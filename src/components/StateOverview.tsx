import React, { useMemo, useState } from 'react';
import { BarChart3, Database, Download, Map, Search, ShieldCheck } from 'lucide-react';
import { KARNATAKA_DISTRICTS, KARNATAKA_NFHS5_BASELINE } from '../data/nfhs5Karnataka';
import { exportNfhs5DistrictPdf } from '../utils/exportReports';
import { AreaMapTracker } from './AreaMapTracker';
import type {
  FieldVisit,
  HealthIndicator,
  KarnatakaDivision,
  ReportsSummary,
} from '../types';

interface StateOverviewProps {
  indicators: HealthIndicator[];
  summary: ReportsSummary | null;
  visits: FieldVisit[];
}

export function StateOverview({ indicators, summary, visits }: StateOverviewProps) {
  const [viewMode, setViewMode] = useState<'statistics' | 'map'>('statistics');
  const [divisionFilter, setDivisionFilter] = useState<'All' | KarnatakaDivision>('All');
  const [search, setSearch] = useState('');
  const [selectedMetric, setSelectedMetric] = useState<
    'fullImmunizationPct' | 'fourPlusAncPct' | 'pregnantAnaemiaPct' | 'childStuntingPct' | 'institutionalBirthsPct'
  >('fullImmunizationPct');

  const filteredDistricts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return KARNATAKA_DISTRICTS.filter((d) => {
      if (divisionFilter !== 'All' && d.division !== divisionFilter) return false;
      if (!q) return true;
      return d.district.toLowerCase().includes(q) || d.division.toLowerCase().includes(q);
    }).sort((a, b) => b[selectedMetric] - a[selectedMetric]);
  }, [divisionFilter, search, selectedMetric]);

  const metricMeta: Record<typeof selectedMetric, { label: string; baseline: number; higherIsBetter: boolean }> = {
    fullImmunizationPct: {
      label: 'Full Immunization (12–23m)',
      baseline: KARNATAKA_NFHS5_BASELINE.fullImmunizationPct,
      higherIsBetter: true,
    },
    fourPlusAncPct: {
      label: '4+ Antenatal Checkups (ANC)',
      baseline: KARNATAKA_NFHS5_BASELINE.fourPlusAncPct,
      higherIsBetter: true,
    },
    institutionalBirthsPct: {
      label: 'Institutional Births',
      baseline: KARNATAKA_NFHS5_BASELINE.institutionalBirthsPct,
      higherIsBetter: true,
    },
    pregnantAnaemiaPct: {
      label: 'Pregnant Women Anaemic (<11 g/dL)',
      baseline: KARNATAKA_NFHS5_BASELINE.pregnantAnaemiaPct,
      higherIsBetter: false,
    },
    childStuntingPct: {
      label: 'Children Under 5 Stunted',
      baseline: KARNATAKA_NFHS5_BASELINE.childStuntingPct,
      higherIsBetter: false,
    },
  };

  const officialCount = indicators.filter((i) => i.dataset_origin === 'Official Imported').length;
  const customCount = indicators.filter((i) => i.dataset_origin === 'Custom Upload').length;

  return (
    <div className="space-y-6">
      {/* Sub-navigation + Data Provenance Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e2e7e0] bg-white p-4">
        <div className="inline-flex rounded-lg bg-[#f4f6f2] p-1">
          <button
            type="button"
            onClick={() => setViewMode('statistics')}
            className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-xs font-semibold transition-colors ${
              viewMode === 'statistics' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BarChart3 className="h-4 w-4 text-[#1f6f5c]" />
            Official State & District Indicators
          </button>
          <button
            type="button"
            onClick={() => setViewMode('map')}
            className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-xs font-semibold transition-colors ${
              viewMode === 'map' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Map className="h-4 w-4 text-[#1f6f5c]" />
            Karnataka Area Map Tracker ({visits.length} visits)
          </button>
        </div>

        <p className="text-xs text-slate-500">
          Provenance separated: <strong className="text-slate-800">NFHS-5 Official Benchmarks</strong> vs{' '}
          <strong className="text-[#1f6f5c]">Locally Collected Field Records</strong>
        </p>
      </div>

      {viewMode === 'map' ? (
        <AreaMapTracker visits={visits} focusedVisit={null} />
      ) : (
        <>
          {/* Clear Separation: Official Imported Statistics vs Locally Collected Application Records */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <section className="rounded-xl border border-[#e2e7e0] bg-white p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Section A · Official Imported Public Health Statistics
                  </p>
                  <h2 className="mt-0.5 text-base font-bold text-slate-900">
                    Karnataka State NFHS-5 Baseline (2019–21, IIPS & MoHFW)
                  </h2>
                </div>
                <ShieldCheck className="h-5 w-5 text-[#1f6f5c]" />
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 tabular-nums">
                <div className="rounded-lg bg-[#f4f6f2] p-3">
                  <span className="text-[11px] text-slate-500">Institutional Births</span>
                  <p className="mt-0.5 text-lg font-bold text-slate-900">
                    {KARNATAKA_NFHS5_BASELINE.institutionalBirthsPct}%
                  </p>
                </div>
                <div className="rounded-lg bg-[#f4f6f2] p-3">
                  <span className="text-[11px] text-slate-500">Full Immunization</span>
                  <p className="mt-0.5 text-lg font-bold text-[#1f6f5c]">
                    {KARNATAKA_NFHS5_BASELINE.fullImmunizationPct}%
                  </p>
                </div>
                <div className="rounded-lg bg-[#f4f6f2] p-3">
                  <span className="text-[11px] text-slate-500">4+ ANC Visits</span>
                  <p className="mt-0.5 text-lg font-bold text-slate-900">
                    {KARNATAKA_NFHS5_BASELINE.fourPlusAncPct}%
                  </p>
                </div>
                <div className="rounded-lg bg-[#f4f6f2] p-3">
                  <span className="text-[11px] text-slate-500">Child Stunting (&lt;5y)</span>
                  <p className="mt-0.5 text-lg font-bold text-amber-700">
                    {KARNATAKA_NFHS5_BASELINE.childStuntingPct}%
                  </p>
                </div>
                <div className="rounded-lg bg-[#f4f6f2] p-3">
                  <span className="text-[11px] text-slate-500">Pregnant Anaemia</span>
                  <p className="mt-0.5 text-lg font-bold text-red-700">
                    {KARNATAKA_NFHS5_BASELINE.pregnantAnaemiaPct}%
                  </p>
                </div>
                <div className="rounded-lg bg-[#f4f6f2] p-3">
                  <span className="text-[11px] text-slate-500">Registry Indicators</span>
                  <p className="mt-0.5 text-lg font-bold text-slate-900">{officialCount + customCount}</p>
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-[#e2e7e0] bg-white p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[#1f6f5c]">
                    Section B · Locally Collected AshaSakhi Application Records
                  </p>
                  <h2 className="mt-0.5 text-base font-bold text-slate-900">
                    Live Village & Sub-Centre Field Progress
                  </h2>
                </div>
                <Database className="h-5 w-5 text-sky-600" />
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 tabular-nums">
                <div className="rounded-lg border border-slate-200 p-3">
                  <span className="text-[11px] text-slate-500">Local Families</span>
                  <p className="mt-0.5 text-lg font-bold text-slate-900">{summary?.totals.families ?? 0}</p>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <span className="text-[11px] text-slate-500">Local People</span>
                  <p className="mt-0.5 text-lg font-bold text-slate-900">{summary?.totals.people ?? 0}</p>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <span className="text-[11px] text-slate-500">Recorded Visits</span>
                  <p className="mt-0.5 text-lg font-bold text-[#1f6f5c]">{summary?.totals.visits ?? 0}</p>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <span className="text-[11px] text-slate-500">Maternal Tracked</span>
                  <p className="mt-0.5 text-lg font-bold text-slate-900">{summary?.totals.pregnantWomen ?? 0}</p>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <span className="text-[11px] text-slate-500">Vaccinated Children</span>
                  <p className="mt-0.5 text-lg font-bold text-slate-900">{summary?.totals.vaccinatedChildren ?? 0}</p>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <span className="text-[11px] text-slate-500">Active Danger Alerts</span>
                  <p className="mt-0.5 text-lg font-bold text-red-700">{summary?.totals.activeAlerts ?? 0}</p>
                </div>
              </div>
            </section>
          </div>

          {/* District Comparison Chart & Table */}
          <section className="rounded-xl border border-[#e2e7e0] bg-white p-5 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Karnataka District Comparison — {metricMeta[selectedMetric].label}
                </h3>
                <p className="text-xs text-slate-500">
                  Official NFHS-5 (2019–21) district fact sheets · State Baseline:{' '}
                  <strong className="font-mono text-slate-800">{metricMeta[selectedMetric].baseline}%</strong>
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Filter district..."
                    className="w-44 rounded-lg border border-slate-300 bg-white py-1.5 pl-8 pr-2.5 text-xs"
                  />
                </div>
                <select
                  value={divisionFilter}
                  onChange={(e) => setDivisionFilter(e.target.value as 'All' | KarnatakaDivision)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium"
                >
                  <option value="All">All 4 Divisions</option>
                  <option value="Bengaluru">Bengaluru Division</option>
                  <option value="Mysuru">Mysuru Division</option>
                  <option value="Belagavi">Belagavi Division</option>
                  <option value="Kalaburagi">Kalaburagi Division</option>
                </select>
                <select
                  value={selectedMetric}
                  onChange={(e) => setSelectedMetric(e.target.value as typeof selectedMetric)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-[#1f6f5c]"
                >
                  <option value="fullImmunizationPct">Full Immunization (%)</option>
                  <option value="fourPlusAncPct">4+ ANC Visits (%)</option>
                  <option value="institutionalBirthsPct">Institutional Births (%)</option>
                  <option value="pregnantAnaemiaPct">Pregnant Anaemia (%)</option>
                  <option value="childStuntingPct">Child Stunting (%)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
              {filteredDistricts.map((d) => {
                const val = d[selectedMetric];
                const meta = metricMeta[selectedMetric];
                const isWarning = meta.higherIsBetter ? val < meta.baseline - 5 : val > meta.baseline + 4;
                return (
                  <div
                    key={d.district}
                    className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-[#f9faf8] px-3.5 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-900">
                          {d.district} <span className="font-normal text-slate-400">· {d.division}</span>
                        </span>
                        <span
                          className={`font-mono font-bold tabular-nums ${
                            isWarning ? 'text-red-700' : 'text-[#1f6f5c]'
                          }`}
                        >
                          {val.toFixed(1)}%
                        </span>
                      </div>
                      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-200/70">
                        <div
                          className={`h-full rounded-full ${isWarning ? 'bg-amber-600' : 'bg-[#1f6f5c]'}`}
                          style={{ width: `${Math.min(100, val)}%` }}
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => exportNfhs5DistrictPdf(d)}
                      className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 hover:text-[#1f6f5c]"
                      title={`Download ${d.district} NFHS-5 PDF`}
                    >
                      <Download className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
