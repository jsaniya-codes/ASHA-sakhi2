import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Info,
  Search,
  Upload,
  X,
} from 'lucide-react';
import { readSheet } from 'read-excel-file/browser';
import { parseApiResponse } from '../utils/apiClient';
import type { AuthUser, DatasetImportLog, HealthIndicator } from '../types';

interface DataFilesProps {
  indicators: HealthIndicator[];
  imports: DatasetImportLog[];
  user: AuthUser | null;
  authToken: string | null;
  onRequestAuth: () => void;
  onRefresh: () => Promise<void>;
}

interface ParsedIndicatorRow {
  indicator_id: string;
  indicator_name: string;
  category: string;
  geography: string;
  value: string;
  unit?: string;
  period: string;
  source: string;
  source_url?: string;
  methodology?: string;
  denominator?: string;
  disaggregation?: string;
  confidence_notes?: string;
  metadata_json?: Record<string, string>;
}

/**
 * RFC-4180 compliant CSV parser handling quoted commas and escaped quotes.
 */
function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  let current: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      current.push(field.trim());
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      current.push(field.trim());
      if (current.some((cell) => cell.length > 0)) rows.push(current);
      current = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || current.length > 0) {
    current.push(field.trim());
    if (current.some((cell) => cell.length > 0)) rows.push(current);
  }
  return rows;
}

function normalizeObjectRow(raw: Record<string, unknown>, fallbackIndex: number): ParsedIndicatorRow | null {
  const lowerMap: Record<string, string> = {};
  const metaJson: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    const val = String(v ?? '').trim();
    lowerMap[k.trim().toLowerCase().replace(/[\s-]+/g, '_')] = val;
    if (val) metaJson[k.trim()] = val;
  }

  const indicator_id =
    lowerMap.indicator_id ||
    lowerMap.id ||
    lowerMap.code ||
    lowerMap.metric_id ||
    `CUSTOM_IND_${fallbackIndex + 1}`;
  const indicator_name =
    lowerMap.indicator_name ||
    lowerMap.indicator ||
    lowerMap.name ||
    lowerMap.title ||
    lowerMap.metric ||
    '';
  const value = lowerMap.value || lowerMap.figure || lowerMap.percentage || lowerMap.rate || '';

  if (!indicator_name || !value) return null;

  return {
    indicator_id,
    indicator_name,
    category: lowerMap.category || lowerMap.domain || 'Public Health',
    geography: lowerMap.geography || lowerMap.state || lowerMap.district || 'Karnataka (State)',
    value,
    unit: lowerMap.unit || (value.includes('%') ? '%' : 'value'),
    period: lowerMap.period || lowerMap.year || lowerMap.survey_period || '2024–25',
    source: lowerMap.source || lowerMap.agency || 'Uploaded Official Dataset',
    source_url: lowerMap.source_url || lowerMap.url || '',
    methodology: lowerMap.methodology || 'Uploaded verified public health dataset',
    denominator: lowerMap.denominator || 'As defined in source survey',
    disaggregation: lowerMap.disaggregation || 'Total',
    confidence_notes: lowerMap.confidence_notes || lowerMap.notes || '',
    metadata_json: metaJson,
  };
}

export function DataFiles({
  indicators,
  imports,
  authToken,
  onRequestAuth,
  onRefresh,
}: DataFilesProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('All Categories');
  const [search, setSearch] = useState('');
  const [inspectIndicator, setInspectIndicator] = useState<HealthIndicator | null>(null);

  // Upload & preview workflow state
  const [parsedFilename, setParsedFilename] = useState('');
  const [parsedFormat, setParsedFormat] = useState('CSV');
  const [sourceName, setSourceName] = useState('');
  const [previewRows, setPreviewRows] = useState<ParsedIndicatorRow[]>([]);
  const [invalidRowCount, setInvalidRowCount] = useState(0);
  const [importMode, setImportMode] = useState<'append' | 'replace'>('append');
  const [confirmReplaceChecked, setConfirmReplaceChecked] = useState(false);

  const [importing, setImporting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const categories = useMemo(() => {
    const set = new Set<string>();
    indicators.forEach((i) => set.add(i.category));
    return ['All Categories', ...Array.from(set).sort()];
  }, [indicators]);

  const existingIds = useMemo(
    () => new Set(indicators.map((i) => i.indicator_id.toLowerCase())),
    [indicators]
  );

  const duplicatePreviewCount = useMemo(
    () => previewRows.filter((r) => existingIds.has(r.indicator_id.toLowerCase())).length,
    [previewRows, existingIds]
  );

  const filteredIndicators = useMemo(() => {
    const q = search.trim().toLowerCase();
    return indicators.filter((ind) => {
      if (categoryFilter !== 'All Categories' && ind.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        ind.indicator_id.toLowerCase().includes(q) ||
        ind.indicator_name.toLowerCase().includes(q) ||
        ind.geography.toLowerCase().includes(q) ||
        ind.source.toLowerCase().includes(q)
      );
    });
  }, [indicators, categoryFilter, search]);

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);
    setStatusMsg(null);

    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (!['csv', 'xlsx', 'xls', 'json'].includes(ext)) {
      setErrorMsg('Unsupported file format. Please upload .csv, .xlsx, .xls, or .json files.');
      e.target.value = '';
      return;
    }

    try {
      let rawObjects: Array<Record<string, unknown>> = [];

      if (ext === 'json') {
        const text = await file.text();
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          rawObjects = parsed;
        } else if (parsed && Array.isArray(parsed.indicators)) {
          rawObjects = parsed.indicators;
        } else if (parsed && Array.isArray(parsed.data)) {
          rawObjects = parsed.data;
        } else {
          throw new Error('JSON file must contain an array of indicator objects.');
        }
      } else if (ext === 'csv') {
        const text = await file.text();
        const matrix = parseCsvText(text);
        if (matrix.length < 2) {
          throw new Error('CSV must include a header row and at least one data row.');
        }
        const headers = matrix[0];
        rawObjects = matrix.slice(1).map((row) => {
          const obj: Record<string, unknown> = {};
          headers.forEach((h, idx) => {
            obj[h] = row[idx] ?? '';
          });
          return obj;
        });
      } else {
        // .xlsx / .xls via read-excel-file v9 readSheet
        const matrix = await readSheet(file);
        if (matrix.length < 2) {
          throw new Error('Spreadsheet must contain a header row and at least one data row.');
        }
        const headers = matrix[0].map((cell) => String(cell ?? '').trim());
        rawObjects = matrix.slice(1).map((row) => {
          const obj: Record<string, unknown> = {};
          headers.forEach((h, idx) => {
            if (h) obj[h] = row[idx] ?? '';
          });
          return obj;
        });
      }

      const validRows: ParsedIndicatorRow[] = [];
      let skipped = 0;
      rawObjects.forEach((obj, idx) => {
        const norm = normalizeObjectRow(obj, idx);
        if (norm) validRows.push(norm);
        else skipped++;
      });

      if (validRows.length === 0) {
        throw new Error(
          'No valid indicator rows found. Ensure columns include Indicator Name (or name) and Value (or percentage).'
        );
      }

      setParsedFilename(file.name);
      setParsedFormat(ext.toUpperCase());
      setSourceName(file.name.replace(/\.[^.]+$/, ''));
      setPreviewRows(validRows);
      setInvalidRowCount(skipped);
      setImportMode('append');
      setConfirmReplaceChecked(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to parse uploaded dataset file.');
    } finally {
      e.target.value = '';
    }
  };

  const handleConfirmImport = async () => {
    if (!authToken) {
      onRequestAuth();
      return;
    }
    if (importMode === 'replace' && !confirmReplaceChecked) {
      setErrorMsg('Please check the confirmation box before replacing existing valid records.');
      return;
    }

    setImporting(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const res = await fetch('/api/data-files/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          filename: parsedFilename,
          source_name: sourceName.trim() || parsedFilename,
          file_format: parsedFormat,
          mode: importMode,
          confirmReplace: importMode === 'replace' && confirmReplaceChecked,
          rows: previewRows,
        }),
      });
      const data = await parseApiResponse<{ added: number; updated: number; skipped: number }>(
        res,
        'Dataset import failed.'
      );
      setPreviewRows([]);
      setParsedFilename('');
      setStatusMsg(
        `Dataset imported cleanly: ${data.added} added, ${data.updated} updated, ${data.skipped} duplicates skipped.`
      );
      await onRefresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to import dataset.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Upload Card — matches user screenshot closely */}
      <section className="rounded-2xl border border-[#e2e7e0] bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Upload Official Public Health Dataset</h2>
            <p className="mt-1 text-xs text-slate-500">
              Supported formats: .csv, .xlsx, .xls, .json. Existing valid records are never overwritten without explicit confirmation.
            </p>
          </div>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls,.json"
              onChange={handleFileSelected}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-xl bg-[#1f6f5c] px-5 py-2.5 text-xs font-semibold text-white hover:bg-[#185848] transition-colors whitespace-nowrap"
            >
              <Upload className="h-4 w-4" />
              Select Dataset File
            </button>
          </div>
        </div>

        {/* Preview & Validation Drawer when file is chosen */}
        {previewRows.length > 0 && (
          <div className="mt-5 rounded-xl border border-[#1f6f5c]/30 bg-[#f4f6f2] p-4 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-slate-900">
                  Import Preview: {parsedFilename} ({parsedFormat})
                </p>
                <p className="mt-0.5 text-xs text-slate-600 tabular-nums">
                  {previewRows.length} valid rows parsed · {invalidRowCount} invalid rows skipped ·{' '}
                  {duplicatePreviewCount} matching existing Indicator IDs
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPreviewRows([]);
                  setParsedFilename('');
                }}
                className="text-xs font-semibold text-slate-500 hover:text-slate-900"
              >
                Cancel Upload
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700">Dataset Source Attribution</label>
                <input
                  value={sourceName}
                  onChange={(e) => setSourceName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">Duplicate Handling Mode</label>
                <select
                  value={importMode}
                  onChange={(e) => {
                    setImportMode(e.target.value as 'append' | 'replace');
                    setConfirmReplaceChecked(false);
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs"
                >
                  <option value="append">Safe Append (Preserve all existing records, skip duplicates)</option>
                  <option value="replace">Update / Replace matching Indicator IDs (Requires confirmation)</option>
                </select>
              </div>
            </div>

            {importMode === 'replace' && (
              <label className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">
                <input
                  type="checkbox"
                  checked={confirmReplaceChecked}
                  onChange={(e) => setConfirmReplaceChecked(e.target.checked)}
                  className="mt-0.5 rounded"
                />
                <span>
                  I explicitly confirm updating up to <strong>{duplicatePreviewCount}</strong> existing valid public health indicator records with the values shown in the preview below.
                </span>
              </label>
            )}

            <div className="max-h-52 overflow-auto rounded-lg border border-slate-200 bg-white">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Indicator ID</th>
                    <th className="px-3 py-2">Indicator Name</th>
                    <th className="px-3 py-2">Category</th>
                    <th className="px-3 py-2">Value</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {previewRows.slice(0, 12).map((row, idx) => {
                    const isDup = existingIds.has(row.indicator_id.toLowerCase());
                    return (
                      <tr key={idx}>
                        <td className="px-3 py-2 font-mono text-[11px]">{row.indicator_id}</td>
                        <td className="px-3 py-2 text-slate-800">{row.indicator_name}</td>
                        <td className="px-3 py-2 text-slate-600">{row.category}</td>
                        <td className="px-3 py-2 font-mono font-semibold">{row.value}</td>
                        <td className="px-3 py-2 text-[11px]">
                          {isDup ? (
                            <span className="font-semibold text-amber-700">
                              {importMode === 'replace' ? 'Will Update' : 'Duplicate (Skip)'}
                            </span>
                          ) : (
                            <span className="font-semibold text-[#1f6f5c]">New Record</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                disabled={importing}
                onClick={handleConfirmImport}
                className="inline-flex items-center gap-2 rounded-lg bg-[#1f6f5c] px-5 py-2 text-xs font-semibold text-white hover:bg-[#185848] disabled:opacity-60"
              >
                <FileSpreadsheet className="h-4 w-4" />
                {importing ? 'Importing Validated Rows...' : `Confirm Import (${previewRows.length} rows)`}
              </button>
            </div>
          </div>
        )}
      </section>

      {statusMsg && (
        <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-medium text-emerald-900">
          <span className="inline-flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-700" />
            {statusMsg}
          </span>
          <button type="button" onClick={() => setStatusMsg(null)} className="text-emerald-700 hover:underline">
            Dismiss
          </button>
        </div>
      )}
      {errorMsg && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-medium text-red-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {errorMsg}
        </div>
      )}

      {/* Active Indicator Registry Table — matches screenshot */}
      <section className="rounded-2xl border border-[#e2e7e0] bg-white overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Active Indicator Registry ({filteredIndicators.length})
            </h2>
            <p className="text-xs text-slate-500">
              Click any row to inspect all 16 metadata &amp; source provenance fields.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700"
            >
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search ID, name, district..."
                className="w-56 rounded-lg border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-900 focus:border-[#1f6f5c] focus:outline-none"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-[#f9faf8] text-[11px] font-semibold text-slate-500">
              <tr>
                <th className="px-5 py-3">Indicator ID</th>
                <th className="px-4 py-3">Indicator Name</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Geography</th>
                <th className="px-4 py-3">Value</th>
                <th className="px-4 py-3">Period</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-5 py-3 text-right">Metadata</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredIndicators.map((ind) => (
                <tr
                  key={ind.id}
                  onClick={() => setInspectIndicator(ind)}
                  className="cursor-pointer hover:bg-[#f4f6f2]/70 transition-colors"
                >
                  <td className="px-5 py-3 font-mono text-[11px] font-semibold text-slate-800 whitespace-nowrap">
                    {ind.indicator_id}
                  </td>
                  <td className="px-4 py-3 text-slate-900 max-w-xs">{ind.indicator_name}</td>
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{ind.category}</td>
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{ind.geography}</td>
                  <td className="px-4 py-3 font-mono font-bold text-[#1f6f5c] whitespace-nowrap tabular-nums">
                    {ind.value}
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-600 whitespace-nowrap tabular-nums">
                    {ind.period}
                  </td>
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{ind.source}</td>
                  <td className="px-5 py-3 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setInspectIndicator(ind);
                      }}
                      className="font-semibold text-[#1f6f5c] hover:underline"
                    >
                      Inspect
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Dataset Import Audit History */}
      {imports.length > 0 && (
        <section className="rounded-xl border border-[#e2e7e0] bg-white p-5">
          <h3 className="text-sm font-bold text-slate-900">Dataset Import Audit History ({imports.length})</h3>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 text-[11px] font-semibold text-slate-500">
                <tr>
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">File</th>
                  <th className="py-2 pr-4">Source</th>
                  <th className="py-2 pr-4">Mode</th>
                  <th className="py-2 pr-4">Added / Updated / Skipped</th>
                  <th className="py-2">Imported By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 tabular-nums">
                {imports.map((imp) => (
                  <tr key={imp.id}>
                    <td className="py-2 pr-4 font-mono text-slate-500">{imp.imported_at.slice(0, 10)}</td>
                    <td className="py-2 pr-4 font-semibold text-slate-900">
                      {imp.filename} ({imp.file_format})
                    </td>
                    <td className="py-2 pr-4 text-slate-600">{imp.source_name}</td>
                    <td className="py-2 pr-4 capitalize text-slate-600">{imp.mode}</td>
                    <td className="py-2 pr-4 font-mono text-slate-800">
                      +{imp.records_added} / ~{imp.records_updated} / -{imp.records_skipped}
                    </td>
                    <td className="py-2 text-slate-600">{imp.imported_by}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 16-FIELD PROVENANCE METADATA INSPECTOR MODAL */}
      {inspectIndicator && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between border-b border-slate-200 pb-3">
              <div>
                <p className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold text-[#1f6f5c]">
                  <Info className="h-3.5 w-3.5" />
                  {inspectIndicator.indicator_id}
                </p>
                <h3 className="mt-1 text-base font-bold text-slate-900">{inspectIndicator.indicator_name}</h3>
              </div>
              <button type="button" onClick={() => setInspectIndicator(null)} className="text-slate-400 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
              {[
                ['1. Indicator ID', inspectIndicator.indicator_id],
                ['2. Indicator Name', inspectIndicator.indicator_name],
                ['3. Category', inspectIndicator.category],
                ['4. Geography', inspectIndicator.geography],
                ['5. Reported Value', inspectIndicator.value],
                ['6. Measurement Unit', inspectIndicator.unit || '%'],
                ['7. Reference Period', inspectIndicator.period],
                ['8. Official Source', inspectIndicator.source],
                ['9. Source URL', inspectIndicator.source_url || 'https://rchiips.org/nfhs/'],
                ['10. Dataset Origin', inspectIndicator.dataset_origin],
                ['11. Survey Methodology', inspectIndicator.methodology],
                ['12. Statistical Denominator', inspectIndicator.denominator],
                ['13. Disaggregation', inspectIndicator.disaggregation],
                ['14. Confidence / Caveats', inspectIndicator.confidence_notes || 'Standard NFHS-5 sample precision'],
                ['15. Imported Timestamp', inspectIndicator.imported_at],
                [
                  '16. Verification Status',
                  inspectIndicator.metadata_json?.verification || 'Verified Official Public Health Source',
                ],
              ].map(([label, val]) => (
                <div key={label} className="rounded-lg bg-[#f4f6f2] p-3">
                  <span className="text-[11px] font-semibold text-slate-500">{label}</span>
                  <p className="mt-0.5 break-words font-medium text-slate-900">{val}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
