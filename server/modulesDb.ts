import { db } from './db.ts';
import type {
  ChildRecord,
  CommunitySurvey,
  DangerAlert,
  DatasetImportLog,
  FamilyRecord,
  HealthCheckupRecord,
  HealthIndicator,
  MaternalRecord,
  PersonRecord,
  ReportsSummary,
  SurveyQuestion,
  SurveyResponseRecord,
  VoiceInteractionRecord,
} from '../src/types.ts';

// Initialize all relational AshaSakhi tables
db.exec(`
  CREATE TABLE IF NOT EXISTS families (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    family_code TEXT NOT NULL UNIQUE,
    head_name TEXT NOT NULL,
    village TEXT NOT NULL,
    district TEXT NOT NULL,
    address TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    ration_card_type TEXT NOT NULL DEFAULT 'BPL',
    water_source TEXT NOT NULL DEFAULT 'Piped Tap Water',
    toilet_access TEXT NOT NULL DEFAULT 'Individual Household Toilet',
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS people (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    person_code TEXT NOT NULL UNIQUE,
    family_id INTEGER,
    full_name TEXT NOT NULL,
    age INTEGER NOT NULL,
    gender TEXT NOT NULL DEFAULT 'Female',
    relation_to_head TEXT NOT NULL DEFAULT 'Member',
    phone TEXT NOT NULL DEFAULT '',
    village TEXT NOT NULL,
    district TEXT NOT NULL,
    address TEXT NOT NULL DEFAULT '',
    blood_group TEXT NOT NULL DEFAULT 'Unknown',
    category TEXT NOT NULL DEFAULT 'Adult',
    chronic_conditions TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS danger_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    person_id INTEGER,
    person_name TEXT NOT NULL,
    village TEXT NOT NULL,
    district TEXT NOT NULL,
    category TEXT NOT NULL,
    severity TEXT NOT NULL,
    danger_signs TEXT NOT NULL DEFAULT '[]',
    guidance TEXT NOT NULL,
    referral_facility TEXT NOT NULL DEFAULT 'Nearest PHC / FRU (Call 108)',
    status TEXT NOT NULL DEFAULT 'Active',
    reported_by TEXT NOT NULL DEFAULT 'ASHA Worker',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS maternal_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    person_id INTEGER,
    mother_name TEXT NOT NULL,
    age INTEGER NOT NULL,
    village TEXT NOT NULL,
    district TEXT NOT NULL,
    lmp_date TEXT NOT NULL DEFAULT '',
    edd_date TEXT NOT NULL DEFAULT '',
    gravida INTEGER NOT NULL DEFAULT 1,
    para INTEGER NOT NULL DEFAULT 0,
    anc_visits_completed INTEGER NOT NULL DEFAULT 1,
    ifa_tablets_total INTEGER NOT NULL DEFAULT 30,
    nutrition_status TEXT NOT NULL DEFAULT 'Normal',
    hemoglobin_gdl REAL,
    bp_reading TEXT NOT NULL DEFAULT '120/80',
    high_risk INTEGER NOT NULL DEFAULT 0,
    high_risk_reasons TEXT NOT NULL DEFAULT '',
    postnatal_status TEXT NOT NULL DEFAULT 'Antenatal',
    next_anc_date TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS child_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    person_id INTEGER,
    child_name TEXT NOT NULL,
    mother_name TEXT NOT NULL,
    dob TEXT NOT NULL,
    gender TEXT NOT NULL DEFAULT 'Female',
    village TEXT NOT NULL,
    district TEXT NOT NULL,
    birth_weight_kg REAL,
    current_weight_kg REAL,
    current_height_cm REAL,
    nutrition_status TEXT NOT NULL DEFAULT 'Normal',
    vaccines_completed TEXT NOT NULL DEFAULT '[]',
    next_vaccine TEXT NOT NULL DEFAULT '',
    next_vaccine_date TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS community_surveys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    topic TEXT NOT NULL,
    village TEXT NOT NULL,
    district TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Active',
    questions_json TEXT NOT NULL DEFAULT '[]',
    target_households INTEGER NOT NULL DEFAULT 10,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS survey_responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    survey_id INTEGER NOT NULL,
    family_id INTEGER,
    respondent_name TEXT NOT NULL,
    village TEXT NOT NULL,
    answers_json TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'Completed',
    submitted_by TEXT NOT NULL DEFAULT 'ASHA Worker',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (survey_id) REFERENCES community_surveys(id) ON DELETE CASCADE,
    FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS health_checkups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    person_id INTEGER,
    person_name TEXT NOT NULL,
    village TEXT NOT NULL,
    district TEXT NOT NULL,
    checkup_date TEXT NOT NULL,
    bp_systolic INTEGER,
    bp_diastolic INTEGER,
    temperature_c REAL,
    weight_kg REAL,
    blood_sugar_mgdl REAL,
    hemoglobin_gdl REAL,
    spo2_pct INTEGER,
    symptoms TEXT NOT NULL DEFAULT '',
    observations TEXT NOT NULL DEFAULT '',
    clinical_flags TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'Completed',
    summary TEXT NOT NULL DEFAULT '',
    recorded_by TEXT NOT NULL DEFAULT 'ASHA Worker',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS voice_interactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    person_id INTEGER,
    person_name TEXT NOT NULL DEFAULT 'Community Member',
    village TEXT NOT NULL DEFAULT '',
    language TEXT NOT NULL DEFAULT 'en',
    transcript TEXT NOT NULL,
    guidance_text TEXT NOT NULL,
    emergency_detected INTEGER NOT NULL DEFAULT 0,
    saved_by TEXT NOT NULL DEFAULT 'ASHA Worker',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS dataset_imports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    source_name TEXT NOT NULL,
    file_format TEXT NOT NULL,
    records_added INTEGER NOT NULL DEFAULT 0,
    records_updated INTEGER NOT NULL DEFAULT 0,
    records_skipped INTEGER NOT NULL DEFAULT 0,
    mode TEXT NOT NULL DEFAULT 'append',
    imported_by TEXT NOT NULL DEFAULT 'System',
    imported_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS health_indicators (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    indicator_id TEXT NOT NULL UNIQUE,
    indicator_name TEXT NOT NULL,
    category TEXT NOT NULL,
    geography TEXT NOT NULL,
    value TEXT NOT NULL,
    unit TEXT NOT NULL DEFAULT '%',
    period TEXT NOT NULL,
    source TEXT NOT NULL,
    source_url TEXT NOT NULL DEFAULT 'https://rchiips.org/nfhs/factsheet_NFHS-5.shtml',
    methodology TEXT NOT NULL DEFAULT 'Household Probability Survey',
    denominator TEXT NOT NULL DEFAULT 'Eligible survey population',
    disaggregation TEXT NOT NULL DEFAULT 'State Total (Urban + Rural)',
    confidence_notes TEXT NOT NULL DEFAULT 'Official published MoHFW / IIPS state factsheet figure',
    dataset_origin TEXT NOT NULL DEFAULT 'Official Imported',
    import_batch_id INTEGER,
    imported_at TEXT NOT NULL DEFAULT (datetime('now')),
    metadata_json TEXT NOT NULL DEFAULT '{}',
    FOREIGN KEY (import_batch_id) REFERENCES dataset_imports(id) ON DELETE SET NULL
  );
`);

function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

// ---------- SEEDING AUTHENTIC OFFICIAL NFHS-5 KARNATAKA (19 INDICATORS) & REALISTIC VILLAGE DATA ----------

function seedOfficialIndicators(): void {
  const count = (db.prepare('SELECT COUNT(*) as c FROM health_indicators').get() as { c: number }).c;
  if (count > 0) return;

  const batch = db
    .prepare(
      `INSERT INTO dataset_imports (filename, source_name, file_format, records_added, records_updated, records_skipped, mode, imported_by)
       VALUES (?, ?, ?, ?, 0, 0, 'append', 'NHM Official Registry')`
    )
    .run('NFHS5_Karnataka_State_Factsheet_2019_21.json', 'NFHS-5 (IIPS & MoHFW)', 'JSON', 19);
  const batchId = Number(batch.lastInsertRowid);

  // Authentic official NFHS-5 (2019-21) Karnataka State Factsheet indicators (IIPS & MoHFW, Govt. of India)
  const official19 = [
    ['NFHS5_KA_CHD_FULL_IMM', 'Children age 12–23 months fully vaccinated (card or recall)', 'Child Health', 'Karnataka (State)', '84.1%', '%', '2019–21', 'NFHS-5 (IIPS & MoHFW)', 'Children age 12–23 months', 'BCG, measles-containing, and 3 doses each of polio & DPT/Penta'],
    ['NFHS5_KA_CHD_BCG', 'Children age 12–23 months who received BCG vaccine', 'Child Health', 'Karnataka (State)', '97.2%', '%', '2019–21', 'NFHS-5 (IIPS & MoHFW)', 'Children age 12–23 months', 'Vaccination card or mother recall'],
    ['NFHS5_KA_CHD_PENTA3', 'Children age 12–23 months who received 3 doses of Penta / DPT', 'Child Health', 'Karnataka (State)', '92.1%', '%', '2019–21', 'NFHS-5 (IIPS & MoHFW)', 'Children age 12–23 months', '3 doses of pentavalent or DPT vaccine'],
    ['NFHS5_KA_CHD_MCV1', 'Children age 12–23 months who received first dose of Measles (MCV)', 'Child Health', 'Karnataka (State)', '91.2%', '%', '2019–21', 'NFHS-5 (IIPS & MoHFW)', 'Children age 12–23 months', 'First dose of measles-containing vaccine'],
    ['NFHS5_KA_CHD_STUNTED', 'Children under 5 years who are stunted (height-for-age)', 'Child Health', 'Karnataka (State)', '35.4%', '%', '2019–21', 'NFHS-5 (IIPS & MoHFW)', 'Children under 5 years', 'Below -2 SD from WHO Child Growth Standards median'],
    ['NFHS5_KA_CHD_WASTED', 'Children under 5 years who are wasted (weight-for-height)', 'Child Health', 'Karnataka (State)', '19.5%', '%', '2019–21', 'NFHS-5 (IIPS & MoHFW)', 'Children under 5 years', 'Below -2 SD from WHO Child Growth Standards median'],
    ['NFHS5_KA_CHD_UNDERWEIGHT', 'Children under 5 years who are underweight (weight-for-age)', 'Child Health', 'Karnataka (State)', '32.9%', '%', '2019–21', 'NFHS-5 (IIPS & MoHFW)', 'Children under 5 years', 'Below -2 SD from WHO Child Growth Standards median'],
    ['NFHS5_KA_MAT_ANC_1TRIM', 'Mothers who had an antenatal check-up in the first trimester', 'Maternal Health', 'Karnataka (State)', '71.0%', '%', '2019–21', 'NFHS-5 (IIPS & MoHFW)', 'Women with live birth in last 5 years', 'First trimester (<12 weeks gestation)'],
    ['NFHS5_KA_MAT_ANC_4PLUS', 'Mothers who had at least 4 antenatal care visits', 'Maternal Health', 'Karnataka (State)', '70.9%', '%', '2019–21', 'NFHS-5 (IIPS & MoHFW)', 'Women with live birth in last 5 years', 'Minimum 4 ANC contacts for last live birth'],
    ['NFHS5_KA_MAT_IFA_100', 'Mothers who consumed iron folic acid for 100 days or more', 'Maternal Health', 'Karnataka (State)', '44.7%', '%', '2019–21', 'NFHS-5 (IIPS & MoHFW)', 'Women with live birth in last 5 years', 'IFA tablets or syrup for >= 100 days during pregnancy'],
    ['NFHS5_KA_MAT_INST_BIRTH', 'Institutional births in health facilities', 'Maternal Health', 'Karnataka (State)', '97.0%', '%', '2019–21', 'NFHS-5 (IIPS & MoHFW)', 'Live births in 5 years preceding survey', 'Public or private health facility delivery'],
    ['NFHS5_KA_MAT_PNC_2DAYS', 'Mothers who received postnatal care from health personnel within 2 days', 'Maternal Health', 'Karnataka (State)', '87.4%', '%', '2019–21', 'NFHS-5 (IIPS & MoHFW)', 'Women with live birth in last 5 years', 'Postnatal check within 48 hours of delivery'],
    ['NFHS5_KA_NUT_PREG_ANAEMIA', 'Pregnant women age 15–49 years who are anaemic (<11.0 g/dL)', 'Nutrition & Anaemia', 'Karnataka (State)', '45.7%', '%', '2019–21', 'NFHS-5 (IIPS & MoHFW)', 'Pregnant women age 15–49 years', 'Altitude-adjusted hemoglobin <11.0 g/dL'],
    ['NFHS5_KA_NUT_WOM_ANAEMIA', 'All women age 15–49 years who are anaemic', 'Nutrition & Anaemia', 'Karnataka (State)', '47.8%', '%', '2019–21', 'NFHS-5 (IIPS & MoHFW)', 'Women age 15–49 years', 'Hemoglobin <12.0 g/dL (non-pregnant) or <11.0 g/dL (pregnant)'],
    ['NFHS5_KA_NUT_CHD_ANAEMIA', 'Children age 6–59 months who are anaemic (<11.0 g/dL)', 'Nutrition & Anaemia', 'Karnataka (State)', '65.5%', '%', '2019–21', 'NFHS-5 (IIPS & MoHFW)', 'Children age 6–59 months', 'Hemoglobin <11.0 g/dL via HemoCue'],
    ['NFHS5_KA_NUT_EXCL_BF', 'Children under age 6 months exclusively breastfed', 'Child Health', 'Karnataka (State)', '61.0%', '%', '2019–21', 'NFHS-5 (IIPS & MoHFW)', 'Youngest children under 6 months', '24-hour dietary recall'],
    ['NFHS5_KA_WASH_WATER', 'Population living in households with an improved drinking-water source', 'Hygiene & Sanitation', 'Karnataka (State)', '95.4%', '%', '2019–21', 'NFHS-5 (IIPS & MoHFW)', 'Household population', 'Piped water, public tap, tube well, protected spring/well'],
    ['NFHS5_KA_WASH_SANITATION', 'Population living in households using an improved sanitation facility', 'Hygiene & Sanitation', 'Karnataka (State)', '74.8%', '%', '2019–21', 'NFHS-5 (IIPS & MoHFW)', 'Household population', 'Flush/pour flush, VIP, pit latrine with slab (not shared)'],
    ['NFHS5_KA_NCD_HYPERTENSION', 'Women age 15 years and above with elevated blood pressure or taking medicine', 'Non-Communicable', 'Karnataka (State)', '25.0%', '%', '2019–21', 'NFHS-5 (IIPS & MoHFW)', 'Women age 15+ years', 'Systolic >=140 mmHg or Diastolic >=90 mmHg or on medication'],
  ];

  const stmt = db.prepare(`
    INSERT INTO health_indicators (
      indicator_id, indicator_name, category, geography, value, unit, period, source,
      source_url, methodology, denominator, disaggregation, confidence_notes, dataset_origin,
      import_batch_id, metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Official Imported', ?, ?)
  `);

  const tx = db.transaction(() => {
    for (const row of official19) {
      const [id, name, category, geography, value, unit, period, source, denominator, methodDetail] = row;
      const metadata = {
        survey_round: 'NFHS-5',
        state_code: 'KA (29)',
        ministry: 'Ministry of Health and Family Welfare (MoHFW), Govt. of India',
        nodal_agency: 'International Institute for Population Sciences (IIPS), Mumbai',
        sampling_design: 'Two-stage stratified cluster sample',
        definition_note: methodDetail,
        verification_status: 'Official Published State Factsheet',
        release_year: '2021',
      };
      stmt.run(
        id,
        name,
        category,
        geography,
        value,
        unit,
        period,
        source,
        'https://rchiips.org/nfhs/NFHS-5_FCTS/Karnataka.pdf',
        `NFHS-5 Household Survey — ${methodDetail}`,
        denominator,
        'Karnataka State Total (Urban + Rural)',
        'Official published NFHS-5 Karnataka State Factsheet figure; do not mix with local field counts.',
        batchId,
        JSON.stringify(metadata)
      );
    }
  });
  tx();
}

function seedCommunityData(): void {
  const famCount = (db.prepare('SELECT COUNT(*) as c FROM families').get() as { c: number }).c;
  if (famCount === 0) {
    const insertFam = db.prepare(`
      INSERT INTO families (family_code, head_name, village, district, address, phone, ration_card_type, water_source, toilet_access, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const f1 = Number(
      insertFam.run('FAM-KA-1001', 'Rameshappa G.', 'Manvi', 'Raichur', 'Ward 3, Near Anganwadi Kendra, Manvi', '9845011201', 'BPL', 'Piped Tap Water', 'Individual Household Toilet', 'High-risk pregnancy household').lastInsertRowid
    );
    const f2 = Number(
      insertFam.run('FAM-KA-1002', 'Kiran Kumar', 'Chittapur', 'Kalaburagi', 'Main Road Colony, Chittapur', '9845011202', 'BPL', 'Handpump / Borewell', 'Individual Household Toilet', 'Toddler immunization follow-up').lastInsertRowid
    );
    const f3 = Number(
      insertFam.run('FAM-KA-1003', 'Mahesh Gowda', 'Nanjangud', 'Mysuru', 'Temple Street Cross, Nanjangud', '9845011203', 'APL', 'Piped Tap Water', 'Individual Household Toilet', 'Postnatal mother & newborn care').lastInsertRowid
    );
    const f4 = Number(
      insertFam.run('FAM-KA-1004', 'Hanumantha H.', 'Gangavathi', 'Koppal', 'Canal Road East, Gangavathi', '9845011204', 'Antyodaya', 'Community Tap', 'Community Toilet', 'Severe maternal anaemia monitoring').lastInsertRowid
    );
    const f5 = Number(
      insertFam.run('FAM-KA-1005', 'Abdul Rahman', 'Shahapur', 'Yadgir', 'Old Bazaar Lane, Shahapur', '9845011205', 'BPL', 'Piped Tap Water', 'Individual Household Toilet', 'Prior C-section birth preparedness').lastInsertRowid
    );

    const insertPerson = db.prepare(`
      INSERT INTO people (person_code, family_id, full_name, age, gender, relation_to_head, phone, village, district, address, blood_group, category, chronic_conditions)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const p1 = Number(
      insertPerson.run('PER-KA-2001', f1, 'Lakshmamma R.', 24, 'Female', 'Wife', '9845011201', 'Manvi', 'Raichur', 'Ward 3, Manvi', 'O+', 'Pregnant Woman', 'Gestational hypertension, moderate anaemia').lastInsertRowid
    );
    insertPerson.run('PER-KA-2002', f1, 'Rameshappa G.', 29, 'Male', 'Head', '9845011201', 'Manvi', 'Raichur', 'Ward 3, Manvi', 'B+', 'Adult', 'None');
    const p3 = Number(
      insertPerson.run('PER-KA-2003', f2, 'Aarav K.', 1, 'Male', 'Son', '9845011202', 'Chittapur', 'Kalaburagi', 'Main Road Colony, Chittapur', 'A+', 'Child (0-5y)', 'Underweight monitoring').lastInsertRowid
    );
    insertPerson.run('PER-KA-2004', f2, 'Sunitha K.', 26, 'Female', 'Wife', '9845011202', 'Chittapur', 'Kalaburagi', 'Main Road Colony, Chittapur', 'A+', 'Adult', 'None');
    const p5 = Number(
      insertPerson.run('PER-KA-2005', f3, 'Kavitha M.', 27, 'Female', 'Wife', '9845011203', 'Nanjangud', 'Mysuru', 'Temple Street Cross, Nanjangud', 'B+', 'Lactating Mother', 'Postnatal Day 14').lastInsertRowid
    );
    const p6 = Number(
      insertPerson.run('PER-KA-2006', f3, 'Baby Diya M.', 0, 'Female', 'Daughter', '9845011203', 'Nanjangud', 'Mysuru', 'Temple Street Cross, Nanjangud', 'B+', 'Child (0-5y)', 'Newborn healthy').lastInsertRowid
    );
    const p7 = Number(
      insertPerson.run('PER-KA-2007', f4, 'Basamma H.', 22, 'Female', 'Wife', '9845011204', 'Gangavathi', 'Koppal', 'Canal Road East, Gangavathi', 'AB+', 'Pregnant Woman', 'Severe anaemia (Hb 6.8)').lastInsertRowid
    );
    const p8 = Number(
      insertPerson.run('PER-KA-2008', f5, 'Razia Begum', 29, 'Female', 'Wife', '9845011205', 'Shahapur', 'Yadgir', 'Old Bazaar Lane, Shahapur', 'O+', 'Pregnant Woman', 'Prior C-section, elevated BP').lastInsertRowid
    );
    insertPerson.run('PER-KA-2009', f5, 'Imran R.', 64, 'Male', 'Father', '9845011205', 'Shahapur', 'Yadgir', 'Old Bazaar Lane, Shahapur', 'O+', 'Senior', 'Type 2 Diabetes');

    // Maternal records
    const insertMat = db.prepare(`
      INSERT INTO maternal_records (person_id, mother_name, age, village, district, lmp_date, edd_date, gravida, para, anc_visits_completed, ifa_tablets_total, nutrition_status, hemoglobin_gdl, bp_reading, high_risk, high_risk_reasons, postnatal_status, next_anc_date, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertMat.run(p1, 'Lakshmamma R.', 24, 'Manvi', 'Raichur', '2026-04-10', '2027-01-15', 2, 1, 3, 90, 'Moderate Anaemia', 7.2, '148/96', 1, 'BP >= 140/90 with pedal edema; Hb 7.2 g/dL', 'Antenatal (32 wks)', '2026-11-23', 'Referred to Raichur FRU for PMSMA checkup.');
    insertMat.run(p7, 'Basamma H.', 22, 'Gangavathi', 'Koppal', '2026-05-20', '2027-02-24', 1, 0, 2, 60, 'Underweight / Severe Anaemia', 6.8, '124/80', 1, 'Severe anaemia (Hb < 7.0 g/dL), exertional breathlessness', 'Antenatal (26 wks)', '2026-11-22', 'Urgent District Hospital IV iron sucrose / transfusion consult.');
    insertMat.run(p8, 'Razia Begum', 29, 'Shahapur', 'Yadgir', '2026-03-18', '2026-12-23', 2, 1, 4, 120, 'Normal', 9.6, '142/92', 1, 'Previous C-section, gestational hypertension', 'Antenatal (35 wks)', '2026-11-24', '108 ambulance transport plan mapped with family.');
    insertMat.run(p5, 'Kavitha M.', 27, 'Nanjangud', 'Mysuru', '2026-01-25', '2026-11-01', 1, 1, 4, 140, 'Normal', 11.4, '118/76', 0, '', 'Postnatal Day 14 (HBNC)', '2026-12-05', 'Exclusive breastfeeding established; mother & baby well.');

    // Child records
    const insertChild = db.prepare(`
      INSERT INTO child_records (person_id, child_name, mother_name, dob, gender, village, district, birth_weight_kg, current_weight_kg, current_height_cm, nutrition_status, vaccines_completed, next_vaccine, next_vaccine_date, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertChild.run(p3, 'Aarav K.', 'Sunitha K.', '2025-09-12', 'Male', 'Chittapur', 'Kalaburagi', 2.7, 7.6, 73.5, 'Moderately Underweight', JSON.stringify(['BCG', 'OPV-0', 'HepB-0', 'Penta-1', 'Penta-2', 'Penta-3', 'Rotavirus-3']), 'MR-1 (Measles-Rubella 1)', '2026-11-26', 'Enrolled in Anganwadi Poshan supplementary nutrition.');
    insertChild.run(p6, 'Baby Diya M.', 'Kavitha M.', '2026-11-06', 'Female', 'Nanjangud', 'Mysuru', 3.1, 3.3, 50.2, 'Normal', JSON.stringify(['BCG', 'OPV-0', 'HepB-0']), 'Penta-1 + OPV-1 + Rotavirus-1 (6 Weeks)', '2026-12-18', 'HBNC Day 14 weight gain on track.');

    // Danger alerts
    const insertAlert = db.prepare(`
      INSERT INTO danger_alerts (person_id, person_name, village, district, category, severity, danger_signs, guidance, referral_facility, status, reported_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertAlert.run(p1, 'Lakshmamma R.', 'Manvi', 'Raichur', 'Maternal', 'Critical', JSON.stringify(['High Blood Pressure (148/96 mmHg)', 'Persistent severe headache', 'Swelling of feet/face (edema)']), 'Possible pre-eclampsia. Arrange immediate 108 ambulance transport to PHC/FRU Medical Officer. Do not wait at home.', 'Raichur District FRU / PHC Manvi', 'Active', 'Shanta Bai (ASHA-KA-4102)');
    insertAlert.run(p7, 'Basamma H.', 'Gangavathi', 'Koppal', 'Maternal', 'Critical', JSON.stringify(['Severe Anaemia (Hb 6.8 g/dL)', 'Breathlessness on mild exertion', 'Dizziness & severe pallor']), 'Severe anaemia in pregnancy requires urgent physician evaluation at District Hospital for parenteral iron or blood transfusion.', 'Koppal District Hospital', 'Referred to PHC/FRU', 'Manjula G. (ASHA-KA-5114)');
    insertAlert.run(p3, 'Aarav K.', 'Chittapur', 'Kalaburagi', 'Child', 'Moderate', JSON.stringify(['Fever for 2 days', 'Low weight-for-age', 'Overdue MR-1 vaccination']), 'Assess for fast breathing or lethargy. Ensure oral fluids and escort to PHC Chittapur medical officer if fever exceeds 38.5°C.', 'PHC Chittapur', 'Active', 'Renuka Patil (ASHA-KA-3891)');

    // Health checkups (multiple entries for Lakshmamma to demonstrate longitudinal tracking!)
    const insertCheckup = db.prepare(`
      INSERT INTO health_checkups (person_id, person_name, village, district, checkup_date, bp_systolic, bp_diastolic, temperature_c, weight_kg, blood_sugar_mgdl, hemoglobin_gdl, spo2_pct, symptoms, observations, clinical_flags, status, summary, recorded_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertCheckup.run(p1, 'Lakshmamma R.', 'Manvi', 'Raichur', '2026-10-22', 132, 84, 36.8, 51.0, 108, 8.1, 98, 'Mild tiredness', 'ANC-2 checkup at VHND', JSON.stringify(['Moderate Anaemia (Hb 8.1 g/dL)']), 'Completed', 'BP borderline; started double-dose IFA counseling.', 'Shanta Bai');
    insertCheckup.run(p1, 'Lakshmamma R.', 'Manvi', 'Raichur', '2026-11-21', 148, 96, 37.0, 52.5, 112, 7.2, 97, 'Headache, leg swelling', 'Elevated BP and dropping hemoglobin on home visit', JSON.stringify(['Hypertension (BP >= 140/90)', 'Anaemia (Hb < 11.0 g/dL)']), 'Pending Follow-up', 'Urgent medical officer referral initiated for elevated BP and low Hb.', 'Shanta Bai');
    insertCheckup.run(p5, 'Kavitha M.', 'Nanjangud', 'Mysuru', '2026-11-20', 118, 76, 36.7, 56.0, 98, 11.4, 99, 'None', 'Postnatal vitals stable', JSON.stringify([]), 'Completed', 'All vitals within normal reference range.', 'Savitha Devi');

    // Community surveys & responses
    const insertSurvey = db.prepare(`
      INSERT INTO community_surveys (title, topic, village, district, status, questions_json, target_households)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const q1: SurveyQuestion[] = [
      { id: 'q1', prompt: 'Does the household boil or filter drinking water daily?', type: 'yes_no' },
      { id: 'q2', prompt: 'Are all children under 5 up to date on routine vaccines?', type: 'yes_no' },
      { id: 'q3', prompt: 'Primary sanitation facility used by the family', type: 'choice', options: ['Individual Toilet', 'Community Toilet', 'Open Field'] },
      { id: 'q4', prompt: 'Any fever or diarrheal illness in the last 14 days?', type: 'text' },
    ];
    const s1 = Number(insertSurvey.run('Monsoon Water, Hygiene & Immunization Audit', 'Hygiene & Immunization', 'Manvi', 'Raichur', 'Active', JSON.stringify(q1), 10).lastInsertRowid);
    const q2: SurveyQuestion[] = [
      { id: 'q1', prompt: 'Is the expectant mother taking daily IFA & Calcium tablets?', type: 'yes_no' },
      { id: 'q2', prompt: 'Has the family registered a 108 transport plan for institutional delivery?', type: 'yes_no' },
      { id: 'q3', prompt: 'Number of ANC visits completed so far', type: 'number' },
    ];
    const s2 = Number(insertSurvey.run('Maternal Birth Preparedness & IFA Check', 'Maternal Health', 'Gangavathi', 'Koppal', 'Active', JSON.stringify(q2), 8).lastInsertRowid);

    const insertResp = db.prepare(`
      INSERT INTO survey_responses (survey_id, family_id, respondent_name, village, answers_json, status, submitted_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    insertResp.run(s1, f1, 'Rameshappa G.', 'Manvi', JSON.stringify({ q1: 'Yes', q2: 'Yes', q3: 'Individual Toilet', q4: 'None' }), 'Completed', 'Shanta Bai');
    insertResp.run(s1, f2, 'Kiran Kumar', 'Chittapur', JSON.stringify({ q1: 'No', q2: 'No', q3: 'Individual Toilet', q4: 'Child mild fever 2 days' }), 'Completed', 'Renuka Patil');
    insertResp.run(s2, f4, 'Basamma H.', 'Gangavathi', JSON.stringify({ q1: 'Yes', q2: 'Yes', q3: '2' }), 'Completed', 'Manjula G.');

    // Voice interactions
    db.prepare(`
      INSERT INTO voice_interactions (person_id, person_name, village, language, transcript, guidance_text, emergency_detected, saved_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      p1,
      'Lakshmamma R.',
      'Manvi',
      'kn',
      'ರಾಯಚೂರು ಮಾನ್ವಿಯಲ್ಲಿ 32 ವಾರಗಳ ಗರ್ಭಿಣಿ ಲಕ್ಷ್ಮಮ್ಮ ಅವರಿಗೆ ತಲೆನೋವು, ಕಾಲು ಊತ ಮತ್ತು ಬಿಪಿ 148/96 ಇದೆ.',
      'Immediate Medical Attention Needed: High blood pressure (148/96 mmHg) with headache and leg swelling in pregnancy are danger signs of pre-eclampsia. Contact 108 ambulance and escort the mother to Raichur FRU / PHC Medical Officer immediately. AI guidance does not replace a qualified doctor.',
      1,
      'Shanta Bai'
    );
  }
}

seedOfficialIndicators();
// Temporary sample patient/family/alert/survey auto-seeding disabled so only real user records are stored
void seedCommunityData;

// ---------- FAMILIES ----------
export function listFamilies(search?: string, village?: string): FamilyRecord[] {
  const conds: string[] = [];
  const params: unknown[] = [];
  if (village && village !== 'All') {
    conds.push('f.village = ?');
    params.push(village);
  }
  if (search && search.trim()) {
    const q = `%${search.trim()}%`;
    conds.push('(f.family_code LIKE ? OR f.head_name LIKE ? OR f.village LIKE ? OR f.district LIKE ?)');
    params.push(q, q, q, q);
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  return db
    .prepare(
      `SELECT f.*, (SELECT COUNT(*) FROM people p WHERE p.family_id = f.id) as member_count
       FROM families f ${where} ORDER BY f.id DESC`
    )
    .all(...params) as FamilyRecord[];
}

export function createFamily(input: Omit<FamilyRecord, 'id' | 'family_code' | 'created_at' | 'member_count'>): FamilyRecord {
  const seqRow = db
    .prepare(
      "SELECT MAX(COALESCE((SELECT MAX(id) FROM families), 0), COALESCE((SELECT seq FROM sqlite_sequence WHERE name = 'families'), 0)) as m"
    )
    .get() as { m: number };
  const code = `FAM-KA-${1001 + seqRow.m}`;
  const info = db
    .prepare(
      `INSERT INTO families (family_code, head_name, village, district, address, phone, ration_card_type, water_source, toilet_access, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      code,
      input.head_name,
      input.village,
      input.district,
      input.address || '',
      input.phone || '',
      input.ration_card_type || 'BPL',
      input.water_source || 'Piped Tap Water',
      input.toilet_access || 'Individual Household Toilet',
      input.notes || ''
    );
  return db
    .prepare('SELECT f.*, 0 as member_count FROM families f WHERE f.id = ?')
    .get(info.lastInsertRowid) as FamilyRecord;
}

export function updateFamily(id: number, input: Partial<FamilyRecord>): FamilyRecord | null {
  const existing = db.prepare('SELECT * FROM families WHERE id = ?').get(id) as FamilyRecord | undefined;
  if (!existing) return null;
  db.prepare(
    `UPDATE families SET head_name = ?, village = ?, district = ?, address = ?, phone = ?, ration_card_type = ?, water_source = ?, toilet_access = ?, notes = ? WHERE id = ?`
  ).run(
    input.head_name ?? existing.head_name,
    input.village ?? existing.village,
    input.district ?? existing.district,
    input.address ?? existing.address,
    input.phone ?? existing.phone,
    input.ration_card_type ?? existing.ration_card_type,
    input.water_source ?? existing.water_source,
    input.toilet_access ?? existing.toilet_access,
    input.notes ?? existing.notes,
    id
  );
  return db
    .prepare('SELECT f.*, (SELECT COUNT(*) FROM people p WHERE p.family_id = f.id) as member_count FROM families f WHERE f.id = ?')
    .get(id) as FamilyRecord;
}

export function deleteFamily(id: number): boolean {
  return db.prepare('DELETE FROM families WHERE id = ?').run(id).changes > 0;
}

// ---------- PEOPLE ----------
export function listPeople(filters?: { search?: string; village?: string; ageGroup?: string; familyId?: number }): PersonRecord[] {
  const conds: string[] = [];
  const params: unknown[] = [];
  if (filters?.familyId) {
    conds.push('p.family_id = ?');
    params.push(filters.familyId);
  }
  if (filters?.village && filters.village !== 'All') {
    conds.push('p.village = ?');
    params.push(filters.village);
  }
  if (filters?.ageGroup && filters.ageGroup !== 'All') {
    if (filters.ageGroup === 'Child (0-5)') conds.push('p.age <= 5');
    else if (filters.ageGroup === 'Adolescent (6-18)') conds.push('p.age >= 6 AND p.age <= 18');
    else if (filters.ageGroup === 'Adult (19-59)') conds.push('p.age >= 19 AND p.age <= 59');
    else if (filters.ageGroup === 'Senior (60+)') conds.push('p.age >= 60');
  }
  if (filters?.search && filters.search.trim()) {
    const q = `%${filters.search.trim()}%`;
    conds.push('(p.full_name LIKE ? OR p.person_code LIKE ? OR p.village LIKE ? OR p.phone LIKE ?)');
    params.push(q, q, q, q);
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  return db
    .prepare(
      `SELECT p.*, f.family_code, f.head_name
       FROM people p LEFT JOIN families f ON p.family_id = f.id
       ${where} ORDER BY p.id DESC`
    )
    .all(...params) as PersonRecord[];
}

export function createPerson(input: Omit<PersonRecord, 'id' | 'person_code' | 'created_at' | 'family_code' | 'head_name'>): PersonRecord {
  const seqRow = db
    .prepare(
      "SELECT MAX(COALESCE((SELECT MAX(id) FROM people), 0), COALESCE((SELECT seq FROM sqlite_sequence WHERE name = 'people'), 0)) as m"
    )
    .get() as { m: number };
  const code = `PER-KA-${2001 + seqRow.m}`;
  const info = db
    .prepare(
      `INSERT INTO people (person_code, family_id, full_name, age, gender, relation_to_head, phone, village, district, address, blood_group, category, chronic_conditions)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      code,
      input.family_id ?? null,
      input.full_name,
      input.age,
      input.gender || 'Female',
      input.relation_to_head || 'Member',
      input.phone || '',
      input.village,
      input.district,
      input.address || '',
      input.blood_group || 'Unknown',
      input.category || 'Adult',
      input.chronic_conditions || ''
    );
  return db
    .prepare('SELECT p.*, f.family_code, f.head_name FROM people p LEFT JOIN families f ON p.family_id = f.id WHERE p.id = ?')
    .get(info.lastInsertRowid) as PersonRecord;
}

export function updatePerson(
  id: number,
  input: Partial<Omit<PersonRecord, 'id' | 'person_code' | 'created_at' | 'family_code' | 'head_name'>>
): PersonRecord | null {
  const existing = db.prepare('SELECT * FROM people WHERE id = ?').get(id) as PersonRecord | undefined;
  if (!existing) return null;

  const nextPhone = input.phone !== undefined ? input.phone.trim() : existing.phone;
  const nextName = input.full_name !== undefined ? input.full_name.trim() : existing.full_name;
  const nextVillage = input.village !== undefined ? input.village.trim() : existing.village;
  const nextDistrict = input.district !== undefined ? input.district.trim() : existing.district;

  db.prepare(
    `UPDATE people SET
      family_id = ?, full_name = ?, age = ?, gender = ?, relation_to_head = ?,
      phone = ?, village = ?, district = ?, address = ?, blood_group = ?,
      category = ?, chronic_conditions = ?
     WHERE id = ?`
  ).run(
    input.family_id !== undefined ? input.family_id : existing.family_id,
    nextName || existing.full_name,
    input.age !== undefined ? input.age : existing.age,
    input.gender ?? existing.gender,
    input.relation_to_head !== undefined ? input.relation_to_head : existing.relation_to_head,
    nextPhone,
    nextVillage || existing.village,
    nextDistrict || existing.district,
    input.address !== undefined ? input.address : existing.address,
    input.blood_group ?? existing.blood_group,
    input.category ?? existing.category,
    input.chronic_conditions !== undefined ? input.chronic_conditions : existing.chronic_conditions,
    id
  );

  // Keep linked visits synchronized with updated patient phone & name
  if (nextPhone) {
    try {
      db.prepare('UPDATE visits SET beneficiary_phone = ? WHERE person_id = ?').run(nextPhone, id);
    } catch {
      // Ignore if visits table missing column
    }
  }

  return db
    .prepare(
      'SELECT p.*, f.family_code, f.head_name FROM people p LEFT JOIN families f ON p.family_id = f.id WHERE p.id = ?'
    )
    .get(id) as PersonRecord;
}

export function deletePerson(id: number): boolean {
  return db.prepare('DELETE FROM people WHERE id = ?').run(id).changes > 0;
}

/**
 * Permanently removes pre-seeded temporary/sample demo records while preserving:
 * - all real user accounts (users, sessions)
 * - all user-entered patients, families, visits, appointments, checkups, calls, notifications
 * - all 19 official NFHS-5 Karnataka reference indicators (health_indicators)
 */
export function clearTemporaryDemoData(): {
  removed: Record<string, number>;
  totalRemoved: number;
} {
  const SEED_FAMILY_CODES = [
    'FAM-KA-1001',
    'FAM-KA-1002',
    'FAM-KA-1003',
    'FAM-KA-1004',
    'FAM-KA-1005',
  ];
  const SEED_FAMILY_HEADS = [
    'Rameshappa G.',
    'Kiran Kumar',
    'Mahesh Gowda',
    'Hanumantha H.',
    'Abdul Rahman',
  ];
  const SEED_PERSON_CODES = [
    'PER-KA-2001',
    'PER-KA-2002',
    'PER-KA-2003',
    'PER-KA-2004',
    'PER-KA-2005',
    'PER-KA-2006',
    'PER-KA-2007',
    'PER-KA-2008',
    'PER-KA-2009',
  ];
  const SEED_PERSON_NAMES = [
    'Lakshmamma R.',
    'Rameshappa G.',
    'Aarav K.',
    'Sunitha K.',
    'Kavitha M.',
    'Baby Diya M.',
    'Basamma H.',
    'Razia Begum',
    'Imran R.',
  ];
  const SEED_SURVEY_TITLES = [
    'Monsoon Water, Hygiene & Immunization Audit',
    'Maternal Birth Preparedness & IFA Check',
  ];
  const SEED_REPORTERS = [
    'Shanta Bai',
    'Shanta Bai (ASHA-KA-4102)',
    'Renuka Patil',
    'Renuka Patil (ASHA-KA-3891)',
    'Savitha Devi',
    'Manjula G.',
    'Manjula G. (ASHA-KA-5114)',
  ];

  const removed: Record<string, number> = {};

  const tx = db.transaction(() => {
    const seedPersonRows = db
      .prepare(
        `SELECT id FROM people
         WHERE person_code IN (${SEED_PERSON_CODES.map(() => '?').join(',')})
           AND full_name IN (${SEED_PERSON_NAMES.map(() => '?').join(',')})`
      )
      .all(...SEED_PERSON_CODES, ...SEED_PERSON_NAMES) as Array<{ id: number }>;
    const seedPersonIds = seedPersonRows.map((r) => r.id);

    // 1. Seeded appointments (created_by = 'ASHA Schedule Seed' or attached to seed people)
    const apptTable = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'appointments'")
      .get();
    if (apptTable) {
      let count = db.prepare("DELETE FROM appointments WHERE created_by = 'ASHA Schedule Seed'").run().changes;
      if (seedPersonIds.length > 0) {
        count += db
          .prepare(`DELETE FROM appointments WHERE person_id IN (${seedPersonIds.map(() => '?').join(',')})`)
          .run(...seedPersonIds).changes;
      }
      removed.appointments = count;
    }

    // 2. Seeded visits (worker_id IS NULL or linked to seed people)
    let visitsCount = db.prepare('DELETE FROM visits WHERE worker_id IS NULL').run().changes;
    if (seedPersonIds.length > 0) {
      visitsCount += db
        .prepare(`DELETE FROM visits WHERE person_id IN (${seedPersonIds.map(() => '?').join(',')})`)
        .run(...seedPersonIds).changes;
    }
    removed.visits = visitsCount;

    // 3. Seeded maternal, child, danger alerts, checkups, voice interactions
    let alertsRemoved = 0;
    let checkupsRemoved = 0;
    let voiceRemoved = 0;
    if (seedPersonIds.length > 0) {
      const ph = seedPersonIds.map(() => '?').join(',');
      removed.maternal_records = db
        .prepare(`DELETE FROM maternal_records WHERE person_id IN (${ph})`)
        .run(...seedPersonIds).changes;
      removed.child_records = db
        .prepare(`DELETE FROM child_records WHERE person_id IN (${ph})`)
        .run(...seedPersonIds).changes;
      alertsRemoved += db
        .prepare(`DELETE FROM danger_alerts WHERE person_id IN (${ph})`)
        .run(...seedPersonIds).changes;
      checkupsRemoved += db
        .prepare(`DELETE FROM health_checkups WHERE person_id IN (${ph})`)
        .run(...seedPersonIds).changes;
      voiceRemoved += db
        .prepare(`DELETE FROM voice_interactions WHERE person_id IN (${ph})`)
        .run(...seedPersonIds).changes;
    }
    const rp = SEED_REPORTERS.map(() => '?').join(',');
    alertsRemoved += db
      .prepare(`DELETE FROM danger_alerts WHERE reported_by IN (${rp})`)
      .run(...SEED_REPORTERS).changes;
    checkupsRemoved += db
      .prepare(`DELETE FROM health_checkups WHERE recorded_by IN (${rp})`)
      .run(...SEED_REPORTERS).changes;
    voiceRemoved += db
      .prepare(`DELETE FROM voice_interactions WHERE saved_by IN (${rp})`)
      .run(...SEED_REPORTERS).changes;
    removed.danger_alerts = alertsRemoved;
    removed.health_checkups = checkupsRemoved;
    removed.voice_interactions = voiceRemoved;

    // 4. Seeded community surveys (cascades survey_responses)
    removed.community_surveys = db
      .prepare(
        `DELETE FROM community_surveys WHERE title IN (${SEED_SURVEY_TITLES.map(() => '?').join(',')})`
      )
      .run(...SEED_SURVEY_TITLES).changes;

    // 5. Seeded people & families (matched by both seed code and seed name to protect user-entered data)
    removed.people =
      seedPersonIds.length > 0
        ? db
            .prepare(`DELETE FROM people WHERE id IN (${seedPersonIds.map(() => '?').join(',')})`)
            .run(...seedPersonIds).changes
        : 0;
    removed.families = db
      .prepare(
        `DELETE FROM families
         WHERE family_code IN (${SEED_FAMILY_CODES.map(() => '?').join(',')})
           AND head_name IN (${SEED_FAMILY_HEADS.map(() => '?').join(',')})`
      )
      .run(...SEED_FAMILY_CODES, ...SEED_FAMILY_HEADS).changes;
  });

  tx();

  const totalRemoved = Object.values(removed).reduce((sum, n) => sum + n, 0);
  return { removed, totalRemoved };
}

// ---------- DANGER ALERTS ----------
export function listDangerAlerts(): DangerAlert[] {
  const rows = db.prepare('SELECT * FROM danger_alerts ORDER BY CASE status WHEN \'Active\' THEN 0 WHEN \'Referred to PHC/FRU\' THEN 1 ELSE 2 END, id DESC').all() as Array<
    Omit<DangerAlert, 'danger_signs'> & { danger_signs: string }
  >;
  return rows.map((r) => ({ ...r, danger_signs: safeJsonParse<string[]>(r.danger_signs, []) }));
}

export function createDangerAlert(input: Omit<DangerAlert, 'id' | 'created_at' | 'updated_at'>): DangerAlert {
  const info = db
    .prepare(
      `INSERT INTO danger_alerts (person_id, person_name, village, district, category, severity, danger_signs, guidance, referral_facility, status, reported_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.person_id ?? null,
      input.person_name,
      input.village,
      input.district,
      input.category,
      input.severity,
      JSON.stringify(input.danger_signs || []),
      input.guidance,
      input.referral_facility || 'Nearest PHC / FRU (Call 108)',
      input.status || 'Active',
      input.reported_by || 'ASHA Worker'
    );
  const row = db.prepare('SELECT * FROM danger_alerts WHERE id = ?').get(info.lastInsertRowid) as Omit<DangerAlert, 'danger_signs'> & { danger_signs: string };
  return { ...row, danger_signs: safeJsonParse<string[]>(row.danger_signs, []) };
}

export function updateDangerAlertStatus(id: number, status: DangerAlert['status']): DangerAlert | null {
  const info = db
    .prepare("UPDATE danger_alerts SET status = ?, updated_at = datetime('now') WHERE id = ?")
    .run(status, id);
  if (info.changes === 0) return null;
  const row = db.prepare('SELECT * FROM danger_alerts WHERE id = ?').get(id) as Omit<DangerAlert, 'danger_signs'> & { danger_signs: string };
  return { ...row, danger_signs: safeJsonParse<string[]>(row.danger_signs, []) };
}

// ---------- MATERNAL & CHILD ----------
export function listMaternalRecords(): MaternalRecord[] {
  const rows = db.prepare('SELECT * FROM maternal_records ORDER BY high_risk DESC, id DESC').all() as Array<
    Omit<MaternalRecord, 'high_risk'> & { high_risk: number }
  >;
  return rows.map((r) => ({ ...r, high_risk: Boolean(r.high_risk) }));
}

export function createMaternalRecord(input: Omit<MaternalRecord, 'id' | 'created_at'>): MaternalRecord {
  const info = db
    .prepare(
      `INSERT INTO maternal_records (person_id, mother_name, age, village, district, lmp_date, edd_date, gravida, para, anc_visits_completed, ifa_tablets_total, nutrition_status, hemoglobin_gdl, bp_reading, high_risk, high_risk_reasons, postnatal_status, next_anc_date, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.person_id ?? null,
      input.mother_name,
      input.age,
      input.village,
      input.district,
      input.lmp_date,
      input.edd_date,
      input.gravida ?? 1,
      input.para ?? 0,
      input.anc_visits_completed ?? 0,
      input.ifa_tablets_total ?? 0,
      input.nutrition_status || 'Normal',
      input.hemoglobin_gdl ?? null,
      input.bp_reading || '120/80',
      input.high_risk ? 1 : 0,
      input.high_risk_reasons || '',
      input.postnatal_status || 'Antenatal',
      input.next_anc_date || '',
      input.notes || ''
    );
  const row = db.prepare('SELECT * FROM maternal_records WHERE id = ?').get(info.lastInsertRowid) as Omit<MaternalRecord, 'high_risk'> & { high_risk: number };
  return { ...row, high_risk: Boolean(row.high_risk) };
}

export function updateMaternalRecord(id: number, input: Partial<MaternalRecord>): MaternalRecord | null {
  const existing = db.prepare('SELECT * FROM maternal_records WHERE id = ?').get(id) as (Omit<MaternalRecord, 'high_risk'> & { high_risk: number }) | undefined;
  if (!existing) return null;
  db.prepare(
    `UPDATE maternal_records SET anc_visits_completed = ?, ifa_tablets_total = ?, nutrition_status = ?, hemoglobin_gdl = ?, bp_reading = ?, high_risk = ?, high_risk_reasons = ?, postnatal_status = ?, next_anc_date = ?, notes = ? WHERE id = ?`
  ).run(
    input.anc_visits_completed ?? existing.anc_visits_completed,
    input.ifa_tablets_total ?? existing.ifa_tablets_total,
    input.nutrition_status ?? existing.nutrition_status,
    input.hemoglobin_gdl !== undefined ? input.hemoglobin_gdl : existing.hemoglobin_gdl,
    input.bp_reading ?? existing.bp_reading,
    input.high_risk !== undefined ? (input.high_risk ? 1 : 0) : existing.high_risk,
    input.high_risk_reasons ?? existing.high_risk_reasons,
    input.postnatal_status ?? existing.postnatal_status,
    input.next_anc_date ?? existing.next_anc_date,
    input.notes ?? existing.notes,
    id
  );
  const row = db.prepare('SELECT * FROM maternal_records WHERE id = ?').get(id) as Omit<MaternalRecord, 'high_risk'> & { high_risk: number };
  return { ...row, high_risk: Boolean(row.high_risk) };
}

export function listChildRecords(): ChildRecord[] {
  const rows = db.prepare('SELECT * FROM child_records ORDER BY id DESC').all() as Array<
    Omit<ChildRecord, 'vaccines_completed'> & { vaccines_completed: string }
  >;
  return rows.map((r) => ({ ...r, vaccines_completed: safeJsonParse<string[]>(r.vaccines_completed, []) }));
}

export function createChildRecord(input: Omit<ChildRecord, 'id' | 'created_at'>): ChildRecord {
  const info = db
    .prepare(
      `INSERT INTO child_records (person_id, child_name, mother_name, dob, gender, village, district, birth_weight_kg, current_weight_kg, current_height_cm, nutrition_status, vaccines_completed, next_vaccine, next_vaccine_date, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.person_id ?? null,
      input.child_name,
      input.mother_name,
      input.dob,
      input.gender || 'Female',
      input.village,
      input.district,
      input.birth_weight_kg ?? null,
      input.current_weight_kg ?? null,
      input.current_height_cm ?? null,
      input.nutrition_status || 'Normal',
      JSON.stringify(input.vaccines_completed || []),
      input.next_vaccine || '',
      input.next_vaccine_date || '',
      input.notes || ''
    );
  const row = db.prepare('SELECT * FROM child_records WHERE id = ?').get(info.lastInsertRowid) as Omit<ChildRecord, 'vaccines_completed'> & { vaccines_completed: string };
  return { ...row, vaccines_completed: safeJsonParse<string[]>(row.vaccines_completed, []) };
}

export function updateChildRecord(id: number, input: Partial<ChildRecord>): ChildRecord | null {
  const existing = db.prepare('SELECT * FROM child_records WHERE id = ?').get(id) as (Omit<ChildRecord, 'vaccines_completed'> & { vaccines_completed: string }) | undefined;
  if (!existing) return null;
  db.prepare(
    `UPDATE child_records SET current_weight_kg = ?, current_height_cm = ?, nutrition_status = ?, vaccines_completed = ?, next_vaccine = ?, next_vaccine_date = ?, notes = ? WHERE id = ?`
  ).run(
    input.current_weight_kg !== undefined ? input.current_weight_kg : existing.current_weight_kg,
    input.current_height_cm !== undefined ? input.current_height_cm : existing.current_height_cm,
    input.nutrition_status ?? existing.nutrition_status,
    input.vaccines_completed ? JSON.stringify(input.vaccines_completed) : existing.vaccines_completed,
    input.next_vaccine ?? existing.next_vaccine,
    input.next_vaccine_date ?? existing.next_vaccine_date,
    input.notes ?? existing.notes,
    id
  );
  const row = db.prepare('SELECT * FROM child_records WHERE id = ?').get(id) as Omit<ChildRecord, 'vaccines_completed'> & { vaccines_completed: string };
  return { ...row, vaccines_completed: safeJsonParse<string[]>(row.vaccines_completed, []) };
}

// ---------- COMMUNITY SURVEYS ----------
export function listSurveys(): CommunitySurvey[] {
  const rows = db
    .prepare(
      `SELECT s.*,
        (SELECT COUNT(*) FROM survey_responses r WHERE r.survey_id = s.id) as response_count,
        (SELECT COUNT(*) FROM survey_responses r WHERE r.survey_id = s.id AND r.status = 'Completed') as completed_count
       FROM community_surveys s ORDER BY s.id DESC`
    )
    .all() as Array<
      Omit<CommunitySurvey, 'questions'> & { questions_json: string; response_count: number; completed_count: number }
    >;
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    topic: r.topic,
    village: r.village,
    district: r.district,
    status: r.status,
    questions: safeJsonParse<SurveyQuestion[]>(r.questions_json, []),
    target_households: r.target_households,
    response_count: r.response_count,
    completed_count: r.completed_count,
    pending_count: Math.max(0, r.target_households - r.completed_count),
    created_at: r.created_at,
  }));
}

export function createSurvey(input: {
  title: string;
  topic: string;
  village: string;
  district: string;
  target_households: number;
  questions: SurveyQuestion[];
}): CommunitySurvey {
  const info = db
    .prepare(
      `INSERT INTO community_surveys (title, topic, village, district, status, questions_json, target_households)
       VALUES (?, ?, ?, ?, 'Active', ?, ?)`
    )
    .run(input.title, input.topic, input.village, input.district, JSON.stringify(input.questions), input.target_households || 10);
  return listSurveys().find((s) => s.id === Number(info.lastInsertRowid))!;
}

export function listSurveyResponses(surveyId?: number): SurveyResponseRecord[] {
  const rows = (
    surveyId
      ? db.prepare('SELECT * FROM survey_responses WHERE survey_id = ? ORDER BY id DESC').all(surveyId)
      : db.prepare('SELECT * FROM survey_responses ORDER BY id DESC').all()
  ) as Array<Omit<SurveyResponseRecord, 'answers'> & { answers_json: string }>;
  return rows.map((r) => ({
    id: r.id,
    survey_id: r.survey_id,
    family_id: r.family_id,
    respondent_name: r.respondent_name,
    village: r.village,
    answers: safeJsonParse<Record<string, string>>(r.answers_json, {}),
    status: r.status,
    submitted_by: r.submitted_by,
    created_at: r.created_at,
  }));
}

export function createSurveyResponse(input: {
  survey_id: number;
  family_id?: number | null;
  respondent_name: string;
  village: string;
  answers: Record<string, string>;
  status?: 'Completed' | 'Pending';
  submitted_by: string;
}): SurveyResponseRecord {
  const info = db
    .prepare(
      `INSERT INTO survey_responses (survey_id, family_id, respondent_name, village, answers_json, status, submitted_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.survey_id,
      input.family_id ?? null,
      input.respondent_name,
      input.village,
      JSON.stringify(input.answers || {}),
      input.status || 'Completed',
      input.submitted_by
    );
  const row = db.prepare('SELECT * FROM survey_responses WHERE id = ?').get(info.lastInsertRowid) as Omit<SurveyResponseRecord, 'answers'> & { answers_json: string };
  return { ...row, answers: safeJsonParse<Record<string, string>>(row.answers_json, {}) };
}

// ---------- HEALTH CHECKUPS ----------
export function computeCheckupFlags(input: {
  bp_systolic: number | null;
  bp_diastolic: number | null;
  temperature_c: number | null;
  blood_sugar_mgdl: number | null;
  hemoglobin_gdl: number | null;
  spo2_pct: number | null;
}): string[] {
  const flags: string[] = [];
  if (
    (input.bp_systolic !== null && input.bp_systolic >= 140) ||
    (input.bp_diastolic !== null && input.bp_diastolic >= 90)
  ) {
    flags.push(`Elevated Blood Pressure (${input.bp_systolic ?? '-'}/${input.bp_diastolic ?? '-'} mmHg — WHO threshold >=140/90)`);
  }
  if (input.temperature_c !== null && input.temperature_c >= 38.0) {
    flags.push(`Fever detected (${input.temperature_c}°C — threshold >=38.0°C)`);
  }
  if (input.blood_sugar_mgdl !== null && input.blood_sugar_mgdl >= 200) {
    flags.push(`High Blood Sugar (${input.blood_sugar_mgdl} mg/dL — urgent diabetes evaluation >=200)`);
  } else if (input.blood_sugar_mgdl !== null && input.blood_sugar_mgdl < 70) {
    flags.push(`Low Blood Sugar / Hypoglycemia (${input.blood_sugar_mgdl} mg/dL — <70 mg/dL)`);
  }
  if (input.hemoglobin_gdl !== null && input.hemoglobin_gdl < 7.0) {
    flags.push(`Severe Anaemia (Hb ${input.hemoglobin_gdl} g/dL — urgent referral <7.0 g/dL)`);
  } else if (input.hemoglobin_gdl !== null && input.hemoglobin_gdl < 11.0) {
    flags.push(`Anaemia (Hb ${input.hemoglobin_gdl} g/dL — WHO cutoff <11.0 g/dL)`);
  }
  if (input.spo2_pct !== null && input.spo2_pct < 94) {
    flags.push(`Low Oxygen Saturation (SpO2 ${input.spo2_pct}% — immediate medical review <94%)`);
  }
  return flags;
}

export function listCheckups(): HealthCheckupRecord[] {
  const rows = db.prepare('SELECT * FROM health_checkups ORDER BY checkup_date DESC, id DESC').all() as Array<
    Omit<HealthCheckupRecord, 'clinical_flags'> & { clinical_flags: string }
  >;
  return rows.map((r) => ({ ...r, clinical_flags: safeJsonParse<string[]>(r.clinical_flags, []) }));
}

export function createCheckup(
  input: Omit<HealthCheckupRecord, 'id' | 'clinical_flags' | 'summary' | 'created_at'>
): HealthCheckupRecord {
  const flags = computeCheckupFlags(input);
  const summary =
    flags.length > 0
      ? `Medical attention recommended (${flags.length} clinical flag${flags.length > 1 ? 's' : ''}): ${flags.join('; ')}. Refer to PHC Medical Officer for clinical evaluation.`
      : 'All recorded checkup measurements are within standard primary-care reference ranges. Continue routine follow-up.';
  const status: HealthCheckupRecord['status'] =
    input.status || (flags.length > 0 ? 'Pending Follow-up' : 'Completed');

  const info = db
    .prepare(
      `INSERT INTO health_checkups (person_id, person_name, village, district, checkup_date, bp_systolic, bp_diastolic, temperature_c, weight_kg, blood_sugar_mgdl, hemoglobin_gdl, spo2_pct, symptoms, observations, clinical_flags, status, summary, recorded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.person_id ?? null,
      input.person_name,
      input.village,
      input.district,
      input.checkup_date,
      input.bp_systolic ?? null,
      input.bp_diastolic ?? null,
      input.temperature_c ?? null,
      input.weight_kg ?? null,
      input.blood_sugar_mgdl ?? null,
      input.hemoglobin_gdl ?? null,
      input.spo2_pct ?? null,
      input.symptoms || '',
      input.observations || '',
      JSON.stringify(flags),
      status,
      summary,
      input.recorded_by || 'ASHA Worker'
    );
  const row = db.prepare('SELECT * FROM health_checkups WHERE id = ?').get(info.lastInsertRowid) as Omit<HealthCheckupRecord, 'clinical_flags'> & { clinical_flags: string };
  return { ...row, clinical_flags: safeJsonParse<string[]>(row.clinical_flags, []) };
}

// ---------- VOICE INTERACTIONS ----------
export function listVoiceInteractions(): VoiceInteractionRecord[] {
  const rows = db.prepare('SELECT * FROM voice_interactions ORDER BY id DESC').all() as Array<
    Omit<VoiceInteractionRecord, 'emergency_detected'> & { emergency_detected: number }
  >;
  return rows.map((r) => ({ ...r, emergency_detected: Boolean(r.emergency_detected) }));
}

export function createVoiceInteraction(input: Omit<VoiceInteractionRecord, 'id' | 'created_at'>): VoiceInteractionRecord {
  const info = db
    .prepare(
      `INSERT INTO voice_interactions (person_id, person_name, village, language, transcript, guidance_text, emergency_detected, saved_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.person_id ?? null,
      input.person_name || 'Community Member',
      input.village || '',
      input.language || 'en',
      input.transcript,
      input.guidance_text,
      input.emergency_detected ? 1 : 0,
      input.saved_by || 'ASHA Worker'
    );
  const row = db.prepare('SELECT * FROM voice_interactions WHERE id = ?').get(info.lastInsertRowid) as Omit<VoiceInteractionRecord, 'emergency_detected'> & { emergency_detected: number };
  return { ...row, emergency_detected: Boolean(row.emergency_detected) };
}

// ---------- OFFICIAL DATA FILES & INDICATOR REGISTRY ----------
export function listIndicators(category?: string, search?: string): HealthIndicator[] {
  const conds: string[] = [];
  const params: unknown[] = [];
  if (category && category !== 'All Categories') {
    conds.push('category = ?');
    params.push(category);
  }
  if (search && search.trim()) {
    const q = `%${search.trim()}%`;
    conds.push('(indicator_id LIKE ? OR indicator_name LIKE ? OR category LIKE ? OR geography LIKE ? OR source LIKE ?)');
    params.push(q, q, q, q, q);
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const rows = db
    .prepare(`SELECT * FROM health_indicators ${where} ORDER BY id ASC`)
    .all(...params) as Array<Omit<HealthIndicator, 'metadata_json'> & { metadata_json: string }>;
  return rows.map((r) => ({
    ...r,
    metadata_json: safeJsonParse<Record<string, string>>(r.metadata_json, {}),
  }));
}

export function listDatasetImports(): DatasetImportLog[] {
  return db.prepare('SELECT * FROM dataset_imports ORDER BY id DESC LIMIT 25').all() as DatasetImportLog[];
}

export function importHealthIndicators(payload: {
  filename: string;
  source_name: string;
  file_format: string;
  mode: 'append' | 'replace';
  confirmReplace?: boolean;
  imported_by: string;
  rows: Array<{
    indicator_id: string;
    indicator_name: string;
    category: string;
    geography: string;
    value: string;
    unit?: string;
    period: string;
    source: string;
    source_url?: string;
    methodology?: string;
    denominator?: string;
    disaggregation?: string;
    confidence_notes?: string;
    metadata_json?: Record<string, string>;
  }>;
}): {
  added: number;
  updated: number;
  skipped: number;
  errors: string[];
  importLog: DatasetImportLog;
} {
  let added = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  const allowReplace = payload.mode === 'replace' && payload.confirmReplace === true;

  const logInfo = db
    .prepare(
      `INSERT INTO dataset_imports (filename, source_name, file_format, records_added, records_updated, records_skipped, mode, imported_by)
       VALUES (?, ?, ?, 0, 0, 0, ?, ?)`
    )
    .run(payload.filename, payload.source_name, payload.file_format, allowReplace ? 'replace' : 'append', payload.imported_by);
  const batchId = Number(logInfo.lastInsertRowid);

  const findStmt = db.prepare('SELECT id FROM health_indicators WHERE indicator_id = ?');
  const insertStmt = db.prepare(`
    INSERT INTO health_indicators (
      indicator_id, indicator_name, category, geography, value, unit, period, source,
      source_url, methodology, denominator, disaggregation, confidence_notes, dataset_origin,
      import_batch_id, metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Custom Upload', ?, ?)
  `);
  const updateStmt = db.prepare(`
    UPDATE health_indicators SET
      indicator_name = ?, category = ?, geography = ?, value = ?, unit = ?, period = ?, source = ?,
      source_url = ?, methodology = ?, denominator = ?, disaggregation = ?, confidence_notes = ?,
      dataset_origin = 'Custom Upload', import_batch_id = ?, imported_at = datetime('now'), metadata_json = ?
    WHERE indicator_id = ?
  `);

  const seenInBatch = new Set<string>();

  const tx = db.transaction(() => {
    for (let i = 0; i < payload.rows.length; i++) {
      const r = payload.rows[i];
      const indId = String(r.indicator_id || '').trim();
      const indName = String(r.indicator_name || '').trim();
      const val = String(r.value ?? '').trim();
      if (!indId || !indName || !val) {
        errors.push(`Row ${i + 1}: Missing required indicator_id, indicator_name, or value.`);
        skipped++;
        continue;
      }
      if (seenInBatch.has(indId.toLowerCase())) {
        skipped++;
        continue;
      }
      seenInBatch.add(indId.toLowerCase());

      const existing = findStmt.get(indId) as { id: number } | undefined;
      if (existing) {
        if (allowReplace) {
          updateStmt.run(
            indName,
            r.category || 'General Public Health',
            r.geography || 'Karnataka (State)',
            val,
            r.unit || '%',
            r.period || 'Unspecified',
            r.source || payload.source_name,
            r.source_url || '',
            r.methodology || 'Uploaded Public Health Dataset',
            r.denominator || 'As reported in source dataset',
            r.disaggregation || 'Total',
            r.confidence_notes || `Imported from ${payload.filename}`,
            batchId,
            JSON.stringify(r.metadata_json || { imported_file: payload.filename }),
            indId
          );
          updated++;
        } else {
          skipped++;
        }
      } else {
        insertStmt.run(
          indId,
          indName,
          r.category || 'General Public Health',
          r.geography || 'Karnataka (State)',
          val,
          r.unit || '%',
          r.period || 'Unspecified',
          r.source || payload.source_name,
          r.source_url || '',
          r.methodology || 'Uploaded Public Health Dataset',
          r.denominator || 'As reported in source dataset',
          r.disaggregation || 'Total',
          r.confidence_notes || `Imported from ${payload.filename}`,
          batchId,
          JSON.stringify(r.metadata_json || { imported_file: payload.filename })
        );
        added++;
      }
    }

    db.prepare(
      'UPDATE dataset_imports SET records_added = ?, records_updated = ?, records_skipped = ? WHERE id = ?'
    ).run(added, updated, skipped, batchId);
  });

  tx();

  const importLog = db.prepare('SELECT * FROM dataset_imports WHERE id = ?').get(batchId) as DatasetImportLog;
  return { added, updated, skipped, errors, importLog };
}

// ---------- LIVE REPORTS AGGREGATION ----------
export function getReportsSummary(): ReportsSummary {
  const familiesCount = (db.prepare('SELECT COUNT(*) as c FROM families').get() as { c: number }).c;
  const peopleCount = (db.prepare('SELECT COUNT(*) as c FROM people').get() as { c: number }).c;
  const visitsCount = (db.prepare('SELECT COUNT(*) as c FROM visits').get() as { c: number }).c;
  const pregnantCount = (db.prepare('SELECT COUNT(*) as c FROM maternal_records').get() as { c: number }).c;
  const highRiskMat = (db.prepare('SELECT COUNT(*) as c FROM maternal_records WHERE high_risk = 1').get() as { c: number }).c;
  const childrenRows = listChildRecords();
  const childrenCount = childrenRows.length;
  const vaccinatedChildren = childrenRows.filter((c) => c.vaccines_completed.length >= 3).length;
  const totalVaccinesLogged = childrenRows.reduce((acc, c) => acc + c.vaccines_completed.length, 0);
  const completedCheckups = (db.prepare("SELECT COUNT(*) as c FROM health_checkups WHERE status = 'Completed'").get() as { c: number }).c;
  const pendingCheckups = (db.prepare("SELECT COUNT(*) as c FROM health_checkups WHERE status != 'Completed'").get() as { c: number }).c;
  const activeAlerts = (db.prepare("SELECT COUNT(*) as c FROM danger_alerts WHERE status != 'Resolved'").get() as { c: number }).c;
  const resolvedAlerts = (db.prepare("SELECT COUNT(*) as c FROM danger_alerts WHERE status = 'Resolved'").get() as { c: number }).c;
  const voiceCount = (db.prepare('SELECT COUNT(*) as c FROM voice_interactions').get() as { c: number }).c;

  // Village-wise aggregation from real tables
  const villageMap = new Map<
    string,
    { village: string; district: string; families: number; people: number; visits: number; checkups: number; activeAlerts: number }
  >();
  const ensureVillage = (village: string, district: string) => {
    const key = village.trim() || 'Unspecified';
    if (!villageMap.has(key)) {
      villageMap.set(key, { village: key, district: district || 'Karnataka', families: 0, people: 0, visits: 0, checkups: 0, activeAlerts: 0 });
    }
    return villageMap.get(key)!;
  };

  for (const r of db.prepare('SELECT village, district, COUNT(*) as c FROM families GROUP BY village, district').all() as Array<{ village: string; district: string; c: number }>) {
    ensureVillage(r.village, r.district).families += r.c;
  }
  for (const r of db.prepare('SELECT village, district, COUNT(*) as c FROM people GROUP BY village, district').all() as Array<{ village: string; district: string; c: number }>) {
    ensureVillage(r.village, r.district).people += r.c;
  }
  for (const r of db.prepare('SELECT village, district, COUNT(*) as c FROM visits GROUP BY village, district').all() as Array<{ village: string; district: string; c: number }>) {
    ensureVillage(r.village, r.district).visits += r.c;
  }
  for (const r of db.prepare('SELECT village, district, COUNT(*) as c FROM health_checkups GROUP BY village, district').all() as Array<{ village: string; district: string; c: number }>) {
    ensureVillage(r.village, r.district).checkups += r.c;
  }
  for (const r of db.prepare("SELECT village, district, COUNT(*) as c FROM danger_alerts WHERE status != 'Resolved' GROUP BY village, district").all() as Array<{ village: string; district: string; c: number }>) {
    ensureVillage(r.village, r.district).activeAlerts += r.c;
  }

  // Monthly activity aggregation
  const monthMap = new Map<string, { month: string; visits: number; checkups: number; alerts: number }>();
  const ensureMonth = (ym: string) => {
    if (!monthMap.has(ym)) monthMap.set(ym, { month: ym, visits: 0, checkups: 0, alerts: 0 });
    return monthMap.get(ym)!;
  };
  for (const r of db.prepare("SELECT substr(visit_date, 1, 7) as m, COUNT(*) as c FROM visits GROUP BY m").all() as Array<{ m: string; c: number }>) {
    if (r.m) ensureMonth(r.m).visits += r.c;
  }
  for (const r of db.prepare("SELECT substr(checkup_date, 1, 7) as m, COUNT(*) as c FROM health_checkups GROUP BY m").all() as Array<{ m: string; c: number }>) {
    if (r.m) ensureMonth(r.m).checkups += r.c;
  }
  for (const r of db.prepare("SELECT substr(created_at, 1, 7) as m, COUNT(*) as c FROM danger_alerts GROUP BY m").all() as Array<{ m: string; c: number }>) {
    if (r.m) ensureMonth(r.m).alerts += r.c;
  }

  return {
    totals: {
      families: familiesCount,
      people: peopleCount,
      visits: visitsCount,
      pregnantWomen: pregnantCount,
      highRiskPregnancies: highRiskMat,
      children: childrenCount,
      vaccinatedChildren,
      totalVaccinesLogged,
      completedCheckups,
      pendingCheckups,
      activeAlerts,
      resolvedAlerts,
      voiceInteractions: voiceCount,
    },
    villageStats: Array.from(villageMap.values()).sort((a, b) => b.visits + b.people - (a.visits + a.people)),
    monthlyActivity: Array.from(monthMap.values()).sort((a, b) => a.month.localeCompare(b.month)),
  };
}
