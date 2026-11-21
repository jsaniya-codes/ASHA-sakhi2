import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Baby,
  Calendar,
  Check,
  CheckCircle2,
  HeartPulse,
  Plus,
  Search,
  Syringe,
  X,
} from 'lucide-react';
import { KARNATAKA_DISTRICTS } from '../data/nfhs5Karnataka';
import { parseApiResponse } from '../utils/apiClient';
import type { AuthUser, BeneficiaryGender, ChildRecord, MaternalRecord, PersonRecord } from '../types';

interface MaternalAndChildProps {
  maternalRecords: MaternalRecord[];
  childRecords: ChildRecord[];
  people: PersonRecord[];
  user: AuthUser | null;
  authToken: string | null;
  onRequestAuth: () => void;
  onRefresh: () => Promise<void>;
}

const STANDARD_VACCINES = [
  { code: 'BCG', label: 'BCG (At birth)' },
  { code: 'OPV-0', label: 'OPV-0 (At birth)' },
  { code: 'HepB-0', label: 'Hep B Birth dose' },
  { code: 'Penta-1', label: 'Penta-1 (6 weeks)' },
  { code: 'OPV-1', label: 'OPV-1 (6 weeks)' },
  { code: 'Rota-1', label: 'Rotavirus-1 (6 weeks)' },
  { code: 'Penta-2', label: 'Penta-2 (10 weeks)' },
  { code: 'OPV-2', label: 'OPV-2 (10 weeks)' },
  { code: 'Penta-3', label: 'Penta-3 (14 weeks)' },
  { code: 'IPV', label: 'IPV (14 weeks)' },
  { code: 'MR-1', label: 'Measles-Rubella 1 (9m)' },
  { code: 'VitA-1', label: 'Vitamin A 1st dose (9m)' },
  { code: 'MR-2', label: 'Measles-Rubella 2 (16–24m)' },
  { code: 'DPT-B1', label: 'DPT Booster-1 (16–24m)' },
];

function calculateEddFromLmp(lmp: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(lmp)) return '';
  const date = new Date(`${lmp}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  date.setDate(date.getDate() + 280);
  return date.toISOString().slice(0, 10);
}

function getAgeMonths(dob: string): number {
  const birth = new Date(`${dob}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return 0;
  const now = new Date();
  return Math.max(0, (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth()));
}

export function MaternalAndChild({
  maternalRecords,
  childRecords,
  people,
  user,
  authToken,
  onRequestAuth,
  onRefresh,
}: MaternalAndChildProps) {
  const [activeTab, setActiveTab] = useState<'maternal' | 'child'>('maternal');
  const [search, setSearch] = useState('');
  const [riskOnly, setRiskOnly] = useState(false);

  // Maternal creation modal state
  const [showMaternalForm, setShowMaternalForm] = useState(false);
  const [mPersonId, setMPersonId] = useState('');
  const [mName, setMName] = useState('');
  const [mAge, setMAge] = useState('24');
  const [mVillage, setMVillage] = useState('');
  const [mDistrict, setMDistrict] = useState(user?.district || 'Raichur');
  const [mLmp, setMLmp] = useState('');
  const [mEdd, setMEdd] = useState('');
  const [mGravida, setMGravida] = useState('1');
  const [mPara, setMPara] = useState('0');
  const [mAnc, setMAnc] = useState('1');
  const [mIfa, setMIfa] = useState('30');
  const [mHb, setMHb] = useState('10.8');
  const [mBp, setMBp] = useState('120/80');
  const [mNutrition, setMNutrition] = useState('Normal');
  const [mPostnatal, setMPostnatal] = useState('Antenatal');
  const [mHighRisk, setMHighRisk] = useState(false);
  const [mRiskReason, setMRiskReason] = useState('');
  const [mNextAnc, setMNextAnc] = useState('');
  const [mNotes, setMNotes] = useState('');

  // Child creation modal state
  const [showChildForm, setShowChildForm] = useState(false);
  const [cPersonId, setCPersonId] = useState('');
  const [cName, setCName] = useState('');
  const [cMother, setCMother] = useState('');
  const [cDob, setCDob] = useState('');
  const [cGender, setCGender] = useState<BeneficiaryGender>('Female');
  const [cVillage, setCVillage] = useState('');
  const [cDistrict, setCDistrict] = useState(user?.district || 'Raichur');
  const [cBirthWt, setCBirthWt] = useState('2.8');
  const [cCurrWt, setCCurrWt] = useState('7.4');
  const [cCurrHt, setCCurrHt] = useState('68');
  const [cNutrition, setCNutrition] = useState('Normal');
  const [cVaccines, setCVaccines] = useState<string[]>(['BCG', 'OPV-0', 'HepB-0']);
  const [cNextVac, setCNextVac] = useState('Penta-1 + OPV-1');
  const [cNextVacDate, setCNextVacDate] = useState('');
  const [cNotes, setCNotes] = useState('');

  // Active child for vaccine checklist drawer
  const [editingChild, setEditingChild] = useState<ChildRecord | null>(null);
  const [editWeight, setEditWeight] = useState('');
  const [editHeight, setEditHeight] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const filteredMaternal = useMemo(() => {
    const q = search.trim().toLowerCase();
    return maternalRecords.filter((r) => {
      if (riskOnly && !r.high_risk) return false;
      if (!q) return true;
      return (
        r.mother_name.toLowerCase().includes(q) ||
        r.village.toLowerCase().includes(q) ||
        r.district.toLowerCase().includes(q) ||
        r.postnatal_status.toLowerCase().includes(q)
      );
    });
  }, [maternalRecords, search, riskOnly]);

  const filteredChildren = useMemo(() => {
    const q = search.trim().toLowerCase();
    return childRecords.filter((r) => {
      if (!q) return true;
      return (
        r.child_name.toLowerCase().includes(q) ||
        r.mother_name.toLowerCase().includes(q) ||
        r.village.toLowerCase().includes(q) ||
        r.next_vaccine.toLowerCase().includes(q)
      );
    });
  }, [childRecords, search]);

  const highRiskCount = maternalRecords.filter((m) => m.high_risk).length;
  const avgAnc =
    maternalRecords.length > 0
      ? (maternalRecords.reduce((acc, r) => acc + r.anc_visits_completed, 0) / maternalRecords.length).toFixed(1)
      : '0.0';
  const fullyImmCount = childRecords.filter((c) => c.vaccines_completed.length >= 9).length;

  const handleSelectMotherPerson = (pid: string) => {
    setMPersonId(pid);
    const p = people.find((x) => String(x.id) === pid);
    if (p) {
      setMName(p.full_name);
      setMAge(String(p.age));
      setMVillage(p.village);
      setMDistrict(p.district);
    }
  };

  const handleSelectChildPerson = (pid: string) => {
    setCPersonId(pid);
    const p = people.find((x) => String(x.id) === pid);
    if (p) {
      setCName(p.full_name);
      setCGender(p.gender);
      setCVillage(p.village);
      setCDistrict(p.district);
    }
  };

  const handleCreateMaternal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authToken) {
      onRequestAuth();
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const res = await fetch('/api/maternal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          person_id: mPersonId ? Number(mPersonId) : null,
          mother_name: mName.trim(),
          age: Number(mAge),
          village: mVillage.trim(),
          district: mDistrict,
          lmp_date: mLmp,
          edd_date: mEdd || calculateEddFromLmp(mLmp),
          gravida: Number(mGravida) || 1,
          para: Number(mPara) || 0,
          anc_visits_completed: Number(mAnc) || 0,
          ifa_tablets_total: Number(mIfa) || 0,
          hemoglobin_gdl: mHb ? Number(mHb) : null,
          bp_reading: mBp.trim(),
          nutrition_status: mNutrition,
          postnatal_status: mPostnatal,
          high_risk: mHighRisk,
          high_risk_reasons: mRiskReason.trim(),
          next_anc_date: mNextAnc,
          notes: mNotes.trim(),
        }),
      });
      await parseApiResponse(res, 'Could not save maternal record.');
      setShowMaternalForm(false);
      setMName('');
      setMRiskReason('');
      setMNotes('');
      setStatusMsg('Maternal health record registered successfully.');
      await onRefresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to register pregnancy record.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickMaternalUpdate = async (
    record: MaternalRecord,
    patch: Partial<MaternalRecord>,
    successLabel: string
  ) => {
    if (!authToken) {
      onRequestAuth();
      return;
    }
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/maternal/${record.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(patch),
      });
      await parseApiResponse(res, 'Could not update maternal record.');
      setStatusMsg(successLabel);
      await onRefresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Update failed.');
    }
  };

  const handleCreateChild = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authToken) {
      onRequestAuth();
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const res = await fetch('/api/children', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          person_id: cPersonId ? Number(cPersonId) : null,
          child_name: cName.trim(),
          mother_name: cMother.trim(),
          dob: cDob,
          gender: cGender,
          village: cVillage.trim(),
          district: cDistrict,
          birth_weight_kg: cBirthWt ? Number(cBirthWt) : null,
          current_weight_kg: cCurrWt ? Number(cCurrWt) : null,
          current_height_cm: cCurrHt ? Number(cCurrHt) : null,
          nutrition_status: cNutrition,
          vaccines_completed: cVaccines,
          next_vaccine: cNextVac.trim(),
          next_vaccine_date: cNextVacDate,
          notes: cNotes.trim(),
        }),
      });
      await parseApiResponse(res, 'Could not save child record.');
      setShowChildForm(false);
      setCName('');
      setCMother('');
      setCNotes('');
      setStatusMsg('Child immunization & growth profile registered.');
      await onRefresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to register child record.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleChildVaccine = async (child: ChildRecord, code: string) => {
    if (!authToken) {
      onRequestAuth();
      return;
    }
    const exists = child.vaccines_completed.includes(code);
    const updatedList = exists
      ? child.vaccines_completed.filter((v) => v !== code)
      : [...child.vaccines_completed, code];
    const remaining = STANDARD_VACCINES.find((v) => !updatedList.includes(v.code));
    try {
      const res = await fetch(`/api/children/${child.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          vaccines_completed: updatedList,
          next_vaccine: remaining ? remaining.label : 'Primary Series Complete',
        }),
      });
      const data = await parseApiResponse<{ record: ChildRecord }>(res, 'Could not update vaccines.');
      setEditingChild(data.record);
      setStatusMsg(`Updated immunization checklist for ${child.child_name}.`);
      await onRefresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Vaccine update failed.');
    }
  };

  const handleUpdateChildGrowth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingChild) return;
    if (!authToken) {
      onRequestAuth();
      return;
    }
    try {
      const res = await fetch(`/api/children/${editingChild.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          current_weight_kg: editWeight ? Number(editWeight) : editingChild.current_weight_kg,
          current_height_cm: editHeight ? Number(editHeight) : editingChild.current_height_cm,
        }),
      });
      const data = await parseApiResponse<{ record: ChildRecord }>(res, 'Could not update growth.');
      setEditingChild(data.record);
      setStatusMsg(`Recorded growth measurements for ${editingChild.child_name}.`);
      await onRefresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Growth update failed.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top KPI Summary Strip */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-[#e2e7e0] bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Registered Pregnancies</p>
          <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">{maternalRecords.length}</p>
          <p className="mt-1 text-xs text-slate-500">Avg {avgAnc} ANC visits completed</p>
        </div>
        <div className="rounded-xl border border-[#e2e7e0] bg-white p-4">
          <p className="text-xs font-medium text-slate-500">High-Risk Mothers</p>
          <p className="mt-1 text-2xl font-bold text-red-700 tabular-nums">{highRiskCount}</p>
          <p className="mt-1 text-xs text-slate-500">Priority PHC / FRU monitoring</p>
        </div>
        <div className="rounded-xl border border-[#e2e7e0] bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Registered Children (0–5y)</p>
          <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">{childRecords.length}</p>
          <p className="mt-1 text-xs text-slate-500">Growth & nutrition tracked</p>
        </div>
        <div className="rounded-xl border border-[#e2e7e0] bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Full Primary Vaccination</p>
          <p className="mt-1 text-2xl font-bold text-[#1f6f5c] tabular-nums">
            {fullyImmCount} / {childRecords.length}
          </p>
          <p className="mt-1 text-xs text-slate-500">9+ UIP scheduled doses</p>
        </div>
      </div>

      {/* Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e2e7e0] bg-white p-4">
        <div className="inline-flex rounded-lg bg-[#f4f6f2] p-1">
          <button
            type="button"
            onClick={() => setActiveTab('maternal')}
            className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
              activeTab === 'maternal' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <HeartPulse className="h-4 w-4 text-[#1f6f5c]" />
            Maternal Health ({maternalRecords.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('child')}
            className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
              activeTab === 'child' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Baby className="h-4 w-4 text-indigo-600" />
            Child Health & Vaccines ({childRecords.length})
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={activeTab === 'maternal' ? 'Search mother or village...' : 'Search child, mother, vaccine...'}
              className="w-56 rounded-lg border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-900 focus:border-[#1f6f5c] focus:outline-none"
            />
          </div>

          {activeTab === 'maternal' && (
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700">
              <input
                type="checkbox"
                checked={riskOnly}
                onChange={(e) => setRiskOnly(e.target.checked)}
                className="rounded border-slate-300 text-[#1f6f5c]"
              />
              High-Risk Only
            </label>
          )}

          <button
            type="button"
            onClick={() => {
              if (!authToken) {
                onRequestAuth();
                return;
              }
              if (activeTab === 'maternal') setShowMaternalForm(true);
              else setShowChildForm(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#1f6f5c] px-4 py-2 text-xs font-semibold text-white hover:bg-[#185848] transition-colors whitespace-nowrap"
          >
            <Plus className="h-4 w-4" />
            {activeTab === 'maternal' ? 'Register Pregnancy' : 'Register Child'}
          </button>
        </div>
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

      {/* MATERNAL LIST */}
      {activeTab === 'maternal' && (
        <div className="space-y-4">
          {filteredMaternal.length === 0 ? (
            <div className="rounded-xl border border-[#e2e7e0] bg-white p-10 text-center text-sm text-slate-500">
              No maternal records match your filter. Click &ldquo;Register Pregnancy&rdquo; to enroll an expectant mother.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {filteredMaternal.map((m) => (
                <article key={m.id} className="rounded-xl border border-[#e2e7e0] bg-white p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="text-base font-bold text-slate-900">
                        {m.mother_name} <span className="font-normal text-slate-500">({m.age} yrs)</span>
                      </h3>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {m.village}, {m.district} · G{m.gravida}P{m.para} · {m.postnatal_status}
                      </p>
                    </div>
                    <span
                      className={`text-xs font-semibold ${
                        m.high_risk ? 'text-red-700' : 'text-[#1f6f5c]'
                      }`}
                    >
                      {m.high_risk ? 'High-Risk Pregnancy' : 'Routine ANC'}
                    </span>
                  </div>

                  {m.high_risk && m.high_risk_reasons && (
                    <div className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-900">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-700" />
                      <span>{m.high_risk_reasons}</span>
                    </div>
                  )}

                  <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 text-xs sm:grid-cols-4">
                    <div>
                      <span className="text-slate-500">EDD</span>
                      <p className="mt-0.5 font-mono font-semibold text-slate-900 tabular-nums">
                        {m.edd_date || '—'}
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-500">ANC Visits</span>
                      <p className="mt-0.5 font-mono font-semibold text-slate-900 tabular-nums">
                        {m.anc_visits_completed} / 4+
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-500">IFA Tablets</span>
                      <p className="mt-0.5 font-mono font-semibold text-slate-900 tabular-nums">
                        {m.ifa_tablets_total} / 180
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-500">Hb / BP</span>
                      <p className="mt-0.5 font-mono font-semibold text-slate-900 tabular-nums">
                        {m.hemoglobin_gdl !== null ? `${m.hemoglobin_gdl} g/dL` : '—'} · {m.bp_reading || '—'}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs">
                    <span className="inline-flex items-center gap-1.5 text-slate-600">
                      <Calendar className="h-3.5 w-3.5 text-slate-400" />
                      Next ANC: <strong className="font-mono text-slate-800">{m.next_anc_date || 'Not set'}</strong> ·{' '}
                      Nutrition: <strong className="text-slate-800">{m.nutrition_status}</strong>
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          handleQuickMaternalUpdate(
                            m,
                            { anc_visits_completed: m.anc_visits_completed + 1 },
                            `Logged ANC visit #${m.anc_visits_completed + 1} for ${m.mother_name}.`
                          )
                        }
                        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        +1 ANC Visit
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleQuickMaternalUpdate(
                            m,
                            { ifa_tablets_total: m.ifa_tablets_total + 30 },
                            `Issued +30 IFA tablets to ${m.mother_name} (Total: ${m.ifa_tablets_total + 30}).`
                          )
                        }
                        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        +30 IFA
                      </button>
                      {m.postnatal_status === 'Antenatal' && (
                        <button
                          type="button"
                          onClick={() =>
                            handleQuickMaternalUpdate(
                              m,
                              { postnatal_status: 'Postnatal (PNC Active)' },
                              `Moved ${m.mother_name} to Postnatal Care (PNC) tracking.`
                            )
                          }
                          className="rounded-lg border border-[#1f6f5c]/30 bg-[#1f6f5c]/5 px-2.5 py-1 text-xs font-medium text-[#1f6f5c] hover:bg-[#1f6f5c]/10"
                        >
                          Mark Delivered (PNC)
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      {/* CHILD LIST */}
      {activeTab === 'child' && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {filteredChildren.length === 0 ? (
            <div className="col-span-full rounded-xl border border-[#e2e7e0] bg-white p-10 text-center text-sm text-slate-500">
              No child records match your search. Click &ldquo;Register Child&rdquo; to add a child profile.
            </div>
          ) : (
            filteredChildren.map((c) => {
              const months = getAgeMonths(c.dob);
              const pct = Math.min(100, Math.round((c.vaccines_completed.length / STANDARD_VACCINES.length) * 100));
              return (
                <article key={c.id} className="rounded-xl border border-[#e2e7e0] bg-white p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-base font-bold text-slate-900">
                        {c.child_name}{' '}
                        <span className="font-normal text-slate-500">
                          ({months} mo · {c.gender})
                        </span>
                      </h3>
                      <p className="mt-0.5 text-xs text-slate-500">
                        Mother: {c.mother_name} · {c.village}, {c.district} · DOB {c.dob}
                      </p>
                    </div>
                    <span
                      className={`text-xs font-semibold ${
                        c.nutrition_status.toLowerCase().includes('normal') ? 'text-[#1f6f5c]' : 'text-amber-700'
                      }`}
                    >
                      {c.nutrition_status}
                    </span>
                  </div>

                  {/* Immunization Progress */}
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-700">
                        Immunization Progress ({c.vaccines_completed.length}/{STANDARD_VACCINES.length} doses)
                      </span>
                      <span className="font-mono font-semibold text-[#1f6f5c] tabular-nums">{pct}%</span>
                    </div>
                    <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-[#1f6f5c]" style={{ width: `${pct}%` }} />
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-3 border-t border-slate-100 pt-3 text-xs">
                    <div>
                      <span className="text-slate-500">Birth / Current Wt</span>
                      <p className="mt-0.5 font-mono font-semibold text-slate-900 tabular-nums">
                        {c.birth_weight_kg ?? '—'} → {c.current_weight_kg ?? '—'} kg
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-500">Height</span>
                      <p className="mt-0.5 font-mono font-semibold text-slate-900 tabular-nums">
                        {c.current_height_cm ? `${c.current_height_cm} cm` : '—'}
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-500">Next Vaccine Due</span>
                      <p className="mt-0.5 font-semibold text-indigo-700 truncate" title={c.next_vaccine}>
                        {c.next_vaccine || 'Up to date'}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
                    <span className="text-slate-500">
                      Reminder: <strong className="font-mono text-slate-700">{c.next_vaccine_date || 'Schedule'}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingChild(c);
                        setEditWeight(c.current_weight_kg !== null ? String(c.current_weight_kg) : '');
                        setEditHeight(c.current_height_cm !== null ? String(c.current_height_cm) : '');
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition-colors"
                    >
                      <Syringe className="h-3.5 w-3.5" />
                      Vaccines & Growth
                    </button>
                  </div>
                </article>
              );
            })
          )}
        </div>
      )}

      {/* REGISTER PREGNANCY MODAL */}
      {showMaternalForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-lg font-bold text-slate-900">Register Pregnant / Postnatal Mother</h3>
              <button type="button" onClick={() => setShowMaternalForm(false)} className="text-slate-400 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateMaternal} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700">Link Existing Person (Optional)</label>
                <select
                  value={mPersonId}
                  onChange={(e) => handleSelectMotherPerson(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">-- Enter manually or choose from People Directory --</option>
                  {people
                    .filter((p) => p.gender === 'Female')
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.full_name} ({p.age}y · {p.village})
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">Mother Full Name *</label>
                <input
                  required
                  value={mName}
                  onChange={(e) => setMName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">Age (Years) *</label>
                <input
                  required
                  type="number"
                  min={14}
                  max={55}
                  value={mAge}
                  onChange={(e) => setMAge(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">Village *</label>
                <input
                  required
                  value={mVillage}
                  onChange={(e) => setMVillage(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">District</label>
                <select
                  value={mDistrict}
                  onChange={(e) => setMDistrict(e.target.value)}
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
                <label className="block text-xs font-semibold text-slate-700">LMP Date (Auto-computes EDD)</label>
                <input
                  type="date"
                  value={mLmp}
                  onChange={(e) => {
                    setMLmp(e.target.value);
                    setMEdd(calculateEddFromLmp(e.target.value));
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">Expected Delivery Date (EDD)</label>
                <input
                  type="date"
                  value={mEdd}
                  onChange={(e) => setMEdd(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Gravida</label>
                  <input
                    type="number"
                    min={1}
                    value={mGravida}
                    onChange={(e) => setMGravida(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Para</label>
                  <input
                    type="number"
                    min={0}
                    value={mPara}
                    onChange={(e) => setMPara(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">ANC Visits</label>
                  <input
                    type="number"
                    min={0}
                    value={mAnc}
                    onChange={(e) => setMAnc(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">IFA Tablets</label>
                  <input
                    type="number"
                    min={0}
                    value={mIfa}
                    onChange={(e) => setMIfa(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">Hemoglobin (g/dL)</label>
                <input
                  type="number"
                  step="0.1"
                  value={mHb}
                  onChange={(e) => setMHb(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">Blood Pressure (e.g. 120/80)</label>
                <input
                  value={mBp}
                  onChange={(e) => setMBp(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">Nutrition Status</label>
                <select
                  value={mNutrition}
                  onChange={(e) => setMNutrition(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="Normal">Normal</option>
                  <option value="Mild Anaemia — Iron Diet Advised">Mild Anaemia — Iron Diet Advised</option>
                  <option value="Underweight — THR Supplementary Nutrition">Underweight — THR Supplementary Nutrition</option>
                  <option value="Severe Anaemia — PHC Follow-up">Severe Anaemia — PHC Follow-up</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">Next ANC / PNC Date</label>
                <input
                  type="date"
                  value={mNextAnc}
                  onChange={(e) => setMNextAnc(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">Stage</label>
                <select
                  value={mPostnatal}
                  onChange={(e) => setMPostnatal(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="Antenatal">Antenatal</option>
                  <option value="Postnatal (PNC Active)">Postnatal (PNC Active)</option>
                  <option value="PNC Completed">PNC Completed</option>
                </select>
              </div>
              <div className="flex items-center gap-2 pt-5">
                <input
                  id="m-high-risk"
                  type="checkbox"
                  checked={mHighRisk}
                  onChange={(e) => setMHighRisk(e.target.checked)}
                  className="rounded border-slate-300"
                />
                <label htmlFor="m-high-risk" className="text-xs font-semibold text-red-700">
                  Flag as High-Risk Pregnancy (auto-flags if Hb &lt; 7 or BP ≥ 140/90)
                </label>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700">High-Risk Reasons / Clinical Notes</label>
                <input
                  value={mRiskReason}
                  onChange={(e) => setMRiskReason(e.target.value)}
                  placeholder="e.g. Prior C-section, pedal oedema, severe anaemia..."
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowMaternalForm(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-[#1f6f5c] px-5 py-2 text-xs font-semibold text-white hover:bg-[#185848] disabled:opacity-60"
                >
                  {submitting ? 'Saving...' : 'Save Maternal Record'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REGISTER CHILD MODAL */}
      {showChildForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-lg font-bold text-slate-900">Register Child Health & Immunization Card</h3>
              <button type="button" onClick={() => setShowChildForm(false)} className="text-slate-400 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateChild} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700">Link Existing Person (Optional)</label>
                <select
                  value={cPersonId}
                  onChange={(e) => handleSelectChildPerson(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">-- Enter manually or select child from People Directory --</option>
                  {people
                    .filter((p) => p.age <= 6)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.full_name} ({p.age}y · {p.village})
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">Child Name *</label>
                <input
                  required
                  value={cName}
                  onChange={(e) => setCName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">Mother Name *</label>
                <input
                  required
                  value={cMother}
                  onChange={(e) => setCMother(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">Date of Birth *</label>
                <input
                  required
                  type="date"
                  value={cDob}
                  onChange={(e) => setCDob(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">Gender</label>
                <select
                  value={cGender}
                  onChange={(e) => setCGender(e.target.value as BeneficiaryGender)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="Female">Female</option>
                  <option value="Male">Male</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">Village *</label>
                <input
                  required
                  value={cVillage}
                  onChange={(e) => setCVillage(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">District</label>
                <select
                  value={cDistrict}
                  onChange={(e) => setCDistrict(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  {KARNATAKA_DISTRICTS.map((d) => (
                    <option key={d.district} value={d.district}>
                      {d.district}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-2 sm:col-span-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Birth Wt (kg)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={cBirthWt}
                    onChange={(e) => setCBirthWt(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Current Wt (kg)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={cCurrWt}
                    onChange={(e) => setCCurrWt(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Height (cm)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={cCurrHt}
                    onChange={(e) => setCCurrHt(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">Nutrition Status</label>
                <select
                  value={cNutrition}
                  onChange={(e) => setCNutrition(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="Normal">Normal Growth</option>
                  <option value="Moderately Underweight (MAM)">Moderately Underweight (MAM)</option>
                  <option value="Severe Acute Malnutrition (SAM — NRC Referral)">SAM — NRC Referral</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">Next Vaccine Due Date</label>
                <input
                  type="date"
                  value={cNextVacDate}
                  onChange={(e) => setCNextVacDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700">Initial Vaccines Completed</label>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {STANDARD_VACCINES.slice(0, 9).map((v) => {
                    const checked = cVaccines.includes(v.code);
                    return (
                      <label
                        key={v.code}
                        className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs ${
                          checked ? 'border-[#1f6f5c] bg-[#1f6f5c]/5 text-[#1f6f5c] font-semibold' : 'border-slate-200 text-slate-700'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setCVaccines((prev) =>
                              prev.includes(v.code) ? prev.filter((x) => x !== v.code) : [...prev, v.code]
                            )
                          }
                          className="rounded"
                        />
                        {v.code}
                      </label>
                    );
                  })}
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700">Next Scheduled Vaccine</label>
                <input
                  value={cNextVac}
                  onChange={(e) => setCNextVac(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowChildForm(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-[#1f6f5c] px-5 py-2 text-xs font-semibold text-white hover:bg-[#185848] disabled:opacity-60"
                >
                  {submitting ? 'Saving...' : 'Save Child Card'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CHILD VACCINATION & GROWTH DRAWER MODAL */}
      {editingChild && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">{editingChild.child_name} — Immunization & Growth</h3>
                <p className="text-xs text-slate-500">
                  Mother: {editingChild.mother_name} · DOB {editingChild.dob} · {editingChild.village}
                </p>
              </div>
              <button type="button" onClick={() => setEditingChild(null)} className="text-slate-400 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateChildGrowth} className="mt-4 flex flex-wrap items-end gap-3 rounded-xl bg-[#f4f6f2] p-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700">Current Weight (kg)</label>
                <input
                  type="number"
                  step="0.1"
                  value={editWeight}
                  onChange={(e) => setEditWeight(e.target.value)}
                  className="mt-1 w-32 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">Current Height (cm)</label>
                <input
                  type="number"
                  step="0.5"
                  value={editHeight}
                  onChange={(e) => setEditHeight(e.target.value)}
                  className="mt-1 w-32 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm"
                />
              </div>
              <button
                type="submit"
                className="rounded-lg bg-[#1f6f5c] px-4 py-2 text-xs font-semibold text-white hover:bg-[#185848]"
              >
                Update Growth
              </button>
            </form>

            <div className="mt-5">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                UIP Immunization Checklist (Tap to Toggle Completed)
              </h4>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {STANDARD_VACCINES.map((vac) => {
                  const done = editingChild.vaccines_completed.includes(vac.code);
                  return (
                    <button
                      key={vac.code}
                      type="button"
                      onClick={() => handleToggleChildVaccine(editingChild, vac.code)}
                      className={`flex items-center justify-between rounded-lg border px-3 py-2.5 text-left text-xs transition-colors ${
                        done
                          ? 'border-[#1f6f5c] bg-[#1f6f5c]/8 text-[#1f6f5c] font-semibold'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span>{vac.label}</span>
                      {done ? <Check className="h-4 w-4 text-[#1f6f5c]" /> : <span className="text-slate-400">Pending</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
