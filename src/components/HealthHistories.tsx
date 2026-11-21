import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Baby,
  ClipboardList,
  HeartPulse,
  Mic,
  Search,
  Volume2,
} from 'lucide-react';
import { speakTextWithFallback } from '../utils/i18n';
import type {
  AppLanguage,
  ChildRecord,
  DangerAlert,
  FieldVisit,
  HealthCheckupRecord,
  MaternalRecord,
  PersonRecord,
  VoiceInteractionRecord,
} from '../types';

interface HealthHistoriesProps {
  people: PersonRecord[];
  visits: FieldVisit[];
  maternalRecords: MaternalRecord[];
  childRecords: ChildRecord[];
  checkups: HealthCheckupRecord[];
  alerts: DangerAlert[];
  voiceInteractions: VoiceInteractionRecord[];
  appLanguage: AppLanguage;
}

type HistoryCategory =
  | 'All'
  | 'Visit'
  | 'Maternal'
  | 'Child & Vaccine'
  | 'Checkup'
  | 'Danger Alert'
  | 'Voice Guidance';

interface TimelineEntry {
  id: string;
  type: Exclude<HistoryCategory, 'All'>;
  date: string;
  patientName: string;
  patientCode?: string;
  village: string;
  title: string;
  summary: string;
  meta: string;
  urgent?: boolean;
  speakableText?: string;
}

export function HealthHistories({
  people,
  visits,
  maternalRecords,
  childRecords,
  checkups,
  alerts,
  voiceInteractions,
  appLanguage,
}: HealthHistoriesProps) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<HistoryCategory>('All');
  const [speakingId, setSpeakingId] = useState<string | null>(null);

  const personCodeById = useMemo(() => {
    const map = new Map<number, string>();
    people.forEach((p) => map.set(p.id, p.person_code));
    return map;
  }, [people]);

  const personCodeByName = useMemo(() => {
    const map = new Map<string, string>();
    people.forEach((p) => map.set(p.full_name.toLowerCase(), p.person_code));
    return map;
  }, [people]);

  const timeline = useMemo<TimelineEntry[]>(() => {
    const items: TimelineEntry[] = [];

    visits.forEach((v) => {
      items.push({
        id: `visit-${v.id}`,
        type: 'Visit',
        date: v.visit_date || v.created_at.slice(0, 10),
        patientName: v.beneficiary_name,
        patientCode:
          (v.person_id ? personCodeById.get(v.person_id) : undefined) ||
          personCodeByName.get(v.beneficiary_name.toLowerCase()),
        village: `${v.village}, ${v.district}`,
        title: `${v.purpose || 'Household Visit'} (${v.risk_level} Risk)`,
        summary: v.recommended_action || v.notes || v.symptoms || 'Routine home health follow-up.',
        meta: `BP ${v.bp_systolic ?? '—'}/${v.bp_diastolic ?? '—'} · Hb ${v.hemoglobin_gdl ?? '—'} g/dL · Status: ${v.status}`,
        urgent: v.risk_level === 'High',
      });
    });

    maternalRecords.forEach((m) => {
      items.push({
        id: `mat-${m.id}`,
        type: 'Maternal',
        date: m.created_at.slice(0, 10),
        patientName: m.mother_name,
        patientCode:
          (m.person_id ? personCodeById.get(m.person_id) : undefined) ||
          personCodeByName.get(m.mother_name.toLowerCase()),
        village: `${m.village}, ${m.district}`,
        title: m.high_risk ? 'High-Risk Maternal Care Record' : 'Maternal ANC / PNC Record',
        summary:
          m.high_risk_reasons ||
          `${m.postnatal_status} · ${m.anc_visits_completed} ANC visits · ${m.ifa_tablets_total} IFA tablets · EDD ${m.edd_date || '—'}`,
        meta: `Hb ${m.hemoglobin_gdl ?? '—'} g/dL · BP ${m.bp_reading || '—'} · Next ANC: ${m.next_anc_date || '—'}`,
        urgent: m.high_risk,
      });
    });

    childRecords.forEach((c) => {
      items.push({
        id: `child-${c.id}`,
        type: 'Child & Vaccine',
        date: c.created_at.slice(0, 10),
        patientName: c.child_name,
        patientCode:
          (c.person_id ? personCodeById.get(c.person_id) : undefined) ||
          personCodeByName.get(c.child_name.toLowerCase()),
        village: `${c.village}, ${c.district}`,
        title: `Child Growth & Vaccination (${c.vaccines_completed.length} doses completed)`,
        summary: `Completed: ${c.vaccines_completed.join(', ') || 'None'}. Next due: ${c.next_vaccine || 'Up to date'} (${c.next_vaccine_date || 'TBD'}).`,
        meta: `Mother: ${c.mother_name} · Wt ${c.current_weight_kg ?? '—'} kg · Ht ${c.current_height_cm ?? '—'} cm · ${c.nutrition_status}`,
      });
    });

    checkups.forEach((ch) => {
      items.push({
        id: `chk-${ch.id}`,
        type: 'Checkup',
        date: ch.checkup_date,
        patientName: ch.person_name,
        patientCode:
          (ch.person_id ? personCodeById.get(ch.person_id) : undefined) ||
          personCodeByName.get(ch.person_name.toLowerCase()),
        village: `${ch.village}, ${ch.district}`,
        title: `Health Checkup (${ch.status})`,
        summary: ch.summary || ch.observations || 'Vitals recorded.',
        meta: `BP ${ch.bp_systolic ?? '—'}/${ch.bp_diastolic ?? '—'} · Temp ${ch.temperature_c ?? '—'}°C · Hb ${ch.hemoglobin_gdl ?? '—'} · Sugar ${ch.blood_sugar_mgdl ?? '—'}`,
        urgent: ch.clinical_flags.length > 0,
      });
    });

    alerts.forEach((a) => {
      items.push({
        id: `alert-${a.id}`,
        type: 'Danger Alert',
        date: a.created_at.slice(0, 10),
        patientName: a.person_name,
        patientCode:
          (a.person_id ? personCodeById.get(a.person_id) : undefined) ||
          personCodeByName.get(a.person_name.toLowerCase()),
        village: `${a.village}, ${a.district}`,
        title: `${a.severity} ${a.category} Danger Alert — ${a.status}`,
        summary: `Signs: ${a.danger_signs.join('; ')}. Action: ${a.guidance}`,
        meta: `Referral: ${a.referral_facility} · Reported by ${a.reported_by}`,
        urgent: a.status !== 'Resolved',
      });
    });

    voiceInteractions.forEach((vi) => {
      items.push({
        id: `voice-${vi.id}`,
        type: 'Voice Guidance',
        date: vi.created_at.slice(0, 10),
        patientName: vi.person_name || 'Community Member',
        patientCode: vi.person_id ? personCodeById.get(vi.person_id) : undefined,
        village: vi.village || 'Field Voice Session',
        title: vi.emergency_detected
          ? 'Saved Voice Consultation (Emergency Warning Triggered)'
          : 'Saved Voice Assistant Guidance',
        summary: `Spoken: "${vi.transcript}" — Guidance: ${vi.guidance_text}`,
        meta: `Language: ${vi.language.toUpperCase()} · Saved by ${vi.saved_by}`,
        urgent: vi.emergency_detected,
        speakableText: vi.guidance_text,
      });
    });

    return items.sort((a, b) => b.date.localeCompare(a.date));
  }, [visits, maternalRecords, childRecords, checkups, alerts, voiceInteractions, personCodeById, personCodeByName]);

  const filteredTimeline = useMemo(() => {
    const q = search.trim().toLowerCase();
    return timeline.filter((item) => {
      if (typeFilter !== 'All' && item.type !== typeFilter) return false;
      if (!q) return true;
      return (
        item.patientName.toLowerCase().includes(q) ||
        (item.patientCode || '').toLowerCase().includes(q) ||
        item.village.toLowerCase().includes(q) ||
        item.title.toLowerCase().includes(q) ||
        item.summary.toLowerCase().includes(q)
      );
    });
  }, [timeline, search, typeFilter]);

  const renderIcon = (type: TimelineEntry['type']) => {
    switch (type) {
      case 'Visit':
        return <ClipboardList className="h-4 w-4 text-[#1f6f5c]" />;
      case 'Maternal':
        return <HeartPulse className="h-4 w-4 text-rose-600" />;
      case 'Child & Vaccine':
        return <Baby className="h-4 w-4 text-indigo-600" />;
      case 'Checkup':
        return <Activity className="h-4 w-4 text-sky-600" />;
      case 'Danger Alert':
        return <AlertTriangle className="h-4 w-4 text-red-600" />;
      case 'Voice Guidance':
        return <Mic className="h-4 w-4 text-teal-700" />;
    }
  };

  return (
    <div className="space-y-5">
      {/* Search & Category Filter */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e2e7e0] bg-white p-4">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by patient name, PER-KA ID, village, or symptom..."
            className="w-full rounded-lg border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-900 focus:border-[#1f6f5c] focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {(
            ['All', 'Visit', 'Maternal', 'Child & Vaccine', 'Checkup', 'Danger Alert', 'Voice Guidance'] as const
          ).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setTypeFilter(cat)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                typeFilter === cat
                  ? 'bg-[#1f6f5c] text-white'
                  : 'bg-[#f4f6f2] text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Chronological Timeline List */}
      <section className="rounded-xl border border-[#e2e7e0] bg-white overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-3.5 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Unified Chronological Health History ({filteredTimeline.length} records)
            </h2>
            <p className="text-xs text-slate-500">
              Combines field visits, maternal & child care, vaccinations, checkups, danger alerts, and saved voice sessions
            </p>
          </div>
        </div>

        {filteredTimeline.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-500">
            No matching health history records found.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredTimeline.map((item) => (
              <article key={item.id} className="flex items-start gap-4 px-5 py-4 hover:bg-slate-50/70 transition-colors">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#f4f6f2]">
                  {renderIcon(item.type)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="text-sm font-bold text-slate-900">{item.patientName}</span>
                      {item.patientCode && (
                        <span className="font-mono text-[11px] font-semibold text-[#1f6f5c]">
                          {item.patientCode}
                        </span>
                      )}
                      <span className="text-xs text-slate-500">· {item.village}</span>
                    </div>
                    <span className="font-mono text-xs text-slate-500 tabular-nums">{item.date}</span>
                  </div>

                  <p className={`mt-1 text-xs font-semibold ${item.urgent ? 'text-red-700' : 'text-slate-800'}`}>
                    {item.type} — {item.title}
                  </p>
                  <p className="mt-1 text-xs text-slate-600 leading-relaxed">{item.summary}</p>
                  <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-[11px] text-slate-500">{item.meta}</span>
                    {item.speakableText && (
                      <button
                        type="button"
                        onClick={() => {
                          setSpeakingId(item.id);
                          speakTextWithFallback(item.speakableText!, appLanguage, undefined, () =>
                            setSpeakingId(null)
                          );
                        }}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-[#1f6f5c] hover:bg-[#f4f6f2]"
                      >
                        <Volume2 className="h-3 w-3" />
                        {speakingId === item.id ? 'Playing...' : 'Listen to Guidance'}
                      </button>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
