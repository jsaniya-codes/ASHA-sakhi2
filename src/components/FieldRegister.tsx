import React, { useMemo, useState } from 'react';
import {
  Download,
  FileSpreadsheet,
  MapPin,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { KARNATAKA_DISTRICTS } from '../data/nfhs5Karnataka';
import { exportVisitsToPdf, exportWorkbookToExcel } from '../utils/exportReports';
import { parseApiResponse } from '../utils/apiClient';
import type { AuthUser, FieldVisit, RiskLevel } from '../types';

interface FieldRegisterProps {
  visits: FieldVisit[];
  loading: boolean;
  currentUser: AuthUser | null;
  authToken: string | null;
  onRequestAuth: () => void;
  onVisitDeleted: (id: number) => void;
  onInspectOnMap: (visit: FieldVisit) => void;
  onStartVoiceIntake: () => void;
}

const LANGUAGE_NAME: Record<string, string> = {
  kn: 'Kannada',
  hi: 'Hindi',
  en: 'English',
};

export function FieldRegister({
  visits,
  loading,
  currentUser,
  authToken,
  onRequestAuth,
  onVisitDeleted,
  onInspectOnMap,
  onStartVoiceIntake,
}: FieldRegisterProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [districtFilter, setDistrictFilter] = useState('All');
  const [riskFilter, setRiskFilter] = useState<'All' | RiskLevel>('All');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [selectedVisit, setSelectedVisit] = useState<FieldVisit | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const filteredVisits = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return visits.filter((v) => {
      if (districtFilter !== 'All' && v.district !== districtFilter) return false;
      if (riskFilter !== 'All' && v.risk_level !== riskFilter) return false;
      if (categoryFilter !== 'All' && v.beneficiary_category !== categoryFilter) return false;
      if (q) {
        const hay = [
          v.beneficiary_name,
          v.village,
          v.district,
          v.phc_center,
          v.worker_name,
          v.symptoms,
          v.recommended_action,
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [visits, searchQuery, districtFilter, riskFilter, categoryFilter]);

  const counts = useMemo(() => {
    return {
      total: filteredVisits.length,
      high: filteredVisits.filter((v) => v.risk_level === 'High').length,
      moderate: filteredVisits.filter((v) => v.risk_level === 'Moderate').length,
      low: filteredVisits.filter((v) => v.risk_level === 'Low').length,
    };
  }, [filteredVisits]);

  const handleDelete = async (visit: FieldVisit) => {
    setDeleteError(null);
    if (!currentUser || !authToken) {
      onRequestAuth();
      return;
    }
    setDeletingId(visit.id);
    try {
      const res = await fetch(`/api/visits/${visit.id}`, {
        method: 'DELETE',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
      });
      await parseApiResponse(res, 'Unable to delete visit record.');
      if (selectedVisit?.id === visit.id) {
        setSelectedVisit(null);
      }
      onVisitDeleted(visit.id);
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : 'Delete failed.');
    } finally {
      setDeletingId(null);
    }
  };

  const filterSummary = [
    districtFilter === 'All' ? 'All Karnataka Districts' : districtFilter,
    riskFilter === 'All' ? 'All Risk Tiers' : `${riskFilter} Risk`,
  ].join(' · ');

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500">
            NHM Karnataka Multilingual Home Visit Register · SQLite Persisted
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            ASHA Field Register
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => exportVisitsToPdf(filteredVisits, filterSummary)}
            disabled={filteredVisits.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            <Download className="h-3.5 w-3.5" />
            Export PDF Register
          </button>
          <button
            type="button"
            onClick={() => exportWorkbookToExcel(filteredVisits)}
            disabled={filteredVisits.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Export Excel (.xlsx)
          </button>
        </div>
      </div>

      {/* Filter Bar + Risk Tabs */}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="inline-flex items-center rounded-lg bg-slate-100 p-1 self-start">
            {(['All', 'High', 'Moderate', 'Low'] as const).map((tier) => (
              <button
                key={tier}
                type="button"
                onClick={() => setRiskFilter(tier)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  riskFilter === tier
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tier === 'All' ? `All (${counts.total})` : `${tier} Risk`}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative min-w-[210px] flex-1 sm:flex-initial">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search beneficiary, village, PHC..."
                className="w-full rounded-lg border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none"
              />
            </div>

            <select
              aria-label="Filter by Karnataka district"
              value={districtFilter}
              onChange={(e) => setDistrictFilter(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800 focus:border-teal-600 focus:outline-none"
            >
              <option value="All">All Districts</option>
              {KARNATAKA_DISTRICTS.map((d) => (
                <option key={d.district} value={d.district}>
                  {d.district}
                </option>
              ))}
            </select>

            <select
              aria-label="Filter by beneficiary category"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800 focus:border-teal-600 focus:outline-none"
            >
              <option value="All">All Categories</option>
              <option value="Pregnant Woman">Pregnant Woman</option>
              <option value="Lactating Mother">Lactating Mother</option>
              <option value="Child (0-5y)">Child (0-5y)</option>
              <option value="Adolescent Girl">Adolescent Girl</option>
            </select>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-xs text-slate-500">
          <span>
            Showing <strong className="font-mono text-slate-900 tabular-nums">{counts.total}</strong>{' '}
            records
          </span>
          <span aria-hidden="true">·</span>
          <span className="text-red-700 font-medium font-mono tabular-nums">
            {counts.high} High Risk
          </span>
          <span aria-hidden="true">·</span>
          <span className="text-amber-700 font-medium font-mono tabular-nums">
            {counts.moderate} Moderate Risk
          </span>
          <span aria-hidden="true">·</span>
          <span className="text-emerald-700 font-medium font-mono tabular-nums">
            {counts.low} Low Risk
          </span>
        </div>
      </section>

      {deleteError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
          {deleteError}
        </div>
      )}

      {/* Register Data Table + Side Detail Drawer */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <section
          className={`${
            selectedVisit ? 'xl:col-span-8' : 'xl:col-span-12'
          } rounded-xl border border-slate-200 bg-white overflow-hidden`}
        >
          {loading ? (
            <div className="space-y-3 p-6">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded bg-slate-100" />
              ))}
            </div>
          ) : filteredVisits.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <p className="text-sm font-medium text-slate-800">
                No field visit records match your active filters.
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Adjust the district or risk filter, or record a new multilingual ASHA home visit.
              </p>
              <button
                type="button"
                onClick={onStartVoiceIntake}
                className="mt-4 rounded-lg bg-teal-700 px-4 py-2 text-xs font-medium text-white hover:bg-teal-800 transition-colors"
              >
                Log First Voice Visit
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-600">
                    <th className="py-3 pl-5 pr-3 whitespace-nowrap">Date</th>
                    <th className="px-3 py-3 whitespace-nowrap">Beneficiary</th>
                    <th className="px-3 py-3 whitespace-nowrap">District / Village</th>
                    <th className="px-3 py-3 text-right whitespace-nowrap">BP (mmHg)</th>
                    <th className="px-3 py-3 text-right whitespace-nowrap">Hb (g/dL)</th>
                    <th className="px-3 py-3 whitespace-nowrap">Triage Status</th>
                    <th className="py-3 pl-3 pr-5 text-right whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm">
                  {filteredVisits.map((v) => {
                    const isSelected = selectedVisit?.id === v.id;
                    return (
                      <tr
                        key={v.id}
                        onClick={() => setSelectedVisit(v)}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? 'bg-teal-50/60' : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="py-3 pl-5 pr-3 font-mono text-xs text-slate-600 whitespace-nowrap tabular-nums">
                          {v.visit_date}
                        </td>
                        <td className="px-3 py-3">
                          <div className="font-medium text-slate-900 whitespace-nowrap">
                            {v.beneficiary_name}
                          </div>
                          <div className="text-xs text-slate-500 whitespace-nowrap">
                            {v.beneficiary_category}
                            {v.beneficiary_age !== null ? ` · ${v.beneficiary_age}y` : ''} ·{' '}
                            {LANGUAGE_NAME[v.language] || v.language}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="text-sm text-slate-800 whitespace-nowrap">{v.district}</div>
                          <div className="text-xs text-slate-500 whitespace-nowrap">
                            {v.village} · {v.phc_center}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-xs text-slate-800 whitespace-nowrap tabular-nums">
                          {v.bp_systolic && v.bp_diastolic ? `${v.bp_systolic}/${v.bp_diastolic}` : '—'}
                        </td>
                        <td
                          className={`px-3 py-3 text-right font-mono text-xs whitespace-nowrap tabular-nums ${
                            v.hemoglobin_gdl !== null && v.hemoglobin_gdl < 8.0
                              ? 'font-semibold text-red-700'
                              : v.hemoglobin_gdl !== null && v.hemoglobin_gdl < 11.0
                              ? 'font-medium text-amber-700'
                              : 'text-slate-800'
                          }`}
                        >
                          {v.hemoglobin_gdl !== null ? v.hemoglobin_gdl.toFixed(1) : '—'}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span
                            className={`text-xs font-semibold ${
                              v.risk_level === 'High'
                                ? 'text-red-700'
                                : v.risk_level === 'Moderate'
                                ? 'text-amber-700'
                                : 'text-emerald-700'
                            }`}
                          >
                            {v.risk_level} Risk
                          </span>
                        </td>
                        <td
                          className="py-3 pl-3 pr-5 text-right whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => onInspectOnMap(v)}
                              title="Show on Area Map Tracker"
                              className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-teal-700 transition-colors"
                            >
                              <MapPin className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(v)}
                              disabled={deletingId === v.id}
                              title="Remove visit record"
                              className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-700 disabled:opacity-50 transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Clinical Inspection Panel */}
        {selectedVisit && (
          <aside className="xl:col-span-4 rounded-xl border border-slate-200 bg-white p-5 self-start">
            <div className="flex items-start justify-between gap-2 border-b border-slate-200 pb-3.5">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  {selectedVisit.beneficiary_name}
                </h2>
                <p className="text-xs text-slate-500">
                  {selectedVisit.beneficiary_category} · {selectedVisit.village},{' '}
                  {selectedVisit.district}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedVisit(null)}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close clinical details"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <dl className="mt-4 space-y-3 text-xs">
              <div className="flex justify-between gap-4 border-b border-slate-100 pb-2.5">
                <dt className="text-slate-500">Clinical Risk Tier</dt>
                <dd
                  className={`font-semibold ${
                    selectedVisit.risk_level === 'High'
                      ? 'text-red-700'
                      : selectedVisit.risk_level === 'Moderate'
                      ? 'text-amber-700'
                      : 'text-emerald-700'
                  }`}
                >
                  {selectedVisit.risk_level} Risk
                </dd>
              </div>

              <div className="flex justify-between gap-4 border-b border-slate-100 pb-2.5">
                <dt className="text-slate-500">Recorded By</dt>
                <dd className="text-right font-medium text-slate-800">
                  {selectedVisit.worker_name}
                </dd>
              </div>

              <div className="flex justify-between gap-4 border-b border-slate-100 pb-2.5">
                <dt className="text-slate-500">PHC Hub / Follow-up</dt>
                <dd className="text-right font-mono text-slate-800 tabular-nums">
                  {selectedVisit.phc_center} · {selectedVisit.follow_up_date}
                </dd>
              </div>

              <div className="flex justify-between gap-4 border-b border-slate-100 pb-2.5">
                <dt className="text-slate-500">Gender &amp; Blood Sugar</dt>
                <dd className="text-right font-mono text-slate-800 tabular-nums">
                  {selectedVisit.beneficiary_gender || 'Female'} ·{' '}
                  {selectedVisit.blood_sugar_mgdl !== null
                    ? `${selectedVisit.blood_sugar_mgdl} mg/dL`
                    : 'Sugar —'}
                </dd>
              </div>

              <div className="flex justify-between gap-4 border-b border-slate-100 pb-2.5">
                <dt className="text-slate-500">Vitals &amp; Supplies</dt>
                <dd className="text-right font-mono text-slate-800 tabular-nums">
                  {selectedVisit.weight_kg ? `${selectedVisit.weight_kg} kg` : '—'} ·{' '}
                  {selectedVisit.ifa_tablets_given} IFA tabs
                </dd>
              </div>

              {selectedVisit.symptom_duration && (
                <div className="flex justify-between gap-4 border-b border-slate-100 pb-2.5">
                  <dt className="text-slate-500">Symptom Duration</dt>
                  <dd className="text-right text-slate-800">{selectedVisit.symptom_duration}</dd>
                </div>
              )}

              <div className="border-b border-slate-100 pb-2.5">
                <dt className="text-slate-500 mb-1">Immunization</dt>
                <dd className="text-slate-800">{selectedVisit.immunization_status}</dd>
              </div>

              {selectedVisit.risk_flags.length > 0 && (
                <div className="border-b border-slate-100 pb-2.5">
                  <dt className="text-slate-500 mb-1">Triggered Risk Flags</dt>
                  <dd className="space-y-1 text-red-700 font-medium">
                    {selectedVisit.risk_flags.map((flag, i) => (
                      <div key={i}>• {flag}</div>
                    ))}
                  </dd>
                </div>
              )}

              <div className="border-b border-slate-100 pb-2.5">
                <dt className="text-slate-500 mb-1">Recommended Clinical Action</dt>
                <dd className="leading-relaxed text-slate-800">
                  {selectedVisit.recommended_action || 'Routine ASHA follow-up'}
                </dd>
              </div>

              <div>
                <dt className="text-slate-500 mb-1">
                  Original Voice Transcript ({LANGUAGE_NAME[selectedVisit.language] || selectedVisit.language})
                </dt>
                <dd className="rounded-lg bg-slate-50 p-3 leading-relaxed text-slate-700">
                  {selectedVisit.transcript || 'No transcript attached.'}
                </dd>
              </div>
            </dl>

            <div className="mt-4 flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => onInspectOnMap(selectedVisit)}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <MapPin className="h-3.5 w-3.5" />
                View on Area Map
              </button>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
