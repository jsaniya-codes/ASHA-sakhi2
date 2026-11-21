export type UserRole = 'asha' | 'supervisor';

export type VisitLanguage = 'kn' | 'hi' | 'en';
export type AppLanguage = 'en' | 'kn' | 'hi' | 'te' | 'ta' | 'mr';
export type FontScale = 'normal' | 'large' | 'xlarge';

export type RiskLevel = 'Low' | 'Moderate' | 'High';

export type BeneficiaryGender = 'Female' | 'Male' | 'Other';

export type BeneficiaryCategory =
  | 'Pregnant Woman'
  | 'Lactating Mother'
  | 'Child (0-5y)'
  | 'Adolescent Girl';

export type PersonCategory =
  | 'Pregnant Woman'
  | 'Lactating Mother'
  | 'Child (0-5y)'
  | 'Adolescent Girl'
  | 'Adult'
  | 'Senior';

export type KarnatakaDivision =
  | 'Bengaluru'
  | 'Mysuru'
  | 'Belagavi'
  | 'Kalaburagi';

export type ActiveWorkspaceView =
  | 'speak-record'
  | 'explain-video'
  | 'visit-register'
  | 'schedule-calendar'
  | 'danger-alerts'
  | 'maternal-child'
  | 'patient-notifications'
  | 'village-families'
  | 'people-directory'
  | 'community-surveys'
  | 'health-checkup'
  | 'health-histories'
  | 'reports'
  | 'state-overview'
  | 'data-files';

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  mobile_number: string;
  full_name: string;
  role: UserRole;
  district: string;
  phc_center: string;
  created_at: string;
}

export interface FieldVisit {
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
  risk_flags: string[];
  recommended_action: string;
  follow_up_date: string;
  lat: number;
  lng: number;
  visit_date: string;
  created_at: string;
}

export interface VisitInput {
  family_id?: number | null;
  person_id?: number | null;
  beneficiary_name: string;
  beneficiary_phone?: string;
  beneficiary_age: number | null;
  beneficiary_gender: BeneficiaryGender;
  beneficiary_category: BeneficiaryCategory;
  district: string;
  village: string;
  phc_center: string;
  language: VisitLanguage;
  purpose?: string;
  status?: 'Completed' | 'Scheduled' | 'Follow-up Due';
  notes?: string;
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
  risk_flags: string[];
  recommended_action: string;
  follow_up_date: string;
  lat: number;
  lng: number;
  visit_date: string;
}

export interface ExtractedClinicalData {
  beneficiary_name: string;
  beneficiary_phone?: string;
  beneficiary_age: number | null;
  beneficiary_gender: BeneficiaryGender;
  beneficiary_category: BeneficiaryCategory;
  district: string;
  village: string;
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
  risk_flags: string[];
  recommended_action: string;
  follow_up_date: string;
  readback_summary: string;
}

export interface VoiceGuidanceResult {
  guidance: string;
  key_steps: string[];
  danger_signs: string[];
  is_emergency: boolean;
  medical_disclaimer: string;
  provider: string;
}

export interface FamilyRecord {
  id: number;
  family_code: string;
  head_name: string;
  village: string;
  district: string;
  address: string;
  phone: string;
  ration_card_type: string;
  water_source: string;
  toilet_access: string;
  notes: string;
  member_count?: number;
  created_at: string;
}

export interface PersonRecord {
  id: number;
  person_code: string;
  family_id: number | null;
  family_code?: string | null;
  head_name?: string | null;
  full_name: string;
  age: number;
  gender: BeneficiaryGender;
  relation_to_head: string;
  phone: string;
  village: string;
  district: string;
  address: string;
  blood_group: string;
  category: PersonCategory;
  chronic_conditions: string;
  created_at: string;
}

export interface DangerAlert {
  id: number;
  person_id: number | null;
  person_name: string;
  village: string;
  district: string;
  category: 'Maternal' | 'Child' | 'Fever / General Illness';
  severity: 'Critical' | 'High' | 'Moderate';
  danger_signs: string[];
  guidance: string;
  referral_facility: string;
  status: 'Active' | 'Referred to PHC/FRU' | 'Resolved';
  reported_by: string;
  created_at: string;
  updated_at: string;
}

export interface MaternalRecord {
  id: number;
  person_id: number | null;
  mother_name: string;
  age: number;
  village: string;
  district: string;
  lmp_date: string;
  edd_date: string;
  gravida: number;
  para: number;
  anc_visits_completed: number;
  ifa_tablets_total: number;
  nutrition_status: string;
  hemoglobin_gdl: number | null;
  bp_reading: string;
  high_risk: boolean;
  high_risk_reasons: string;
  postnatal_status: string;
  next_anc_date: string;
  notes: string;
  created_at: string;
}

export interface ChildRecord {
  id: number;
  person_id: number | null;
  child_name: string;
  mother_name: string;
  dob: string;
  gender: BeneficiaryGender;
  village: string;
  district: string;
  birth_weight_kg: number | null;
  current_weight_kg: number | null;
  current_height_cm: number | null;
  nutrition_status: string;
  vaccines_completed: string[];
  next_vaccine: string;
  next_vaccine_date: string;
  notes: string;
  created_at: string;
}

export interface SurveyQuestion {
  id: string;
  prompt: string;
  type: 'yes_no' | 'choice' | 'text' | 'number';
  options?: string[];
}

export interface CommunitySurvey {
  id: number;
  title: string;
  topic: string;
  village: string;
  district: string;
  status: 'Active' | 'Completed';
  questions: SurveyQuestion[];
  target_households: number;
  response_count?: number;
  completed_count?: number;
  pending_count?: number;
  created_at: string;
}

export interface SurveyResponseRecord {
  id: number;
  survey_id: number;
  family_id: number | null;
  respondent_name: string;
  village: string;
  answers: Record<string, string>;
  status: 'Completed' | 'Pending';
  submitted_by: string;
  created_at: string;
}

export interface HealthCheckupRecord {
  id: number;
  person_id: number | null;
  person_name: string;
  village: string;
  district: string;
  checkup_date: string;
  bp_systolic: number | null;
  bp_diastolic: number | null;
  temperature_c: number | null;
  weight_kg: number | null;
  blood_sugar_mgdl: number | null;
  hemoglobin_gdl: number | null;
  spo2_pct: number | null;
  symptoms: string;
  observations: string;
  clinical_flags: string[];
  status: 'Completed' | 'Pending Follow-up';
  summary: string;
  recorded_by: string;
  created_at: string;
}

export interface VoiceInteractionRecord {
  id: number;
  person_id: number | null;
  person_name: string;
  village: string;
  language: string;
  transcript: string;
  guidance_text: string;
  emergency_detected: boolean;
  saved_by: string;
  created_at: string;
}

export interface HealthIndicator {
  id: number;
  indicator_id: string;
  indicator_name: string;
  category: string;
  geography: string;
  value: string;
  unit: string;
  period: string;
  source: string;
  source_url: string;
  methodology: string;
  denominator: string;
  disaggregation: string;
  confidence_notes: string;
  dataset_origin: 'Official Imported' | 'Custom Upload';
  import_batch_id: number | null;
  imported_at: string;
  metadata_json: Record<string, string>;
}

export interface DatasetImportLog {
  id: number;
  filename: string;
  source_name: string;
  file_format: string;
  records_added: number;
  records_updated: number;
  records_skipped: number;
  mode: 'append' | 'replace';
  imported_by: string;
  imported_at: string;
}

export interface ReportsSummary {
  totals: {
    families: number;
    people: number;
    visits: number;
    pregnantWomen: number;
    highRiskPregnancies: number;
    children: number;
    vaccinatedChildren: number;
    totalVaccinesLogged: number;
    completedCheckups: number;
    pendingCheckups: number;
    activeAlerts: number;
    resolvedAlerts: number;
    voiceInteractions: number;
  };
  villageStats: Array<{
    village: string;
    district: string;
    families: number;
    people: number;
    visits: number;
    checkups: number;
    activeAlerts: number;
  }>;
  monthlyActivity: Array<{
    month: string;
    visits: number;
    checkups: number;
    alerts: number;
  }>;
}

export interface NFHS5District {
  district: string;
  division: KarnatakaDivision;
  lat: number;
  lng: number;
  samplePhcs: string[];
  institutionalBirthsPct: number;
  fourPlusAncPct: number;
  ifa100DaysPct: number;
  fullImmunizationPct: number;
  childStuntingPct: number;
  childWastingPct: number;
  childUnderweightPct: number;
  pregnantAnaemiaPct: number;
  allWomenAnaemiaPct: number;
  childAnaemiaPct: number;
  exclusiveBreastfeedingPct: number;
}

export interface DistrictPolicyBrief {
  district: string;
  executiveSummary: string;
  priorityGaps: string[];
  ashaFieldActions: string[];
  phcEscalationTargets: string[];
}

export interface VoicePreset {
  id: string;
  label: string;
  language: VisitLanguage;
  district: string;
  scenario: string;
  transcript: string;
}

// ---------- NEW MODULE 1: SMART SCHEDULE CALENDAR ----------

export type AppointmentType =
  | 'Home Visit'
  | 'Antenatal Checkup'
  | 'Vaccination'
  | 'Follow-up Visit';

export type AppointmentStatus = 'Scheduled' | 'Completed' | 'Missed' | 'Cancelled';

export interface AppointmentRecord {
  id: number;
  person_id: number;
  person_code: string;
  patient_name: string;
  patient_phone: string;
  patient_category: string;
  village: string;
  district: string;
  appointment_type: AppointmentType;
  appointment_date: string; // YYYY-MM-DD
  appointment_time: string; // HH:MM
  purpose: string;
  notes: string;
  status: AppointmentStatus;
  reminder_sent: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// ---------- NEW MODULE 2: DIRECT PATIENT CALLING ----------

export type CallOutcome =
  | 'Dialer Opened (Pending Outcome)'
  | 'Answered'
  | 'Not Answered'
  | 'Call Back Required';

export interface CallLogRecord {
  id: number;
  person_id: number;
  person_code?: string;
  patient_name?: string;
  village?: string;
  district?: string;
  phone_number: string;
  call_initiated_at: string;
  outcome: CallOutcome;
  notes: string;
  recorded_by: string;
  created_at: string;
}

// ---------- NEW MODULE 3: PATIENT NOTIFICATIONS & HEALTH UPDATES ----------

export type NotificationChannel = 'SMS' | 'WhatsApp';

export type NotificationCategory =
  | 'Appointment Reminder'
  | 'ANC Checkup Reminder'
  | 'Vaccination Reminder'
  | 'Follow-up Notification'
  | 'Recent Health Update'
  | 'Health Report Summary';

export type NotificationDeliveryStatus =
  | 'Sent'
  | 'Queued'
  | 'Failed'
  | 'Provider Not Configured';

export interface NotificationRecord {
  id: number;
  person_id: number;
  person_code?: string;
  patient_name?: string;
  village?: string;
  district?: string;
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
  created_at: string;
}

export interface MessagingProviderStatus {
  smsConfigured: boolean;
  whatsappConfigured: boolean;
  smsProvider: string;
  whatsappProvider: string;
}

// ---------- NEW MODULE 4: INDIVIDUAL PATIENT PDF REPORT ----------

export interface PatientFullReportData {
  generated_at: string;
  patient: PersonRecord;
  maternalRecords: MaternalRecord[];
  childRecords: ChildRecord[];
  checkups: HealthCheckupRecord[];
  visits: FieldVisit[];
  appointments: AppointmentRecord[];
  alerts: DangerAlert[];
  callLogs: CallLogRecord[];
  notifications: NotificationRecord[];
  voiceInteractions: VoiceInteractionRecord[];
}

