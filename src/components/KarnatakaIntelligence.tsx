import React, { useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Download,
  FileText,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { KARNATAKA_DISTRICTS, KARNATAKA_NFHS5_BASELINE } from '../data/nfhs5Karnataka';
import { exportNfhs5DistrictPdf } from '../utils/exportReports';
import { parseApiResponse } from '../utils/apiClient';
import type { DistrictPolicyBrief, FieldVisit, KarnatakaDivision, NFHS5District } from '../types';

interface KarnatakaIntelligenceProps {
  visits: FieldVisit[];
  onStartVoiceForDistrict: (district: string) => void;
}

type IndicatorGroup = 'maternal' | 'nutrition' | 'anaemia';

interface ComparisonRow {
  label: string;
  districtVal: number;
  stateVal: number;
  higherIsBetter: boolean;
}

export function KarnatakaIntelligence({
  visits,
  onStartVoiceForDistrict,
}: KarnatakaIntelligenceProps) {
  const [selectedDivision, setSelectedDivision] = useState<'All' | KarnatakaDivision>('All');
  const [selectedDistrictName, setSelectedDistrictName] = useState<string>('Raichur');
  const [indicatorGroup, setIndicatorGroup] = useState<IndicatorGroup>('maternal');
  const [sortBy, setSortBy] = useState<
    'district' | 'fourPlusAncPct' | 'fullImmunizationPct' | 'childStuntingPct' | 'pregnantAnaemiaPct'
  >('pregnantAnaemiaPct');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const [brief, setBrief] = useState<DistrictPolicyBrief | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefError, setBriefError] = useState<string | null>(null);

  const filteredDistricts = useMemo(() => {
    const base =
      selectedDivision === 'All'
        ? KARNATAKA_DISTRICTS
        : KARNATAKA_DISTRICTS.filter((d) => d.division === selectedDivision);

    return [...base].sort((a, b) => {
      if (sortBy === 'district') {
        return sortDir === 'asc'
          ? a.district.localeCompare(b.district)
          : b.district.localeCompare(a.district);
      }
      return sortDir === 'asc' ? a[sortBy] - b[sortBy] : b[sortBy] - a[sortBy];
    });
  }, [selectedDivision, sortBy, sortDir]);

  const activeDistrict: NFHS5District = useMemo(() => {
    return (
      KARNATAKA_DISTRICTS.find((d) => d.district === selectedDistrictName) ??
      filteredDistricts[0] ??
      KARNATAKA_DISTRICTS[0]
    );
  }, [selectedDistrictName, filteredDistricts]);

  const districtFieldSummary = useMemo(() => {
    const matching = visits.filter(
      (v) => v.district.toLowerCase() === activeDistrict.district.toLowerCase()
    );
    return {
      total: matching.length,
      highRisk: matching.filter((v) => v.risk_level === 'High').length,
      moderateRisk: matching.filter((v) => v.risk_level === 'Moderate').length,
    };
  }, [visits, activeDistrict.district]);

  const comparisonRows: ComparisonRow[] = useMemo(() => {
    if (indicatorGroup === 'maternal') {
      return [
        {
          label: 'Institutional births',
          districtVal: activeDistrict.institutionalBirthsPct,
          stateVal: KARNATAKA_NFHS5_BASELINE.institutionalBirthsPct,
          higherIsBetter: true,
        },
        {
          label: '4+ ANC visits',
          districtVal: activeDistrict.fourPlusAncPct,
          stateVal: KARNATAKA_NFHS5_BASELINE.fourPlusAncPct,
          higherIsBetter: true,
        },
        {
          label: 'IFA >= 100 days',
          districtVal: activeDistrict.ifa100DaysPct,
          stateVal: KARNATAKA_NFHS5_BASELINE.ifa100DaysPct,
          higherIsBetter: true,
        },
        {
          label: 'Full immunization (12–23m)',
          districtVal: activeDistrict.fullImmunizationPct,
          stateVal: KARNATAKA_NFHS5_BASELINE.fullImmunizationPct,
          higherIsBetter: true,
        },
        {
          label: 'Exclusive breastfeeding (<6m)',
          districtVal: activeDistrict.exclusiveBreastfeedingPct,
          stateVal: KARNATAKA_NFHS5_BASELINE.exclusiveBreastfeedingPct,
          higherIsBetter: true,
        },
      ];
    }
    if (indicatorGroup === 'nutrition') {
      return [
        {
          label: 'Children under 5 stunted',
          districtVal: activeDistrict.childStuntingPct,
          stateVal: KARNATAKA_NFHS5_BASELINE.childStuntingPct,
          higherIsBetter: false,
        },
        {
          label: 'Children under 5 wasted',
          districtVal: activeDistrict.childWastingPct,
          stateVal: KARNATAKA_NFHS5_BASELINE.childWastingPct,
          higherIsBetter: false,
        },
        {
          label: 'Children under 5 underweight',
          districtVal: activeDistrict.childUnderweightPct,
          stateVal: KARNATAKA_NFHS5_BASELINE.childUnderweightPct,
          higherIsBetter: false,
        },
      ];
    }
    return [
      {
        label: 'Pregnant women anaemic (<11 g/dL)',
        districtVal: activeDistrict.pregnantAnaemiaPct,
        stateVal: KARNATAKA_NFHS5_BASELINE.pregnantAnaemiaPct,
        higherIsBetter: false,
      },
      {
        label: 'All women (15–49y) anaemic',
        districtVal: activeDistrict.allWomenAnaemiaPct,
        stateVal: KARNATAKA_NFHS5_BASELINE.allWomenAnaemiaPct,
        higherIsBetter: false,
      },
      {
        label: 'Children (6–59m) anaemic',
        districtVal: activeDistrict.childAnaemiaPct,
        stateVal: KARNATAKA_NFHS5_BASELINE.childAnaemiaPct,
        higherIsBetter: false,
      },
    ];
  }, [activeDistrict, indicatorGroup]);

  const handleSort = (
    col: 'district' | 'fourPlusAncPct' | 'fullImmunizationPct' | 'childStuntingPct' | 'pregnantAnaemiaPct'
  ) => {
    if (sortBy === col) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(col);
      setSortDir(col === 'district' ? 'asc' : 'desc');
    }
  };

  const handleGenerateBrief = async () => {
    setBriefLoading(true);
    setBriefError(null);
    try {
      const res = await fetch('/api/ai/district-brief', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({ district: activeDistrict.district }),
      });
      const data = await parseApiResponse<{ brief: DistrictPolicyBrief }>(
        res,
        'Could not generate district brief.'
      );
      setBrief(data.brief);
    } catch (err: unknown) {
      setBriefError(err instanceof Error ? err.message : 'Unable to generate district policy brief.');
    } finally {
      setBriefLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Intro + Division Filter */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500">
            NFHS-5 (2019–21) Karnataka Fact Sheet · MoHFW Baseline vs. District Field Operations
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            Karnataka Public Health Intelligence
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center rounded-lg bg-slate-200/70 p-1">
            {(['All', 'Bengaluru', 'Mysuru', 'Belagavi', 'Kalaburagi'] as const).map((div) => (
              <button
                key={div}
                type="button"
                onClick={() => {
                  setSelectedDivision(div);
                  if (div !== 'All') {
                    const firstInDiv = KARNATAKA_DISTRICTS.find((d) => d.division === div);
                    if (firstInDiv) {
                      setSelectedDistrictName(firstInDiv.district);
                      setBrief(null);
                    }
                  }
                }}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  selectedDivision === div
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {div === 'All' ? 'All Divisions' : div}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* State Baseline KPI Strip — single clean flat surface with hairline dividers */}
      <section className="grid grid-cols-1 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Institutional Births (State)</p>
          <div className="mt-2 flex items-baseline gap-2.5">
            <span className="font-mono text-2xl font-semibold text-slate-900 tabular-nums">
              {KARNATAKA_NFHS5_BASELINE.institutionalBirthsPct.toFixed(1)}%
            </span>
            <span className="inline-flex items-center gap-0.5 text-xs font-medium text-emerald-700 tabular-nums">
              <ArrowUpRight className="h-3.5 w-3.5" />
              +2.7pp vs NFHS-4
            </span>
          </div>
          <p className="mt-1.5 text-xs text-slate-500">
            {activeDistrict.district}:{' '}
            <span className="font-mono font-medium text-slate-800 tabular-nums">
              {activeDistrict.institutionalBirthsPct.toFixed(1)}%
            </span>
          </p>
        </div>

        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Full Immunization (12–23m)</p>
          <div className="mt-2 flex items-baseline gap-2.5">
            <span className="font-mono text-2xl font-semibold text-slate-900 tabular-nums">
              {KARNATAKA_NFHS5_BASELINE.fullImmunizationPct.toFixed(1)}%
            </span>
            <span className="inline-flex items-center gap-0.5 text-xs font-medium text-emerald-700 tabular-nums">
              <ArrowUpRight className="h-3.5 w-3.5" />
              +21.5pp vs NFHS-4
            </span>
          </div>
          <p className="mt-1.5 text-xs text-slate-500">
            {activeDistrict.district}:{' '}
            <span className="font-mono font-medium text-slate-800 tabular-nums">
              {activeDistrict.fullImmunizationPct.toFixed(1)}%
            </span>
          </p>
        </div>

        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Pregnant Women Anaemic</p>
          <div className="mt-2 flex items-baseline gap-2.5">
            <span className="font-mono text-2xl font-semibold text-slate-900 tabular-nums">
              {KARNATAKA_NFHS5_BASELINE.pregnantAnaemiaPct.toFixed(1)}%
            </span>
            <span className="inline-flex items-center gap-0.5 text-xs font-medium text-amber-700 tabular-nums">
              <ArrowUpRight className="h-3.5 w-3.5" />
              +0.3pp vs NFHS-4
            </span>
          </div>
          <p className="mt-1.5 text-xs text-slate-500">
            {activeDistrict.district}:{' '}
            <span
              className={`font-mono font-medium tabular-nums ${
                activeDistrict.pregnantAnaemiaPct > KARNATAKA_NFHS5_BASELINE.pregnantAnaemiaPct
                  ? 'text-red-700'
                  : 'text-emerald-700'
              }`}
            >
              {activeDistrict.pregnantAnaemiaPct.toFixed(1)}%
            </span>
          </p>
        </div>

        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Children Under 5 Stunted</p>
          <div className="mt-2 flex items-baseline gap-2.5">
            <span className="font-mono text-2xl font-semibold text-slate-900 tabular-nums">
              {KARNATAKA_NFHS5_BASELINE.childStuntingPct.toFixed(1)}%
            </span>
            <span className="inline-flex items-center gap-0.5 text-xs font-medium text-emerald-700 tabular-nums">
              <ArrowDownRight className="h-3.5 w-3.5" />
              -0.8pp vs NFHS-4
            </span>
          </div>
          <p className="mt-1.5 text-xs text-slate-500">
            {activeDistrict.district}:{' '}
            <span
              className={`font-mono font-medium tabular-nums ${
                activeDistrict.childStuntingPct > KARNATAKA_NFHS5_BASELINE.childStuntingPct
                  ? 'text-red-700'
                  : 'text-emerald-700'
              }`}
            >
              {activeDistrict.childStuntingPct.toFixed(1)}%
            </span>
          </p>
        </div>
      </section>

      {/* Main 2-Column Analytical Split: District Benchmark Chart + AI District PHC Action Brief */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* Left: Interactive District vs State Comparison Chart */}
        <section className="xl:col-span-7 rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                {activeDistrict.district} vs. Karnataka Baseline
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {activeDistrict.division} Division · {activeDistrict.samplePhcs.join(' / ')}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <select
                aria-label="Select Karnataka District"
                value={activeDistrict.district}
                onChange={(e) => {
                  setSelectedDistrictName(e.target.value);
                  setBrief(null);
                  setBriefError(null);
                }}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-900 focus:border-teal-600 focus:outline-none"
              >
                {KARNATAKA_DISTRICTS.map((d) => (
                  <option key={d.district} value={d.district}>
                    {d.district}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => exportNfhs5DistrictPdf(activeDistrict)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
              >
                <Download className="h-3.5 w-3.5" />
                PDF Profile
              </button>
            </div>
          </div>

          {/* Indicator Group Segmented Filter */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex items-center rounded-lg bg-slate-100 p-1">
              {(
                [
                  { id: 'maternal', label: 'Maternal & Immunization' },
                  { id: 'nutrition', label: 'Child Nutrition' },
                  { id: 'anaemia', label: 'Anaemia Burden' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setIndicatorGroup(tab.id)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                    indicatorGroup === tab.id
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-4 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-teal-700" />
                {activeDistrict.district}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-slate-300" />
                State Baseline
              </span>
            </div>
          </div>

          {/* Horizontal Comparative Bar Chart */}
          <div className="mt-6 space-y-5">
            {comparisonRows.map((row) => {
              const delta = Number((row.districtVal - row.stateVal).toFixed(1));
              const isFavorable = row.higherIsBetter ? delta >= 0 : delta <= 0;
              return (
                <div key={row.label} className="space-y-2">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="font-medium text-slate-800">{row.label}</span>
                    <div className="flex items-baseline gap-2.5 font-mono text-xs tabular-nums">
                      <span className="font-semibold text-slate-900">{row.districtVal.toFixed(1)}%</span>
                      <span className="text-slate-400">vs {row.stateVal.toFixed(1)}%</span>
                      <span
                        className={`font-medium ${
                          isFavorable ? 'text-emerald-700' : 'text-red-700'
                        }`}
                      >
                        {delta > 0 ? `+${delta.toFixed(1)}pp` : `${delta.toFixed(1)}pp`}
                      </span>
                    </div>
                  </div>

                  <div className="relative space-y-1.5">
                    <div className="h-2.5 w-full overflow-hidden rounded-sm bg-slate-100">
                      <div
                        className={`h-full rounded-sm transition-all duration-300 ${
                          isFavorable ? 'bg-teal-700' : 'bg-amber-600'
                        }`}
                        style={{ width: `${Math.min(100, Math.max(2, row.districtVal))}%` }}
                      />
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-sm bg-slate-100">
                      <div
                        className="h-full rounded-sm bg-slate-300 transition-all duration-300"
                        style={{ width: `${Math.min(100, Math.max(2, row.stateVal))}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 text-xs text-slate-600">
            <div>
              Live ASHA Field Register in {activeDistrict.district}:{' '}
              <span className="font-mono font-semibold text-slate-900 tabular-nums">
                {districtFieldSummary.total} visits
              </span>{' '}
              ·{' '}
              <span className="font-mono font-medium text-red-700 tabular-nums">
                {districtFieldSummary.highRisk} high-risk
              </span>{' '}
              ·{' '}
              <span className="font-mono font-medium text-amber-700 tabular-nums">
                {districtFieldSummary.moderateRisk} moderate
              </span>
            </div>
            <button
              type="button"
              onClick={() => onStartVoiceForDistrict(activeDistrict.district)}
              className="font-medium text-teal-700 hover:text-teal-800 hover:underline whitespace-nowrap"
            >
              Log voice visit in {activeDistrict.district} →
            </button>
          </div>
        </section>

        {/* Right: Gemini District PHC Action Brief */}
        <section className="xl:col-span-5 flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-6">
          <div>
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  PHC Operational Action Brief
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Synthesizes NFHS-5 gaps and live ASHA register alerts for {activeDistrict.district}
                </p>
              </div>
              <button
                type="button"
                onClick={handleGenerateBrief}
                disabled={briefLoading}
                className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-2 text-xs font-medium text-white hover:bg-teal-800 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
              >
                {briefLoading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-3.5 w-3.5" />
                    {brief ? 'Refresh Brief' : 'Generate Brief'}
                  </>
                )}
              </button>
            </div>

            {briefError && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3.5 text-xs text-red-700">
                {briefError}
              </div>
            )}

            {!brief && !briefLoading && !briefError && (
              <div className="mt-6 space-y-4">
                <div className="flex items-start gap-3">
                  <FileText className="mt-0.5 h-5 w-5 text-slate-400 shrink-0" />
                  <div className="space-y-1.5">
                    <p className="text-sm font-medium text-slate-800">
                      District supervision guidance for {activeDistrict.district}
                    </p>
                    <p className="text-xs leading-relaxed text-slate-600">
                      Generate a targeted Medical Officer and ASHA facilitator brief comparing{' '}
                      {activeDistrict.district}&apos;s NFHS-5 antenatal care ({activeDistrict.fourPlusAncPct}%),
                      pregnant anaemia ({activeDistrict.pregnantAnaemiaPct}%), and child stunting (
                      {activeDistrict.childStuntingPct}%) indicators against Karnataka&apos;s state baseline.
                    </p>
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-4 text-xs text-slate-500 space-y-1.5">
                  <p className="font-medium text-slate-700">Included PHC Hubs</p>
                  <p>{activeDistrict.samplePhcs.join(' · ')}</p>
                </div>
              </div>
            )}

            {briefLoading && (
              <div className="mt-6 space-y-3" aria-live="polite">
                <div className="h-4 w-3/4 animate-pulse rounded bg-slate-100" />
                <div className="h-3 w-full animate-pulse rounded bg-slate-100" />
                <div className="h-3 w-5/6 animate-pulse rounded bg-slate-100" />
                <div className="h-3 w-2/3 animate-pulse rounded bg-slate-100" />
              </div>
            )}

            {brief && !briefLoading && (
              <div className="mt-5 space-y-4 text-sm">
                <p className="leading-relaxed text-slate-700">{brief.executiveSummary}</p>

                <div className="space-y-2 border-t border-slate-100 pt-3.5">
                  <h3 className="text-xs font-semibold text-slate-900">Priority Indicator Gaps</h3>
                  <ul className="space-y-1.5 text-xs text-slate-600 list-disc pl-4">
                    {brief.priorityGaps.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>

                <div className="space-y-2 border-t border-slate-100 pt-3.5">
                  <h3 className="text-xs font-semibold text-slate-900">ASHA Home-Visit Directives</h3>
                  <ul className="space-y-1.5 text-xs text-slate-600 list-disc pl-4">
                    {brief.ashaFieldActions.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>

                <div className="space-y-2 border-t border-slate-100 pt-3.5">
                  <h3 className="text-xs font-semibold text-slate-900">PHC Escalation Targets</h3>
                  <ul className="space-y-1.5 text-xs text-slate-600 list-disc pl-4">
                    {brief.phcEscalationTargets.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>

          <div className="mt-6 border-t border-slate-200 pt-3.5 text-xs text-slate-500">
            Data source: MoHFW NFHS-5 (2019–21) Karnataka Fact Sheets · Click any district row below to switch focus.
          </div>
        </section>
      </div>

      {/* High-Density NFHS-5 Karnataka District Matrix */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              District Indicator Matrix ({filteredDistricts.length} Districts)
            </h2>
            <p className="text-xs text-slate-500">
              Click a column heading to sort or select any row to inspect district benchmarks
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-600">
                <th className="py-3 pl-6 pr-3">
                  <button
                    type="button"
                    onClick={() => handleSort('district')}
                    className="hover:text-slate-900 whitespace-nowrap"
                  >
                    District {sortBy === 'district' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                  </button>
                </th>
                <th className="px-3 py-3 whitespace-nowrap">Division</th>
                <th className="px-3 py-3 text-right whitespace-nowrap">Inst. Births</th>
                <th className="px-3 py-3 text-right whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleSort('fourPlusAncPct')}
                    className="hover:text-slate-900 whitespace-nowrap"
                  >
                    4+ ANC {sortBy === 'fourPlusAncPct' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                  </button>
                </th>
                <th className="px-3 py-3 text-right whitespace-nowrap">IFA 100d</th>
                <th className="px-3 py-3 text-right whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleSort('fullImmunizationPct')}
                    className="hover:text-slate-900 whitespace-nowrap"
                  >
                    Full Immun. {sortBy === 'fullImmunizationPct' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                  </button>
                </th>
                <th className="px-3 py-3 text-right whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleSort('childStuntingPct')}
                    className="hover:text-slate-900 whitespace-nowrap"
                  >
                    Stunting &lt;5y {sortBy === 'childStuntingPct' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                  </button>
                </th>
                <th className="py-3 pl-3 pr-6 text-right whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleSort('pregnantAnaemiaPct')}
                    className="hover:text-slate-900 whitespace-nowrap"
                  >
                    Preg. Anaemia {sortBy === 'pregnantAnaemiaPct' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {filteredDistricts.map((d) => {
                const isSelected = d.district === activeDistrict.district;
                return (
                  <tr
                    key={d.district}
                    onClick={() => {
                      setSelectedDistrictName(d.district);
                      setBrief(null);
                      setBriefError(null);
                    }}
                    className={`cursor-pointer transition-colors ${
                      isSelected ? 'bg-teal-50/60' : 'hover:bg-slate-50'
                    }`}
                  >
                    <td className="py-3 pl-6 pr-3 font-medium text-slate-900 whitespace-nowrap">
                      {d.district}
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-500 whitespace-nowrap">
                      {d.division}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-xs text-slate-700 tabular-nums">
                      {d.institutionalBirthsPct.toFixed(1)}%
                    </td>
                    <td
                      className={`px-3 py-3 text-right font-mono text-xs tabular-nums ${
                        d.fourPlusAncPct < 65 ? 'font-medium text-amber-700' : 'text-slate-700'
                      }`}
                    >
                      {d.fourPlusAncPct.toFixed(1)}%
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-xs text-slate-700 tabular-nums">
                      {d.ifa100DaysPct.toFixed(1)}%
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-xs text-slate-700 tabular-nums">
                      {d.fullImmunizationPct.toFixed(1)}%
                    </td>
                    <td
                      className={`px-3 py-3 text-right font-mono text-xs tabular-nums ${
                        d.childStuntingPct >= 42 ? 'font-semibold text-red-700' : 'text-slate-700'
                      }`}
                    >
                      {d.childStuntingPct.toFixed(1)}%
                    </td>
                    <td
                      className={`py-3 pl-3 pr-6 text-right font-mono text-xs tabular-nums ${
                        d.pregnantAnaemiaPct >= 52 ? 'font-semibold text-red-700' : 'text-slate-700'
                      }`}
                    >
                      {d.pregnantAnaemiaPct.toFixed(1)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
