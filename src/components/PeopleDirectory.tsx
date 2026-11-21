import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bell,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileText,
  Pencil,
  Phone,
  PhoneCall,
  Plus,
  Search,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { KARNATAKA_DISTRICTS } from '../data/nfhs5Karnataka';
import { parseApiResponse } from '../utils/apiClient';
import { PatientReportModal } from './PatientReportModal';
import type {
  AppointmentRecord,
  AuthUser,
  BeneficiaryGender,
  CallLogRecord,
  CallOutcome,
  DangerAlert,
  FamilyRecord,
  FieldVisit,
  HealthCheckupRecord,
  PersonCategory,
  PersonRecord,
} from '../types';

interface PeopleDirectoryProps {
  people: PersonRecord[];
  families: FamilyRecord[];
  visits: FieldVisit[];
  checkups: HealthCheckupRecord[];
  alerts: DangerAlert[];
  appointments: AppointmentRecord[];
  callLogs: CallLogRecord[];
  user: AuthUser | null;
  authToken: string | null;
  initialSelectedPersonId?: number | null;
  onClearInitialSelectedPerson?: () => void;
  onScheduleForPatient: (personId: number) => void;
  onNotifyPatient: (personId: number) => void;
  onRequestAuth: () => void;
  onRefresh: () => Promise<void>;
}

const CALL_OUTCOMES: Array<Exclude<CallOutcome, 'Dialer Opened (Pending Outcome)'>> = [
  'Answered',
  'Not Answered',
  'Call Back Required',
];

function formatLocalDateTimeInput(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

function formatCallTimestamp(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function sanitizeTelHref(phone: string): string {
  const cleaned = phone.replace(/[^+\d]/g, '');
  return cleaned ? `tel:${cleaned}` : '';
}

export function PeopleDirectory({
  people,
  families,
  visits,
  checkups,
  alerts,
  appointments,
  callLogs,
  user,
  authToken,
  initialSelectedPersonId,
  onClearInitialSelectedPerson,
  onScheduleForPatient,
  onNotifyPatient,
  onRequestAuth,
  onRefresh,
}: PeopleDirectoryProps) {
  const [search, setSearch] = useState('');
  const [villageFilter, setVillageFilter] = useState('All');
  const [ageGroup, setAgeGroup] = useState('All');
  const [selectedPerson, setSelectedPerson] = useState<PersonRecord | null>(null);

  // Direct Patient Calling & Report Modal state
  const [showCallForm, setShowCallForm] = useState(false);
  const [editingCallId, setEditingCallId] = useState<number | null>(null);
  const [callOutcome, setCallOutcome] = useState<Exclude<CallOutcome, 'Dialer Opened (Pending Outcome)'>>('Answered');
  const [callDateTime, setCallDateTime] = useState<string>(() => formatLocalDateTimeInput());
  const [callNotes, setCallNotes] = useState('');
  const [savingCall, setSavingCall] = useState(false);
  const [dialerBanner, setDialerBanner] = useState<string | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingPerson, setEditingPerson] = useState<PersonRecord | null>(null);
  const [familyId, setFamilyId] = useState('');
  const [fullName, setFullName] = useState('');
  const [age, setAge] = useState('26');
  const [gender, setGender] = useState<BeneficiaryGender>('Female');
  const [relation, setRelation] = useState('Head');
  const [phone, setPhone] = useState('');
  const [village, setVillage] = useState('');
  const [district, setDistrict] = useState(user?.district || 'Raichur');
  const [address, setAddress] = useState('');
  const [bloodGroup, setBloodGroup] = useState('O+');
  const [category, setCategory] = useState<PersonCategory>('Adult');
  const [chronic, setChronic] = useState('');

  const [confirmDelete, setConfirmDelete] = useState<PersonRecord | null>(null);
  const [showClearTempModal, setShowClearTempModal] = useState(false);
  const [clearingTemp, setClearingTemp] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const hasTemporarySeedData = useMemo(() => {
    const seedNames = new Set([
      'Lakshmamma R.',
      'Rameshappa G.',
      'Aarav K.',
      'Sunitha K.',
      'Kavitha M.',
      'Baby Diya M.',
      'Basamma H.',
      'Razia Begum',
      'Imran R.',
    ]);
    return people.some(
      (p) => /^PER-KA-200[1-9]$/.test(p.person_code) && seedNames.has(p.full_name)
    );
  }, [people]);

  const villages = useMemo(() => Array.from(new Set(people.map((p) => p.village))).sort(), [people]);

  const filteredPeople = useMemo(() => {
    const q = search.trim().toLowerCase();
    return people.filter((p) => {
      if (villageFilter !== 'All' && p.village !== villageFilter) return false;
      if (ageGroup === 'child' && p.age > 5) return false;
      if (ageGroup === 'adolescent' && (p.age < 6 || p.age > 19)) return false;
      if (ageGroup === 'adult' && (p.age < 20 || p.age > 59)) return false;
      if (ageGroup === 'senior' && p.age < 60) return false;
      if (!q) return true;
      return (
        p.full_name.toLowerCase().includes(q) ||
        p.person_code.toLowerCase().includes(q) ||
        (p.family_code || '').toLowerCase().includes(q) ||
        p.village.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
      );
    });
  }, [people, search, villageFilter, ageGroup]);

  // Sync when navigated here from Schedule Calendar -> Open Patient Profile
  useEffect(() => {
    if (!initialSelectedPersonId) return;
    const match = people.find((p) => p.id === initialSelectedPersonId);
    if (match) {
      setSelectedPerson(match);
      setShowCallForm(false);
      setEditingCallId(null);
      setDialerBanner(null);
      onClearInitialSelectedPerson?.();
    }
  }, [initialSelectedPersonId, people, onClearInitialSelectedPerson]);

  // Keep selectedPerson synchronized with latest DB data after refresh
  useEffect(() => {
    if (!selectedPerson) return;
    const refreshed = people.find((p) => p.id === selectedPerson.id);
    if (refreshed && refreshed !== selectedPerson) {
      setSelectedPerson(refreshed);
    }
  }, [people, selectedPerson]);

  const personHistory = useMemo(() => {
    if (!selectedPerson) {
      return { visits: [], checkups: [], alerts: [], appointments: [], callLogs: [] };
    }
    const nameLower = selectedPerson.full_name.toLowerCase();
    return {
      visits: visits.filter(
        (v) => v.person_id === selectedPerson.id || v.beneficiary_name.toLowerCase() === nameLower
      ),
      checkups: checkups.filter(
        (c) => c.person_id === selectedPerson.id || c.person_name.toLowerCase() === nameLower
      ),
      alerts: alerts.filter(
        (a) => a.person_id === selectedPerson.id || a.person_name.toLowerCase() === nameLower
      ),
      appointments: appointments
        .filter((ap) => ap.person_id === selectedPerson.id)
        .sort((a, b) => `${b.appointment_date} ${b.appointment_time}`.localeCompare(`${a.appointment_date} ${a.appointment_time}`)),
      callLogs: callLogs
        .filter((c) => c.person_id === selectedPerson.id)
        .sort((a, b) => b.call_initiated_at.localeCompare(a.call_initiated_at)),
    };
  }, [selectedPerson, visits, checkups, alerts, appointments, callLogs]);

  const handleSelectPerson = (p: PersonRecord) => {
    setSelectedPerson(p);
    setShowCallForm(false);
    setEditingCallId(null);
    setDialerBanner(null);
    setCallNotes('');
  };

  // Opens device phone dialer via native tel: anchor AND logs a truthful pending entry
  const handleInitiateCall = async () => {
    if (!selectedPerson || !selectedPerson.phone?.trim()) return;
    const nowLocal = formatLocalDateTimeInput();
    setCallDateTime(nowLocal);
    setCallOutcome('Answered');
    setCallNotes('');
    setShowCallForm(true);
    setDialerBanner(
      `Phone dialer requested for ${selectedPerson.phone}. Device calls are not automatically confirmed — please record the actual call outcome below after speaking.`
    );

    if (!authToken) return;
    try {
      const res = await fetch('/api/calls', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          person_id: selectedPerson.id,
          phone_number: selectedPerson.phone.trim(),
          call_initiated_at: new Date().toISOString(),
          outcome: 'Dialer Opened (Pending Outcome)',
          notes: 'Phone dialer opened from patient profile. Awaiting ASHA worker outcome update.',
        }),
      });
      if (res.ok) {
        const data = await parseApiResponse<{ call: CallLogRecord }>(res, 'Could not log dialer event.');
        setEditingCallId(data.call.id);
        await onRefresh();
      }
    } catch {
      // Do not block the native tel: call if logging fails
    }
  };

  const handleOpenManualCallForm = (existingPendingCall?: CallLogRecord) => {
    if (!authToken) {
      onRequestAuth();
      return;
    }
    if (existingPendingCall) {
      setEditingCallId(existingPendingCall.id);
      setCallOutcome(
        existingPendingCall.outcome === 'Dialer Opened (Pending Outcome)'
          ? 'Answered'
          : existingPendingCall.outcome
      );
      setCallDateTime(formatLocalDateTimeInput(new Date(existingPendingCall.call_initiated_at)));
      setCallNotes(
        existingPendingCall.outcome === 'Dialer Opened (Pending Outcome)' ? '' : existingPendingCall.notes
      );
    } else {
      setEditingCallId(null);
      setCallOutcome('Answered');
      setCallDateTime(formatLocalDateTimeInput());
      setCallNotes('');
    }
    setDialerBanner(null);
    setShowCallForm(true);
  };

  const handleSaveCallOutcome = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPerson) return;
    if (!authToken) {
      onRequestAuth();
      return;
    }
    setSavingCall(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const isoTimestamp = callDateTime ? new Date(callDateTime).toISOString() : new Date().toISOString();
      if (editingCallId) {
        const res = await fetch(`/api/calls/${editingCallId}`, {
          method: 'PATCH',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            outcome: callOutcome,
            notes: callNotes.trim(),
          }),
        });
        await parseApiResponse<{ call: CallLogRecord }>(res, 'Could not update call outcome.');
        setStatusMsg(`Updated call outcome for ${selectedPerson.full_name}: ${callOutcome}.`);
      } else {
        const res = await fetch('/api/calls', {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            person_id: selectedPerson.id,
            phone_number: (selectedPerson.phone || 'Not recorded').trim(),
            call_initiated_at: isoTimestamp,
            outcome: callOutcome,
            notes: callNotes.trim(),
          }),
        });
        await parseApiResponse<{ call: CallLogRecord }>(res, 'Could not record call log.');
        setStatusMsg(`Recorded call log for ${selectedPerson.full_name} (${callOutcome}).`);
      }
      setShowCallForm(false);
      setEditingCallId(null);
      setCallNotes('');
      setDialerBanner(null);
      await onRefresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save call log.');
    } finally {
      setSavingCall(false);
    }
  };

  const handleFamilySelect = (fid: string) => {
    setFamilyId(fid);
    const f = families.find((x) => String(x.id) === fid);
    if (f) {
      setVillage(f.village);
      setDistrict(f.district);
      setAddress(f.address);
      if (!phone) setPhone(f.phone);
    }
  };

  const openCreatePersonModal = () => {
    if (!authToken) {
      onRequestAuth();
      return;
    }
    setEditingPerson(null);
    setFamilyId('');
    setFullName('');
    setAge('26');
    setGender('Female');
    setRelation('Head');
    setPhone('');
    setVillage('');
    setDistrict(user?.district || 'Raichur');
    setAddress('');
    setBloodGroup('O+');
    setCategory('Adult');
    setChronic('');
    setErrorMsg(null);
    setShowCreateModal(true);
  };

  const openEditPersonModal = (p: PersonRecord) => {
    if (!authToken) {
      onRequestAuth();
      return;
    }
    setEditingPerson(p);
    setFamilyId(p.family_id ? String(p.family_id) : '');
    setFullName(p.full_name);
    setAge(String(p.age));
    setGender(p.gender);
    setRelation(p.relation_to_head || 'Member');
    setPhone(p.phone || '');
    setVillage(p.village || '');
    setDistrict(p.district || user?.district || 'Raichur');
    setAddress(p.address || '');
    setBloodGroup(p.blood_group || 'Unknown');
    setCategory(p.category);
    setChronic(p.chronic_conditions || '');
    setErrorMsg(null);
    setShowCreateModal(true);
  };

  const handleSavePerson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authToken) {
      onRequestAuth();
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const isEditing = Boolean(editingPerson);
      const res = await fetch(isEditing ? `/api/people/${editingPerson!.id}` : '/api/people', {
        method: isEditing ? 'PUT' : 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          family_id: familyId ? Number(familyId) : null,
          full_name: fullName.trim(),
          age: Number(age),
          gender,
          relation_to_head: relation.trim(),
          phone: phone.trim(),
          village: village.trim(),
          district,
          address: address.trim(),
          blood_group: bloodGroup,
          category,
          chronic_conditions: chronic.trim(),
        }),
      });
      const data = await parseApiResponse<{ person: PersonRecord }>(
        res,
        isEditing ? 'Could not update person.' : 'Could not register person.'
      );
      setShowCreateModal(false);
      setEditingPerson(null);
      setFullName('');
      setChronic('');
      setStatusMsg(
        isEditing
          ? `Updated ${data.person.full_name} (${data.person.person_code}).`
          : `Registered ${data.person.full_name} (${data.person.person_code}).`
      );
      setSelectedPerson(data.person);
      await onRefresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClearTemporaryData = async () => {
    if (!authToken) {
      onRequestAuth();
      return;
    }
    setClearingTemp(true);
    setErrorMsg(null);
    setStatusMsg(null);
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
      if (selectedPerson && /^PER-KA-200[1-9]$/.test(selectedPerson.person_code)) {
        setSelectedPerson(null);
      }
      setShowClearTempModal(false);
      setStatusMsg(
        data.totalRemoved > 0
          ? `Removed ${data.totalRemoved} temporary sample records. Your entered records were preserved.`
          : 'No temporary sample records were found.'
      );
      await onRefresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to remove temporary data.');
    } finally {
      setClearingTemp(false);
    }
  };

  const handleDeletePerson = async () => {
    if (!confirmDelete || !authToken) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/people/${confirmDelete.id}`, {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: {
          Accept: 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          Authorization: `Bearer ${authToken}`,
        },
      });
      await parseApiResponse(res, 'Could not remove person.');
      if (selectedPerson?.id === confirmDelete.id) setSelectedPerson(null);
      setStatusMsg(`Removed ${confirmDelete.full_name} (${confirmDelete.person_code}).`);
      setConfirmDelete(null);
      await onRefresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Delete failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e2e7e0] bg-white p-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, PER ID, family ID..."
              className="w-60 rounded-lg border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-900 focus:border-[#1f6f5c] focus:outline-none"
            />
          </div>
          <select
            value={villageFilter}
            onChange={(e) => setVillageFilter(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700"
          >
            <option value="All">All Villages</option>
            {villages.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
          <select
            value={ageGroup}
            onChange={(e) => setAgeGroup(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700"
          >
            <option value="All">All Age Groups</option>
            <option value="child">Children (0–5 yrs)</option>
            <option value="adolescent">Youth (6–19 yrs)</option>
            <option value="adult">Adults (20–59 yrs)</option>
            <option value="senior">Seniors (60+ yrs)</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {hasTemporarySeedData && (
            <button
              type="button"
              onClick={() => {
                if (!authToken) {
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
            onClick={openCreatePersonModal}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#1f6f5c] px-4 py-2 text-xs font-semibold text-white hover:bg-[#185848] whitespace-nowrap"
          >
            <Plus className="h-4 w-4" />
            Register Person
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

      {/* Main Split View */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <section className="xl:col-span-7 rounded-xl border border-[#e2e7e0] bg-white overflow-hidden">
          <div className="border-b border-slate-200 px-5 py-3.5">
            <h2 className="text-sm font-bold text-slate-900">Community People Directory ({filteredPeople.length})</h2>
            <p className="text-xs text-slate-500">Click any resident to open their longitudinal health profile</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-[#f9faf8] text-[11px] font-semibold text-slate-500">
                <tr>
                  <th className="px-4 py-3">ID</th>
                  <th className="px-4 py-3">Name & Category</th>
                  <th className="px-4 py-3">Age / Gender</th>
                  <th className="px-4 py-3">Village / Family</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPeople.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                      No individuals match your active filters.
                    </td>
                  </tr>
                ) : (
                  filteredPeople.map((p) => {
                    const active = selectedPerson?.id === p.id;
                    return (
                      <tr
                        key={p.id}
                        onClick={() => handleSelectPerson(p)}
                        className={`cursor-pointer transition-colors ${active ? 'bg-[#1f6f5c]/6' : 'hover:bg-slate-50'}`}
                      >
                        <td className="px-4 py-3 font-mono font-semibold text-[#1f6f5c] whitespace-nowrap">
                          {p.person_code}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900">{p.full_name}</div>
                          <div className="text-[11px] text-slate-500">{p.category}</div>
                        </td>
                        <td className="px-4 py-3 text-slate-700 whitespace-nowrap tabular-nums">
                          {p.age}y · {p.gender}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          <div>{p.village}</div>
                          <div className="font-mono text-[11px] text-slate-400">{p.family_code || 'Unlinked'}</div>
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openEditPersonModal(p)}
                              className="rounded p-1.5 text-slate-500 hover:bg-[#1f6f5c]/10 hover:text-[#1f6f5c]"
                              title="Edit Person"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (!authToken) {
                                  onRequestAuth();
                                  return;
                                }
                                setConfirmDelete(p);
                              }}
                              className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-700"
                              title="Delete Person"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Individual Health Profile Panel */}
        <section className="xl:col-span-5 rounded-xl border border-[#e2e7e0] bg-white p-5">
          {!selectedPerson ? (
            <div className="flex h-full min-h-[280px] flex-col items-center justify-center text-center text-slate-500">
              <User className="h-9 w-9 text-slate-300" />
              <p className="mt-3 text-sm font-semibold text-slate-700">Individual Health Profile</p>
              <p className="mt-1 max-w-xs text-xs text-slate-500">
                Select any person from the directory to view demographics, linked visits, checkups, and danger alerts.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="border-b border-slate-100 pb-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-semibold text-[#1f6f5c]">{selectedPerson.person_code}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-600">{selectedPerson.category}</span>
                    <button
                      type="button"
                      onClick={() => openEditPersonModal(selectedPerson)}
                      className="inline-flex items-center gap-1 rounded-md border border-[#d7dfd5] bg-[#f9faf8] px-2 py-1 text-[11px] font-semibold text-[#1f6f5c] hover:bg-[#1f6f5c]/10"
                    >
                      <Pencil className="h-3 w-3" />
                      Edit Details
                    </button>
                  </div>
                </div>
                <h3 className="mt-1 text-lg font-bold text-slate-900">{selectedPerson.full_name}</h3>
                <p className="text-xs text-slate-500">
                  {selectedPerson.age} yrs · {selectedPerson.gender} · Blood Group {selectedPerson.blood_group} ·{' '}
                  {selectedPerson.village}, {selectedPerson.district}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-lg bg-[#f4f6f2] p-3">
                  <span className="text-slate-500">Linked Family</span>
                  <p className="mt-0.5 font-mono font-semibold text-slate-900">
                    {selectedPerson.family_code || 'Not linked'}
                  </p>
                  {selectedPerson.head_name && (
                    <p className="text-[11px] text-slate-500">Head: {selectedPerson.head_name}</p>
                  )}
                </div>
                <div className="rounded-lg bg-[#f4f6f2] p-3">
                  <span className="text-slate-500">Contact Phone</span>
                  <p className="mt-0.5 flex items-center gap-1 font-mono font-semibold text-slate-900">
                    <Phone className="h-3 w-3 text-slate-400" />
                    {selectedPerson.phone || 'Not recorded'}
                  </p>
                </div>
              </div>

              {selectedPerson.chronic_conditions && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <strong>Known Conditions:</strong> {selectedPerson.chronic_conditions}
                </div>
              )}

              {/* Direct Care Action Bar: Call Patient, Generate PDF Report, Schedule Visit, Send Update */}
              <div className="grid grid-cols-2 gap-2">
                {selectedPerson.phone && sanitizeTelHref(selectedPerson.phone) ? (
                  <a
                    href={sanitizeTelHref(selectedPerson.phone)}
                    onClick={() => {
                      void handleInitiateCall();
                    }}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#1f6f5c] px-3 py-2 text-xs font-semibold text-white hover:bg-[#185848] transition-colors"
                  >
                    <PhoneCall className="h-3.5 w-3.5" />
                    Call Patient
                  </a>
                ) : (
                  <button
                    type="button"
                    disabled
                    title="No phone number recorded in database for this patient"
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-400 cursor-not-allowed"
                  >
                    <PhoneCall className="h-3.5 w-3.5" />
                    No Phone on File
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    if (!authToken) {
                      onRequestAuth();
                      return;
                    }
                    setShowReportModal(true);
                  }}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#1f6f5c] bg-white px-3 py-2 text-xs font-semibold text-[#1f6f5c] hover:bg-[#1f6f5c]/5 transition-colors"
                >
                  <FileText className="h-3.5 w-3.5" />
                  Generate Patient Report
                </button>

                <button
                  type="button"
                  onClick={() => onScheduleForPatient(selectedPerson.id)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#d7dfd5] bg-[#f9faf8] px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  <Calendar className="h-3.5 w-3.5 text-[#1f6f5c]" />
                  Schedule Visit
                </button>

                <button
                  type="button"
                  onClick={() => onNotifyPatient(selectedPerson.id)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#d7dfd5] bg-[#f9faf8] px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  <Bell className="h-3.5 w-3.5 text-[#1f6f5c]" />
                  Send Update
                </button>
              </div>

              {/* Direct Patient Calling & Call Outcome Recorder */}
              <div className="rounded-xl border border-[#e2e7e0] bg-[#f9faf8] p-3.5 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-bold text-slate-800">
                      Direct Calling & Call History ({personHistory.callLogs.length})
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Calls use your device phone app. Record the real outcome below.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleOpenManualCallForm()}
                    className="rounded-lg border border-[#d7dfd5] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#1f6f5c] hover:bg-[#1f6f5c]/5 whitespace-nowrap"
                  >
                    + Log Call Outcome
                  </button>
                </div>

                {dialerBanner && (
                  <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] text-sky-900">
                    {dialerBanner}
                  </div>
                )}

                {showCallForm && (
                  <form
                    onSubmit={handleSaveCallOutcome}
                    className="space-y-2.5 rounded-lg border border-slate-200 bg-white p-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800">
                        {editingCallId ? 'Update Call Outcome' : 'Record Patient Call Outcome'}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setShowCallForm(false);
                          setEditingCallId(null);
                          setDialerBanner(null);
                        }}
                        className="text-slate-400 hover:text-slate-600"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600">Call Outcome *</label>
                        <select
                          value={callOutcome}
                          onChange={(e) =>
                            setCallOutcome(
                              e.target.value as Exclude<CallOutcome, 'Dialer Opened (Pending Outcome)'>
                            )
                          }
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800"
                        >
                          {CALL_OUTCOMES.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      </div>

                      {!editingCallId && (
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600">Date & Time</label>
                          <input
                            type="datetime-local"
                            value={callDateTime}
                            onChange={(e) => setCallDateTime(e.target.value)}
                            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800"
                          />
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600">Call Notes</label>
                      <textarea
                        rows={2}
                        value={callNotes}
                        onChange={(e) => setCallNotes(e.target.value)}
                        placeholder="e.g. Confirmed tomorrow 10 AM ANC visit; patient requested morning callback..."
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-[#1f6f5c] focus:outline-none"
                      />
                    </div>

                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setShowCallForm(false);
                          setEditingCallId(null);
                          setDialerBanner(null);
                        }}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={savingCall}
                        className="rounded-lg bg-[#1f6f5c] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#185848] disabled:opacity-60"
                      >
                        {savingCall ? 'Saving...' : editingCallId ? 'Save Outcome' : 'Record Call'}
                      </button>
                    </div>
                  </form>
                )}

                {personHistory.callLogs.length === 0 ? (
                  <p className="text-[11px] text-slate-500">
                    No calls logged for {selectedPerson.full_name} yet.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-52 overflow-y-auto pr-0.5">
                    {personHistory.callLogs.map((log) => {
                      const isPending = log.outcome === 'Dialer Opened (Pending Outcome)';
                      const outcomeClass =
                        log.outcome === 'Answered'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : log.outcome === 'Call Back Required'
                          ? 'bg-amber-50 text-amber-900 border-amber-200'
                          : log.outcome === 'Not Answered'
                          ? 'bg-red-50 text-red-800 border-red-200'
                          : 'bg-sky-50 text-sky-800 border-sky-200';
                      return (
                        <div
                          key={log.id}
                          className="rounded-lg border border-slate-200 bg-white p-2.5 text-xs"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-1.5">
                            <span
                              className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold ${outcomeClass}`}
                            >
                              {log.outcome}
                            </span>
                            <span className="inline-flex items-center gap-1 font-mono text-[10px] text-slate-500">
                              <Clock className="h-3 w-3" />
                              {formatCallTimestamp(log.call_initiated_at)}
                            </span>
                          </div>
                          {log.notes && (
                            <p className="mt-1.5 text-[11px] text-slate-700 leading-relaxed">{log.notes}</p>
                          )}
                          <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-400">
                            <span className="font-mono">{log.phone_number}</span>
                            {isPending ? (
                              <button
                                type="button"
                                onClick={() => handleOpenManualCallForm(log)}
                                className="font-semibold text-[#1f6f5c] hover:underline"
                              >
                                Record Outcome →
                              </button>
                            ) : (
                              <span>By {log.recorded_by}</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Linked Clinical Activity */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg border border-slate-200 p-2.5">
                  <ClipboardList className="mx-auto h-4 w-4 text-[#1f6f5c]" />
                  <p className="mt-1 font-mono text-base font-bold text-slate-900 tabular-nums">
                    {personHistory.visits.length}
                  </p>
                  <p className="text-[11px] text-slate-500">Visits</p>
                </div>
                <div className="rounded-lg border border-slate-200 p-2.5">
                  <Activity className="mx-auto h-4 w-4 text-sky-600" />
                  <p className="mt-1 font-mono text-base font-bold text-slate-900 tabular-nums">
                    {personHistory.checkups.length}
                  </p>
                  <p className="text-[11px] text-slate-500">Checkups</p>
                </div>
                <div className="rounded-lg border border-slate-200 p-2.5">
                  <AlertTriangle className="mx-auto h-4 w-4 text-red-600" />
                  <p className="mt-1 font-mono text-base font-bold text-slate-900 tabular-nums">
                    {personHistory.alerts.length}
                  </p>
                  <p className="text-[11px] text-slate-500">Alerts</p>
                </div>
              </div>

              {/* Linked Scheduled Appointments */}
              {personHistory.appointments.length > 0 && (
                <div>
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-800">
                      Scheduled Appointments ({personHistory.appointments.length})
                    </h4>
                    <button
                      type="button"
                      onClick={() => onScheduleForPatient(selectedPerson.id)}
                      className="text-[11px] font-semibold text-[#1f6f5c] hover:underline"
                    >
                      Open Calendar
                    </button>
                  </div>
                  <div className="mt-2 space-y-1.5">
                    {personHistory.appointments.slice(0, 3).map((ap) => (
                      <div
                        key={ap.id}
                        className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 p-2.5 text-xs"
                      >
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900 truncate">{ap.appointment_type}</p>
                          <p className="text-[11px] text-slate-500 truncate">{ap.purpose}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-mono text-[11px] font-semibold text-slate-800">
                            {ap.appointment_date} {ap.appointment_time}
                          </p>
                          <p className="text-[10px] font-medium text-slate-500">{ap.status}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {personHistory.checkups.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-slate-800">Latest Checkup Summary</h4>
                  <div className="mt-2 rounded-lg border border-slate-200 p-3 text-xs text-slate-700">
                    <div className="flex justify-between font-mono text-[11px] text-slate-500">
                      <span>{personHistory.checkups[0].checkup_date}</span>
                      <span>
                        BP {personHistory.checkups[0].bp_systolic ?? '—'}/{personHistory.checkups[0].bp_diastolic ?? '—'} · Hb{' '}
                        {personHistory.checkups[0].hemoglobin_gdl ?? '—'}
                      </span>
                    </div>
                    <p className="mt-1.5 text-slate-800">{personHistory.checkups[0].summary}</p>
                  </div>
                </div>
              )}

              {personHistory.visits.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-slate-800">Recent Home Visits</h4>
                  <div className="mt-2 space-y-2">
                    {personHistory.visits.slice(0, 3).map((v) => (
                      <div key={v.id} className="rounded-lg border border-slate-200 p-2.5 text-xs">
                        <div className="flex justify-between">
                          <span className="font-semibold text-slate-900">{v.purpose || 'Home Visit'}</span>
                          <span className="font-mono text-[11px] text-slate-500">{v.visit_date}</span>
                        </div>
                        <p className="mt-1 text-slate-600 line-clamp-2">{v.recommended_action || v.notes || v.symptoms}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      {/* INDIVIDUAL PATIENT PDF REPORT MODAL */}
      {showReportModal && selectedPerson && (
        <PatientReportModal
          person={selectedPerson}
          authToken={authToken}
          onClose={() => setShowReportModal(false)}
        />
      )}

      {/* CREATE / EDIT PERSON MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-lg font-bold text-slate-900">
                {editingPerson
                  ? `Update Resident (${editingPerson.person_code})`
                  : 'Register Individual in People Directory'}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowCreateModal(false);
                  setEditingPerson(null);
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSavePerson} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700">Link to Village Family</label>
                <select
                  value={familyId}
                  onChange={(e) => handleFamilySelect(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">-- Standalone / Unlinked --</option>
                  {families.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.family_code} — {f.head_name} ({f.village})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">Full Name *</label>
                <input
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Age *</label>
                  <input
                    required
                    type="number"
                    min={0}
                    max={115}
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Gender</label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value as BeneficiaryGender)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="Female">Female</option>
                    <option value="Male">Male</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
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
                <label className="block text-xs font-semibold text-slate-700">Health Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as PersonCategory)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="Pregnant Woman">Pregnant Woman</option>
                  <option value="Lactating Mother">Lactating Mother</option>
                  <option value="Child (0-5y)">Child (0-5y)</option>
                  <option value="Adolescent Girl">Adolescent Girl</option>
                  <option value="Adult">Adult</option>
                  <option value="Senior">Senior</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">Phone</label>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">Blood Group</label>
                <select
                  value={bloodGroup}
                  onChange={(e) => setBloodGroup(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  {['Unknown', 'A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">Relation to Head</label>
                <input
                  value={relation}
                  onChange={(e) => setRelation(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700">Address</label>
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700">Chronic Conditions / Allergies</label>
                <input
                  value={chronic}
                  onChange={(e) => setChronic(e.target.value)}
                  placeholder="e.g. Hypertension, Diabetes, Anaemia, None"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setEditingPerson(null);
                  }}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-[#1f6f5c] px-5 py-2 text-xs font-semibold text-white hover:bg-[#185848] disabled:opacity-60"
                >
                  {submitting ? 'Saving...' : editingPerson ? 'Save Changes' : 'Register Person'}
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
              This removes pre-seeded sample families, residents, visits, checkups, alerts, and schedule entries while
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

      {/* DELETE CONFIRM MODAL */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 className="text-base font-bold text-slate-900">Remove Resident?</h3>
            <p className="mt-2 text-xs text-slate-600">
              Confirm deletion of <strong>{confirmDelete.full_name}</strong> ({confirmDelete.person_code}) from the People Directory.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleDeletePerson}
                className="rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700"
              >
                {submitting ? 'Removing...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
