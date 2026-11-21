import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, PhoneCall, ShieldAlert } from 'lucide-react';
import { KARNATAKA_DISTRICTS } from '../data/nfhs5Karnataka';
import { parseApiResponse } from '../utils/apiClient';
import type { AuthUser, DangerAlert, PersonRecord } from '../types';

interface DangerAlertsProps {
  alerts: DangerAlert[];
  people: PersonRecord[];
  currentUser: AuthUser | null;
  authToken: string | null;
  onRequestAuth: () => void;
  onAlertCreated: (alert: DangerAlert) => void;
  onAlertUpdated: (alert: DangerAlert) => void;
}

const DANGER_SIGN_CATALOG: Record<DangerAlert['category'], Array<{ label: string; severity: 'Critical' | 'High' | 'Moderate'; action: string }>> = {
  Maternal: [
    { label: 'Vaginal bleeding during pregnancy or heavy bleeding after delivery', severity: 'Critical', action: 'Call 108 ambulance immediately for emergency obstetric care at FRU.' },
    { label: 'Severe headache with blurred vision or swelling of face/hands', severity: 'Critical', action: 'Suspected pre-eclampsia/eclampsia. Immediate FRU/PHC Medical Officer referral.' },
    { label: 'Convulsions, fits, or loss of consciousness', severity: 'Critical', action: 'Keep airway safe on left side and rush via 108 emergency ambulance.' },
    { label: 'High BP >= 140/90 mmHg or Severe Anaemia (Hb < 7.0 g/dL)', severity: 'High', action: 'Urgent PHC Medical Officer / PMSMA high-risk clinic referral.' },
    { label: 'Reduced or absent fetal movement', severity: 'High', action: 'Escort mother to PHC/FRU for immediate fetal assessment.' },
  ],
  Child: [
    { label: 'Unable to drink or breastfeed / vomiting everything', severity: 'Critical', action: 'Immediate hospital referral via 108 — risk of severe dehydration or sepsis.' },
    { label: 'Fast breathing, chest indrawing, or blue lips', severity: 'Critical', action: 'Suspected severe pneumonia. Immediate emergency medical care at PHC/FRU.' },
    { label: 'Lethargic, unusually drowsy, or unconscious', severity: 'Critical', action: 'Emergency transport via 108 to District Hospital paediatric unit.' },
    { label: 'Convulsions or fits in infant/child', severity: 'Critical', action: 'Keep child on side, do not put anything in mouth, rush to PHC/FRU.' },
    { label: 'High fever > 38.5°C with sunken eyes or severe diarrhoea', severity: 'High', action: 'Begin ORS sips immediately and escort to PHC Medical Officer.' },
  ],
  'Fever / General Illness': [
    { label: 'High persistent fever (> 3 days) with chills, rash, or stiff neck', severity: 'High', action: 'Immediate PHC Medical Officer evaluation for malaria, dengue, or meningitis.' },
    { label: 'Severe chest pain or sudden shortness of breath', severity: 'Critical', action: 'Call 108 immediately for emergency cardiac/respiratory assessment.' },
    { label: 'Persistent vomiting, dark urine, or bleeding gums', severity: 'Critical', action: 'Warning signs of severe dengue — urgent hospital evaluation required.' },
    { label: 'Blood sugar >= 300 mg/dL or < 70 mg/dL with dizziness', severity: 'High', action: 'Escort to PHC immediately; give oral sugar water if conscious & hypoglycemic.' },
  ],
};

export function DangerAlerts({
  alerts,
  people,
  currentUser,
  authToken,
  onRequestAuth,
  onAlertCreated,
  onAlertUpdated,
}: DangerAlertsProps) {
  const [category, setCategory] = useState<DangerAlert['category']>('Maternal');
  const [selectedSigns, setSelectedSigns] = useState<string[]>([]);
  const [selectedPersonId, setSelectedPersonId] = useState('');
  const [personName, setPersonName] = useState('');
  const [village, setVillage] = useState('');
  const [district, setDistrict] = useState(currentUser?.district || 'Raichur');
  const [referralFacility, setReferralFacility] = useState('Nearest PHC / District FRU (Call 108)');
  const [statusFilter, setStatusFilter] = useState<'All' | DangerAlert['status']>('All');

  const [submitting, setSubmitting] = useState(false);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const toggleSign = (label: string) => {
    setSelectedSigns((prev) =>
      prev.includes(label) ? prev.filter((s) => s !== label) : [...prev, label]
    );
  };

  const computedSeverity: DangerAlert['severity'] = selectedSigns.some((s) =>
    DANGER_SIGN_CATALOG[category].some((item) => item.label === s && item.severity === 'Critical')
  )
    ? 'Critical'
    : selectedSigns.length > 0
    ? 'High'
    : 'Moderate';

  const recommendedSteps = DANGER_SIGN_CATALOG[category]
    .filter((item) => selectedSigns.includes(item.label))
    .map((item) => item.action);

  const handlePersonChange = (pid: string) => {
    setSelectedPersonId(pid);
    const p = people.find((x) => String(x.id) === pid);
    if (p) {
      setPersonName(p.full_name);
      setVillage(p.village);
      setDistrict(p.district);
      setReferralFacility(`PHC ${p.district} / District FRU (Call 108)`);
    }
  };

  const handleCreateAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !authToken) {
      onRequestAuth();
      return;
    }
    if (selectedSigns.length === 0) {
      setError('Select at least one observed danger sign from the checklist.');
      return;
    }
    setSubmitting(true);
    setError(null);
    setFeedback(null);
    try {
      const res = await fetch('/api/alerts', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          person_id: selectedPersonId ? Number(selectedPersonId) : null,
          person_name: personName.trim(),
          village: village.trim() || district,
          district,
          category,
          severity: computedSeverity,
          danger_signs: selectedSigns,
          guidance:
            recommendedSteps.join(' ') ||
            'Escort patient immediately to the nearest PHC / FRU Medical Officer via 108 ambulance.',
          referral_facility: referralFacility.trim(),
        }),
      });
      const data = await parseApiResponse<{ alert: DangerAlert }>(res, 'Could not record alert.');
      onAlertCreated(data.alert);
      setSelectedSigns([]);
      setPersonName('');
      setFeedback(`Emergency alert #${data.alert.id} logged for ${data.alert.person_name}.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save danger alert.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusUpdate = async (id: number, status: DangerAlert['status']) => {
    if (!currentUser || !authToken) {
      onRequestAuth();
      return;
    }
    setUpdatingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/alerts/${id}/status`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ status }),
      });
      const data = await parseApiResponse<{ alert: DangerAlert }>(res, 'Could not update alert status.');
      onAlertUpdated(data.alert);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to update status.');
    } finally {
      setUpdatingId(null);
    }
  };

  const visibleAlerts =
    statusFilter === 'All' ? alerts : alerts.filter((a) => a.status === statusFilter);
  const activeCount = alerts.filter((a) => a.status !== 'Resolved').length;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium text-[#5c6b64]">
          Maternal, Child &amp; Fever Danger Sign Screening · Emergency 108 Referral Tracking
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#1c2421]">Danger Alerts</h1>
      </div>

      {/* Prominent Clinical Safety & Emergency Escalation Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-red-300 bg-red-50 px-5 py-4">
        <div className="flex items-start gap-3 max-w-3xl">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-700" />
          <div>
            <p className="text-sm font-bold text-red-900">
              Emergency Protocol — Direct Urgent Cases to Qualified Medical Services Immediately
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-red-800">
              AshaSakhi assists ASHA workers with checklists and referral tracking and{' '}
              <strong>never replaces a qualified doctor or nurse</strong>. For any Critical or High danger sign, call{' '}
              <strong className="font-mono">108</strong> ambulance or escort the patient to the nearest PHC / FRU
              immediately.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 font-mono text-sm font-bold text-red-800 whitespace-nowrap">
          <PhoneCall className="h-4 w-4" />
          Emergency: 108 / 104
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {feedback && (
        <div className="flex items-center gap-2 rounded-xl border border-[#b9d9cf] bg-[#edf6f3] px-4 py-3 text-sm text-[#185a4b]">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {feedback}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* Left: Danger Sign Screening & Alert Logger */}
        <form
          onSubmit={handleCreateAlert}
          className="xl:col-span-5 space-y-4 rounded-xl border border-[#dfe4dc] bg-white p-6"
        >
          <h2 className="text-base font-semibold text-[#1c2421]">Screen &amp; Log Danger Sign Alert</h2>

          <div className="flex flex-wrap gap-1.5 rounded-lg bg-[#f4f6f2] p-1">
            {(['Maternal', 'Child', 'Fever / General Illness'] as const).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => {
                  setCategory(cat);
                  setSelectedSigns([]);
                }}
                className={`flex-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  category === cat ? 'bg-white text-[#1c2421] shadow-sm' : 'text-[#5c6b64]'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-[#394741]">Select Registered Person</label>
              <select
                value={selectedPersonId}
                onChange={(e) => handlePersonChange(e.target.value)}
                className="w-full rounded-lg border border-[#cdd6cb] bg-white px-3 py-2 text-sm"
              >
                <option value="">-- Optional: Pick from People Directory --</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name} ({p.village}, {p.age}y)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[#394741]">Patient Name *</label>
              <input
                required
                value={personName}
                onChange={(e) => setPersonName(e.target.value)}
                placeholder="e.g. Lakshmamma R."
                className="w-full rounded-lg border border-[#cdd6cb] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[#394741]">Village *</label>
              <input
                required
                value={village}
                onChange={(e) => setVillage(e.target.value)}
                placeholder="e.g. Manvi"
                className="w-full rounded-lg border border-[#cdd6cb] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[#394741]">District</label>
              <select
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
                className="w-full rounded-lg border border-[#cdd6cb] bg-white px-3 py-2 text-sm"
              >
                {KARNATAKA_DISTRICTS.map((d) => (
                  <option key={d.district} value={d.district}>
                    {d.district}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[#394741]">Referral Facility</label>
              <input
                value={referralFacility}
                onChange={(e) => setReferralFacility(e.target.value)}
                className="w-full rounded-lg border border-[#cdd6cb] px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="space-y-2 border-t border-[#e8ece6] pt-3">
            <p className="text-xs font-semibold text-[#394741]">
              Check Observed {category} Danger Signs:
            </p>
            {DANGER_SIGN_CATALOG[category].map((item) => {
              const checked = selectedSigns.includes(item.label);
              return (
                <label
                  key={item.label}
                  className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 text-xs transition-colors ${
                    checked
                      ? 'border-red-300 bg-red-50 text-red-900'
                      : 'border-[#e8ece6] bg-[#fafbf9] text-[#1c2421]'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleSign(item.label)}
                    className="mt-0.5 accent-red-600"
                  />
                  <span>
                    <span className="font-medium">{item.label}</span>
                    <span className="ml-1.5 text-[11px] font-semibold text-red-700">({item.severity})</span>
                  </span>
                </label>
              );
            })}
          </div>

          {selectedSigns.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-900">
              <div className="font-bold">Immediate Next Step ({computedSeverity} Priority):</div>
              <p className="mt-1 leading-relaxed">{recommendedSteps[0]}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || selectedSigns.length === 0}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
            Record Danger Alert ({selectedSigns.length} signs)
          </button>
        </form>

        {/* Right: Active & Historical Alerts Tracker */}
        <section className="xl:col-span-7 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-[#1c2421]">
              Alert Tracking Register ({activeCount} Active / Open)
            </h2>
            <div className="flex items-center gap-1 rounded-lg border border-[#dfe4dc] bg-white p-1">
              {(['All', 'Active', 'Referred to PHC/FRU', 'Resolved'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap ${
                    statusFilter === st ? 'bg-[#1f6f5c] text-white' : 'text-[#5c6b64]'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            {visibleAlerts.map((alert) => (
              <div
                key={alert.id}
                className="rounded-xl border border-[#dfe4dc] bg-white p-5 space-y-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-xs font-semibold">
                      <span
                        className={
                          alert.severity === 'Critical'
                            ? 'text-red-700'
                            : alert.severity === 'High'
                            ? 'text-amber-700'
                            : 'text-[#1f6f5c]'
                        }
                      >
                        {alert.severity} Priority
                      </span>
                      <span className="text-[#a0ada6]">·</span>
                      <span className="text-[#5c6b64]">{alert.category}</span>
                      <span className="text-[#a0ada6]">·</span>
                      <span className="font-mono text-[#5c6b64] tabular-nums">
                        {alert.created_at.slice(0, 10)}
                      </span>
                    </div>
                    <h3 className="mt-1 text-base font-bold text-[#1c2421]">
                      {alert.person_name} — {alert.village}, {alert.district}
                    </h3>
                  </div>

                  <select
                    aria-label={`Alert status for ${alert.person_name}`}
                    disabled={updatingId === alert.id}
                    value={alert.status}
                    onChange={(e) =>
                      void handleStatusUpdate(alert.id, e.target.value as DangerAlert['status'])
                    }
                    className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${
                      alert.status === 'Active'
                        ? 'border-red-300 bg-red-50 text-red-800'
                        : alert.status === 'Referred to PHC/FRU'
                        ? 'border-amber-300 bg-amber-50 text-amber-900'
                        : 'border-emerald-300 bg-emerald-50 text-emerald-800'
                    }`}
                  >
                    <option value="Active">Active</option>
                    <option value="Referred to PHC/FRU">Referred to PHC/FRU</option>
                    <option value="Resolved">Resolved</option>
                  </select>
                </div>

                <div className="text-xs text-[#1c2421]">
                  <span className="font-semibold text-red-800">Observed Signs: </span>
                  {alert.danger_signs.join(' · ')}
                </div>

                <p className="text-xs leading-relaxed text-[#394741]">{alert.guidance}</p>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#eef1ec] pt-2.5 text-xs text-[#5c6b64]">
                  <span>Referral: {alert.referral_facility}</span>
                  <span>Reported by {alert.reported_by}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
