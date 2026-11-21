import { Router, type NextFunction, type Request, type Response } from 'express';
import {
  clearTemporaryDemoData,
  createCheckup,
  createChildRecord,
  createDangerAlert,
  createFamily,
  createMaternalRecord,
  createPerson,
  createSurvey,
  createSurveyResponse,
  createVoiceInteraction,
  deleteFamily,
  deletePerson,
  getReportsSummary,
  importHealthIndicators,
  listCheckups,
  listChildRecords,
  listDangerAlerts,
  listDatasetImports,
  listFamilies,
  listIndicators,
  listMaternalRecords,
  listPeople,
  listSurveyResponses,
  listSurveys,
  listVoiceInteractions,
  updateChildRecord,
  updateDangerAlertStatus,
  updateFamily,
  updateMaternalRecord,
  updatePerson,
} from './modulesDb.ts';
import type { AuthUser, BeneficiaryGender, DangerAlert, PersonCategory, SurveyQuestion } from '../src/types.ts';

interface AuthedRequest extends Request {
  user?: AuthUser;
}

type AuthMiddleware = (req: AuthedRequest, res: Response, next: NextFunction) => void;

function toNum(v: unknown, min: number, max: number): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

export function createModuleRouter(requireAuth: AuthMiddleware): Router {
  const router = Router();
  router.use(requireAuth);

  // ---------- VILLAGE FAMILIES ----------
  router.get('/families', (req, res) => {
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const village = typeof req.query.village === 'string' ? req.query.village : undefined;
    res.json({ families: listFamilies(search, village) });
  });

  router.post('/families', requireAuth, (req: AuthedRequest, res) => {
    const head_name = String(req.body?.head_name ?? '').trim();
    const village = String(req.body?.village ?? '').trim();
    const district = String(req.body?.district ?? 'Raichur').trim();
    if (head_name.length < 2 || village.length < 2) {
      res.status(400).json({ error: 'Head of family name and village are required (minimum 2 characters).' });
      return;
    }
    const family = createFamily({
      head_name: head_name.slice(0, 120),
      village: village.slice(0, 120),
      district: district.slice(0, 80),
      address: String(req.body?.address ?? '').trim().slice(0, 240),
      phone: String(req.body?.phone ?? '').trim().slice(0, 20),
      ration_card_type: String(req.body?.ration_card_type ?? 'BPL').trim().slice(0, 30),
      water_source: String(req.body?.water_source ?? 'Piped Tap Water').trim().slice(0, 80),
      toilet_access: String(req.body?.toilet_access ?? 'Individual Household Toilet').trim().slice(0, 80),
      notes: String(req.body?.notes ?? '').trim().slice(0, 400),
    });
    res.status(201).json({ family });
  });

  router.put('/families/:id', requireAuth, (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid family ID.' });
      return;
    }
    const updated = updateFamily(id, {
      head_name: req.body?.head_name ? String(req.body.head_name).trim().slice(0, 120) : undefined,
      village: req.body?.village ? String(req.body.village).trim().slice(0, 120) : undefined,
      district: req.body?.district ? String(req.body.district).trim().slice(0, 80) : undefined,
      address: req.body?.address !== undefined ? String(req.body.address).trim().slice(0, 240) : undefined,
      phone: req.body?.phone !== undefined ? String(req.body.phone).trim().slice(0, 20) : undefined,
      ration_card_type: req.body?.ration_card_type ? String(req.body.ration_card_type).trim().slice(0, 30) : undefined,
      water_source: req.body?.water_source ? String(req.body.water_source).trim().slice(0, 80) : undefined,
      toilet_access: req.body?.toilet_access ? String(req.body.toilet_access).trim().slice(0, 80) : undefined,
      notes: req.body?.notes !== undefined ? String(req.body.notes).trim().slice(0, 400) : undefined,
    });
    if (!updated) {
      res.status(404).json({ error: 'Family record not found.' });
      return;
    }
    res.json({ family: updated });
  });

  router.delete('/families/:id', requireAuth, (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid family ID.' });
      return;
    }
    if (!deleteFamily(id)) {
      res.status(404).json({ error: 'Family record not found.' });
      return;
    }
    res.json({ ok: true });
  });

  // ---------- PEOPLE DIRECTORY ----------
  router.get('/people', (req, res) => {
    const familyId = req.query.family_id ? Number(req.query.family_id) : undefined;
    res.json({
      people: listPeople({
        search: typeof req.query.search === 'string' ? req.query.search : undefined,
        village: typeof req.query.village === 'string' ? req.query.village : undefined,
        ageGroup: typeof req.query.age_group === 'string' ? req.query.age_group : undefined,
        familyId: Number.isInteger(familyId) ? familyId : undefined,
      }),
    });
  });

  router.post('/people', requireAuth, (req: AuthedRequest, res) => {
    const full_name = String(req.body?.full_name ?? '').trim();
    const village = String(req.body?.village ?? '').trim();
    const age = toNum(req.body?.age, 0, 115);
    if (full_name.length < 2 || village.length < 2 || age === null) {
      res.status(400).json({ error: 'Full name, valid age (0–115), and village are required.' });
      return;
    }
    const validGenders: BeneficiaryGender[] = ['Female', 'Male', 'Other'];
    const gender = validGenders.includes(req.body?.gender) ? req.body.gender : 'Female';
    const validCategories: PersonCategory[] = [
      'Pregnant Woman',
      'Lactating Mother',
      'Child (0-5y)',
      'Adolescent Girl',
      'Adult',
      'Senior',
    ];
    const category = validCategories.includes(req.body?.category) ? req.body.category : 'Adult';
    const familyIdRaw = toNum(req.body?.family_id, 1, 1_000_000);

    const person = createPerson({
      family_id: familyIdRaw,
      full_name: full_name.slice(0, 120),
      age: Math.round(age),
      gender,
      relation_to_head: String(req.body?.relation_to_head ?? 'Member').trim().slice(0, 40),
      phone: String(req.body?.phone ?? '').trim().slice(0, 20),
      village: village.slice(0, 120),
      district: String(req.body?.district ?? 'Raichur').trim().slice(0, 80),
      address: String(req.body?.address ?? '').trim().slice(0, 240),
      blood_group: String(req.body?.blood_group ?? 'Unknown').trim().slice(0, 10),
      category,
      chronic_conditions: String(req.body?.chronic_conditions ?? '').trim().slice(0, 300),
    });
    res.status(201).json({ person });
  });

  router.put('/people/:id', requireAuth, (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid person ID.' });
      return;
    }

    const full_name =
      req.body?.full_name !== undefined ? String(req.body.full_name).trim() : undefined;
    if (full_name !== undefined && full_name.length < 2) {
      res.status(400).json({ error: 'Full name must be at least 2 characters.' });
      return;
    }

    const village =
      req.body?.village !== undefined ? String(req.body.village).trim() : undefined;
    if (village !== undefined && village.length < 2) {
      res.status(400).json({ error: 'Village name must be at least 2 characters.' });
      return;
    }

    const age = req.body?.age !== undefined ? toNum(req.body.age, 0, 115) : undefined;
    if (req.body?.age !== undefined && age === null) {
      res.status(400).json({ error: 'Age must be between 0 and 115.' });
      return;
    }

    const validGenders: BeneficiaryGender[] = ['Female', 'Male', 'Other'];
    const gender =
      req.body?.gender !== undefined && validGenders.includes(req.body.gender)
        ? (req.body.gender as BeneficiaryGender)
        : undefined;

    const validCategories: PersonCategory[] = [
      'Pregnant Woman',
      'Lactating Mother',
      'Child (0-5y)',
      'Adolescent Girl',
      'Adult',
      'Senior',
    ];
    const category =
      req.body?.category !== undefined && validCategories.includes(req.body.category)
        ? (req.body.category as PersonCategory)
        : undefined;

    const familyIdRaw =
      req.body?.family_id === '' || req.body?.family_id === null
        ? null
        : req.body?.family_id !== undefined
        ? toNum(req.body.family_id, 1, 1_000_000)
        : undefined;

    const updated = updatePerson(id, {
      family_id: familyIdRaw,
      full_name: full_name?.slice(0, 120),
      age: age !== undefined && age !== null ? Math.round(age) : undefined,
      gender,
      relation_to_head:
        req.body?.relation_to_head !== undefined
          ? String(req.body.relation_to_head).trim().slice(0, 40)
          : undefined,
      phone:
        req.body?.phone !== undefined ? String(req.body.phone).trim().slice(0, 24) : undefined,
      village: village?.slice(0, 120),
      district:
        req.body?.district !== undefined
          ? String(req.body.district).trim().slice(0, 80)
          : undefined,
      address:
        req.body?.address !== undefined
          ? String(req.body.address).trim().slice(0, 240)
          : undefined,
      blood_group:
        req.body?.blood_group !== undefined
          ? String(req.body.blood_group).trim().slice(0, 10)
          : undefined,
      category,
      chronic_conditions:
        req.body?.chronic_conditions !== undefined
          ? String(req.body.chronic_conditions).trim().slice(0, 300)
          : undefined,
    });

    if (!updated) {
      res.status(404).json({ error: 'Person record not found.' });
      return;
    }
    res.json({ person: updated });
  });

  router.delete('/people/:id', requireAuth, (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid person ID.' });
      return;
    }
    if (!deletePerson(id)) {
      res.status(404).json({ error: 'Person record not found.' });
      return;
    }
    res.json({ ok: true });
  });

  // ---------- REMOVE TEMPORARY / DEMO DATA ----------
  router.post('/data-management/clear-temporary-data', requireAuth, (_req, res) => {
    const result = clearTemporaryDemoData();
    res.json({ ok: true, ...result });
  });

  // ---------- DANGER ALERTS ----------
  router.get('/alerts', (_req, res) => {
    res.json({ alerts: listDangerAlerts() });
  });

  router.post('/alerts', requireAuth, (req: AuthedRequest, res) => {
    const person_name = String(req.body?.person_name ?? '').trim();
    const village = String(req.body?.village ?? '').trim();
    const danger_signs = Array.isArray(req.body?.danger_signs)
      ? req.body.danger_signs.map((s: unknown) => String(s).trim()).filter(Boolean).slice(0, 12)
      : [];
    if (person_name.length < 2 || danger_signs.length === 0) {
      res.status(400).json({ error: 'Patient name and at least one danger sign are required.' });
      return;
    }
    const validCategories: Array<DangerAlert['category']> = ['Maternal', 'Child', 'Fever / General Illness'];
    const category = validCategories.includes(req.body?.category) ? req.body.category : 'Maternal';
    const validSeverities: Array<DangerAlert['severity']> = ['Critical', 'High', 'Moderate'];
    const severity = validSeverities.includes(req.body?.severity) ? req.body.severity : 'High';

    const alert = createDangerAlert({
      person_id: toNum(req.body?.person_id, 1, 1_000_000),
      person_name: person_name.slice(0, 120),
      village: (village || 'Unspecified').slice(0, 120),
      district: String(req.body?.district ?? 'Raichur').trim().slice(0, 80),
      category,
      severity,
      danger_signs,
      guidance:
        String(req.body?.guidance ?? '').trim().slice(0, 600) ||
        'Arrange immediate transport (108 ambulance) to the nearest PHC / FRU Medical Officer. Do not delay emergency medical care.',
      referral_facility: String(req.body?.referral_facility ?? 'Nearest PHC / FRU (Call 108)').trim().slice(0, 140),
      status: 'Active',
      reported_by: `${req.user!.full_name} (${req.user!.username})`,
    });
    res.status(201).json({ alert });
  });

  router.patch('/alerts/:id/status', requireAuth, (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const status = String(req.body?.status ?? '') as DangerAlert['status'];
    const validStatuses: Array<DangerAlert['status']> = ['Active', 'Referred to PHC/FRU', 'Resolved'];
    if (!Number.isInteger(id) || id <= 0 || !validStatuses.includes(status)) {
      res.status(400).json({ error: 'Valid alert ID and status are required.' });
      return;
    }
    const updated = updateDangerAlertStatus(id, status);
    if (!updated) {
      res.status(404).json({ error: 'Alert not found.' });
      return;
    }
    res.json({ alert: updated });
  });

  // ---------- MATERNAL & CHILD HEALTH ----------
  router.get('/maternal', (_req, res) => {
    res.json({ records: listMaternalRecords() });
  });

  router.post('/maternal', requireAuth, (req: AuthedRequest, res) => {
    const mother_name = String(req.body?.mother_name ?? '').trim();
    const village = String(req.body?.village ?? '').trim();
    const age = toNum(req.body?.age, 13, 55);
    if (mother_name.length < 2 || village.length < 2 || age === null) {
      res.status(400).json({ error: 'Mother name, valid age, and village are required.' });
      return;
    }
    const hb = toNum(req.body?.hemoglobin_gdl, 2, 20);
    const bpReading = String(req.body?.bp_reading ?? '120/80').trim();
    const bpMatch = bpReading.match(/(\d+)\s*\/\s*(\d+)/);
    const autoHighRisk =
      Boolean(req.body?.high_risk) ||
      (hb !== null && hb < 7.0) ||
      (bpMatch !== null && (Number(bpMatch[1]) >= 140 || Number(bpMatch[2]) >= 90));

    const record = createMaternalRecord({
      person_id: toNum(req.body?.person_id, 1, 1_000_000),
      mother_name: mother_name.slice(0, 120),
      age: Math.round(age),
      village: village.slice(0, 120),
      district: String(req.body?.district ?? 'Raichur').trim().slice(0, 80),
      lmp_date: String(req.body?.lmp_date ?? '').trim().slice(0, 20),
      edd_date: String(req.body?.edd_date ?? '').trim().slice(0, 20),
      gravida: Math.max(1, Math.round(Number(req.body?.gravida ?? 1) || 1)),
      para: Math.max(0, Math.round(Number(req.body?.para ?? 0) || 0)),
      anc_visits_completed: Math.max(0, Math.round(Number(req.body?.anc_visits_completed ?? 1) || 0)),
      ifa_tablets_total: Math.max(0, Math.round(Number(req.body?.ifa_tablets_total ?? 30) || 0)),
      nutrition_status: String(req.body?.nutrition_status ?? 'Normal').trim().slice(0, 60),
      hemoglobin_gdl: hb,
      bp_reading: bpReading.slice(0, 20),
      high_risk: autoHighRisk,
      high_risk_reasons: String(req.body?.high_risk_reasons ?? '').trim().slice(0, 300),
      postnatal_status: String(req.body?.postnatal_status ?? 'Antenatal').trim().slice(0, 60),
      next_anc_date: String(req.body?.next_anc_date ?? '').trim().slice(0, 20),
      notes: String(req.body?.notes ?? '').trim().slice(0, 400),
    });
    res.status(201).json({ record });
  });

  router.put('/maternal/:id', requireAuth, (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid maternal record ID.' });
      return;
    }
    const updated = updateMaternalRecord(id, req.body ?? {});
    if (!updated) {
      res.status(404).json({ error: 'Maternal record not found.' });
      return;
    }
    res.json({ record: updated });
  });

  router.get('/children', (_req, res) => {
    res.json({ records: listChildRecords() });
  });

  router.post('/children', requireAuth, (req: AuthedRequest, res) => {
    const child_name = String(req.body?.child_name ?? '').trim();
    const mother_name = String(req.body?.mother_name ?? '').trim();
    const dob = String(req.body?.dob ?? '').trim();
    if (child_name.length < 2 || mother_name.length < 2 || !dob) {
      res.status(400).json({ error: 'Child name, mother name, and date of birth are required.' });
      return;
    }
    const record = createChildRecord({
      person_id: toNum(req.body?.person_id, 1, 1_000_000),
      child_name: child_name.slice(0, 120),
      mother_name: mother_name.slice(0, 120),
      dob: dob.slice(0, 20),
      gender: (['Female', 'Male', 'Other'].includes(req.body?.gender) ? req.body.gender : 'Female') as BeneficiaryGender,
      village: String(req.body?.village ?? 'Manvi').trim().slice(0, 120),
      district: String(req.body?.district ?? 'Raichur').trim().slice(0, 80),
      birth_weight_kg: toNum(req.body?.birth_weight_kg, 0.5, 7),
      current_weight_kg: toNum(req.body?.current_weight_kg, 0.5, 40),
      current_height_cm: toNum(req.body?.current_height_cm, 30, 140),
      nutrition_status: String(req.body?.nutrition_status ?? 'Normal').trim().slice(0, 60),
      vaccines_completed: Array.isArray(req.body?.vaccines_completed)
        ? req.body.vaccines_completed.map((v: unknown) => String(v).trim()).filter(Boolean)
        : ['BCG', 'OPV-0'],
      next_vaccine: String(req.body?.next_vaccine ?? 'Penta-1 + OPV-1').trim().slice(0, 100),
      next_vaccine_date: String(req.body?.next_vaccine_date ?? '').trim().slice(0, 20),
      notes: String(req.body?.notes ?? '').trim().slice(0, 400),
    });
    res.status(201).json({ record });
  });

  router.put('/children/:id', requireAuth, (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid child record ID.' });
      return;
    }
    const updated = updateChildRecord(id, req.body ?? {});
    if (!updated) {
      res.status(404).json({ error: 'Child record not found.' });
      return;
    }
    res.json({ record: updated });
  });

  // ---------- COMMUNITY SURVEYS ----------
  router.get('/surveys', (_req, res) => {
    res.json({ surveys: listSurveys() });
  });

  router.post('/surveys', requireAuth, (req: AuthedRequest, res) => {
    const title = String(req.body?.title ?? '').trim();
    const topic = String(req.body?.topic ?? 'General Health').trim();
    const village = String(req.body?.village ?? 'All Villages').trim();
    const district = String(req.body?.district ?? 'Raichur').trim();
    const rawQuestions = Array.isArray(req.body?.questions) ? req.body.questions : [];
    const questions: SurveyQuestion[] = rawQuestions
      .map((q: Record<string, unknown>, idx: number) => ({
        id: String(q.id || `q${idx + 1}`),
        prompt: String(q.prompt || '').trim(),
        type: (['yes_no', 'choice', 'text', 'number'].includes(String(q.type)) ? q.type : 'text') as SurveyQuestion['type'],
        options: Array.isArray(q.options) ? q.options.map((o) => String(o).trim()).filter(Boolean) : undefined,
      }))
      .filter((q: SurveyQuestion) => q.prompt.length > 0);

    if (title.length < 3 || questions.length === 0) {
      res.status(400).json({ error: 'Survey title and at least one question are required.' });
      return;
    }
    const survey = createSurvey({
      title: title.slice(0, 160),
      topic: topic.slice(0, 80),
      village: village.slice(0, 120),
      district: district.slice(0, 80),
      target_households: Math.max(1, Math.min(500, Math.round(Number(req.body?.target_households ?? 10) || 10))),
      questions,
    });
    res.status(201).json({ survey });
  });

  router.get('/surveys/:id/responses', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid survey ID.' });
      return;
    }
    res.json({ responses: listSurveyResponses(id) });
  });

  router.post('/surveys/:id/responses', requireAuth, (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const respondent_name = String(req.body?.respondent_name ?? '').trim();
    if (!Number.isInteger(id) || id <= 0 || respondent_name.length < 2) {
      res.status(400).json({ error: 'Survey ID and respondent name are required.' });
      return;
    }
    const answersRaw = req.body?.answers && typeof req.body.answers === 'object' ? req.body.answers : {};
    const answers: Record<string, string> = {};
    for (const [k, v] of Object.entries(answersRaw as Record<string, unknown>)) {
      answers[String(k).slice(0, 40)] = String(v ?? '').trim().slice(0, 300);
    }
    const response = createSurveyResponse({
      survey_id: id,
      family_id: toNum(req.body?.family_id, 1, 1_000_000),
      respondent_name: respondent_name.slice(0, 120),
      village: String(req.body?.village ?? 'Manvi').trim().slice(0, 120),
      answers,
      status: req.body?.status === 'Pending' ? 'Pending' : 'Completed',
      submitted_by: `${req.user!.full_name} (${req.user!.username})`,
    });
    res.status(201).json({ response });
  });

  // ---------- HEALTH CHECKUPS ----------
  router.get('/checkups', (_req, res) => {
    res.json({ checkups: listCheckups() });
  });

  router.post('/checkups', requireAuth, (req: AuthedRequest, res) => {
    const person_name = String(req.body?.person_name ?? '').trim();
    const village = String(req.body?.village ?? '').trim();
    if (person_name.length < 2 || village.length < 2) {
      res.status(400).json({ error: 'Patient name and village are required.' });
      return;
    }
    const checkup = createCheckup({
      person_id: toNum(req.body?.person_id, 1, 1_000_000),
      person_name: person_name.slice(0, 120),
      village: village.slice(0, 120),
      district: String(req.body?.district ?? 'Raichur').trim().slice(0, 80),
      checkup_date: /^\d{4}-\d{2}-\d{2}$/.test(String(req.body?.checkup_date ?? ''))
        ? String(req.body.checkup_date)
        : new Date().toISOString().slice(0, 10),
      bp_systolic: toNum(req.body?.bp_systolic, 50, 260),
      bp_diastolic: toNum(req.body?.bp_diastolic, 30, 160),
      temperature_c: toNum(req.body?.temperature_c, 33, 43),
      weight_kg: toNum(req.body?.weight_kg, 1, 200),
      blood_sugar_mgdl: toNum(req.body?.blood_sugar_mgdl, 20, 700),
      hemoglobin_gdl: toNum(req.body?.hemoglobin_gdl, 2, 22),
      spo2_pct: toNum(req.body?.spo2_pct, 50, 100),
      symptoms: String(req.body?.symptoms ?? '').trim().slice(0, 400),
      observations: String(req.body?.observations ?? '').trim().slice(0, 600),
      status: req.body?.status === 'Pending Follow-up' ? 'Pending Follow-up' : 'Completed',
      recorded_by: `${req.user!.full_name} (${req.user!.username})`,
    });
    res.status(201).json({ checkup });
  });

  // ---------- VOICE INTERACTIONS (SAVED IN HEALTH HISTORIES) ----------
  router.get('/voice-interactions', (_req, res) => {
    res.json({ interactions: listVoiceInteractions() });
  });

  router.post('/voice-interactions', requireAuth, (req: AuthedRequest, res) => {
    const transcript = String(req.body?.transcript ?? '').trim();
    const guidance_text = String(req.body?.guidance_text ?? '').trim();
    if (transcript.length < 3 || guidance_text.length < 3) {
      res.status(400).json({ error: 'Transcript and guidance text are required to save voice history.' });
      return;
    }
    const interaction = createVoiceInteraction({
      person_id: toNum(req.body?.person_id, 1, 1_000_000),
      person_name: String(req.body?.person_name ?? 'Community Member').trim().slice(0, 120),
      village: String(req.body?.village ?? '').trim().slice(0, 120),
      language: String(req.body?.language ?? 'en').trim().slice(0, 12),
      transcript: transcript.slice(0, 4000),
      guidance_text: guidance_text.slice(0, 4000),
      emergency_detected: Boolean(req.body?.emergency_detected),
      saved_by: `${req.user!.full_name} (${req.user!.username})`,
    });
    res.status(201).json({ interaction });
  });

  // ---------- OFFICIAL PUBLIC HEALTH DATA FILES ----------
  router.get('/data-files/indicators', (req, res) => {
    const category = typeof req.query.category === 'string' ? req.query.category : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    res.json({
      indicators: listIndicators(category, search),
      imports: listDatasetImports(),
    });
  });

  router.post('/data-files/import', requireAuth, (req: AuthedRequest, res) => {
    const filename = String(req.body?.filename ?? 'uploaded-dataset').trim().slice(0, 180);
    const source_name = String(req.body?.source_name ?? 'Uploaded Public Health Dataset').trim().slice(0, 160);
    const file_format = String(req.body?.file_format ?? 'CSV').trim().toUpperCase().slice(0, 12);
    const mode = req.body?.mode === 'replace' ? 'replace' : 'append';
    const confirmReplace = req.body?.confirmReplace === true;
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];

    if (rows.length === 0 || rows.length > 1000) {
      res.status(400).json({ error: 'Provide between 1 and 1,000 validated indicator rows to import.' });
      return;
    }
    if (mode === 'replace' && !confirmReplace) {
      res.status(400).json({
        error: 'Explicit confirmation is required before replacing existing valid indicator records.',
      });
      return;
    }

    const result = importHealthIndicators({
      filename,
      source_name,
      file_format,
      mode,
      confirmReplace,
      imported_by: `${req.user!.full_name} (${req.user!.username})`,
      rows,
    });
    res.status(201).json(result);
  });

  // ---------- LIVE REPORTS AGGREGATION ----------
  router.get('/reports/summary', (_req, res) => {
    res.json(getReportsSummary());
  });

  return router;
}
