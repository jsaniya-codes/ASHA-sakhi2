import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { KARNATAKA_DISTRICTS, getDistrictCoords } from '../data/nfhs5Karnataka';
import { parseApiResponse } from '../utils/apiClient';
import { exportVisitsToExcel, exportVisitsToPdf } from '../utils/exportReports';
import type {
  AuthUser,
  BeneficiaryCategory,
  FamilyRecord,
  FieldVisit,
  PersonRecord,
  RiskLevel,
} from '../types';

interface VisitRegisterProps {
  visits: FieldVisit[];
  families: FamilyRecord[];
  people: PersonRecord[];
  currentUser: AuthUser | null;
  authToken: string | null;
  onRequestAuth: () => void;
  onVisitCreated: (visit: FieldVisit) => void;
  onVisitUpdated: (visit: FieldVisit) => void;
  onVisitDeleted: (id: number) => void;
  onRefresh?: () => Promise<void>;
}

const VISIT_PURPOSES = [
  'Antenatal Care (ANC) Follow-up',
  'Postnatal Home Visit (HBNC)',
  'Child Immunization & Growth Check',
  'Fever / Common Illness Screening',
  'Nutrition & IFA Counseling',
  'Routine Household Health Visit',
];

export function VisitRegister({
  visits,
  families,
  people,
  currentUser,
  authToken,
  onRequestAuth,
  onVisitCreated,
  onVisitUpdated,
  onVisitDeleted,
  onRefresh,
}: VisitRegisterProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [riskFilter, setRiskFilter] = useState<string>('All');
  const [showNewForm, setShowNewForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Edit household visit modal state
  const [editingVisit, setEditingVisit] = useState<FieldVisit | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editCategory, setEditCategory] = useState<BeneficiaryCategory>('Pregnant Woman');
  const [editDistrict, setEditDistrict] = useState('Raichur');
  const [editVillage, setEditVillage] = useState('');
  const [editVisitDate, setEditVisitDate] = useState('');
  const [editFollowUpDate, setEditFollowUpDate] = useState('');
  const [editPurpose, setEditPurpose] = useState(VISIT_PURPOSES[0]);
  const [editStatus, setEditStatus] = useState<'Completed' | 'Scheduled' | 'Follow-up Due'>('Completed');
  const [editRiskLevel, setEditRiskLevel] = useState<RiskLevel>('Low');
  const [editBpSys, setEditBpSys] = useState('');
  const [editBpDia, setEditBpDia] = useState('');
  const [editSugar, setEditSugar] = useState('');
  const [editHb, setEditHb] = useState('');
  const [editSymptoms, setEditSymptoms] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Remove temporary sample data state
  const [showClearTempModal, setShowClearTempModal] = useState(false);
  const [clearingTemp, setClearingTemp] = useState(false);

  const hasTemporarySeedVisits = useMemo(
    () => visits.some((v) => v.worker_id === null),
    [visits]
  );

  // New household visit form
  const [selectedFamilyId, setSelectedFamilyId] = useState('');
  const [selectedPersonId, setSelectedPersonId] = useState('');
  const [beneficiaryName, setBeneficiaryName] = useState('');
  const [beneficiaryPhone, setBeneficiaryPhone] = useState('');
  const [beneficiaryCategory, setBeneficiaryCategory] =
    useState<BeneficiaryCategory>('Pregnant Woman');
  const [district, setDistrict] = useState(currentUser?.district || 'Raichur');
  const [village, setVillage] = useState('');
  const [visitDate, setVisitDate] = useState(new Date().toISOString().slice(0, 10));
  const [purpose, setPurpose] = useState(VISIT_PURPOSES[0]);
  const [observations, setObservations] = useState('');
  const [notes, setNotes] = useState('');
  const [followUpDate, setFollowUpDate] = useState(
    new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10)
  );
  const [riskLevel, setRiskLevel] = useState<RiskLevel>('Low');
  const [status, setStatus] = useState<'Completed' | 'Scheduled' | 'Follow-up Due'>('Completed');

  const familyMembers = useMemo(() => {
    if (!selectedFamilyId) return people;
    return people.filter((p) => String(p.family_id) === selectedFamilyId);
  }, [people, selectedFamilyId]);

  const handleFamilySelect = (famId: string) => {
    setSelectedFamilyId(famId);
    setSelectedPersonId('');
    const fam = families.find((f) => String(f.id) === famId);
    if (fam) {
      setVillage(fam.village);
      setDistrict(fam.district);
      if (fam.phone) setBeneficiaryPhone(fam.phone);
    }
  };

  const handlePersonSelect = (pid: string) => {
    setSelectedPersonId(pid);
    const p = people.find((x) => String(x.id) === pid);
    if (p) {
      setBeneficiaryName(p.full_name);
      setBeneficiaryPhone(p.phone || '');
      setVillage(p.village);
      setDistrict(p.district);
      if (p.family_id) setSelectedFamilyId(String(p.family_id));
      if (
        p.category === 'Pregnant Woman' ||
        p.category === 'Lactating Mother' ||
        p.category === 'Child (0-5y)' ||
        p.category === 'Adolescent Girl'
      ) {
        setBeneficiaryCategory(p.category);
      }
    }
  };

  const filteredVisits = useMemo(() => {
    const q = search.trim().toLowerCase();
    return visits.filter((v) => {
      if (statusFilter !== 'All' && v.status !== statusFilter) return false;
      if (riskFilter !== 'All' && v.risk_level !== riskFilter) return false;
      if (!q) return true;
      return (
        v.beneficiary_name.toLowerCase().includes(q) ||
        (v.beneficiary_phone || '').toLowerCase().includes(q) ||
        v.village.toLowerCase().includes(q) ||
        v.district.toLowerCase().includes(q) ||
        (v.purpose || '').toLowerCase().includes(q) ||
        v.symptoms.toLowerCase().includes(q)
      );
    });
  }, [visits, search, statusFilter, riskFilter]);

  const handleCreateVisit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !authToken) {
      onRequestAuth();
      return;
    }
    setSaving(true);
    setError(null);
    setFeedback(null);

    try {
      const coords = getDistrictCoords(district);
      const selectedPerson = people.find((p) => String(p.id) === selectedPersonId);
      const res = await fetch('/api/visits', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          family_id: selectedFamilyId ? Number(selectedFamilyId) : null,
          person_id: selectedPerson ? selectedPerson.id : null,
          beneficiary_name: beneficiaryName.trim(),
          beneficiary_phone: beneficiaryPhone.trim(),
          beneficiary_age: selectedPerson ? selectedPerson.age : null,
          beneficiary_gender: selectedPerson ? selectedPerson.gender : 'Female',
          beneficiary_category: beneficiaryCategory,
          district,
          village: village.trim() || district,
          phc_center: currentUser.phc_center || `PHC ${district}`,
          language: 'en',
          purpose,
          status,
          notes: notes.trim(),
          transcript: `${purpose}. ${observations.trim()} ${notes.trim()}`.trim(),
          bp_systolic: null,
          bp_diastolic: null,
          blood_sugar_mgdl: null,
          hemoglobin_gdl: null,
          weight_kg: null,
          gestational_weeks: null,
          immunization_status: 'Reviewed',
          ifa_tablets_given: 0,
          symptoms: observations.trim(),
          symptom_duration: '',
          risk_level: riskLevel,
          risk_flags: [],
          recommended_action: notes.trim() || 'Continue scheduled household follow-up.',
          follow_up_date: followUpDate,
          lat: coords.lat,
          lng: coords.lng,
          visit_date: visitDate,
        }),
      });
      const data = await parseApiResponse<{ visit: FieldVisit }>(res, 'Could not register visit.');
      onVisitCreated(data.visit);
      setShowNewForm(false);
      setBeneficiaryName('');
      setBeneficiaryPhone('');
      setObservations('');
      setNotes('');
      setFeedback(`Registered household visit #${data.visit.id} for ${data.visit.beneficiary_name}.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create visit.');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (
    visit: FieldVisit,
    nextStatus: 'Completed' | 'Scheduled' | 'Follow-up Due'
  ) => {
    if (!currentUser || !authToken) {
      onRequestAuth();
      return;
    }
    setUpdatingId(visit.id);
    setError(null);
    try {
      const res = await fetch(`/api/visits/${visit.id}`, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await parseApiResponse<{ visit: FieldVisit }>(res, 'Could not update visit status.');
      onVisitUpdated(data.visit);
      setFeedback(`Updated visit #${visit.id} status to ${nextStatus}.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to update visit.');
    } finally {
      setUpdatingId(null);
    }
  };

  const openEditVisit = (v: FieldVisit) => {
    if (!currentUser || !authToken) {
      onRequestAuth();
      return;
    }
    setEditingVisit(v);
    setEditName(v.beneficiary_name || '');
    setEditPhone(v.beneficiary_phone || '');
    setEditCategory(v.beneficiary_category || 'General');
    setEditDistrict(v.district || currentUser.district || 'Raichur');
    setEditVillage(v.village || '');
    setEditVisitDate(v.visit_date || new Date().toISOString().slice(0, 10));
    setEditFollowUpDate(v.follow_up_date || '');
    setEditPurpose(v.purpose || VISIT_PURPOSES[0]);
    setEditStatus(v.status || 'Completed');
    setEditRiskLevel(v.risk_level || 'Low');
    setEditBpSys(v.bp_systolic !== null && v.bp_systolic !== undefined ? String(v.bp_systolic) : '');
    setEditBpDia(v.bp_diastolic !== null && v.bp_diastolic !== undefined ? String(v.bp_diastolic) : '');
    setEditSugar(v.blood_sugar_mgdl !== null && v.blood_sugar_mgdl !== undefined ? String(v.blood_sugar_mgdl) : '');
    setEditHb(v.hemoglobin_gdl !== null && v.hemoglobin_gdl !== undefined ? String(v.hemoglobin_gdl) : '');
    setEditSymptoms(v.symptoms || '');
    setEditNotes(v.notes || v.recommended_action || '');
    setError(null);
  };

  const handleUpdateVisit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingVisit) return;
    if (!currentUser || !authToken) {
      onRequestAuth();
      return;
    }
    setSavingEdit(true);
    setError(null);
    setFeedback(null);
    const parseOptNum = (val: string): number | null => {
      const trimmed = val.trim();
      if (!trimmed) return null;
      const n = Number(trimmed);
      return Number.isFinite(n) ? n : null;
    };
    try {
      const res = await fetch(`/api/visits/${editingVisit.id}`, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          beneficiary_name: editName.trim(),
          beneficiary_phone: editPhone.trim(),
          beneficiary_category: editCategory,
          district: editDistrict,
          village: editVillage.trim() || editDistrict,
          visit_date: editVisitDate,
          follow_up_date: editFollowUpDate,
          purpose: editPurpose,
          status: editStatus,
          risk_level: editRiskLevel,
          bp_systolic: parseOptNum(editBpSys),
          bp_diastolic: parseOptNum(editBpDia),
          blood_sugar_mgdl: parseOptNum(editSugar),
          hemoglobin_gdl: parseOptNum(editHb),
          symptoms: editSymptoms.trim(),
          notes: editNotes.trim(),
          recommended_action: editNotes.trim() || editingVisit.recommended_action || '',
        }),
      });
      const data = await parseApiResponse<{ visit: FieldVisit }>(res, 'Could not update visit.');
      onVisitUpdated(data.visit);
      setEditingVisit(null);
      setFeedback(`Updated household visit #${data.visit.id} for ${data.visit.beneficiary_name}.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to update visit.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleClearTemporaryData = async () => {
    if (!currentUser || !authToken) {
      onRequestAuth();
      return;
    }
    setClearingTemp(true);
    setError(null);
    setFeedback(null);
    try {
      const res = await fetch('/api/data-management/clear-temporary-data', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          Accept: 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          Authorization: `Bearer ${authToken}`,
        },
      });
      const data = await parseApiResponse<{ totalRemoved: number }>(
        res,
        'Could not remove temporary sample data.'
      );
      setShowClearTempModal(false);
      setFeedback(
        data.totalRemoved > 0
          ? `Removed ${data.totalRemoved} temporary sample records. Your entered records were preserved.`
          : 'No temporary sample records were found.'
      );
      if (onRefresh) {
        await onRefresh();
      } else {
        onVisitDeleted(0);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to remove temporary data.');
    } finally {
      setClearingTemp(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!currentUser || !authToken) {
      onRequestAuth();
      return;
    }
    setError(null);
    try {
      const res = await fetch(`/api/visits/${id}`, {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'X-Requested-With': 'XMLHttpRequest',
          Accept: 'application/json',
        },
      });
      await parseApiResponse(res, 'Could not delete visit.');
      onVisitDeleted(id);
      setConfirmDeleteId(null);
      setFeedback(`Visit #${id} removed.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to delete visit.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-[#5c6b64]">
            Household Visits · Family &amp; Member Linking · Follow-up Scheduling
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#1c2421]">Visit Register</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {hasTemporarySeedVisits && (
            <button
              type="button"
              onClick={() => {
                if (!currentUser || !authToken) {
                  onRequestAuth();
                  return;
                }
                setShowClearTempModal(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100 whitespace-nowrap"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remove Temporary Data
            </button>
          )}
          <button
            type="button"
            onClick={() => exportVisitsToPdf(filteredVisits, 'All')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#d6ddd3] bg-white px-3 py-2 text-xs font-medium text-[#1c2421] hover:bg-[#f4f6f2] whitespace-nowrap"
          >
            <Download className="h-3.5 w-3.5" />
            PDF
          </button>
          <button
            type="button"
            onClick={() => void exportVisitsToExcel(filteredVisits, 'All')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#d6ddd3] bg-white px-3 py-2 text-xs font-medium text-[#1c2421] hover:bg-[#f4f6f2] whitespace-nowrap"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Excel
          </button>
          <button
            type="button"
            onClick={() => setShowNewForm((s) => !s)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#1f6f5c] px-4 py-2 text-xs font-medium text-white hover:bg-[#185a4b] whitespace-nowrap"
          >
            <Plus className="h-3.5 w-3.5" />
            Register Household Visit
          </button>
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

      {showNewForm && (
        <form
          onSubmit={handleCreateVisit}
          className="rounded-xl border border-[#dfe4dc] bg-white p-6 space-y-4"
        >
          <div className="flex items-center justify-between border-b border-[#e8ece6] pb-3">
            <h2 className="text-base font-semibold text-[#1c2421]">New Household Visit Entry</h2>
            <button
              type="button"
              onClick={() => setShowNewForm(false)}
              className="text-xs text-[#5c6b64] hover:text-[#1c2421]"
            >
              Cancel
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-[#394741]">Select Family</label>
              <select
                value={selectedFamilyId}
                onChange={(e) => handleFamilySelect(e.target.value)}
                className="w-full rounded-lg border border-[#cdd6cb] bg-white px-3 py-2 text-sm"
              >
                <option value="">-- Choose Registered Family --</option>
                {families.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.family_code} — {f.head_name} ({f.village})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[#394741]">Select Family Member</label>
              <select
                value={selectedPersonId}
                onChange={(e) => handlePersonSelect(e.target.value)}
                className="w-full rounded-lg border border-[#cdd6cb] bg-white px-3 py-2 text-sm"
              >
                <option value="">-- Choose Registered Member --</option>
                {familyMembers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name} ({p.person_code}, {p.age}y)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[#394741]">Patient / Member Name *</label>
              <input
                required
                value={beneficiaryName}
                onChange={(e) => setBeneficiaryName(e.target.value)}
                placeholder="Enter or auto-filled from member"
                className="w-full rounded-lg border border-[#cdd6cb] px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-[#394741]">Visit Purpose *</label>
              <select
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                className="w-full rounded-lg border border-[#cdd6cb] bg-white px-3 py-2 text-sm"
              >
                {VISIT_PURPOSES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
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
              <label className="mb-1 block text-xs font-medium text-[#394741]">Enter Phone:</label>
              <input
                type="tel"
                inputMode="tel"
                value={beneficiaryPhone}
                onChange={(e) => setBeneficiaryPhone(e.target.value)}
                placeholder="Enter phone number"
                className="w-full rounded-lg border border-[#cdd6cb] px-3 py-2 font-mono text-sm tabular-nums"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-[#394741]">Visit Date</label>
              <input
                type="date"
                value={visitDate}
                onChange={(e) => setVisitDate(e.target.value)}
                className="w-full rounded-lg border border-[#cdd6cb] px-3 py-2 font-mono text-sm tabular-nums"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[#394741]">Next Follow-up Date</label>
              <input
                type="date"
                value={followUpDate}
                onChange={(e) => setFollowUpDate(e.target.value)}
                className="w-full rounded-lg border border-[#cdd6cb] px-3 py-2 font-mono text-sm tabular-nums"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[#394741]">Visit Status &amp; Risk</label>
              <div className="flex gap-2">
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as 'Completed' | 'Scheduled' | 'Follow-up Due')}
                  className="w-1/2 rounded-lg border border-[#cdd6cb] bg-white px-2.5 py-2 text-xs"
                >
                  <option value="Completed">Completed</option>
                  <option value="Scheduled">Scheduled</option>
                  <option value="Follow-up Due">Follow-up Due</option>
                </select>
                <select
                  value={riskLevel}
                  onChange={(e) => setRiskLevel(e.target.value as RiskLevel)}
                  className="w-1/2 rounded-lg border border-[#cdd6cb] bg-white px-2.5 py-2 text-xs"
                >
                  <option value="Low">Low Risk</option>
                  <option value="Moderate">Moderate</option>
                  <option value="High">High Risk</option>
                </select>
              </div>
            </div>

            <div className="sm:col-span-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-[#394741]">Observations / Symptoms</label>
                <textarea
                  rows={2}
                  value={observations}
                  onChange={(e) => setObservations(e.target.value)}
                  placeholder="Observed vitals, complaints, mother/child well-being..."
                  className="w-full rounded-lg border border-[#cdd6cb] px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#394741]">Health Notes &amp; Counseling</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="IFA given, advice shared, PHC referral notes..."
                  className="w-full rounded-lg border border-[#cdd6cb] px-3 py-2 text-sm"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-[#1f6f5c] px-5 py-2 text-sm font-medium text-white hover:bg-[#185a4b] disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save Household Visit
            </button>
          </div>
        </form>
      )}

      {/* Search & Filters */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#dfe4dc] bg-white p-4">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[#7c8b83]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search patient, village, district, purpose, or symptoms..."
            className="w-full rounded-lg border border-[#d6ddd3] pl-9 pr-3 py-2 text-sm focus:border-[#1f6f5c] focus:outline-none"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-[#d6ddd3] bg-white px-3 py-2 text-xs font-medium text-[#1c2421]"
        >
          <option value="All">All Statuses</option>
          <option value="Completed">Completed</option>
          <option value="Scheduled">Scheduled</option>
          <option value="Follow-up Due">Follow-up Due</option>
        </select>
        <select
          value={riskFilter}
          onChange={(e) => setRiskFilter(e.target.value)}
          className="rounded-lg border border-[#d6ddd3] bg-white px-3 py-2 text-xs font-medium text-[#1c2421]"
        >
          <option value="All">All Risk Levels</option>
          <option value="High">High Risk</option>
          <option value="Moderate">Moderate</option>
          <option value="Low">Low Risk</option>
        </select>
      </div>

      {/* Visits Table */}
      <div className="rounded-xl border border-[#dfe4dc] bg-white overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[#e8ece6] bg-[#fafbf9] text-xs font-semibold text-[#5c6b64]">
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Member &amp; Village</th>
              <th className="px-4 py-3">Purpose &amp; Observations</th>
              <th className="px-4 py-3">Follow-up</th>
              <th className="px-4 py-3">Risk</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#eef1ec] text-sm">
            {filteredVisits.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-[#5c6b64]">
                  No household visits match your filter.
                </td>
              </tr>
            ) : (
              filteredVisits.map((v) => (
                <tr key={v.id} className="hover:bg-[#f9faf8]">
                  <td className="px-4 py-3 font-mono text-xs text-[#394741] tabular-nums whitespace-nowrap">
                    {v.visit_date}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-[#1c2421]">{v.beneficiary_name}</div>
                    <div className="text-xs text-[#5c6b64]">
                      {v.village}, {v.district} · {v.beneficiary_category}
                    </div>
                    {v.beneficiary_phone && (
                      <div className="mt-0.5 font-mono text-[11px] text-[#1f6f5c] tabular-nums">
                        {v.beneficiary_phone}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 max-w-sm">
                    <div className="text-xs font-semibold text-[#1c2421]">{v.purpose || 'Routine Home Visit'}</div>
                    <div className="mt-0.5 text-xs text-[#5c6b64] line-clamp-2">
                      {v.symptoms || v.notes || v.recommended_action}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-[#394741] tabular-nums whitespace-nowrap">
                    {v.follow_up_date || '—'}
                  </td>
                  <td className="px-4 py-3 text-xs font-semibold whitespace-nowrap">
                    <span
                      className={
                        v.risk_level === 'High'
                          ? 'text-red-700'
                          : v.risk_level === 'Moderate'
                          ? 'text-amber-700'
                          : 'text-emerald-700'
                      }
                    >
                      {v.risk_level}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <select
                      aria-label={`Update status for ${v.beneficiary_name}`}
                      disabled={updatingId === v.id}
                      value={v.status || 'Completed'}
                      onChange={(e) =>
                        void handleStatusChange(
                          v,
                          e.target.value as 'Completed' | 'Scheduled' | 'Follow-up Due'
                        )
                      }
                      className="rounded-md border border-[#d6ddd3] bg-white px-2 py-1 text-xs font-medium text-[#1c2421]"
                    >
                      <option value="Completed">Completed</option>
                      <option value="Scheduled">Scheduled</option>
                      <option value="Follow-up Due">Follow-up Due</option>
                    </select>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {confirmDeleteId === v.id ? (
                      <span className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => void handleDelete(v.id)}
                          className="text-xs font-semibold text-red-700 hover:underline"
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="text-xs text-[#5c6b64] hover:underline"
                        >
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEditVisit(v)}
                          className="rounded p-1.5 text-[#5c6b64] hover:bg-[#1f6f5c]/10 hover:text-[#1f6f5c]"
                          title="Edit visit"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(v.id)}
                          className="rounded p-1.5 text-[#7c8b83] hover:bg-red-50 hover:text-red-700"
                          title="Delete visit"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* EDIT HOUSEHOLD VISIT MODAL */}
      {editingVisit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[#dfe4dc] bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-[#e8ece6] pb-3">
              <div>
                <h3 className="text-base font-bold text-[#1c2421]">
                  Update Household Visit #{editingVisit.id}
                </h3>
                <p className="text-xs text-[#5c6b64]">
                  Changes also sync updated contact phone to the linked patient directory record.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingVisit(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateVisit} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#394741]">Patient / Member Name *</label>
                  <input
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full rounded-lg border border-[#cdd6cb] px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#394741]">Enter Phone:</label>
                  <input
                    type="tel"
                    inputMode="tel"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    placeholder="Enter phone number"
                    className="w-full rounded-lg border border-[#cdd6cb] px-3 py-2 font-mono text-sm tabular-nums"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#394741]">Category</label>
                  <select
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value as BeneficiaryCategory)}
                    className="w-full rounded-lg border border-[#cdd6cb] bg-white px-3 py-2 text-sm"
                  >
                    <option value="Pregnant Woman">Pregnant Woman</option>
                    <option value="Lactating Mother">Lactating Mother</option>
                    <option value="Child (0-5y)">Child (0-5y)</option>
                    <option value="Adolescent Girl">Adolescent Girl</option>
                    <option value="General">General</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#394741]">Visit Purpose</label>
                  <input
                    value={editPurpose}
                    onChange={(e) => setEditPurpose(e.target.value)}
                    list="edit-visit-purpose-options"
                    className="w-full rounded-lg border border-[#cdd6cb] px-3 py-2 text-sm"
                  />
                  <datalist id="edit-visit-purpose-options">
                    {VISIT_PURPOSES.map((p) => (
                      <option key={p} value={p} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#394741]">District</label>
                  <select
                    value={editDistrict}
                    onChange={(e) => setEditDistrict(e.target.value)}
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
                  <label className="mb-1 block text-xs font-medium text-[#394741]">Village *</label>
                  <input
                    required
                    value={editVillage}
                    onChange={(e) => setEditVillage(e.target.value)}
                    className="w-full rounded-lg border border-[#cdd6cb] px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#394741]">Visit Date</label>
                  <input
                    type="date"
                    value={editVisitDate}
                    onChange={(e) => setEditVisitDate(e.target.value)}
                    className="w-full rounded-lg border border-[#cdd6cb] px-3 py-2 font-mono text-sm tabular-nums"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#394741]">Next Follow-up Date</label>
                  <input
                    type="date"
                    value={editFollowUpDate}
                    onChange={(e) => setEditFollowUpDate(e.target.value)}
                    className="w-full rounded-lg border border-[#cdd6cb] px-3 py-2 font-mono text-sm tabular-nums"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#394741]">Status</label>
                  <select
                    value={editStatus}
                    onChange={(e) =>
                      setEditStatus(e.target.value as 'Completed' | 'Scheduled' | 'Follow-up Due')
                    }
                    className="w-full rounded-lg border border-[#cdd6cb] bg-white px-3 py-2 text-sm"
                  >
                    <option value="Completed">Completed</option>
                    <option value="Scheduled">Scheduled</option>
                    <option value="Follow-up Due">Follow-up Due</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#394741]">Risk Level</label>
                  <select
                    value={editRiskLevel}
                    onChange={(e) => setEditRiskLevel(e.target.value as RiskLevel)}
                    className="w-full rounded-lg border border-[#cdd6cb] bg-white px-3 py-2 text-sm"
                  >
                    <option value="Low">Low Risk</option>
                    <option value="Moderate">Moderate</option>
                    <option value="High">High Risk</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#394741]">BP Systolic</label>
                  <input
                    type="number"
                    min={50}
                    max={260}
                    value={editBpSys}
                    onChange={(e) => setEditBpSys(e.target.value)}
                    placeholder="mmHg"
                    className="w-full rounded-lg border border-[#cdd6cb] px-2.5 py-1.5 font-mono text-sm tabular-nums"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#394741]">BP Diastolic</label>
                  <input
                    type="number"
                    min={30}
                    max={160}
                    value={editBpDia}
                    onChange={(e) => setEditBpDia(e.target.value)}
                    placeholder="mmHg"
                    className="w-full rounded-lg border border-[#cdd6cb] px-2.5 py-1.5 font-mono text-sm tabular-nums"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#394741]">Blood Sugar</label>
                  <input
                    type="number"
                    min={30}
                    max={600}
                    value={editSugar}
                    onChange={(e) => setEditSugar(e.target.value)}
                    placeholder="mg/dL"
                    className="w-full rounded-lg border border-[#cdd6cb] px-2.5 py-1.5 font-mono text-sm tabular-nums"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#394741]">Hemoglobin</label>
                  <input
                    type="number"
                    step="0.1"
                    min={2}
                    max={22}
                    value={editHb}
                    onChange={(e) => setEditHb(e.target.value)}
                    placeholder="g/dL"
                    className="w-full rounded-lg border border-[#cdd6cb] px-2.5 py-1.5 font-mono text-sm tabular-nums"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#394741]">Observations / Symptoms</label>
                  <textarea
                    rows={3}
                    value={editSymptoms}
                    onChange={(e) => setEditSymptoms(e.target.value)}
                    className="w-full rounded-lg border border-[#cdd6cb] px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#394741]">Health Notes &amp; Counseling</label>
                  <textarea
                    rows={3}
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    className="w-full rounded-lg border border-[#cdd6cb] px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingVisit(null)}
                  className="rounded-lg border border-[#cdd6cb] px-4 py-2 text-xs font-semibold text-[#394741]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#1f6f5c] px-5 py-2 text-xs font-semibold text-white hover:bg-[#185a4b] disabled:opacity-60"
                >
                  {savingEdit && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Save Visit Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REMOVE TEMPORARY DATA CONFIRM MODAL */}
      {showClearTempModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 className="text-base font-bold text-slate-900">Remove Temporary Sample Data?</h3>
            <p className="mt-2 text-xs leading-relaxed text-slate-600">
              This removes pre-seeded sample visits, families, residents, checkups, alerts, and appointments while
              preserving all records you entered and official Karnataka NFHS-5 reference indicators.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowClearTempModal(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={clearingTemp}
                onClick={() => void handleClearTemporaryData()}
                className="rounded-lg bg-amber-600 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
              >
                {clearingTemp ? 'Removing...' : 'Remove Temporary Data'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
