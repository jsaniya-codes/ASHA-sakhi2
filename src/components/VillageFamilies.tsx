import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Edit3,
  Home,
  Phone,
  Plus,
  Search,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { KARNATAKA_DISTRICTS } from '../data/nfhs5Karnataka';
import { parseApiResponse } from '../utils/apiClient';
import type {
  AuthUser,
  BeneficiaryGender,
  FamilyRecord,
  PersonCategory,
  PersonRecord,
} from '../types';

interface VillageFamiliesProps {
  families: FamilyRecord[];
  people: PersonRecord[];
  user: AuthUser | null;
  authToken: string | null;
  onRequestAuth: () => void;
  onRefresh: () => Promise<void>;
}

export function VillageFamilies({
  families,
  people,
  user,
  authToken,
  onRequestAuth,
  onRefresh,
}: VillageFamiliesProps) {
  const [search, setSearch] = useState('');
  const [villageFilter, setVillageFilter] = useState('All');
  const [selectedFamily, setSelectedFamily] = useState<FamilyRecord | null>(null);

  // Add/Edit family modal state
  const [showFamilyModal, setShowFamilyModal] = useState(false);
  const [editingFamily, setEditingFamily] = useState<FamilyRecord | null>(null);
  const [headName, setHeadName] = useState('');
  const [village, setVillage] = useState('');
  const [district, setDistrict] = useState(user?.district || 'Raichur');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [rationCard, setRationCard] = useState('BPL');
  const [waterSource, setWaterSource] = useState('Piped Tap Water');
  const [toiletAccess, setToiletAccess] = useState('Individual Household Toilet');
  const [notes, setNotes] = useState('');

  // Quick Add Member to selected family modal
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [memberName, setMemberName] = useState('');
  const [memberAge, setMemberAge] = useState('25');
  const [memberGender, setMemberGender] = useState<BeneficiaryGender>('Female');
  const [memberRelation, setMemberRelation] = useState('Spouse');
  const [memberCategory, setMemberCategory] = useState<PersonCategory>('Adult');
  const [memberBlood, setMemberBlood] = useState('O+');

  // Delete confirmation modal
  const [confirmDeleteFamily, setConfirmDeleteFamily] = useState<FamilyRecord | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const villages = useMemo(() => {
    const set = new Set<string>();
    families.forEach((f) => set.add(f.village));
    return Array.from(set).sort();
  }, [families]);

  const filteredFamilies = useMemo(() => {
    const q = search.trim().toLowerCase();
    return families.filter((f) => {
      if (villageFilter !== 'All' && f.village !== villageFilter) return false;
      if (!q) return true;
      return (
        f.head_name.toLowerCase().includes(q) ||
        f.family_code.toLowerCase().includes(q) ||
        f.village.toLowerCase().includes(q) ||
        f.district.toLowerCase().includes(q) ||
        f.phone.toLowerCase().includes(q)
      );
    });
  }, [families, search, villageFilter]);

  const selectedMembers = useMemo(() => {
    if (!selectedFamily) return [];
    return people.filter((p) => p.family_id === selectedFamily.id);
  }, [people, selectedFamily]);

  const openCreateModal = () => {
    if (!authToken) {
      onRequestAuth();
      return;
    }
    setEditingFamily(null);
    setHeadName('');
    setVillage('');
    setDistrict(user?.district || 'Raichur');
    setAddress('');
    setPhone('');
    setRationCard('BPL');
    setWaterSource('Piped Tap Water');
    setToiletAccess('Individual Household Toilet');
    setNotes('');
    setShowFamilyModal(true);
  };

  const openEditModal = (fam: FamilyRecord) => {
    if (!authToken) {
      onRequestAuth();
      return;
    }
    setEditingFamily(fam);
    setHeadName(fam.head_name);
    setVillage(fam.village);
    setDistrict(fam.district);
    setAddress(fam.address);
    setPhone(fam.phone);
    setRationCard(fam.ration_card_type);
    setWaterSource(fam.water_source);
    setToiletAccess(fam.toilet_access);
    setNotes(fam.notes);
    setShowFamilyModal(true);
  };

  const handleSaveFamily = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authToken) {
      onRequestAuth();
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const url = editingFamily ? `/api/families/${editingFamily.id}` : '/api/families';
      const method = editingFamily ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          head_name: headName.trim(),
          village: village.trim(),
          district,
          address: address.trim(),
          phone: phone.trim(),
          ration_card_type: rationCard,
          water_source: waterSource,
          toilet_access: toiletAccess,
          notes: notes.trim(),
        }),
      });
      const data = await parseApiResponse<{ family: FamilyRecord }>(res, 'Could not save family.');
      setShowFamilyModal(false);
      setStatusMsg(
        editingFamily
          ? `Updated family ${data.family.family_code}.`
          : `Registered new household ${data.family.family_code}.`
      );
      if (selectedFamily && editingFamily && selectedFamily.id === editingFamily.id) {
        setSelectedFamily(data.family);
      }
      await onRefresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteFamily = async () => {
    if (!confirmDeleteFamily) return;
    if (!authToken) {
      onRequestAuth();
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/families/${confirmDeleteFamily.id}`, {
        method: 'DELETE',
        headers: { Accept: 'application/json', Authorization: `Bearer ${authToken}` },
      });
      await parseApiResponse(res, 'Could not delete family.');
      if (selectedFamily?.id === confirmDeleteFamily.id) {
        setSelectedFamily(null);
      }
      setStatusMsg(`Removed family ${confirmDeleteFamily.family_code}.`);
      setConfirmDeleteFamily(null);
      await onRefresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Delete failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddMemberToFamily = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFamily) return;
    if (!authToken) {
      onRequestAuth();
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/people', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          family_id: selectedFamily.id,
          full_name: memberName.trim(),
          age: Number(memberAge),
          gender: memberGender,
          relation_to_head: memberRelation.trim(),
          phone: selectedFamily.phone,
          village: selectedFamily.village,
          district: selectedFamily.district,
          address: selectedFamily.address,
          blood_group: memberBlood,
          category: memberCategory,
        }),
      });
      await parseApiResponse(res, 'Could not add family member.');
      setShowAddMemberModal(false);
      setMemberName('');
      setStatusMsg(`Added ${memberName.trim()} to household ${selectedFamily.family_code}.`);
      await onRefresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not add member.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e2e7e0] bg-white p-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search head name, FAM ID, village..."
              className="w-64 rounded-lg border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-900 focus:border-[#1f6f5c] focus:outline-none"
            />
          </div>
          <select
            value={villageFilter}
            onChange={(e) => setVillageFilter(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700"
          >
            <option value="All">All Villages ({villages.length})</option>
            {villages.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#1f6f5c] px-4 py-2 text-xs font-semibold text-white hover:bg-[#185848] whitespace-nowrap"
        >
          <Plus className="h-4 w-4" />
          Add Family Household
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

      {/* Main Split: Family Table + Selected Family Detail */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <section className="xl:col-span-7 rounded-xl border border-[#e2e7e0] bg-white overflow-hidden">
          <div className="border-b border-slate-200 px-5 py-3.5 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Registered Village Families ({filteredFamilies.length})</h2>
              <p className="text-xs text-slate-500">Click any household to view linked members and WASH status</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-[#f9faf8] text-[11px] font-semibold text-slate-500">
                <tr>
                  <th className="px-4 py-3">Family ID</th>
                  <th className="px-4 py-3">Head of Household</th>
                  <th className="px-4 py-3">Village / District</th>
                  <th className="px-4 py-3">Members</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredFamilies.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                      No households found. Click &ldquo;Add Family Household&rdquo; to register a family.
                    </td>
                  </tr>
                ) : (
                  filteredFamilies.map((f) => {
                    const active = selectedFamily?.id === f.id;
                    const count = people.filter((p) => p.family_id === f.id).length;
                    return (
                      <tr
                        key={f.id}
                        onClick={() => setSelectedFamily(f)}
                        className={`cursor-pointer transition-colors ${active ? 'bg-[#1f6f5c]/6' : 'hover:bg-slate-50'}`}
                      >
                        <td className="px-4 py-3 font-mono font-semibold text-[#1f6f5c] whitespace-nowrap">
                          {f.family_code}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900">{f.head_name}</div>
                          <div className="text-[11px] text-slate-500">{f.ration_card_type} · {f.phone || 'No phone'}</div>
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {f.village} <span className="text-slate-400">· {f.district}</span>
                        </td>
                        <td className="px-4 py-3 font-mono font-semibold text-slate-800 tabular-nums">
                          {count}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => openEditModal(f)}
                            className="mr-2 rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                            title="Edit Family"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (!authToken) {
                                onRequestAuth();
                                return;
                              }
                              setConfirmDeleteFamily(f);
                            }}
                            className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-700"
                            title="Delete Family"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Right Detail Panel */}
        <section className="xl:col-span-5 rounded-xl border border-[#e2e7e0] bg-white p-5">
          {!selectedFamily ? (
            <div className="flex h-full min-h-[260px] flex-col items-center justify-center text-center text-slate-500">
              <Home className="h-9 w-9 text-slate-300" />
              <p className="mt-3 text-sm font-semibold text-slate-700">Select a Household</p>
              <p className="mt-1 max-w-xs text-xs text-slate-500">
                Choose any village family on the left to inspect household sanitation, drinking water, and linked family members.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex items-start justify-between border-b border-slate-100 pb-4">
                <div>
                  <p className="font-mono text-xs font-semibold text-[#1f6f5c]">{selectedFamily.family_code}</p>
                  <h3 className="mt-0.5 text-lg font-bold text-slate-900">{selectedFamily.head_name}</h3>
                  <p className="text-xs text-slate-500">
                    {selectedFamily.address ? `${selectedFamily.address}, ` : ''}
                    {selectedFamily.village}, {selectedFamily.district}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openEditModal(selectedFamily)}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Edit
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-lg bg-[#f4f6f2] p-3">
                  <span className="text-slate-500">Phone</span>
                  <p className="mt-0.5 flex items-center gap-1 font-mono font-semibold text-slate-900">
                    <Phone className="h-3 w-3 text-slate-400" />
                    {selectedFamily.phone || 'Not recorded'}
                  </p>
                </div>
                <div className="rounded-lg bg-[#f4f6f2] p-3">
                  <span className="text-slate-500">Ration Card</span>
                  <p className="mt-0.5 font-semibold text-slate-900">{selectedFamily.ration_card_type}</p>
                </div>
                <div className="rounded-lg bg-[#f4f6f2] p-3">
                  <span className="text-slate-500">Drinking Water</span>
                  <p className="mt-0.5 font-semibold text-slate-900">{selectedFamily.water_source}</p>
                </div>
                <div className="rounded-lg bg-[#f4f6f2] p-3">
                  <span className="text-slate-500">Sanitation / Toilet</span>
                  <p className="mt-0.5 font-semibold text-slate-900">{selectedFamily.toilet_access}</p>
                </div>
              </div>

              {selectedFamily.notes && (
                <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                  {selectedFamily.notes}
                </p>
              )}

              <div>
                <div className="flex items-center justify-between">
                  <h4 className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-800">
                    <Users className="h-4 w-4 text-[#1f6f5c]" />
                    Linked Household Members ({selectedMembers.length})
                  </h4>
                  <button
                    type="button"
                    onClick={() => {
                      if (!authToken) {
                        onRequestAuth();
                        return;
                      }
                      setShowAddMemberModal(true);
                    }}
                    className="inline-flex items-center gap-1 rounded-lg bg-[#1f6f5c] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[#185848]"
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    Add Member
                  </button>
                </div>

                <div className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200">
                  {selectedMembers.length === 0 ? (
                    <p className="p-4 text-center text-xs text-slate-500">No members linked yet.</p>
                  ) : (
                    selectedMembers.map((m) => (
                      <div key={m.id} className="flex items-center justify-between px-3.5 py-2.5 text-xs">
                        <div>
                          <p className="font-semibold text-slate-900">
                            {m.full_name} <span className="font-normal text-slate-500">({m.age}y · {m.gender})</span>
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {m.person_code} · {m.relation_to_head} · {m.category}
                          </p>
                        </div>
                        <span className="font-mono text-[11px] font-semibold text-slate-600">{m.blood_group}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* ADD/EDIT FAMILY MODAL */}
      {showFamilyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-lg font-bold text-slate-900">
                {editingFamily ? `Edit Family ${editingFamily.family_code}` : 'Register Village Family'}
              </h3>
              <button type="button" onClick={() => setShowFamilyModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSaveFamily} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700">Head of Household Name *</label>
                <input
                  required
                  value={headName}
                  onChange={(e) => setHeadName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">Phone Number</label>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. 9845012345"
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
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700">Street / Ward / House Number</label>
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">Ration Card Category</label>
                <select
                  value={rationCard}
                  onChange={(e) => setRationCard(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="BPL">BPL (Priority Household)</option>
                  <option value="AAY">AAY (Antyodaya)</option>
                  <option value="APL">APL</option>
                  <option value="None">No Card</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">Drinking Water Source</label>
                <select
                  value={waterSource}
                  onChange={(e) => setWaterSource(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="Piped Tap Water">Piped Tap Water</option>
                  <option value="Borewell / Handpump">Borewell / Handpump</option>
                  <option value="Public Standpost">Public Standpost</option>
                  <option value="Open Well / Tanker">Open Well / Tanker</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700">Toilet / Sanitation Access</label>
                <select
                  value={toiletAccess}
                  onChange={(e) => setToiletAccess(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="Individual Household Toilet">Individual Household Toilet</option>
                  <option value="Community Toilet">Community Toilet</option>
                  <option value="No Toilet Access">No Toilet Access</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700">Household Notes</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowFamilyModal(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-[#1f6f5c] px-5 py-2 text-xs font-semibold text-white hover:bg-[#185848] disabled:opacity-60"
                >
                  {submitting ? 'Saving...' : editingFamily ? 'Update Family' : 'Create Family'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD MEMBER MODAL */}
      {showAddMemberModal && selectedFamily && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                Add Member to {selectedFamily.family_code}
              </h3>
              <button type="button" onClick={() => setShowAddMemberModal(false)} className="text-slate-400">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleAddMemberToFamily} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700">Full Name *</label>
                <input
                  required
                  value={memberName}
                  onChange={(e) => setMemberName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Age *</label>
                  <input
                    required
                    type="number"
                    min={0}
                    max={110}
                    value={memberAge}
                    onChange={(e) => setMemberAge(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Gender</label>
                  <select
                    value={memberGender}
                    onChange={(e) => setMemberGender(e.target.value as BeneficiaryGender)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="Female">Female</option>
                    <option value="Male">Male</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Relation to Head</label>
                  <input
                    value={memberRelation}
                    onChange={(e) => setMemberRelation(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Blood Group</label>
                  <select
                    value={memberBlood}
                    onChange={(e) => setMemberBlood(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    {['Unknown', 'A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">Health Category</label>
                <select
                  value={memberCategory}
                  onChange={(e) => setMemberCategory(e.target.value as PersonCategory)}
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
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddMemberModal(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-[#1f6f5c] px-4 py-2 text-xs font-semibold text-white hover:bg-[#185848]"
                >
                  {submitting ? 'Adding...' : 'Add Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {confirmDeleteFamily && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 className="text-base font-bold text-slate-900">Delete Family Record?</h3>
            <p className="mt-2 text-xs text-slate-600 leading-relaxed">
              Are you sure you want to delete household <strong>{confirmDeleteFamily.family_code}</strong> ({confirmDeleteFamily.head_name}, {confirmDeleteFamily.village})? Individual members in the People Directory will remain preserved with unlinked family status.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteFamily(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleDeleteFamily}
                className="rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700"
              >
                {submitting ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
