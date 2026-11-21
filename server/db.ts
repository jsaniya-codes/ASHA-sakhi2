import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type {
  AuthUser,
  BeneficiaryCategory,
  BeneficiaryGender,
  FieldVisit,
  RiskLevel,
  UserRole,
  VisitInput,
  VisitLanguage,
} from '../src/types.ts';

function openWritableDatabase(): Database.Database {
  const candidates = [
    path.resolve(process.cwd(), 'data'),
    path.join(os.tmpdir(), 'ashasakhi-data'),
  ];

  for (const dir of candidates) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      const dbPath = path.join(dir, 'ashasakhi.db');
      const instance = new Database(dbPath);
      try {
        instance.pragma('journal_mode = WAL');
      } catch {
        try {
          instance.pragma('journal_mode = DELETE');
        } catch {
          // Ignore journal pragma fallback error
        }
      }
      instance.pragma('foreign_keys = ON');
      // Verify the database file itself is actually writable (not a read-only image layer)
      instance.exec('CREATE TABLE IF NOT EXISTS _db_write_probe (id INTEGER PRIMARY KEY)');
      return instance;
    } catch (err) {
      console.warn(`[DB] Could not open writable SQLite at ${dir}:`, err instanceof Error ? err.message : err);
    }
  }

  console.warn('[DB] Falling back to in-memory SQLite database.');
  const mem = new Database(':memory:');
  mem.pragma('foreign_keys = ON');
  return mem;
}

export const db = openWritableDatabase();

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('asha', 'supervisor')),
    district TEXT NOT NULL,
    phc_center TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at TEXT NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS visits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    worker_id INTEGER,
    worker_name TEXT NOT NULL,
    beneficiary_name TEXT NOT NULL,
    beneficiary_age INTEGER,
    beneficiary_gender TEXT NOT NULL DEFAULT 'Female',
    beneficiary_category TEXT NOT NULL,
    district TEXT NOT NULL,
    village TEXT NOT NULL,
    phc_center TEXT NOT NULL,
    language TEXT NOT NULL CHECK(language IN ('kn', 'hi', 'en')),
    transcript TEXT NOT NULL,
    bp_systolic INTEGER,
    bp_diastolic INTEGER,
    blood_sugar_mgdl REAL,
    hemoglobin_gdl REAL,
    weight_kg REAL,
    gestational_weeks INTEGER,
    immunization_status TEXT NOT NULL DEFAULT 'Up to date',
    ifa_tablets_given INTEGER NOT NULL DEFAULT 0,
    symptoms TEXT NOT NULL DEFAULT '',
    symptom_duration TEXT NOT NULL DEFAULT '',
    risk_level TEXT NOT NULL CHECK(risk_level IN ('Low', 'Moderate', 'High')),
    risk_flags TEXT NOT NULL DEFAULT '[]',
    recommended_action TEXT NOT NULL DEFAULT '',
    follow_up_date TEXT NOT NULL DEFAULT '',
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    visit_date TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (worker_id) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_visits_district ON visits(district);
  CREATE INDEX IF NOT EXISTS idx_visits_risk ON visits(risk_level);
  CREATE INDEX IF NOT EXISTS idx_visits_date ON visits(visit_date);
`);

// Safe additive migration for existing SQLite databases
function ensureVisitColumns(): void {
  const columns = db.prepare('PRAGMA table_info(visits)').all() as Array<{ name: string }>;
  const colNames = new Set(columns.map((c) => c.name));
  if (!colNames.has('beneficiary_gender')) {
    db.exec("ALTER TABLE visits ADD COLUMN beneficiary_gender TEXT NOT NULL DEFAULT 'Female'");
  }
  if (!colNames.has('blood_sugar_mgdl')) {
    db.exec('ALTER TABLE visits ADD COLUMN blood_sugar_mgdl REAL');
  }
  if (!colNames.has('symptom_duration')) {
    db.exec("ALTER TABLE visits ADD COLUMN symptom_duration TEXT NOT NULL DEFAULT ''");
  }
  if (!colNames.has('family_id')) {
    db.exec('ALTER TABLE visits ADD COLUMN family_id INTEGER');
  }
  if (!colNames.has('person_id')) {
    db.exec('ALTER TABLE visits ADD COLUMN person_id INTEGER');
  }
  if (!colNames.has('purpose')) {
    db.exec("ALTER TABLE visits ADD COLUMN purpose TEXT NOT NULL DEFAULT 'Routine Home Visit'");
  }
  if (!colNames.has('status')) {
    db.exec("ALTER TABLE visits ADD COLUMN status TEXT NOT NULL DEFAULT 'Completed'");
  }
  if (!colNames.has('notes')) {
    db.exec("ALTER TABLE visits ADD COLUMN notes TEXT NOT NULL DEFAULT ''");
  }
  if (!colNames.has('beneficiary_phone')) {
    db.exec("ALTER TABLE visits ADD COLUMN beneficiary_phone TEXT NOT NULL DEFAULT ''");
  }
}

function ensureUserColumns(): void {
  const columns = db.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>;
  const colNames = new Set(columns.map((c) => c.name));
  if (!colNames.has('email')) {
    db.exec("ALTER TABLE users ADD COLUMN email TEXT NOT NULL DEFAULT ''");
  }
  if (!colNames.has('mobile_number')) {
    db.exec("ALTER TABLE users ADD COLUMN mobile_number TEXT NOT NULL DEFAULT ''");
  }
  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users(email COLLATE NOCASE) WHERE email != ''"
  );
}

ensureVisitColumns();
ensureUserColumns();

interface VisitRow {
  id: number;
  worker_id: number | null;
  worker_name: string;
  family_id: number | null;
  person_id: number | null;
  beneficiary_name: string;
  beneficiary_phone?: string;
  beneficiary_age: number | null;
  beneficiary_gender: BeneficiaryGender;
  beneficiary_category: BeneficiaryCategory;
  district: string;
  village: string;
  phc_center: string;
  language: VisitLanguage;
  purpose: string;
  status: 'Completed' | 'Scheduled' | 'Follow-up Due';
  notes: string;
  transcript: string;
  bp_systolic: number | null;
  bp_diastolic: number | null;
  blood_sugar_mgdl: number | null;
  hemoglobin_gdl: number | null;
  weight_kg: number | null;
  gestational_weeks: number | null;
  immunization_status: string;
  ifa_tablets_given: number;
  symptoms: string;
  symptom_duration: string;
  risk_level: RiskLevel;
  risk_flags: string;
  recommended_action: string;
  follow_up_date: string;
  lat: number;
  lng: number;
  visit_date: string;
  created_at: string;
}

function hydrateVisit(row: VisitRow): FieldVisit {
  let parsedFlags: string[] = [];
  try {
    const raw = JSON.parse(row.risk_flags);
    if (Array.isArray(raw)) {
      parsedFlags = raw.map((item) => String(item));
    }
  } catch {
    parsedFlags = [];
  }
  const validStatuses = ['Completed', 'Scheduled', 'Follow-up Due'] as const;
  const safeStatus = validStatuses.includes(row.status as (typeof validStatuses)[number])
    ? row.status
    : 'Completed';
  return {
    ...row,
    family_id: row.family_id ?? null,
    person_id: row.person_id ?? null,
    purpose: row.purpose || 'Routine Home Visit',
    status: safeStatus,
    notes: row.notes || '',
    beneficiary_phone: row.beneficiary_phone || '',
    beneficiary_gender: row.beneficiary_gender || 'Female',
    blood_sugar_mgdl: row.blood_sugar_mgdl ?? null,
    symptom_duration: row.symptom_duration || '',
    risk_flags: parsedFlags,
  };
}

function seedInitialVisits(): void {
  const countRow = db.prepare('SELECT COUNT(*) as count FROM visits').get() as { count: number };
  if (countRow.count > 0) return;

  const initialVisits: Array<
    Omit<FieldVisit, 'id' | 'worker_id' | 'created_at' | 'family_id' | 'person_id' | 'purpose' | 'status' | 'notes'>
  > = [
    {
      worker_name: 'Shanta Bai (ASHA-KA-4102)',
      beneficiary_name: 'Lakshmamma R.',
      beneficiary_age: 24,
      beneficiary_gender: 'Female',
      beneficiary_category: 'Pregnant Woman',
      district: 'Raichur',
      village: 'Manvi',
      phc_center: 'PHC Manvi',
      language: 'kn',
      transcript:
        'ರಾಯಚೂರು ಜಿಲ್ಲೆಯ ಮಾನ್ವಿ ಗ್ರಾಮದಲ್ಲಿ 32 ವಾರಗಳ ಗರ್ಭಿಣಿ ಲಕ್ಷ್ಮಮ್ಮ ಅವರ ತಪಾಸಣೆ. ಬಿಪಿ 148/96, ಹಿಮೋಗ್ಲೋಬಿನ್ 7.2 g/dL, ಕಾಲುಗಳಲ್ಲಿ ಊತ ಮತ್ತು ತಲೆನೋವು.',
      bp_systolic: 148,
      bp_diastolic: 96,
      blood_sugar_mgdl: 112,
      hemoglobin_gdl: 7.2,
      weight_kg: 52.5,
      gestational_weeks: 32,
      immunization_status: 'Td-2 Completed',
      ifa_tablets_given: 30,
      symptoms: 'Pedal edema, persistent headache, fatigue',
      symptom_duration: '4 days',
      risk_level: 'High',
      risk_flags: ['Pre-eclampsia signs (BP 148/96)', 'Severe/Moderate Anaemia (Hb 7.2 g/dL)'],
      recommended_action: 'Immediate 108 referral to Raichur FRU / PHC Medical Officer for obstetric evaluation and IV iron sucrose.',
      follow_up_date: '2026-11-23',
      lat: 15.9936,
      lng: 77.0505,
      visit_date: '2026-11-21',
    },
    {
      worker_name: 'Renuka Patil (ASHA-KA-3891)',
      beneficiary_name: 'Aarav K.',
      beneficiary_age: 1,
      beneficiary_gender: 'Male',
      beneficiary_category: 'Child (0-5y)',
      district: 'Kalaburagi',
      village: 'Chittapur',
      phc_center: 'PHC Chittapur',
      language: 'hi',
      transcript:
        'कलबुर्गी के चित्तापुर में 14 महीने के आरव की जांच। वजन 7.6 किलो, एमआर-1 टीकाकरण बाकी और हल्का बुखार।',
      bp_systolic: null,
      bp_diastolic: null,
      blood_sugar_mgdl: null,
      hemoglobin_gdl: 9.4,
      weight_kg: 7.6,
      gestational_weeks: null,
      immunization_status: 'MR-1 Overdue (Pentavalent-3 Done)',
      ifa_tablets_given: 0,
      symptoms: 'Mild fever, low weight-for-age',
      symptom_duration: '2 days',
      risk_level: 'Moderate',
      risk_flags: ['Underweight for age', 'MR-1 Vaccination overdue'],
      recommended_action: 'Schedule VHND immunization session for MR-1 and enroll child in Anganwadi Poshan Tracker supplementary nutrition.',
      follow_up_date: '2026-11-26',
      lat: 17.1167,
      lng: 77.0833,
      visit_date: '2026-11-20',
    },
    {
      worker_name: 'Savitha Devi (ASHA-KA-2019)',
      beneficiary_name: 'Kavitha M.',
      beneficiary_age: 27,
      beneficiary_gender: 'Female',
      beneficiary_category: 'Lactating Mother',
      district: 'Mysuru',
      village: 'Nanjangud',
      phc_center: 'PHC Nanjangud',
      language: 'en',
      transcript:
        'Day 14 HBNC postnatal visit in Nanjangud. Mother BP 118/76, Hb 11.4 g/dL, exclusive breastfeeding established, newborn gaining weight steadily.',
      bp_systolic: 118,
      bp_diastolic: 76,
      blood_sugar_mgdl: 98,
      hemoglobin_gdl: 11.4,
      weight_kg: 56.0,
      gestational_weeks: null,
      immunization_status: 'BCG + OPV-0 Completed',
      ifa_tablets_given: 30,
      symptoms: 'None reported',
      symptom_duration: '',
      risk_level: 'Low',
      risk_flags: [],
      recommended_action: 'Continue exclusive breastfeeding counseling and maternal calcium/IFA supplementation.',
      follow_up_date: '2026-12-05',
      lat: 12.1200,
      lng: 76.6801,
      visit_date: '2026-11-20',
    },
    {
      worker_name: 'Manjula G. (ASHA-KA-5114)',
      beneficiary_name: 'Basamma H.',
      beneficiary_age: 22,
      beneficiary_gender: 'Female',
      beneficiary_category: 'Pregnant Woman',
      district: 'Koppal',
      village: 'Gangavathi',
      phc_center: 'PHC Gangavathi',
      language: 'kn',
      transcript:
        'ಗಂಗಾವತಿ ಗ್ರಾಮದಲ್ಲಿ 26 ವಾರಗಳ ಗರ್ಭಿಣಿ ಬಸಮ್ಮ ಅವರ ಭೇಟಿ. ಹಿಮೋಗ್ಲೋಬಿನ್ 6.8 g/dL, ತೀವ್ರ ಸುಸ್ತು ಮತ್ತು ಉಸಿರಾಟದ ತೊಂದರೆ.',
      bp_systolic: 124,
      bp_diastolic: 80,
      blood_sugar_mgdl: 104,
      hemoglobin_gdl: 6.8,
      weight_kg: 47.0,
      gestational_weeks: 26,
      immunization_status: 'Td-1 Completed',
      ifa_tablets_given: 30,
      symptoms: 'Severe pallor, exertional breathlessness, dizziness',
      symptom_duration: '1 week',
      risk_level: 'High',
      risk_flags: ['Severe Anaemia (Hb < 7.0 g/dL)', 'Low maternal weight'],
      recommended_action: 'Escalate to Koppal District Hospital / PMSMA high-risk clinic for blood transfusion/parenteral iron assessment.',
      follow_up_date: '2026-11-22',
      lat: 15.4319,
      lng: 76.5281,
      visit_date: '2026-11-19',
    },
    {
      worker_name: 'Sunita Kulkarni (ASHA-KA-1748)',
      beneficiary_name: 'Pooja S.',
      beneficiary_age: 17,
      beneficiary_gender: 'Female',
      beneficiary_category: 'Adolescent Girl',
      district: 'Belagavi',
      village: 'Gokak',
      phc_center: 'PHC Gokak',
      language: 'kn',
      transcript:
        'ಗೋಕಾಕ ತಾಲೂಕಿನಲ್ಲಿ ಕಿಶೋರಿ ಪೂಜಾ ಅವರ ಆರೋಗ್ಯ ತಪಾಸಣೆ. ಹಿಮೋಗ್ಲೋಬಿನ್ 9.8 g/dL. ವಾರದ ಐಎಫ್‌ಎ ನೀಲಿ ಮಾತ್ರೆ ವಿತರಣೆ.',
      bp_systolic: 112,
      bp_diastolic: 72,
      blood_sugar_mgdl: null,
      hemoglobin_gdl: 9.8,
      weight_kg: 43.5,
      gestational_weeks: null,
      immunization_status: 'WIFS Weekly IFA Active',
      ifa_tablets_given: 12,
      symptoms: 'Mild fatigue during school hours',
      symptom_duration: '2 weeks',
      risk_level: 'Moderate',
      risk_flags: ['Adolescent moderate anaemia (Hb 9.8 g/dL)'],
      recommended_action: 'Continue Weekly Iron Folic Acid Supplementation (WIFS), albendazole deworming verification, and dietary counseling.',
      follow_up_date: '2026-12-02',
      lat: 16.1691,
      lng: 74.8239,
      visit_date: '2026-11-18',
    },
    {
      worker_name: 'Meenakshi B. (ASHA-KA-6044)',
      beneficiary_name: 'Razia Begum',
      beneficiary_age: 29,
      beneficiary_gender: 'Female',
      beneficiary_category: 'Pregnant Woman',
      district: 'Yadgir',
      village: 'Shahapur',
      phc_center: 'PHC Shahapur',
      language: 'hi',
      transcript:
        'यादगीर शाहपुर में 35 सप्ताह की गर्भवती रजिया बेगम की जांच। बीपी 142/92, पिछली डिलीवरी सिजेरियन थी, पीएचसी में संस्थागत प्रसव की योजना।',
      bp_systolic: 142,
      bp_diastolic: 92,
      blood_sugar_mgdl: 158,
      hemoglobin_gdl: 9.6,
      weight_kg: 61.0,
      gestational_weeks: 35,
      immunization_status: 'Td-Booster Done',
      ifa_tablets_given: 30,
      symptoms: 'Elevated blood pressure, previous C-section history',
      symptom_duration: '5 days',
      risk_level: 'High',
      risk_flags: ['Gestational hypertension (BP 142/92)', 'Prior Cesarean delivery'],
      recommended_action: 'Register for birth preparedness at Yadgir FRU with 108 ambulance transport plan and weekly BP monitoring.',
      follow_up_date: '2026-11-24',
      lat: 16.6967,
      lng: 76.8431,
      visit_date: '2026-11-18',
    },
    {
      worker_name: 'Anitha N. (ASHA-KA-1208)',
      beneficiary_name: 'Deepa K.',
      beneficiary_age: 25,
      beneficiary_gender: 'Female',
      beneficiary_category: 'Pregnant Woman',
      district: 'Bengaluru Rural',
      village: 'Devanahalli',
      phc_center: 'PHC Devanahalli',
      language: 'en',
      transcript:
        'Second trimester ANC checkup at Devanahalli. BP 116/74, Hb 11.8 g/dL, gestational age 20 weeks, anomaly scan completed at PHC.',
      bp_systolic: 116,
      bp_diastolic: 74,
      blood_sugar_mgdl: 96,
      hemoglobin_gdl: 11.8,
      weight_kg: 58.2,
      gestational_weeks: 20,
      immunization_status: 'Td-1 Completed',
      ifa_tablets_given: 30,
      symptoms: 'None reported',
      symptom_duration: '',
      risk_level: 'Low',
      risk_flags: [],
      recommended_action: 'Schedule ANC-3 visit at 28 weeks and continue daily IFA + calcium intake.',
      follow_up_date: '2026-12-12',
      lat: 13.2473,
      lng: 77.7139,
      visit_date: '2026-11-17',
    },
    {
      worker_name: 'Geetha Rao (ASHA-KA-2955)',
      beneficiary_name: 'Pranav N.',
      beneficiary_age: 2,
      beneficiary_gender: 'Male',
      beneficiary_category: 'Child (0-5y)',
      district: 'Dharwad',
      village: 'Kalghatgi',
      phc_center: 'PHC Kalghatgi',
      language: 'kn',
      transcript:
        'ಧಾರವಾಡ ಕಲಘಟಗಿ ಗ್ರಾಮದಲ್ಲಿ 2 ವರ್ಷದ ಮಗು ಪ್ರಣವ್ ತಪಾಸಣೆ. ತೂಕ 11.2 ಕೆಜಿ, ಎಲ್ಲಾ ಲಸಿಕೆಗಳು ಪೂರ್ಣಗೊಂಡಿವೆ.',
      bp_systolic: null,
      bp_diastolic: null,
      blood_sugar_mgdl: null,
      hemoglobin_gdl: 11.2,
      weight_kg: 11.2,
      gestational_weeks: null,
      immunization_status: 'Fully Immunized (MR-2 + DPT Booster)',
      ifa_tablets_given: 0,
      symptoms: 'Healthy growth milestones',
      symptom_duration: '',
      risk_level: 'Low',
      risk_flags: [],
      recommended_action: 'Maintain biannual Vitamin A and deworming schedule at Anganwadi center.',
      follow_up_date: '2026-12-20',
      lat: 15.1846,
      lng: 74.9718,
      visit_date: '2026-11-16',
    },
  ];

  const insertStmt = db.prepare(`
    INSERT INTO visits (
      worker_id, worker_name, beneficiary_name, beneficiary_age, beneficiary_gender, beneficiary_category,
      district, village, phc_center, language, transcript,
      bp_systolic, bp_diastolic, blood_sugar_mgdl, hemoglobin_gdl, weight_kg, gestational_weeks,
      immunization_status, ifa_tablets_given, symptoms, symptom_duration, risk_level, risk_flags,
      recommended_action, follow_up_date, lat, lng, visit_date
    ) VALUES (
      NULL, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?
    )
  `);

  const seedTx = db.transaction(() => {
    for (const v of initialVisits) {
      insertStmt.run(
        v.worker_name,
        v.beneficiary_name,
        v.beneficiary_age,
        v.beneficiary_gender,
        v.beneficiary_category,
        v.district,
        v.village,
        v.phc_center,
        v.language,
        v.transcript,
        v.bp_systolic,
        v.bp_diastolic,
        v.blood_sugar_mgdl,
        v.hemoglobin_gdl,
        v.weight_kg,
        v.gestational_weeks,
        v.immunization_status,
        v.ifa_tablets_given,
        v.symptoms,
        v.symptom_duration,
        v.risk_level,
        JSON.stringify(v.risk_flags),
        v.recommended_action,
        v.follow_up_date,
        v.lat,
        v.lng,
        v.visit_date
      );
    }
  });

  seedTx();
}

// Temporary sample visit auto-seeding disabled so user-entered records stay clean
void seedInitialVisits;

function normalizeMobileDigits(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length > 10 && digits.startsWith('91')) {
    return digits.slice(-10);
  }
  return digits;
}

export function findUserByEmail(email: string): AuthUser | null {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) return null;
  const row = db
    .prepare(
      'SELECT id, username, email, mobile_number, full_name, role, district, phc_center, created_at FROM users WHERE LOWER(email) = ?'
    )
    .get(cleanEmail) as AuthUser | undefined;
  return row ?? null;
}

export function createUser(input: {
  username?: string;
  email: string;
  mobile_number: string;
  full_name: string;
  role: UserRole;
  district: string;
  phc_center: string;
  password: string;
}): AuthUser {
  const normalizedEmail = input.email.trim().toLowerCase();
  const existingEmail = findUserByEmail(normalizedEmail);
  if (existingEmail) {
    throw new Error('UNIQUE_EMAIL');
  }

  const username = (input.username?.trim() || normalizedEmail).toLowerCase();
  const passwordHash = bcrypt.hashSync(input.password, 12);
  const stmt = db.prepare(`
    INSERT INTO users (username, email, mobile_number, full_name, role, district, phc_center, password_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const info = stmt.run(
    username,
    normalizedEmail,
    input.mobile_number.trim(),
    input.full_name.trim(),
    input.role,
    input.district.trim(),
    input.phc_center.trim(),
    passwordHash
  );
  const user = db
    .prepare(
      'SELECT id, username, email, mobile_number, full_name, role, district, phc_center, created_at FROM users WHERE id = ?'
    )
    .get(info.lastInsertRowid) as AuthUser;
  return user;
}

export function authenticateUser(identifier: string, password: string): AuthUser | null {
  const cleanId = identifier.trim().toLowerCase();
  if (!cleanId) return null;
  const row = db
    .prepare(
      'SELECT id, username, email, mobile_number, full_name, role, district, phc_center, password_hash, created_at FROM users WHERE LOWER(email) = ? OR LOWER(username) = ?'
    )
    .get(cleanId, cleanId) as (AuthUser & { password_hash: string }) | undefined;

  if (!row) return null;
  const ok = bcrypt.compareSync(password, row.password_hash);
  if (!ok) return null;

  const { password_hash: _ignored, ...safeUser } = row;
  return safeUser;
}

export function createPasswordResetToken(email: string, mobileNumber: string): string | null {
  const cleanEmail = email.trim().toLowerCase();
  const targetDigits = normalizeMobileDigits(mobileNumber);
  if (!cleanEmail || targetDigits.length < 10) return null;

  const row = db
    .prepare('SELECT id, mobile_number FROM users WHERE LOWER(email) = ?')
    .get(cleanEmail) as { id: number; mobile_number: string } | undefined;

  if (!row) return null;
  const storedDigits = normalizeMobileDigits(row.mobile_number || '');
  if (!storedDigits || storedDigits !== targetDigits) return null;

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 1000 * 60 * 15).toISOString();
  db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ? OR expires_at <= ?').run(
    row.id,
    new Date().toISOString()
  );
  db.prepare(
    'INSERT INTO password_reset_tokens (token, user_id, expires_at, used) VALUES (?, ?, ?, 0)'
  ).run(token, row.id, expiresAt);
  return token;
}

export function consumePasswordResetToken(token: string, newPassword: string): boolean {
  const now = new Date().toISOString();
  const row = db
    .prepare(
      'SELECT token, user_id FROM password_reset_tokens WHERE token = ? AND used = 0 AND expires_at > ?'
    )
    .get(token.trim(), now) as { token: string; user_id: number } | undefined;

  if (!row) return false;

  const passwordHash = bcrypt.hashSync(newPassword, 12);
  const tx = db.transaction(() => {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, row.user_id);
    db.prepare('UPDATE password_reset_tokens SET used = 1 WHERE token = ?').run(row.token);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(row.user_id);
  });
  tx();
  return true;
}

export function createSession(userId: number): string {
  const now = new Date().toISOString();
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(
    token,
    userId,
    expiresAt
  );
  return token;
}

export function getUserBySessionToken(token: string): AuthUser | null {
  const now = new Date().toISOString();
  const row = db
    .prepare(
      `
      SELECT u.id, u.username, u.email, u.mobile_number, u.full_name, u.role, u.district, u.phc_center, u.created_at
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token = ? AND s.expires_at > ?
    `
    )
    .get(token, now) as AuthUser | undefined;
  return row ?? null;
}

export function deleteSession(token: string): void {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

export function listVisits(filters: {
  district?: string;
  risk_level?: string;
  category?: string;
  search?: string;
}): FieldVisit[] {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.district && filters.district !== 'All') {
    conditions.push('district = ?');
    params.push(filters.district);
  }
  if (filters.risk_level && filters.risk_level !== 'All') {
    conditions.push('risk_level = ?');
    params.push(filters.risk_level);
  }
  if (filters.category && filters.category !== 'All') {
    conditions.push('beneficiary_category = ?');
    params.push(filters.category);
  }
  if (filters.search && filters.search.trim().length > 0) {
    const q = `%${filters.search.trim()}%`;
    conditions.push(
      '(beneficiary_name LIKE ? OR village LIKE ? OR phc_center LIKE ? OR symptoms LIKE ? OR worker_name LIKE ?)'
    );
    params.push(q, q, q, q, q);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `SELECT * FROM visits ${whereClause} ORDER BY visit_date DESC, id DESC`;
  const rows = db.prepare(sql).all(...params) as VisitRow[];
  return rows.map(hydrateVisit);
}

export function getVisitById(id: number): FieldVisit | null {
  const row = db.prepare('SELECT * FROM visits WHERE id = ?').get(id) as VisitRow | undefined;
  return row ? hydrateVisit(row) : null;
}

function resolveAndSyncPersonForVisit(
  input: Pick<
    VisitInput,
    | 'person_id'
    | 'family_id'
    | 'beneficiary_name'
    | 'beneficiary_phone'
    | 'beneficiary_age'
    | 'beneficiary_gender'
    | 'beneficiary_category'
    | 'village'
    | 'district'
  >
): { person_id: number | null; family_id: number | null } {
  const phoneVal = (input.beneficiary_phone || '').trim().slice(0, 24);
  let resolvedPersonId = input.person_id ?? null;
  let resolvedFamilyId = input.family_id ?? null;

  try {
    // Check if people table exists
    const tableCheck = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'people'")
      .get() as { name: string } | undefined;
    if (!tableCheck) {
      return { person_id: resolvedPersonId, family_id: resolvedFamilyId };
    }

    if (resolvedPersonId) {
      const existingById = db
        .prepare('SELECT id, family_id FROM people WHERE id = ?')
        .get(resolvedPersonId) as { id: number; family_id: number | null } | undefined;
      if (existingById) {
        if (!resolvedFamilyId) resolvedFamilyId = existingById.family_id ?? null;
        if (phoneVal) {
          db.prepare('UPDATE people SET phone = ? WHERE id = ?').run(phoneVal, existingById.id);
        }
        return { person_id: existingById.id, family_id: resolvedFamilyId };
      }
      resolvedPersonId = null;
    }

    const cleanName = input.beneficiary_name.trim();
    if (!cleanName) {
      return { person_id: null, family_id: resolvedFamilyId };
    }

    // Try to match an existing person by full name (preferring same village/district)
    const matched = db
      .prepare(
        `SELECT id, family_id FROM people
         WHERE LOWER(TRIM(full_name)) = LOWER(TRIM(?))
         ORDER BY
           CASE WHEN LOWER(TRIM(village)) = LOWER(TRIM(?)) THEN 0 ELSE 1 END,
           CASE WHEN LOWER(TRIM(district)) = LOWER(TRIM(?)) THEN 0 ELSE 1 END,
           id DESC
         LIMIT 1`
      )
      .get(cleanName, input.village.trim(), input.district.trim()) as
      | { id: number; family_id: number | null }
      | undefined;

    if (matched) {
      resolvedPersonId = matched.id;
      if (!resolvedFamilyId) resolvedFamilyId = matched.family_id ?? null;
      if (phoneVal) {
        db.prepare('UPDATE people SET phone = ? WHERE id = ?').run(phoneVal, matched.id);
      }
      return { person_id: resolvedPersonId, family_id: resolvedFamilyId };
    }

    // No existing patient found: create a linked record in people so phone, calls, calendar & reports work immediately
    const maxRow = db.prepare('SELECT COALESCE(MAX(id), 0) as m FROM people').get() as { m: number };
    const personCode = `PER-KA-${2001 + maxRow.m}-${Date.now().toString().slice(-3)}`;
    const insertRes = db
      .prepare(
        `INSERT INTO people (
          person_code, family_id, full_name, age, gender, relation_to_head, phone,
          village, district, address, blood_group, category, chronic_conditions
        ) VALUES (?, ?, ?, ?, ?, 'Member', ?, ?, ?, '', 'Unknown', ?, '')`
      )
      .run(
        personCode,
        resolvedFamilyId,
        cleanName,
        input.beneficiary_age !== null && Number.isFinite(input.beneficiary_age)
          ? Math.max(0, Math.min(115, Math.round(input.beneficiary_age)))
          : 25,
        input.beneficiary_gender || 'Female',
        phoneVal,
        input.village.trim() || input.district.trim(),
        input.district.trim(),
        input.beneficiary_category || 'Adult'
      );
    resolvedPersonId = Number(insertRes.lastInsertRowid);
  } catch (err) {
    console.warn('[Visits] Could not sync patient record in people table:', err);
  }

  return { person_id: resolvedPersonId, family_id: resolvedFamilyId };
}

export function createVisit(user: AuthUser, input: VisitInput): FieldVisit {
  const workerLabel = `${user.full_name} (${user.username})`;
  const phoneVal = (input.beneficiary_phone || '').trim().slice(0, 24);
  const synced = resolveAndSyncPersonForVisit(input);

  const stmt = db.prepare(`
    INSERT INTO visits (
      worker_id, worker_name, family_id, person_id, beneficiary_name, beneficiary_phone, beneficiary_age, beneficiary_gender, beneficiary_category,
      district, village, phc_center, language, purpose, status, notes, transcript,
      bp_systolic, bp_diastolic, blood_sugar_mgdl, hemoglobin_gdl, weight_kg, gestational_weeks,
      immunization_status, ifa_tablets_given, symptoms, symptom_duration, risk_level, risk_flags,
      recommended_action, follow_up_date, lat, lng, visit_date
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?
    )
  `);

  const info = stmt.run(
    user.id,
    workerLabel,
    synced.family_id,
    synced.person_id,
    input.beneficiary_name,
    phoneVal,
    input.beneficiary_age,
    input.beneficiary_gender,
    input.beneficiary_category,
    input.district,
    input.village,
    input.phc_center,
    input.language,
    input.purpose || 'Routine Home Visit',
    input.status || 'Completed',
    input.notes || '',
    input.transcript,
    input.bp_systolic,
    input.bp_diastolic,
    input.blood_sugar_mgdl,
    input.hemoglobin_gdl,
    input.weight_kg,
    input.gestational_weeks,
    input.immunization_status,
    input.ifa_tablets_given,
    input.symptoms,
    input.symptom_duration,
    input.risk_level,
    JSON.stringify(input.risk_flags),
    input.recommended_action,
    input.follow_up_date,
    input.lat,
    input.lng,
    input.visit_date
  );

  return getVisitById(Number(info.lastInsertRowid))!;
}

export function updateVisit(id: number, input: Partial<VisitInput>): FieldVisit | null {
  const existing = getVisitById(id);
  if (!existing) return null;

  const merged: VisitInput = {
    family_id: input.family_id !== undefined ? input.family_id : existing.family_id,
    person_id: input.person_id !== undefined ? input.person_id : existing.person_id,
    beneficiary_name: input.beneficiary_name ?? existing.beneficiary_name,
    beneficiary_phone:
      input.beneficiary_phone !== undefined ? input.beneficiary_phone : existing.beneficiary_phone || '',
    beneficiary_age: input.beneficiary_age !== undefined ? input.beneficiary_age : existing.beneficiary_age,
    beneficiary_gender: input.beneficiary_gender ?? existing.beneficiary_gender,
    beneficiary_category: input.beneficiary_category ?? existing.beneficiary_category,
    district: input.district ?? existing.district,
    village: input.village ?? existing.village,
    phc_center: input.phc_center ?? existing.phc_center,
    language: input.language ?? existing.language,
    purpose: input.purpose ?? existing.purpose,
    status: input.status ?? existing.status,
    notes: input.notes ?? existing.notes,
    transcript: input.transcript ?? existing.transcript,
    bp_systolic: input.bp_systolic !== undefined ? input.bp_systolic : existing.bp_systolic,
    bp_diastolic: input.bp_diastolic !== undefined ? input.bp_diastolic : existing.bp_diastolic,
    blood_sugar_mgdl:
      input.blood_sugar_mgdl !== undefined ? input.blood_sugar_mgdl : existing.blood_sugar_mgdl,
    hemoglobin_gdl: input.hemoglobin_gdl !== undefined ? input.hemoglobin_gdl : existing.hemoglobin_gdl,
    weight_kg: input.weight_kg !== undefined ? input.weight_kg : existing.weight_kg,
    gestational_weeks:
      input.gestational_weeks !== undefined ? input.gestational_weeks : existing.gestational_weeks,
    immunization_status: input.immunization_status ?? existing.immunization_status,
    ifa_tablets_given: input.ifa_tablets_given ?? existing.ifa_tablets_given,
    symptoms: input.symptoms ?? existing.symptoms,
    symptom_duration: input.symptom_duration ?? existing.symptom_duration,
    risk_level: input.risk_level ?? existing.risk_level,
    risk_flags: input.risk_flags ?? existing.risk_flags,
    recommended_action: input.recommended_action ?? existing.recommended_action,
    follow_up_date: input.follow_up_date ?? existing.follow_up_date,
    lat: input.lat ?? existing.lat,
    lng: input.lng ?? existing.lng,
    visit_date: input.visit_date ?? existing.visit_date,
  };

  const phoneVal = (merged.beneficiary_phone || '').trim().slice(0, 24);

  db.prepare(`
    UPDATE visits SET
      family_id = ?, person_id = ?, beneficiary_name = ?, beneficiary_phone = ?, beneficiary_age = ?, beneficiary_gender = ?, beneficiary_category = ?,
      district = ?, village = ?, phc_center = ?, language = ?, purpose = ?, status = ?, notes = ?, transcript = ?,
      bp_systolic = ?, bp_diastolic = ?, blood_sugar_mgdl = ?, hemoglobin_gdl = ?, weight_kg = ?, gestational_weeks = ?,
      immunization_status = ?, ifa_tablets_given = ?, symptoms = ?, symptom_duration = ?, risk_level = ?, risk_flags = ?,
      recommended_action = ?, follow_up_date = ?, lat = ?, lng = ?, visit_date = ?
    WHERE id = ?
  `).run(
    merged.family_id ?? null,
    merged.person_id ?? null,
    merged.beneficiary_name,
    phoneVal,
    merged.beneficiary_age,
    merged.beneficiary_gender,
    merged.beneficiary_category,
    merged.district,
    merged.village,
    merged.phc_center,
    merged.language,
    merged.purpose || 'Routine Home Visit',
    merged.status || 'Completed',
    merged.notes || '',
    merged.transcript,
    merged.bp_systolic,
    merged.bp_diastolic,
    merged.blood_sugar_mgdl,
    merged.hemoglobin_gdl,
    merged.weight_kg,
    merged.gestational_weeks,
    merged.immunization_status,
    merged.ifa_tablets_given,
    merged.symptoms,
    merged.symptom_duration,
    merged.risk_level,
    JSON.stringify(merged.risk_flags),
    merged.recommended_action,
    merged.follow_up_date,
    merged.lat,
    merged.lng,
    merged.visit_date,
    id
  );

  if (merged.person_id && phoneVal) {
    try {
      db.prepare('UPDATE people SET phone = ? WHERE id = ?').run(phoneVal, merged.person_id);
    } catch {
      // Ignore if people table not yet initialized
    }
  }

  return getVisitById(id);
}

export function deleteVisit(id: number): boolean {
  const info = db.prepare('DELETE FROM visits WHERE id = ?').run(id);
  return info.changes > 0;
}
