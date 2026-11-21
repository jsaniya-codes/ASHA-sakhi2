import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Bell,
  Calendar as CalendarIcon,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Edit3,
  Plus,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { parseApiResponse } from '../utils/apiClient';
import type {
  AppointmentRecord,
  AppointmentStatus,
  AppointmentType,
  PersonRecord,
} from '../types';

interface ScheduleCalendarProps {
  appointments: AppointmentRecord[];
  people: PersonRecord[];
  authToken: string | null;
  preselectedPersonId?: number | null;
  onClearPreselectedPerson?: () => void;
  onRequestAuth: () => void;
  onRefresh: () => Promise<void>;
  onOpenPatientProfile: (personId: number) => void;
  onSendReminder: (appointment: AppointmentRecord) => void;
}

type CalendarViewMode = 'month' | 'week' | 'day';
type ListFilterMode = 'all' | 'today' | 'upcoming' | 'overdue';

const APPOINTMENT_TYPES: AppointmentType[] = [
  'Home Visit',
  'Antenatal Checkup',
  'Vaccination',
  'Follow-up Visit',
];

const TYPE_STYLES: Record<AppointmentType, string> = {
  'Home Visit': 'bg-teal-50 text-[#1f6f5c] border-teal-200',
  'Antenatal Checkup': 'bg-indigo-50 text-indigo-800 border-indigo-200',
  Vaccination: 'bg-sky-50 text-sky-800 border-sky-200',
  'Follow-up Visit': 'bg-amber-50 text-amber-900 border-amber-200',
};

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function getStartOfWeek(d: Date): Date {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = copy.getDay(); // 0 = Sun
  copy.setDate(copy.getDate() - day);
  return copy;
}

function formatReadableDate(iso: string): string {
  const d = parseIsoDate(iso);
  return d.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function ScheduleCalendar({
  appointments,
  people,
  authToken,
  preselectedPersonId,
  onClearPreselectedPerson,
  onRequestAuth,
  onRefresh,
  onOpenPatientProfile,
  onSendReminder,
}: ScheduleCalendarProps) {
  const todayIso = toIsoDate(new Date());
  const [viewMode, setViewMode] = useState<CalendarViewMode>('month');
  const [cursorDate, setCursorDate] = useState<Date>(() => new Date());
  const [selectedDateIso, setSelectedDateIso] = useState<string>(todayIso);
  const [listFilter, setListFilter] = useState<ListFilterMode>('all');
  const [typeFilter, setTypeFilter] = useState<AppointmentType | 'All'>('All');

  // Add / Edit Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<AppointmentRecord | null>(null);
  const [personId, setPersonId] = useState('');
  const [appointmentType, setAppointmentType] = useState<AppointmentType>('Home Visit');
  const [appointmentDate, setAppointmentDate] = useState(todayIso);
  const [appointmentTime, setAppointmentTime] = useState('10:00');
  const [purpose, setPurpose] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<AppointmentStatus>('Scheduled');

  const [confirmDelete, setConfirmDelete] = useState<AppointmentRecord | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // If navigated from a patient profile to schedule a visit, open modal pre-selected for that patient
  useEffect(() => {
    if (preselectedPersonId && people.some((p) => p.id === preselectedPersonId)) {
      setEditingAppointment(null);
      setPersonId(String(preselectedPersonId));
      setAppointmentType('Home Visit');
      setAppointmentDate(todayIso);
      setAppointmentTime('10:00');
      setPurpose('');
      setNotes('');
      setStatus('Scheduled');
      setShowModal(true);
      onClearPreselectedPerson?.();
    }
  }, [preselectedPersonId, people, todayIso, onClearPreselectedPerson]);

  const isOverdue = (a: AppointmentRecord): boolean =>
    a.status === 'Scheduled' && a.appointment_date < todayIso;

  const stats = useMemo(() => {
    let todayCount = 0;
    let upcomingCount = 0;
    let overdueCount = 0;
    let completedCount = 0;
    for (const a of appointments) {
      if (a.status === 'Completed') {
        completedCount += 1;
      } else if (a.status === 'Scheduled') {
        if (a.appointment_date === todayIso) todayCount += 1;
        else if (a.appointment_date > todayIso) upcomingCount += 1;
        else overdueCount += 1;
      }
    }
    return { todayCount, upcomingCount, overdueCount, completedCount };
  }, [appointments, todayIso]);

  const filteredAppointments = useMemo(() => {
    return appointments.filter((a) => {
      if (typeFilter !== 'All' && a.appointment_type !== typeFilter) return false;
      if (listFilter === 'today') return a.appointment_date === todayIso;
      if (listFilter === 'upcoming')
        return a.status === 'Scheduled' && a.appointment_date > todayIso;
      if (listFilter === 'overdue') return isOverdue(a);
      return true;
    });
  }, [appointments, listFilter, typeFilter, todayIso]);

  const appointmentsByDate = useMemo(() => {
    const map = new Map<string, AppointmentRecord[]>();
    for (const a of appointments) {
      if (typeFilter !== 'All' && a.appointment_type !== typeFilter) continue;
      const list = map.get(a.appointment_date) || [];
      list.push(a);
      map.set(a.appointment_date, list);
    }
    return map;
  }, [appointments, typeFilter]);

  // Month grid cells (6 rows x 7 cols = 42 days)
  const monthDays = useMemo(() => {
    const year = cursorDate.getFullYear();
    const month = cursorDate.getMonth();
    const firstDayOfMonth = new Date(year, month, 1);
    const startOffset = firstDayOfMonth.getDay();
    const gridStart = new Date(year, month, 1 - startOffset);
    const cells: Array<{ date: Date; iso: string; inMonth: boolean }> = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
      cells.push({ date: d, iso: toIsoDate(d), inMonth: d.getMonth() === month });
    }
    return cells;
  }, [cursorDate]);

  // Week 7 days
  const weekDays = useMemo(() => {
    const start = getStartOfWeek(cursorDate);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      return { date: d, iso: toIsoDate(d) };
    });
  }, [cursorDate]);

  const dayAppointments = useMemo(() => {
    return (appointmentsByDate.get(selectedDateIso) || []).slice().sort((a, b) =>
      a.appointment_time.localeCompare(b.appointment_time)
    );
  }, [appointmentsByDate, selectedDateIso]);

  const handleNavigateCalendar = (dir: -1 | 0 | 1) => {
    if (dir === 0) {
      const now = new Date();
      setCursorDate(now);
      setSelectedDateIso(toIsoDate(now));
      return;
    }
    const next = new Date(cursorDate);
    if (viewMode === 'month') {
      next.setMonth(next.getMonth() + dir);
    } else if (viewMode === 'week') {
      next.setDate(next.getDate() + dir * 7);
    } else {
      next.setDate(next.getDate() + dir);
      setSelectedDateIso(toIsoDate(next));
    }
    setCursorDate(next);
  };

  const openCreateModal = (dateOverride?: string) => {
    if (!authToken) {
      onRequestAuth();
      return;
    }
    setEditingAppointment(null);
    setPersonId(people[0] ? String(people[0].id) : '');
    setAppointmentType('Home Visit');
    setAppointmentDate(dateOverride || selectedDateIso || todayIso);
    setAppointmentTime('10:00');
    setPurpose('');
    setNotes('');
    setStatus('Scheduled');
    setErrorMsg(null);
    setShowModal(true);
  };

  const openEditModal = (appt: AppointmentRecord) => {
    if (!authToken) {
      onRequestAuth();
      return;
    }
    setEditingAppointment(appt);
    setPersonId(String(appt.person_id));
    setAppointmentType(appt.appointment_type);
    setAppointmentDate(appt.appointment_date);
    setAppointmentTime(appt.appointment_time);
    setPurpose(appt.purpose);
    setNotes(appt.notes);
    setStatus(appt.status);
    setErrorMsg(null);
    setShowModal(true);
  };

  const handleSaveAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authToken) {
      onRequestAuth();
      return;
    }
    if (!personId) {
      setErrorMsg('Please select an existing patient from the database.');
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const endpoint = editingAppointment
        ? `/api/appointments/${editingAppointment.id}`
        : '/api/appointments';
      const method = editingAppointment ? 'PUT' : 'POST';
      const res = await fetch(endpoint, {
        method,
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          person_id: Number(personId),
          appointment_type: appointmentType,
          appointment_date: appointmentDate,
          appointment_time: appointmentTime,
          purpose: purpose.trim(),
          notes: notes.trim(),
          status,
        }),
      });
      const data = await parseApiResponse<{ appointment: AppointmentRecord }>(
        res,
        'Could not save appointment.'
      );
      setShowModal(false);
      setSelectedDateIso(data.appointment.appointment_date);
      setStatusMsg(
        editingAppointment
          ? `Updated ${data.appointment.appointment_type} for ${data.appointment.patient_name}.`
          : `Scheduled ${data.appointment.appointment_type} for ${data.appointment.patient_name} on ${data.appointment.appointment_date}.`
      );
      await onRefresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save appointment.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleMarkStatus = async (appt: AppointmentRecord, nextStatus: AppointmentStatus) => {
    if (!authToken) {
      onRequestAuth();
      return;
    }
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/appointments/${appt.id}`, {
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
      await parseApiResponse(res, 'Could not update appointment status.');
      setStatusMsg(`Marked ${appt.patient_name}'s ${appt.appointment_type} as ${nextStatus}.`);
      await onRefresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not update status.');
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete || !authToken) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/appointments/${confirmDelete.id}`, {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: {
          Accept: 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          Authorization: `Bearer ${authToken}`,
        },
      });
      await parseApiResponse(res, 'Could not delete appointment.');
      setStatusMsg(`Deleted appointment for ${confirmDelete.patient_name}.`);
      setConfirmDelete(null);
      await onRefresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Delete failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const headerPeriodLabel = useMemo(() => {
    if (viewMode === 'month') {
      return cursorDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    }
    if (viewMode === 'week') {
      const first = weekDays[0].date;
      const last = weekDays[6].date;
      return `${first.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} – ${last.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`;
    }
    return formatReadableDate(selectedDateIso);
  }, [viewMode, cursorDate, weekDays, selectedDateIso]);

  return (
    <div className="space-y-5">
      {/* KPI Summary Strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <button
          type="button"
          onClick={() => setListFilter('today')}
          className={`rounded-xl border bg-white p-4 text-left transition-colors ${
            listFilter === 'today' ? 'border-[#1f6f5c] ring-1 ring-[#1f6f5c]' : 'border-[#e2e7e0] hover:border-slate-300'
          }`}
        >
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Today</p>
          <p className="mt-1 font-mono text-2xl font-bold text-[#1f6f5c] tabular-nums">{stats.todayCount}</p>
          <p className="text-[11px] text-slate-500">Scheduled for today</p>
        </button>

        <button
          type="button"
          onClick={() => setListFilter('upcoming')}
          className={`rounded-xl border bg-white p-4 text-left transition-colors ${
            listFilter === 'upcoming' ? 'border-sky-600 ring-1 ring-sky-600' : 'border-[#e2e7e0] hover:border-slate-300'
          }`}
        >
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Upcoming</p>
          <p className="mt-1 font-mono text-2xl font-bold text-sky-700 tabular-nums">{stats.upcomingCount}</p>
          <p className="text-[11px] text-slate-500">Future visits & ANC</p>
        </button>

        <button
          type="button"
          onClick={() => setListFilter('overdue')}
          className={`rounded-xl border bg-white p-4 text-left transition-colors ${
            listFilter === 'overdue' ? 'border-red-600 ring-1 ring-red-600' : 'border-[#e2e7e0] hover:border-slate-300'
          }`}
        >
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Overdue</p>
          <p className="mt-1 font-mono text-2xl font-bold text-red-700 tabular-nums">{stats.overdueCount}</p>
          <p className="text-[11px] text-slate-500">Needs immediate follow-up</p>
        </button>

        <button
          type="button"
          onClick={() => setListFilter('all')}
          className={`rounded-xl border bg-white p-4 text-left transition-colors ${
            listFilter === 'all' ? 'border-emerald-700 ring-1 ring-emerald-700' : 'border-[#e2e7e0] hover:border-slate-300'
          }`}
        >
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Completed</p>
          <p className="mt-1 font-mono text-2xl font-bold text-slate-900 tabular-nums">{stats.completedCount}</p>
          <p className="text-[11px] text-slate-500">Total appointments: {appointments.length}</p>
        </button>
      </div>

      {/* Controls Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e2e7e0] bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 bg-[#f4f6f2] p-0.5 text-xs font-semibold">
            {(['month', 'week', 'day'] as CalendarViewMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => {
                  setViewMode(mode);
                  if (mode === 'day') {
                    setCursorDate(parseIsoDate(selectedDateIso));
                  }
                }}
                className={`rounded-md px-3 py-1.5 capitalize transition-colors ${
                  viewMode === mode
                    ? 'bg-white text-[#1f6f5c] shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => handleNavigateCalendar(-1)}
              className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-700 hover:bg-slate-50"
              aria-label="Previous period"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => handleNavigateCalendar(0)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => handleNavigateCalendar(1)}
              className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-700 hover:bg-slate-50"
              aria-label="Next period"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <span className="ml-1 text-sm font-bold text-slate-900">{headerPeriodLabel}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as AppointmentType | 'All')}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700"
          >
            <option value="All">All Appointment Types</option>
            {APPOINTMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => openCreateModal()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#1f6f5c] px-4 py-2 text-xs font-semibold text-white hover:bg-[#185848] whitespace-nowrap"
          >
            <Plus className="h-4 w-4" />
            Schedule Appointment
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

      {/* Main Split Workspace: Calendar + Agenda */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <section className="xl:col-span-8 rounded-xl border border-[#e2e7e0] bg-white overflow-hidden">
          {viewMode === 'month' && (
            <div>
              <div className="grid grid-cols-7 border-b border-slate-200 bg-[#f9faf8] text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                  <div key={d} className="py-2.5">
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 divide-x divide-y divide-slate-100">
                {monthDays.map((cell) => {
                  const items = appointmentsByDate.get(cell.iso) || [];
                  const isToday = cell.iso === todayIso;
                  const isSelected = cell.iso === selectedDateIso;
                  return (
                    <div
                      key={cell.iso}
                      onClick={() => setSelectedDateIso(cell.iso)}
                      className={`min-h-[92px] cursor-pointer p-1.5 transition-colors ${
                        cell.inMonth ? 'bg-white' : 'bg-slate-50/70 text-slate-400'
                      } ${isSelected ? 'ring-2 ring-inset ring-[#1f6f5c] bg-[#1f6f5c]/5' : 'hover:bg-slate-50'}`}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold tabular-nums ${
                            isToday
                              ? 'bg-[#1f6f5c] text-white'
                              : cell.inMonth
                              ? 'text-slate-800'
                              : 'text-slate-400'
                          }`}
                        >
                          {cell.date.getDate()}
                        </span>
                        {items.length > 0 && (
                          <span className="font-mono text-[10px] font-bold text-slate-500">
                            {items.length}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 space-y-1">
                        {items.slice(0, 2).map((a) => (
                          <div
                            key={a.id}
                            className={`truncate rounded border px-1.5 py-0.5 text-[10px] font-medium ${
                              isOverdue(a)
                                ? 'border-red-200 bg-red-50 text-red-800'
                                : TYPE_STYLES[a.appointment_type]
                            }`}
                            title={`${a.appointment_time} · ${a.patient_name} (${a.appointment_type})`}
                          >
                            {a.appointment_time} {a.patient_name}
                          </div>
                        ))}
                        {items.length > 2 && (
                          <div className="px-1 text-[10px] font-semibold text-slate-500">
                            +{items.length - 2} more
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {viewMode === 'week' && (
            <div className="grid grid-cols-1 divide-y divide-slate-200 sm:grid-cols-7 sm:divide-x sm:divide-y-0">
              {weekDays.map((wd) => {
                const items = (appointmentsByDate.get(wd.iso) || [])
                  .slice()
                  .sort((a, b) => a.appointment_time.localeCompare(b.appointment_time));
                const isToday = wd.iso === todayIso;
                const isSelected = wd.iso === selectedDateIso;
                return (
                  <div
                    key={wd.iso}
                    onClick={() => setSelectedDateIso(wd.iso)}
                    className={`min-h-[320px] cursor-pointer p-2.5 ${
                      isSelected ? 'bg-[#1f6f5c]/5' : 'bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <div>
                        <p className="text-[10px] font-bold uppercase text-slate-400">
                          {wd.date.toLocaleDateString('en-IN', { weekday: 'short' })}
                        </p>
                        <p
                          className={`text-sm font-bold tabular-nums ${
                            isToday ? 'text-[#1f6f5c]' : 'text-slate-900'
                          }`}
                        >
                          {wd.date.getDate()}{' '}
                          {wd.date.toLocaleDateString('en-IN', { month: 'short' })}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openCreateModal(wd.iso);
                        }}
                        className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-[#1f6f5c]"
                        title="Add appointment on this day"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="mt-2 space-y-2">
                      {items.length === 0 ? (
                        <p className="py-4 text-center text-[11px] text-slate-400">No visits</p>
                      ) : (
                        items.map((a) => (
                          <div
                            key={a.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditModal(a);
                            }}
                            className={`rounded-lg border p-2 text-[11px] transition-colors ${
                              isOverdue(a)
                                ? 'border-red-200 bg-red-50 text-red-900'
                                : TYPE_STYLES[a.appointment_type]
                            }`}
                          >
                            <p className="font-mono font-bold">{a.appointment_time}</p>
                            <p className="mt-0.5 font-semibold truncate">{a.patient_name}</p>
                            <p className="text-[10px] opacity-80 truncate">{a.appointment_type}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {viewMode === 'day' && (
            <div className="p-5">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Daily Schedule — {formatReadableDate(selectedDateIso)}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {dayAppointments.length} appointment{dayAppointments.length === 1 ? '' : 's'} scheduled
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openCreateModal(selectedDateIso)}
                  className="inline-flex items-center gap-1 rounded-lg border border-[#1f6f5c] px-3 py-1.5 text-xs font-semibold text-[#1f6f5c] hover:bg-[#1f6f5c]/5"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add on {selectedDateIso}
                </button>
              </div>
              {dayAppointments.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-500">
                  No appointments scheduled for this date. Tap &ldquo;Schedule Appointment&rdquo; to add a patient visit.
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {dayAppointments.map((a) => (
                    <div
                      key={a.id}
                      className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-[#fafbfa] p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center gap-1 font-mono text-xs font-bold text-slate-900">
                            <Clock className="h-3.5 w-3.5 text-[#1f6f5c]" />
                            {a.appointment_time}
                          </span>
                          <span className={`rounded border px-2 py-0.5 text-[11px] font-semibold ${TYPE_STYLES[a.appointment_type]}`}>
                            {a.appointment_type}
                          </span>
                          {isOverdue(a) && (
                            <span className="inline-flex items-center gap-1 rounded bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-800">
                              <AlertCircle className="h-3 w-3" /> Overdue
                            </span>
                          )}
                          <span className="text-[11px] font-semibold text-slate-500">{a.status}</span>
                        </div>
                        <p className="text-sm font-bold text-slate-900">
                          {a.patient_name}{' '}
                          <span className="font-mono text-xs font-normal text-slate-500">
                            ({a.person_code} · {a.village})
                          </span>
                        </p>
                        <p className="text-xs text-slate-700">{a.purpose}</p>
                        {a.notes && <p className="text-xs text-slate-500">{a.notes}</p>}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onOpenPatientProfile(a.person_id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          <User className="h-3.5 w-3.5" />
                          Profile
                        </button>
                        <button
                          type="button"
                          onClick={() => onSendReminder(a)}
                          className="inline-flex items-center gap-1 rounded-lg border border-[#1f6f5c]/30 bg-teal-50 px-2.5 py-1.5 text-xs font-semibold text-[#1f6f5c] hover:bg-teal-100"
                        >
                          <Bell className="h-3.5 w-3.5" />
                          Remind
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditModal(a)}
                          className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-100"
                          title="Edit appointment"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(a)}
                          className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-700"
                          title="Delete appointment"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Right Column: Filtered Appointment List (Today / Upcoming / Overdue / All) */}
        <section className="xl:col-span-4 rounded-xl border border-[#e2e7e0] bg-white p-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                {listFilter === 'today'
                  ? "Today's Appointments"
                  : listFilter === 'upcoming'
                  ? 'Upcoming Appointments'
                  : listFilter === 'overdue'
                  ? 'Overdue Appointments'
                  : 'All Scheduled Appointments'}
              </h3>
              <p className="text-xs text-slate-500">
                Showing {filteredAppointments.length} linked patient record
                {filteredAppointments.length === 1 ? '' : 's'}
              </p>
            </div>
            <CalendarIcon className="h-4 w-4 text-[#1f6f5c]" />
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {(['all', 'today', 'upcoming', 'overdue'] as ListFilterMode[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setListFilter(f)}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold capitalize transition-colors ${
                  listFilter === f
                    ? 'bg-[#1f6f5c] text-white'
                    : 'bg-[#f4f6f2] text-slate-600 hover:text-slate-900'
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          <div className="mt-3 max-h-[540px] space-y-2.5 overflow-y-auto pr-1">
            {filteredAppointments.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500">
                No appointments in this filter.
              </div>
            ) : (
              filteredAppointments.map((a) => {
                const overdue = isOverdue(a);
                return (
                  <div
                    key={a.id}
                    className={`rounded-xl border p-3 text-xs ${
                      overdue ? 'border-red-200 bg-red-50/40' : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${TYPE_STYLES[a.appointment_type]}`}
                          >
                            {a.appointment_type}
                          </span>
                          {overdue && (
                            <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-800">
                              Overdue
                            </span>
                          )}
                          {a.reminder_sent && (
                            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
                              Reminded
                            </span>
                          )}
                        </div>
                        <p className="mt-1.5 font-bold text-slate-900">{a.patient_name}</p>
                        <p className="font-mono text-[11px] text-slate-500">
                          {a.person_code} · {a.appointment_date} at {a.appointment_time}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                          a.status === 'Completed'
                            ? 'bg-emerald-50 text-emerald-800'
                            : a.status === 'Cancelled'
                            ? 'bg-slate-100 text-slate-500'
                            : 'bg-amber-50 text-amber-800'
                        }`}
                      >
                        {a.status}
                      </span>
                    </div>

                    <p className="mt-1.5 text-slate-700">{a.purpose}</p>
                    {a.notes && <p className="mt-0.5 text-[11px] text-slate-500">{a.notes}</p>}

                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2">
                      <button
                        type="button"
                        onClick={() => onOpenPatientProfile(a.person_id)}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <User className="h-3 w-3" />
                        Patient Profile
                      </button>
                      <button
                        type="button"
                        onClick={() => onSendReminder(a)}
                        className="inline-flex items-center gap-1 rounded-md border border-teal-200 bg-teal-50 px-2 py-1 text-[11px] font-semibold text-[#1f6f5c] hover:bg-teal-100"
                      >
                        <Bell className="h-3 w-3" />
                        Reminder
                      </button>
                      {a.status === 'Scheduled' && (
                        <button
                          type="button"
                          onClick={() => handleMarkStatus(a, 'Completed')}
                          className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100"
                        >
                          <CheckCircle2 className="h-3 w-3" />
                          Done
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => openEditModal(a)}
                        className="ml-auto rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        title="Edit"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(a)}
                        className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-700"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>

      {/* ADD / EDIT APPOINTMENT MODAL */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                {editingAppointment ? 'Edit Appointment' : 'Schedule Patient Appointment'}
              </h3>
              <button type="button" onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSaveAppointment} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Select Existing Patient *
                </label>
                <select
                  required
                  value={personId}
                  onChange={(e) => setPersonId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#1f6f5c] focus:outline-none"
                >
                  <option value="">-- Choose a registered patient --</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.person_code} — {p.full_name} ({p.category}, {p.village})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Appointment Type *
                  </label>
                  <select
                    value={appointmentType}
                    onChange={(e) => setAppointmentType(e.target.value as AppointmentType)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                  >
                    {APPOINTMENT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as AppointmentStatus)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                  >
                    <option value="Scheduled">Scheduled</option>
                    <option value="Completed">Completed</option>
                    <option value="Missed">Missed</option>
                    <option value="Cancelled">Cancelled</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Date *</label>
                  <input
                    required
                    type="date"
                    value={appointmentDate}
                    onChange={(e) => setAppointmentDate(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Time *</label>
                  <input
                    required
                    type="time"
                    value={appointmentTime}
                    onChange={(e) => setAppointmentTime(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Purpose *</label>
                <input
                  required
                  minLength={3}
                  maxLength={200}
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  placeholder="e.g. 3rd Trimester ANC BP & Hb checkup at PHC"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Notes</label>
                <textarea
                  rows={3}
                  maxLength={600}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Preparation instructions, MCP card reminder, Anganwadi slot..."
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-[#1f6f5c] px-5 py-2 text-xs font-semibold text-white hover:bg-[#185848]"
                >
                  {submitting
                    ? 'Saving...'
                    : editingAppointment
                    ? 'Save Changes'
                    : 'Schedule Appointment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 className="text-base font-bold text-slate-900">Delete Appointment?</h3>
            <p className="mt-2 text-xs text-slate-600">
              Remove <strong>{confirmDelete.appointment_type}</strong> for{' '}
              <strong>{confirmDelete.patient_name}</strong> on {confirmDelete.appointment_date} at{' '}
              {confirmDelete.appointment_time}?
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
                onClick={handleDelete}
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
