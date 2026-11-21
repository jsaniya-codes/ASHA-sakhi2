import React, { useMemo } from 'react';
import {
  AlertTriangle,
  Baby,
  ClipboardList,
  Download,
  FileSpreadsheet,
  HeartPulse,
  Home,
  Mic,
  Stethoscope,
  Users,
} from 'lucide-react';
import {
  exportReportsSummaryToExcel,
  exportReportsSummaryToPdf,
} from '../utils/exportReports';
import type { ReportsSummary } from '../types';

interface ReportsDashboardProps {
  summary: ReportsSummary | null;
  loading: boolean;
  onRefresh: () => Promise<void>;
}

export function ReportsDashboard({ summary, loading, onRefresh }: ReportsDashboardProps) {
  const maxMonthly = useMemo(() => {
    if (!summary) return 1;
    return Math.max(
      1,
      ...summary.monthlyActivity.map((m) => m.visits + m.checkups + m.alerts)
    );
  }, [summary]);

  if (loading && !summary) {
    return (
      <div className="rounded-xl border border-[#e2e7e0] bg-white p-12 text-center text-sm text-slate-500">
        Aggregating live SQLite healthcare records...
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="rounded-xl border border-[#e2e7e0] bg-white p-10 text-center">
        <p className="text-sm text-slate-600">Unable to load report totals right now.</p>
        <button
          type="button"
          onClick={() => onRefresh()}
          className="mt-3 rounded-lg bg-[#1f6f5c] px-4 py-2 text-xs font-semibold text-white"
        >
          Retry Aggregation
        </button>
      </div>
    );
  }

  const t = summary.totals;

  return (
    <div className="space-y-6">
      {/* Header + Export Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e2e7e0] bg-white p-4">
        <div>
          <h2 className="text-sm font-bold text-slate-900">
            Live Field Program Reports (Locally Collected Records)
          </h2>
          <p className="text-xs text-slate-500">
            All metrics are aggregated directly from the AshaSakhi SQLite database — zero mock counters.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => exportReportsSummaryToPdf(summary)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
          >
            <Download className="h-3.5 w-3.5 text-[#1f6f5c]" />
            Download PDF Report
          </button>
          <button
            type="button"
            onClick={() => exportReportsSummaryToExcel(summary)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#1f6f5c] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#185848]"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Download Excel (.xlsx)
          </button>
        </div>
      </div>

      {/* 8-Card Real Totals Grid */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-[#e2e7e0] bg-white p-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Village Families</span>
            <Home className="h-4 w-4 text-[#1f6f5c]" />
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">{t.families}</p>
          <p className="mt-0.5 text-[11px] text-slate-500">Registered households</p>
        </div>

        <div className="rounded-xl border border-[#e2e7e0] bg-white p-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Registered People</span>
            <Users className="h-4 w-4 text-sky-600" />
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">{t.people}</p>
          <p className="mt-0.5 text-[11px] text-slate-500">Active directory profiles</p>
        </div>

        <div className="rounded-xl border border-[#e2e7e0] bg-white p-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Field Visits Logged</span>
            <ClipboardList className="h-4 w-4 text-teal-700" />
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">{t.visits}</p>
          <p className="mt-0.5 text-[11px] text-slate-500">Voice & manual visit register</p>
        </div>

        <div className="rounded-xl border border-[#e2e7e0] bg-white p-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Pregnant / PNC Women</span>
            <HeartPulse className="h-4 w-4 text-rose-600" />
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">{t.pregnantWomen}</p>
          <p className="mt-0.5 text-[11px] text-red-700 font-medium tabular-nums">
            {t.highRiskPregnancies} flagged High-Risk
          </p>
        </div>

        <div className="rounded-xl border border-[#e2e7e0] bg-white p-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Children & Vaccines</span>
            <Baby className="h-4 w-4 text-indigo-600" />
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">{t.children}</p>
          <p className="mt-0.5 text-[11px] text-slate-500 tabular-nums">
            {t.vaccinatedChildren} vaccinated · {t.totalVaccinesLogged} doses
          </p>
        </div>

        <div className="rounded-xl border border-[#e2e7e0] bg-white p-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Health Checkups</span>
            <Stethoscope className="h-4 w-4 text-emerald-700" />
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">
            {t.completedCheckups + t.pendingCheckups}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500 tabular-nums">
            {t.completedCheckups} completed · {t.pendingCheckups} pending follow-up
          </p>
        </div>

        <div className="rounded-xl border border-[#e2e7e0] bg-white p-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Danger Alerts</span>
            <AlertTriangle className="h-4 w-4 text-red-600" />
          </div>
          <p className="mt-2 text-2xl font-bold text-red-700 tabular-nums">{t.activeAlerts}</p>
          <p className="mt-0.5 text-[11px] text-slate-500 tabular-nums">
            Active/Referred · {t.resolvedAlerts} resolved
          </p>
        </div>

        <div className="rounded-xl border border-[#e2e7e0] bg-white p-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Saved Voice Guidance</span>
            <Mic className="h-4 w-4 text-[#1f6f5c]" />
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">{t.voiceInteractions}</p>
          <p className="mt-0.5 text-[11px] text-slate-500">Archived in Health Histories</p>
        </div>
      </div>

      {/* Village Breakdown Table + Monthly Activity Chart */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <section className="xl:col-span-7 rounded-xl border border-[#e2e7e0] bg-white overflow-hidden">
          <div className="border-b border-slate-200 px-5 py-3.5">
            <h3 className="text-sm font-bold text-slate-900">Village-Wise Coverage Breakdown</h3>
            <p className="text-xs text-slate-500">Live counts across registered villages and sub-centres</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-[#f9faf8] text-[11px] font-semibold text-slate-500">
                <tr>
                  <th className="px-4 py-3">Village / District</th>
                  <th className="px-4 py-3 text-right">Families</th>
                  <th className="px-4 py-3 text-right">People</th>
                  <th className="px-4 py-3 text-right">Visits</th>
                  <th className="px-4 py-3 text-right">Checkups</th>
                  <th className="px-4 py-3 text-right">Active Alerts</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 tabular-nums">
                {summary.villageStats.map((v) => (
                  <tr key={`${v.village}-${v.district}`} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <span className="font-semibold text-slate-900">{v.village}</span>
                      <span className="text-slate-400"> · {v.district}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{v.families}</td>
                    <td className="px-4 py-3 text-right font-mono">{v.people}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-[#1f6f5c]">{v.visits}</td>
                    <td className="px-4 py-3 text-right font-mono">{v.checkups}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-red-700">
                      {v.activeAlerts}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Monthly Activity Bar Visualization */}
        <section className="xl:col-span-5 rounded-xl border border-[#e2e7e0] bg-white p-5">
          <h3 className="text-sm font-bold text-slate-900">Monthly Field Activity Trend</h3>
          <p className="text-xs text-slate-500">Home visits, checkups, and danger alerts by month</p>

          <div className="mt-5 space-y-4">
            {summary.monthlyActivity.length === 0 ? (
              <p className="py-10 text-center text-xs text-slate-500">No monthly records logged yet.</p>
            ) : (
              summary.monthlyActivity.map((m) => {
                const total = m.visits + m.checkups + m.alerts;
                const visitW = (m.visits / maxMonthly) * 100;
                const checkupW = (m.checkups / maxMonthly) * 100;
                const alertW = (m.alerts / maxMonthly) * 100;
                return (
                  <div key={m.month} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs tabular-nums">
                      <span className="font-mono font-semibold text-slate-800">{m.month}</span>
                      <span className="text-slate-500">
                        {m.visits} visits · {m.checkups} checkups · {m.alerts} alerts ({total})
                      </span>
                    </div>
                    <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
                      <div className="bg-[#1f6f5c]" style={{ width: `${visitW}%` }} title={`Visits: ${m.visits}`} />
                      <div className="bg-sky-500" style={{ width: `${checkupW}%` }} title={`Checkups: ${m.checkups}`} />
                      <div className="bg-red-500" style={{ width: `${alertW}%` }} title={`Alerts: ${m.alerts}`} />
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-4 border-t border-slate-100 pt-3 text-[11px] text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-[#1f6f5c]" /> Field Visits
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-sky-500" /> Checkups
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-red-500" /> Danger Alerts
            </span>
          </div>
        </section>
      </div>
    </div>
  );
}
