import { db } from './db.ts';
import type {
  AppointmentRecord,
  AppointmentStatus,
  AppointmentType,
  CallLogRecord,
  CallOutcome,
  ChildRecord,
  DangerAlert,
  FieldVisit,
  HealthCheckupRecord,
  MaternalRecord,
  NotificationCategory,
  NotificationChannel,
  NotificationDeliveryStatus,
  NotificationRecord,
  PatientFullReportData,
  PersonRecord,
  VoiceInteractionRecord,
} from '../src/types.ts';

// Additive tables referencing existing `people(id)` — zero duplicate patient records
db.exec(`
  CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    person_id INTEGER NOT NULL,
    appointment_type TEXT NOT NULL DEFAULT 'Home Visit',
    appointment_date TEXT NOT NULL,
    appointment_time TEXT NOT NULL DEFAULT '10:00',
    purpose TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'Scheduled',
    reminder_sent INTEGER NOT NULL DEFAULT 0,
    created_by TEXT NOT NULL DEFAULT 'ASHA Worker',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_appointments_person_date
    ON appointments (person_id, appointment_date);

  CREATE TABLE IF NOT EXISTS patient_call_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    person_id INTEGER NOT NULL,
    phone_number TEXT NOT NULL,
    call_initiated_at TEXT NOT NULL DEFAULT (datetime('now')),
    outcome TEXT NOT NULL DEFAULT 'Dialer Opened (Pending Outcome)',
    notes TEXT NOT NULL DEFAULT '',
    recorded_by TEXT NOT NULL DEFAULT 'ASHA Worker',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_call_logs_person
    ON patient_call_logs (person_id, call_initiated_at DESC);

  CREATE TABLE IF NOT EXISTS patient_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    person_id INTEGER NOT NULL,
    phone_number TEXT NOT NULL,
    channel TEXT NOT NULL DEFAULT 'SMS',
    category TEXT NOT NULL DEFAULT 'Appointment Reminder',
    language TEXT NOT NULL DEFAULT 'en',
    message_body TEXT NOT NULL,
    consent_confirmed INTEGER NOT NULL DEFAULT 0,
    delivery_status TEXT NOT NULL DEFAULT 'Provider Not Configured',
    provider_name TEXT NOT NULL DEFAULT '',
    provider_message_id TEXT NOT NULL DEFAULT '',
    error_detail TEXT NOT NULL DEFAULT '',
    sent_by TEXT NOT NULL DEFAULT 'ASHA Worker',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_notifications_person
    ON patient_notifications (person_id, created_at DESC);
`);

function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function formatLocalDateOffset(daysOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Seeds a small set of realistic schedule entries linked to EXISTING patients
 * only on first run when the appointments table is empty.
 */
function seedInitialAppointments(): void {
  const count = (db.prepare('SELECT COUNT(*) as c FROM appointments').get() as { c: number }).c;
  if (count > 0) return;

  const existingPeople = db
    .prepare('SELECT id, full_name, category, village FROM people ORDER BY id ASC LIMIT 6')
    .all() as Array<{ id: number; full_name: string; category: string; village: string }>;

  if (existingPeople.length === 0) return;

  const insert = db.prepare(`
    INSERT INTO appointments (
      person_id, appointment_type, appointment_date, appointment_time,
      purpose, notes, status, reminder_sent, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const today = formatLocalDateOffset(0);
  const tomorrow = formatLocalDateOffset(1);
  const plus3 = formatLocalDateOffset(3);
  const minus2 = formatLocalDateOffset(-2);

  const pregnant = existingPeople.find((p) => p.category === 'Pregnant Woman') || existingPeople[0];
  const child = existingPeople.find((p) => p.category === 'Child (0-5y)') || existingPeople[1 % existingPeople.length];
  const other1 = existingPeople[2 % existingPeople.length] || existingPeople[0];
  const other2 = existingPeople[3 % existingPeople.length] || existingPeople[0];

  const tx = db.transaction(() => {
    insert.run(
      pregnant.id,
      'Antenatal Checkup',
      today,
      '10:00',
      'Scheduled ANC BP, Hb & IFA tablet review',
      'Bring MCP card for blood pressure and hemoglobin verification.',
      'Scheduled',
      0,
      'ASHA Schedule Seed'
    );
    insert.run(
      child.id,
      'Vaccination',
      tomorrow,
      '11:00',
      'Routine UIP childhood immunization session at Anganwadi',
      'Check immunization card and record weight.',
      'Scheduled',
      0,
      'ASHA Schedule Seed'
    );
    insert.run(
      other1.id,
      'Home Visit',
      plus3,
      '09:30',
      'Routine household maternal & nutrition follow-up visit',
      'Verify drinking water hygiene and nutrition intake.',
      'Scheduled',
      0,
      'ASHA Schedule Seed'
    );
    insert.run(
      other2.id,
      'Follow-up Visit',
      minus2,
      '15:00',
      'Pending post-checkup vital signs follow-up',
      'Confirm medication adherence and repeat vitals.',
      'Scheduled',
      0,
      'ASHA Schedule Seed'
    );
  });

  tx();
}

// Temporary sample appointment auto-seeding disabled so user schedules stay clean
void seedInitialAppointments;

// ---------- APPOINTMENTS (SMART SCHEDULE CALENDAR) ----------

export function personExists(personId: number): PersonRecord | null {
  const row = db
    .prepare(
      `SELECT p.*, f.family_code, f.head_name
       FROM people p
       LEFT JOIN families f ON f.id = p.family_id
       WHERE p.id = ?`
    )
    .get(personId) as PersonRecord | undefined;
  return row ?? null;
}

export function listAppointments(filters?: {
  personId?: number;
  status?: string;
  fromDate?: string;
  toDate?: string;
}): AppointmentRecord[] {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (filters?.personId) {
    clauses.push('a.person_id = ?');
    params.push(filters.personId);
  }
  if (filters?.status && filters.status !== 'All') {
    clauses.push('a.status = ?');
    params.push(filters.status);
  }
  if (filters?.fromDate) {
    clauses.push('a.appointment_date >= ?');
    params.push(filters.fromDate);
  }
  if (filters?.toDate) {
    clauses.push('a.appointment_date <= ?');
    params.push(filters.toDate);
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = db
    .prepare(
      `SELECT
         a.*,
         p.person_code,
         p.full_name AS patient_name,
         p.phone AS patient_phone,
         p.village,
         p.district,
         p.category AS patient_category
       FROM appointments a
       INNER JOIN people p ON p.id = a.person_id
       ${where}
       ORDER BY a.appointment_date ASC, a.appointment_time ASC, a.id DESC`
    )
    .all(...params) as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    ...(r as unknown as AppointmentRecord),
    reminder_sent: Boolean(r.reminder_sent),
  }));
}

export function getAppointmentById(id: number): AppointmentRecord | null {
  const r = db
    .prepare(
      `SELECT
         a.*,
         p.person_code,
         p.full_name AS patient_name,
         p.phone AS patient_phone,
         p.village,
         p.district,
         p.category AS patient_category
       FROM appointments a
       INNER JOIN people p ON p.id = a.person_id
       WHERE a.id = ?`
    )
    .get(id) as Record<string, unknown> | undefined;
  if (!r) return null;
  return {
    ...(r as unknown as AppointmentRecord),
    reminder_sent: Boolean(r.reminder_sent),
  };
}

export function createAppointment(input: {
  person_id: number;
  appointment_type: AppointmentType;
  appointment_date: string;
  appointment_time: string;
  purpose: string;
  notes: string;
  status?: AppointmentStatus;
  created_by: string;
}): AppointmentRecord {
  const info = db
    .prepare(
      `INSERT INTO appointments (
         person_id, appointment_type, appointment_date, appointment_time,
         purpose, notes, status, reminder_sent, created_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`
    )
    .run(
      input.person_id,
      input.appointment_type,
      input.appointment_date,
      input.appointment_time,
      input.purpose,
      input.notes,
      input.status || 'Scheduled',
      input.created_by
    );
  return getAppointmentById(Number(info.lastInsertRowid))!;
}

export function updateAppointment(
  id: number,
  patch: Partial<{
    person_id: number;
    appointment_type: AppointmentType;
    appointment_date: string;
    appointment_time: string;
    purpose: string;
    notes: string;
    status: AppointmentStatus;
    reminder_sent: boolean;
  }>
): AppointmentRecord | null {
  const existing = getAppointmentById(id);
  if (!existing) return null;

  db.prepare(
    `UPDATE appointments
     SET person_id = ?,
         appointment_type = ?,
         appointment_date = ?,
         appointment_time = ?,
         purpose = ?,
         notes = ?,
         status = ?,
         reminder_sent = ?,
         updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    patch.person_id ?? existing.person_id,
    patch.appointment_type ?? existing.appointment_type,
    patch.appointment_date ?? existing.appointment_date,
    patch.appointment_time ?? existing.appointment_time,
    patch.purpose ?? existing.purpose,
    patch.notes ?? existing.notes,
    patch.status ?? existing.status,
    patch.reminder_sent !== undefined ? (patch.reminder_sent ? 1 : 0) : existing.reminder_sent ? 1 : 0,
    id
  );
  return getAppointmentById(id);
}

export function deleteAppointment(id: number): boolean {
  const info = db.prepare('DELETE FROM appointments WHERE id = ?').run(id);
  return info.changes > 0;
}

// ---------- DIRECT PATIENT CALLING LOGS ----------

export function listCallLogs(personId?: number): CallLogRecord[] {
  const where = personId ? 'WHERE c.person_id = ?' : '';
  const params = personId ? [personId] : [];
  return db
    .prepare(
      `SELECT
         c.*,
         p.person_code,
         p.full_name AS patient_name,
         p.village,
         p.district
       FROM patient_call_logs c
       INNER JOIN people p ON p.id = c.person_id
       ${where}
       ORDER BY c.call_initiated_at DESC, c.id DESC`
    )
    .all(...params) as CallLogRecord[];
}

export function createCallLog(input: {
  person_id: number;
  phone_number: string;
  call_initiated_at?: string;
  outcome: CallOutcome;
  notes: string;
  recorded_by: string;
}): CallLogRecord {
  const initiatedAt = input.call_initiated_at || new Date().toISOString();
  const info = db
    .prepare(
      `INSERT INTO patient_call_logs (
         person_id, phone_number, call_initiated_at, outcome, notes, recorded_by
       ) VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.person_id,
      input.phone_number,
      initiatedAt,
      input.outcome,
      input.notes,
      input.recorded_by
    );

  return db
    .prepare(
      `SELECT c.*, p.person_code, p.full_name AS patient_name, p.village, p.district
       FROM patient_call_logs c
       INNER JOIN people p ON p.id = c.person_id
       WHERE c.id = ?`
    )
    .get(Number(info.lastInsertRowid)) as CallLogRecord;
}

export function updateCallLog(
  id: number,
  patch: { outcome?: CallOutcome; notes?: string }
): CallLogRecord | null {
  const existing = db
    .prepare('SELECT id, outcome, notes FROM patient_call_logs WHERE id = ?')
    .get(id) as { id: number; outcome: CallOutcome; notes: string } | undefined;
  if (!existing) return null;

  db.prepare('UPDATE patient_call_logs SET outcome = ?, notes = ? WHERE id = ?').run(
    patch.outcome ?? existing.outcome,
    patch.notes !== undefined ? patch.notes : existing.notes,
    id
  );

  return db
    .prepare(
      `SELECT c.*, p.person_code, p.full_name AS patient_name, p.village, p.district
       FROM patient_call_logs c
       INNER JOIN people p ON p.id = c.person_id
       WHERE c.id = ?`
    )
    .get(id) as CallLogRecord;
}

// ---------- PATIENT NOTIFICATIONS ----------

export function listNotifications(personId?: number): NotificationRecord[] {
  const where = personId ? 'WHERE n.person_id = ?' : '';
  const params = personId ? [personId] : [];
  const rows = db
    .prepare(
      `SELECT
         n.*,
         p.person_code,
         p.full_name AS patient_name,
         p.village,
         p.district
       FROM patient_notifications n
       INNER JOIN people p ON p.id = n.person_id
       ${where}
       ORDER BY n.created_at DESC, n.id DESC`
    )
    .all(...params) as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    ...(r as unknown as NotificationRecord),
    consent_confirmed: Boolean(r.consent_confirmed),
  }));
}

export function createNotificationRecord(input: {
  person_id: number;
  phone_number: string;
  channel: NotificationChannel;
  category: NotificationCategory;
  language: string;
  message_body: string;
  consent_confirmed: boolean;
  delivery_status: NotificationDeliveryStatus;
  provider_name: string;
  provider_message_id: string;
  error_detail: string;
  sent_by: string;
}): NotificationRecord {
  const info = db
    .prepare(
      `INSERT INTO patient_notifications (
         person_id, phone_number, channel, category, language, message_body,
         consent_confirmed, delivery_status, provider_name, provider_message_id,
         error_detail, sent_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.person_id,
      input.phone_number,
      input.channel,
      input.category,
      input.language,
      input.message_body,
      input.consent_confirmed ? 1 : 0,
      input.delivery_status,
      input.provider_name,
      input.provider_message_id,
      input.error_detail,
      input.sent_by
    );

  const row = db
    .prepare(
      `SELECT n.*, p.person_code, p.full_name AS patient_name, p.village, p.district
       FROM patient_notifications n
       INNER JOIN people p ON p.id = n.person_id
       WHERE n.id = ?`
    )
    .get(Number(info.lastInsertRowid)) as Record<string, unknown>;

  return {
    ...(row as unknown as NotificationRecord),
    consent_confirmed: Boolean(row.consent_confirmed),
  };
}

// ---------- INDIVIDUAL PATIENT REPORT AGGREGATOR (REAL EXISTING DATA ONLY) ----------

export function getPatientFullReportData(personId: number): PatientFullReportData | null {
  const patient = personExists(personId);
  if (!patient) return null;

  const lowerName = patient.full_name.trim().toLowerCase();

  // Maternal / pregnancy records linked to this patient ID (or matching legacy unlinked name)
  const maternalRows = db
    .prepare(
      `SELECT * FROM maternal_records
       WHERE person_id = ? OR (person_id IS NULL AND lower(mother_name) = ?)
       ORDER BY created_at DESC, id DESC`
    )
    .all(personId, lowerName) as Array<Record<string, unknown>>;

  const maternalRecords: MaternalRecord[] = maternalRows.map((r) => ({
    ...(r as unknown as MaternalRecord),
    high_risk: Boolean(r.high_risk),
  }));

  // Child / vaccination records linked to this patient ID
  const childRows = db
    .prepare(
      `SELECT * FROM child_records
       WHERE person_id = ? OR (person_id IS NULL AND lower(child_name) = ?)
       ORDER BY created_at DESC, id DESC`
    )
    .all(personId, lowerName) as Array<Record<string, unknown>>;

  const childRecords: ChildRecord[] = childRows.map((r) => ({
    ...(r as unknown as ChildRecord),
    vaccines_completed: safeJsonParse<string[]>(String(r.vaccines_completed || '[]'), []),
  }));

  // Health checkups (BP, temp, weight, sugar, Hb, SpO2, observations)
  const checkupRows = db
    .prepare(
      `SELECT * FROM health_checkups
       WHERE person_id = ? OR (person_id IS NULL AND lower(person_name) = ?)
       ORDER BY checkup_date DESC, id DESC`
    )
    .all(personId, lowerName) as Array<Record<string, unknown>>;

  const checkups: HealthCheckupRecord[] = checkupRows.map((r) => ({
    ...(r as unknown as HealthCheckupRecord),
    clinical_flags: safeJsonParse<string[]>(String(r.clinical_flags || '[]'), []),
  }));

  // Home visits & ANC visits
  const visitRows = db
    .prepare(
      `SELECT * FROM visits
       WHERE person_id = ? OR (person_id IS NULL AND lower(beneficiary_name) = ?)
       ORDER BY visit_date DESC, id DESC`
    )
    .all(personId, lowerName) as Array<Record<string, unknown>>;

  const visits: FieldVisit[] = visitRows.map((r) => ({
    ...(r as unknown as FieldVisit),
    risk_flags: safeJsonParse<string[]>(String(r.risk_flags || '[]'), []),
  }));

  // Important health / danger alerts
  const alertRows = db
    .prepare(
      `SELECT * FROM danger_alerts
       WHERE person_id = ? OR (person_id IS NULL AND lower(person_name) = ?)
       ORDER BY created_at DESC, id DESC`
    )
    .all(personId, lowerName) as Array<Record<string, unknown>>;

  const alerts: DangerAlert[] = alertRows.map((r) => ({
    ...(r as unknown as DangerAlert),
    danger_signs: safeJsonParse<string[]>(String(r.danger_signs || '[]'), []),
  }));

  // Scheduled / past follow-up appointments
  const appointments = listAppointments({ personId });

  // Call logs
  const callLogs = listCallLogs(personId);

  // Recent sent/logged health notifications
  const notifications = listNotifications(personId);

  // Saved voice interactions
  const voiceRows = db
    .prepare(
      `SELECT * FROM voice_interactions
       WHERE person_id = ? OR (person_id IS NULL AND lower(person_name) = ?)
       ORDER BY created_at DESC, id DESC`
    )
    .all(personId, lowerName) as Array<Record<string, unknown>>;

  const voiceInteractions: VoiceInteractionRecord[] = voiceRows.map((r) => ({
    ...(r as unknown as VoiceInteractionRecord),
    emergency_detected: Boolean(r.emergency_detected),
  }));

  return {
    generated_at: new Date().toISOString(),
    patient,
    maternalRecords,
    childRecords,
    checkups,
    visits,
    appointments,
    alerts,
    callLogs,
    notifications,
    voiceInteractions,
  };
}
