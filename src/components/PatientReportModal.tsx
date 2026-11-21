import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  Download,
  ExternalLink,
  FileText,
  HeartPulse,
  Loader2,
  ShieldAlert,
  Syringe,
  X,
} from 'lucide-react';
import { parseApiResponse } from '../utils/apiClient';
import {
  createPatientReportPdfBlobUrl,
  downloadPatientReportPdf,
} from '../utils/patientReportPdf';
import type { PatientFullReportData, PersonRecord } from '../types';

interface PatientReportModalProps {
  person: PersonRecord;
  authToken: string | null;
  onClose: () => void;
}

type ReportTab = 'summary' | 'full' | 'pdf-preview';

export function PatientReportModal({ person, authToken, onClose }: PatientReportModalProps) {
  const [report, setReport] = useState<PatientFullReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ReportTab>('summary');
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/patients/${person.id}/report`, {
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
    })
      .then((res) => parseApiResponse<{ report: PatientFullReportData }>(res, 'Could not load patient report.'))
      .then((data) => {
        if (!cancelled) setReport(data.report);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load patient report.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [person.id, authToken]);

  useEffect(() => {
    if (activeTab !== 'pdf-preview' || !report) return;
    const url = createPatientReportPdfBlobUrl(report, 'full');
    setPdfPreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
      setPdfPreviewUrl(null);
    };
  }, [activeTab, report]);

  const latestCheckup = report?.checkups[0] || null;
  const latestMaternal = report?.maternalRecords[0] || null;
  const activeAlerts = report?.alerts.filter((a) => a.status !== 'Resolved') || [];
  const upcomingAppts = report?.appointments.filter((a) => a.status === 'Scheduled') || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 sm:p-5">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[#dce4dc] bg-white shadow-2xl">
        {/* Modal Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e2e7e0] bg-[#1f6f5c] px-5 py-4 text-white">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-teal-100">
              AshaSakhi AI · Individual Patient Report
            </p>
            <h2 className="truncate text-base font-bold">
              {person.full_name} ({person.person_code})
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {report && (
              <>
                <button
                  type="button"
                  onClick={() => downloadPatientReportPdf(report, 'summary')}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/25"
                >
                  <Download className="h-3.5 w-3.5" />
                  Summary PDF
                </button>
                <button
                  type="button"
                  onClick={() => downloadPatientReportPdf(report, 'full')}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3.5 py-1.5 text-xs font-bold text-[#1f6f5c] hover:bg-teal-50"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download PDF
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close report modal"
              className="rounded-lg p-1.5 text-teal-100 hover:bg-white/15 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs: Short Summary | Open Full Report | PDF Document Preview */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-[#f4f6f2] px-5 py-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveTab('summary')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                activeTab === 'summary'
                  ? 'bg-white text-[#1f6f5c] shadow-xs ring-1 ring-[#d7dfd5]'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileText className="h-3.5 w-3.5" />
              Short Report Summary
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('full')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                activeTab === 'full'
                  ? 'bg-white text-[#1f6f5c] shadow-xs ring-1 ring-[#d7dfd5]'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open Full Report (13 Sections)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('pdf-preview')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                activeTab === 'pdf-preview'
                  ? 'bg-white text-[#1f6f5c] shadow-xs ring-1 ring-[#d7dfd5]'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileText className="h-3.5 w-3.5" />
              PDF Preview
            </button>
          </div>
          {report && (
            <span className="font-mono text-[11px] text-slate-500">
              Generated: {new Date(report.generated_at).toLocaleString('en-IN')}
            </span>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-xs text-slate-500">
              <Loader2 className="h-6 w-6 animate-spin text-[#1f6f5c]" />
              <p className="mt-2 font-medium">Compiling verified patient records from database...</p>
            </div>
          ) : error || !report ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-800">
              {error || 'Unable to load report.'}
            </div>
          ) : activeTab === 'summary' ? (
            <div className="space-y-4">
              {/* Short Report Summary View */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl border border-slate-200 bg-[#f9faf8] p-3">
                  <p className="text-[11px] text-slate-500">Home Visits</p>
                  <p className="mt-1 font-mono text-xl font-bold text-slate-900">{report.visits.length}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-[#f9faf8] p-3">
                  <p className="text-[11px] text-slate-500">Health Checkups</p>
                  <p className="mt-1 font-mono text-xl font-bold text-slate-900">{report.checkups.length}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-[#f9faf8] p-3">
                  <p className="text-[11px] text-slate-500">Scheduled Appts</p>
                  <p className="mt-1 font-mono text-xl font-bold text-[#1f6f5c]">{upcomingAppts.length}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-[#f9faf8] p-3">
                  <p className="text-[11px] text-slate-500">Active Alerts</p>
                  <p className={`mt-1 font-mono text-xl font-bold ${activeAlerts.length > 0 ? 'text-red-700' : 'text-slate-900'}`}>
                    {activeAlerts.length}
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-[#e2e7e0] p-4 text-xs space-y-2">
                <h3 className="font-bold text-slate-900">Patient Snapshot (Recorded Data Only)</h3>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 text-slate-700">
                  <p><strong>ID:</strong> <span className="font-mono">{report.patient.person_code}</span></p>
                  <p><strong>Category:</strong> {report.patient.category}</p>
                  <p><strong>Age / Gender:</strong> {report.patient.age} yrs / {report.patient.gender}</p>
                  <p><strong>Blood Group:</strong> {report.patient.blood_group || 'Not recorded'}</p>
                  <p><strong>Location:</strong> {report.patient.village}, {report.patient.district}</p>
                  <p><strong>Phone:</strong> {report.patient.phone || 'Not recorded'}</p>
                  <p className="sm:col-span-2">
                    <strong>Known Conditions:</strong> {report.patient.chronic_conditions || 'None recorded'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-xs">
                <div className="rounded-xl border border-slate-200 p-4">
                  <p className="flex items-center gap-1.5 font-bold text-slate-900">
                    <HeartPulse className="h-4 w-4 text-[#1f6f5c]" /> Latest Recorded Vitals
                  </p>
                  {latestCheckup ? (
                    <div className="mt-2 space-y-1 text-slate-700">
                      <p className="font-mono text-[11px] text-slate-500">Date: {latestCheckup.checkup_date}</p>
                      <p>
                        BP: {latestCheckup.bp_systolic ?? '—'}/{latestCheckup.bp_diastolic ?? '—'} mmHg · Hb:{' '}
                        {latestCheckup.hemoglobin_gdl ?? '—'} g/dL · Sugar: {latestCheckup.blood_sugar_mgdl ?? '—'} mg/dL
                      </p>
                      <p className="text-slate-600">{latestCheckup.observations || latestCheckup.summary || 'Not recorded'}</p>
                    </div>
                  ) : (
                    <p className="mt-2 text-slate-500 italic">No health checkup vitals recorded yet.</p>
                  )}
                </div>

                <div className="rounded-xl border border-slate-200 p-4">
                  <p className="flex items-center gap-1.5 font-bold text-slate-900">
                    <Calendar className="h-4 w-4 text-[#1f6f5c]" /> Next Follow-up & Maternal Status
                  </p>
                  {latestMaternal && (
                    <p className="mt-2 text-slate-700">
                      <strong>Maternal:</strong> {latestMaternal.postnatal_status} · {latestMaternal.anc_visits_completed} ANC visits · EDD {latestMaternal.edd_date || 'Not recorded'}
                    </p>
                  )}
                  {upcomingAppts.length > 0 ? (
                    <p className="mt-1.5 text-slate-700">
                      <strong>Next Appointment:</strong> {upcomingAppts[0].appointment_date} {upcomingAppts[0].appointment_time} — {upcomingAppts[0].appointment_type} ({upcomingAppts[0].purpose})
                    </p>
                  ) : (
                    <p className="mt-2 text-slate-500 italic">No upcoming appointments scheduled.</p>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('full')}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#1f6f5c] px-4 py-2 text-xs font-semibold text-[#1f6f5c] hover:bg-[#1f6f5c]/5"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open Full Report
                </button>
                <button
                  type="button"
                  onClick={() => downloadPatientReportPdf(report, 'full')}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#1f6f5c] px-4 py-2 text-xs font-semibold text-white hover:bg-[#185848]"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download Full PDF
                </button>
              </div>
            </div>
          ) : activeTab === 'full' ? (
            <div className="space-y-5 text-xs">
              {/* Complete 13-Section Clinical Report View */}
              <div className="rounded-xl border border-[#1f6f5c]/25 bg-[#f4faf8] p-4">
                <p className="text-[11px] font-bold uppercase tracking-wider text-[#1f6f5c]">
                  1. AshaSakhi AI Individual Patient Health Report
                </p>
                <p className="mt-1 text-slate-600">
                  Compiled exclusively from recorded database entries for{' '}
                  <strong>{report.patient.full_name}</strong> ({report.patient.person_code}). Missing
                  fields are explicitly marked as &ldquo;Not recorded&rdquo;.
                </p>
              </div>

              {/* 2 & 3. Identification & Basic Info */}
              <section className="rounded-xl border border-slate-200 p-4">
                <h3 className="font-bold text-[#1f6f5c]">2 & 3. Patient Identification & Basic Information</h3>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3 text-slate-700">
                  <p><strong>Patient ID:</strong> <span className="font-mono">{report.patient.person_code}</span></p>
                  <p><strong>Full Name:</strong> {report.patient.full_name}</p>
                  <p><strong>Age / Gender:</strong> {report.patient.age}y / {report.patient.gender}</p>
                  <p><strong>Category:</strong> {report.patient.category}</p>
                  <p><strong>Blood Group:</strong> {report.patient.blood_group || 'Not recorded'}</p>
                  <p><strong>Phone:</strong> {report.patient.phone || 'Not recorded'}</p>
                  <p><strong>Village / District:</strong> {report.patient.village}, {report.patient.district}</p>
                  <p><strong>Family ID:</strong> {report.patient.family_code || 'Not linked'}</p>
                  <p><strong>Known Conditions:</strong> {report.patient.chronic_conditions || 'Not recorded'}</p>
                </div>
              </section>

              {/* 4. Pregnancy Details */}
              <section className="rounded-xl border border-slate-200 p-4">
                <h3 className="font-bold text-[#1f6f5c]">4. Pregnancy Details</h3>
                {report.maternalRecords.length === 0 ? (
                  <p className="mt-1.5 italic text-slate-500">Not applicable / No maternal record on file.</p>
                ) : (
                  <div className="mt-2 space-y-2">
                    {report.maternalRecords.map((m) => (
                      <div key={m.id} className="rounded-lg bg-[#f9faf8] p-3 text-slate-700">
                        <p className="font-semibold text-slate-900">
                          {m.postnatal_status} · G{m.gravida} P{m.para} · LMP: {m.lmp_date || 'Not recorded'} · EDD: {m.edd_date || 'Not recorded'}
                        </p>
                        <p className="mt-1">
                          ANC Visits: {m.anc_visits_completed} · IFA Tablets: {m.ifa_tablets_total} · BP: {m.bp_reading || 'Not recorded'} · Hb: {m.hemoglobin_gdl ?? 'Not recorded'} g/dL · Next ANC: {m.next_anc_date || 'Not recorded'}
                        </p>
                        {m.high_risk && (
                          <p className="mt-1 font-semibold text-red-700">
                            High Risk Flagged: {m.high_risk_reasons || 'High-risk maternal case'}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* 5 & 6. ANC Visit History + Vitals */}
              <section className="rounded-xl border border-slate-200 p-4">
                <h3 className="font-bold text-[#1f6f5c]">5 & 6. ANC History, Blood Pressure & Recorded Vitals</h3>
                {report.checkups.length === 0 && report.visits.length === 0 ? (
                  <p className="mt-1.5 italic text-slate-500">No vitals or checkup history recorded yet.</p>
                ) : (
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full text-left text-[11px]">
                      <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                        <tr>
                          <th className="px-2 py-1.5">Date</th>
                          <th className="px-2 py-1.5">Source</th>
                          <th className="px-2 py-1.5">BP</th>
                          <th className="px-2 py-1.5">Hb</th>
                          <th className="px-2 py-1.5">Sugar</th>
                          <th className="px-2 py-1.5">Weight / Temp</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {report.checkups.map((c) => (
                          <tr key={`chk-${c.id}`}>
                            <td className="px-2 py-1.5 font-mono">{c.checkup_date}</td>
                            <td className="px-2 py-1.5">Checkup</td>
                            <td className="px-2 py-1.5">{c.bp_systolic && c.bp_diastolic ? `${c.bp_systolic}/${c.bp_diastolic}` : '—'}</td>
                            <td className="px-2 py-1.5">{c.hemoglobin_gdl ?? '—'}</td>
                            <td className="px-2 py-1.5">{c.blood_sugar_mgdl ?? '—'}</td>
                            <td className="px-2 py-1.5">{c.weight_kg ?? '—'} kg / {c.temperature_c ?? '—'} °C</td>
                          </tr>
                        ))}
                        {report.visits.map((v) => (
                          <tr key={`vis-${v.id}`}>
                            <td className="px-2 py-1.5 font-mono">{v.visit_date}</td>
                            <td className="px-2 py-1.5">Visit ({v.purpose || 'Home'})</td>
                            <td className="px-2 py-1.5">{v.bp_systolic && v.bp_diastolic ? `${v.bp_systolic}/${v.bp_diastolic}` : '—'}</td>
                            <td className="px-2 py-1.5">{v.hemoglobin_gdl ?? '—'}</td>
                            <td className="px-2 py-1.5">{v.blood_sugar_mgdl ?? '—'}</td>
                            <td className="px-2 py-1.5">{v.weight_kg ?? '—'} kg</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {/* 7. Health Observations & 8. Vaccination Details */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <section className="rounded-xl border border-slate-200 p-4">
                  <h3 className="font-bold text-[#1f6f5c]">7. Health Observations</h3>
                  {report.checkups.length === 0 && report.visits.length === 0 ? (
                    <p className="mt-1.5 italic text-slate-500">No observations recorded.</p>
                  ) : (
                    <ul className="mt-2 space-y-1.5 text-slate-700">
                      {report.checkups.slice(0, 5).map((c) => (
                        <li key={`obs-c-${c.id}`} className="rounded bg-[#f9faf8] p-2">
                          <span className="font-mono text-[10px] text-slate-500">{c.checkup_date}</span> —{' '}
                          {c.observations || c.summary || c.symptoms || 'Not recorded'}
                        </li>
                      ))}
                      {report.visits.slice(0, 5).map((v) => (
                        <li key={`obs-v-${v.id}`} className="rounded bg-[#f9faf8] p-2">
                          <span className="font-mono text-[10px] text-slate-500">{v.visit_date}</span> —{' '}
                          {v.notes || v.recommended_action || v.symptoms || 'Not recorded'}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="rounded-xl border border-slate-200 p-4">
                  <h3 className="flex items-center gap-1.5 font-bold text-[#1f6f5c]">
                    <Syringe className="h-3.5 w-3.5" /> 8. Vaccination Details
                  </h3>
                  {report.childRecords.length === 0 ? (
                    <p className="mt-1.5 italic text-slate-500">No child vaccination records logged.</p>
                  ) : (
                    <div className="mt-2 space-y-2 text-slate-700">
                      {report.childRecords.map((c) => (
                        <div key={c.id} className="rounded bg-[#f9faf8] p-2.5">
                          <p><strong>Completed:</strong> {c.vaccines_completed.join(', ') || 'None recorded'}</p>
                          <p><strong>Next Vaccine:</strong> {c.next_vaccine || 'Not recorded'} ({c.next_vaccine_date || 'Not recorded'})</p>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>

              {/* 9. Previous Home Visits & 10. Follow-up Appointments */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <section className="rounded-xl border border-slate-200 p-4">
                  <h3 className="font-bold text-[#1f6f5c]">9. Previous Home Visits ({report.visits.length})</h3>
                  {report.visits.length === 0 ? (
                    <p className="mt-1.5 italic text-slate-500">No home visits recorded.</p>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {report.visits.map((v) => (
                        <div key={v.id} className="rounded bg-[#f9faf8] p-2.5 text-slate-700">
                          <div className="flex justify-between font-semibold text-slate-900">
                            <span>{v.purpose || 'Home Visit'}</span>
                            <span className="font-mono text-[11px]">{v.visit_date}</span>
                          </div>
                          <p className="mt-0.5 text-slate-600">{v.recommended_action || v.notes || 'Recorded visit'}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section className="rounded-xl border border-slate-200 p-4">
                  <h3 className="font-bold text-[#1f6f5c]">10. Follow-up Appointments ({report.appointments.length})</h3>
                  {report.appointments.length === 0 ? (
                    <p className="mt-1.5 italic text-slate-500">No appointments recorded.</p>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {report.appointments.map((a) => (
                        <div key={a.id} className="rounded bg-[#f9faf8] p-2.5 text-slate-700">
                          <div className="flex justify-between font-semibold text-slate-900">
                            <span>{a.appointment_type}</span>
                            <span className="font-mono text-[11px]">{a.appointment_date} {a.appointment_time}</span>
                          </div>
                          <p className="mt-0.5">{a.purpose} · Status: <strong>{a.status}</strong></p>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>

              {/* 11. Important Health Alerts & 12. Recent Health Updates */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <section className="rounded-xl border border-red-200 bg-red-50/30 p-4">
                  <h3 className="flex items-center gap-1.5 font-bold text-red-800">
                    <ShieldAlert className="h-3.5 w-3.5" /> 11. Important Health Alerts ({report.alerts.length})
                  </h3>
                  {report.alerts.length === 0 ? (
                    <p className="mt-1.5 italic text-slate-500">No danger alerts recorded.</p>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {report.alerts.map((al) => (
                        <div key={al.id} className="rounded border border-red-200 bg-white p-2.5">
                          <p className="font-semibold text-red-800">
                            [{al.severity}] {al.danger_signs.join(', ')} ({al.status})
                          </p>
                          <p className="mt-0.5 text-slate-600">{al.guidance}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section className="rounded-xl border border-slate-200 p-4">
                  <h3 className="font-bold text-[#1f6f5c]">12. Recent Health Updates & Call Logs</h3>
                  {report.notifications.length === 0 && report.callLogs.length === 0 && report.voiceInteractions.length === 0 ? (
                    <p className="mt-1.5 italic text-slate-500">No recent updates or call logs recorded.</p>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {report.notifications.slice(0, 4).map((n) => (
                        <div key={`n-${n.id}`} className="rounded bg-[#f9faf8] p-2">
                          <p className="font-semibold text-slate-900">{n.channel} · {n.category} ({n.delivery_status})</p>
                          <p className="text-slate-600 line-clamp-2">{n.message_body}</p>
                        </div>
                      ))}
                      {report.callLogs.slice(0, 4).map((c) => (
                        <div key={`c-${c.id}`} className="rounded bg-[#f9faf8] p-2">
                          <p className="font-semibold text-slate-900">Call · {c.outcome}</p>
                          <p className="text-slate-600">{c.notes || c.phone_number}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>

              {/* 13. Generation Date */}
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-[#f4f6f2] px-4 py-2.5 text-[11px] text-slate-600">
                <span>13. Report Generation Timestamp: {new Date(report.generated_at).toLocaleString('en-IN')}</span>
                <span className="inline-flex items-center gap-1 font-semibold text-[#1f6f5c]">
                  <AlertTriangle className="h-3.5 w-3.5" /> Strictly Existing Database Records
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span>Live A4 PDF Preview for {report.patient.full_name} ({report.patient.person_code})</span>
                <button
                  type="button"
                  onClick={() => downloadPatientReportPdf(report, 'full')}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#1f6f5c] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#185848]"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download PDF
                </button>
              </div>
              {pdfPreviewUrl ? (
                <iframe
                  title="Individual Patient Report PDF Preview"
                  src={pdfPreviewUrl}
                  className="h-[62vh] w-full rounded-xl border border-slate-200"
                />
              ) : (
                <div className="flex h-[50vh] items-center justify-center text-xs text-slate-500">
                  Rendering PDF preview...
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
