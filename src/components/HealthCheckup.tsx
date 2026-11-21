import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Plus,
  Search,
  Stethoscope,
  X,
} from 'lucide-react';
import { KARNATAKA_DISTRICTS } from '../data/nfhs5Karnataka';
import { parseApiResponse } from '../utils/apiClient';
import type { AuthUser, HealthCheckupRecord, PersonRecord } from '../types';

interface HealthCheckupProps {
  checkups: HealthCheckupRecord[];
  people: PersonRecord[];
  user: AuthUser | null;
  authToken: string | null;
  onRequestAuth: () => void;
  onRefresh: () => Promise<void>;
}

export function HealthCheckup({
  checkups,
  people,
  user,
  authToken,
  onRequestAuth,
  onRefresh,
}: HealthCheckupProps) {
  const [search, setSearch] = useState('');
  const [trendPatient, setTrendPatient] = useState<string>('');
  const [showForm, setShowForm] = useState(false);

  // Checkup form fields
  const [personId, setPersonId] = useState('');
  const [personName, setPersonName] = useState('');
  const [village, setVillage] = useState('');
  const [district, setDistrict] = useState(user?.district || 'Raichur');
  const [checkupDate, setCheckupDate] = useState(new Date().toISOString().slice(0, 10));
  const [bpSys, setBpSys] = useState('120');
  const [bpDia, setBpDia] = useState('80');
  const [tempC, setTempC] = useState('36.8');
  const [weightKg, setWeightKg] = useState('54');
  const [sugar, setSugar] = useState('108');
  const [hb, setHb] = useState('11.2');
  const [spo2, setSpo2] = useState('98');
  const [symptoms, setSymptoms] = useState('');
  const [observations, setObservations] = useState('');
  const [status, setStatus] = useState<'Completed' | 'Pending Follow-up'>('Completed');

  const [submitting, setSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const patientNames = useMemo(
    () => Array.from(new Set(checkups.map((c) => c.person_name))).sort(),
    [checkups]
  );

  const activeTrendPatient = trendPatient || patientNames[0] || '';

  const patientTrendData = useMemo(() => {
    if (!activeTrendPatient) return [];
    return [...checkups]
      .filter((c) => c.person_name === activeTrendPatient)
      .sort((a, b) => a.checkup_date.localeCompare(b.checkup_date));
  }, [checkups, activeTrendPatient]);

  const filteredCheckups = useMemo(() => {
    const q = search.trim().toLowerCase();
    return checkups.filter((c) => {
      if (!q) return true;
      return (
        c.person_name.toLowerCase().includes(q) ||
        c.village.toLowerCase().includes(q) ||
        c.symptoms.toLowerCase().includes(q) ||
        c.clinical_flags.join(' ').toLowerCase().includes(q)
      );
    });
  }, [checkups, search]);

  const handleSelectPerson = (pid: string) => {
    setPersonId(pid);
    const p = people.find((x) => String(x.id) === pid);
    if (p) {
      setPersonName(p.full_name);
      setVillage(p.village);
      setDistrict(p.district);
    }
  };

  // Live preview of WHO/NHM reference alerts while filling form
  const liveWarnings = useMemo(() => {
    const warns: string[] = [];
    const sys = Number(bpSys);
    const dia = Number(bpDia);
    const t = Number(tempC);
    const s = Number(sugar);
    const h = Number(hb);
    const o2 = Number(spo2);
    if (sys >= 140 || dia >= 90) warns.push(`Elevated BP (${sys}/${dia} mmHg) — Doctor review advised`);
    if (t >= 38.0) warns.push(`Fever (${t} °C) — Check malaria/dengue & hydration`);
    if (s >= 200) warns.push(`High Blood Sugar (${s} mg/dL) — Refer to PHC NCD Clinic`);
    if (h > 0 && h < 11) warns.push(`Low Hemoglobin (${h} g/dL) — Anaemia management required`);
    if (o2 > 0 && o2 < 94) warns.push(`Low SpO2 (${o2}%) — Immediate medical referral`);
    return warns;
  }, [bpSys, bpDia, tempC, sugar, hb, spo2]);

  const handleCreateCheckup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authToken) {
      onRequestAuth();
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const res = await fetch('/api/checkups', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          person_id: personId ? Number(personId) : null,
          person_name: personName.trim(),
          village: village.trim(),
          district,
          checkup_date: checkupDate,
          bp_systolic: bpSys ? Number(bpSys) : null,
          bp_diastolic: bpDia ? Number(bpDia) : null,
          temperature_c: tempC ? Number(tempC) : null,
          weight_kg: weightKg ? Number(weightKg) : null,
          blood_sugar_mgdl: sugar ? Number(sugar) : null,
          hemoglobin_gdl: hb ? Number(hb) : null,
          spo2_pct: spo2 ? Number(spo2) : null,
          symptoms: symptoms.trim(),
          observations: observations.trim(),
          status: liveWarnings.length > 0 ? 'Pending Follow-up' : status,
        }),
      });
      const data = await parseApiResponse<{ checkup: HealthCheckupRecord }>(res, 'Could not record checkup.');
      setShowForm(false);
      setSymptoms('');
      setObservations('');
      setTrendPatient(data.checkup.person_name);
      setStatusMsg(`Recorded health checkup for ${data.checkup.person_name}.`);
      await onRefresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Checkup save failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* KPI & Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e2e7e0] bg-white p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search patient, village, clinical flag..."
              className="w-64 rounded-lg border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-900 focus:border-[#1f6f5c] focus:outline-none"
            />
          </div>
          <span className="text-xs text-slate-500 tabular-nums">
            Total Checkups: <strong className="text-slate-900">{checkups.length}</strong> · Pending Follow-up:{' '}
            <strong className="text-amber-700">
              {checkups.filter((c) => c.status === 'Pending Follow-up').length}
            </strong>
          </span>
        </div>

        <button
          type="button"
          onClick={() => {
            if (!authToken) {
              onRequestAuth();
              return;
            }
            setShowForm(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#1f6f5c] px-4 py-2 text-xs font-semibold text-white hover:bg-[#185848]"
        >
          <Plus className="h-4 w-4" />
          Record Health Checkup
        </button>
      </div>

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
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-medium text-red-800">
          {errorMsg}
        </div>
      )}

      {/* Longitudinal Vitals Trend Chart */}
      {patientNames.length > 0 && (
        <section className="rounded-xl border border-[#e2e7e0] bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="inline-flex items-center gap-2 text-sm font-bold text-slate-900">
                <Activity className="h-4 w-4 text-[#1f6f5c]" />
                Longitudinal Patient Vitals Trend
              </h2>
              <p className="text-xs text-slate-500">
                Compare systolic BP, hemoglobin, and weight across visits over time
              </p>
            </div>
            <select
              value={activeTrendPatient}
              onChange={(e) => setTrendPatient(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800"
            >
              {patientNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
            {patientTrendData.map((c) => (
              <div key={c.id} className="rounded-lg border border-slate-200 bg-[#f9faf8] p-3.5 text-xs">
                <div className="flex items-center justify-between font-mono text-[11px] text-slate-500">
                  <span>{c.checkup_date}</span>
                  <span className={c.clinical_flags.length > 0 ? 'font-semibold text-amber-700' : 'text-[#1f6f5c]'}>
                    {c.status}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 font-mono tabular-nums">
                  <div>
                    <span className="block font-sans text-[10px] text-slate-500">BP</span>
                    <strong className="text-slate-900">
                      {c.bp_systolic ?? '—'}/{c.bp_diastolic ?? '—'}
                    </strong>
                  </div>
                  <div>
                    <span className="block font-sans text-[10px] text-slate-500">Hb</span>
                    <strong className="text-slate-900">{c.hemoglobin_gdl ?? '—'}</strong>
                  </div>
                  <div>
                    <span className="block font-sans text-[10px] text-slate-500">Sugar</span>
                    <strong className="text-slate-900">{c.blood_sugar_mgdl ?? '—'}</strong>
                  </div>
                </div>
                {c.clinical_flags.length > 0 && (
                  <p className="mt-2 text-[11px] font-medium text-red-700">{c.clinical_flags[0]}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Checkup History Table */}
      <section className="rounded-xl border border-[#e2e7e0] bg-white overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-3.5 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Health Checkup Register ({filteredCheckups.length})</h2>
            <p className="text-xs text-slate-500">Automated clinical threshold alerts assist ASHA referral decisions</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-[#f9faf8] text-[11px] font-semibold text-slate-500">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Patient & Village</th>
                <th className="px-4 py-3">BP / Temp / SpO2</th>
                <th className="px-4 py-3">Hb / Sugar / Wt</th>
                <th className="px-4 py-3">Clinical Assessment & Flags</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredCheckups.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-slate-600 whitespace-nowrap tabular-nums">
                    {c.checkup_date}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-900">{c.person_name}</div>
                    <div className="text-[11px] text-slate-500">
                      {c.village}, {c.district}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-800 whitespace-nowrap tabular-nums">
                    {c.bp_systolic && c.bp_diastolic ? `${c.bp_systolic}/${c.bp_diastolic}` : '—'} ·{' '}
                    {c.temperature_c !== null ? `${c.temperature_c}°C` : '—'} ·{' '}
                    {c.spo2_pct !== null ? `${c.spo2_pct}%` : '—'}
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-800 whitespace-nowrap tabular-nums">
                    {c.hemoglobin_gdl !== null ? `${c.hemoglobin_gdl} g/dL` : '—'} ·{' '}
                    {c.blood_sugar_mgdl !== null ? `${c.blood_sugar_mgdl} mg/dL` : '—'} ·{' '}
                    {c.weight_kg !== null ? `${c.weight_kg} kg` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {c.clinical_flags.length > 0 ? (
                      <div className="space-y-1">
                        {c.clinical_flags.map((flag, idx) => (
                          <div key={idx} className="flex items-center gap-1.5 font-semibold text-red-700">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                            <span>{flag}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="font-semibold text-[#1f6f5c]">All vitals within normal reference range</span>
                    )}
                    {c.observations && <p className="mt-1 text-[11px] text-slate-500">{c.observations}</p>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* NEW CHECKUP MODAL */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="inline-flex items-center gap-2 text-lg font-bold text-slate-900">
                <Stethoscope className="h-5 w-5 text-[#1f6f5c]" />
                Record Basic Health Checkup
              </h3>
              <button type="button" onClick={() => setShowForm(false)} className="text-slate-400">
                <X className="h-5 w-5" />
              </button>
            </div>

            {liveWarnings.length > 0 && (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950 space-y-1">
                <p className="font-bold text-amber-900">Clinical Reference Alerts Detected:</p>
                {liveWarnings.map((w, i) => (
                  <p key={i}>• {w}</p>
                ))}
              </div>
            )}

            <form onSubmit={handleCreateCheckup} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="sm:col-span-3">
                <label className="block text-xs font-semibold text-slate-700">Select Patient from Directory (Optional)</label>
                <select
                  value={personId}
                  onChange={(e) => handleSelectPerson(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">-- Enter manually or select resident --</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name} ({p.person_code} · {p.age}y · {p.village})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">Patient Name *</label>
                <input
                  required
                  value={personName}
                  onChange={(e) => setPersonName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">Village *</label>
                <input
                  required
                  value={village}
                  onChange={(e) => setVillage(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">District</label>
                <select
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  {KARNATAKA_DISTRICTS.map((d) => (
                    <option key={d.district} value={d.district}>
                      {d.district}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">Checkup Date</label>
                <input
                  type="date"
                  value={checkupDate}
                  onChange={(e) => setCheckupDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">BP Systolic (mmHg)</label>
                <input
                  type="number"
                  value={bpSys}
                  onChange={(e) => setBpSys(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">BP Diastolic (mmHg)</label>
                <input
                  type="number"
                  value={bpDia}
                  onChange={(e) => setBpDia(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">Temperature (°C)</label>
                <input
                  type="number"
                  step="0.1"
                  value={tempC}
                  onChange={(e) => setTempC(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">Weight (kg)</label>
                <input
                  type="number"
                  step="0.1"
                  value={weightKg}
                  onChange={(e) => setWeightKg(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">Blood Sugar (mg/dL)</label>
                <input
                  type="number"
                  value={sugar}
                  onChange={(e) => setSugar(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">Hemoglobin (g/dL)</label>
                <input
                  type="number"
                  step="0.1"
                  value={hb}
                  onChange={(e) => setHb(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">SpO2 (%)</label>
                <input
                  type="number"
                  value={spo2}
                  onChange={(e) => setSpo2(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as 'Completed' | 'Pending Follow-up')}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="Completed">Completed</option>
                  <option value="Pending Follow-up">Pending Follow-up</option>
                </select>
              </div>
              <div className="sm:col-span-3">
                <label className="block text-xs font-semibold text-slate-700">Symptoms Reported</label>
                <input
                  value={symptoms}
                  onChange={(e) => setSymptoms(e.target.value)}
                  placeholder="e.g. Fatigue, dizziness, mild cough..."
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="sm:col-span-3">
                <label className="block text-xs font-semibold text-slate-700">ASHA Observations & Follow-up Plan</label>
                <textarea
                  rows={2}
                  value={observations}
                  onChange={(e) => setObservations(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="sm:col-span-3 flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-[#1f6f5c] px-5 py-2 text-xs font-semibold text-white hover:bg-[#185848]"
                >
                  {submitting ? 'Saving...' : 'Save Checkup'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
