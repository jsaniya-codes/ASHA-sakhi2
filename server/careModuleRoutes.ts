import { Router, type NextFunction, type Request, type Response } from 'express';
import {
  createAppointment,
  createCallLog,
  createNotificationRecord,
  deleteAppointment,
  getAppointmentById,
  getPatientFullReportData,
  listAppointments,
  listCallLogs,
  listNotifications,
  personExists,
  updateAppointment,
  updateCallLog,
} from './careModulesDb.ts';
import {
  checkSmsPrivacyCompliance,
  dispatchPatientNotification,
  getMessagingProviderStatus,
  normalizePhoneE164,
} from './messaging.ts';
import type {
  AppointmentStatus,
  AppointmentType,
  AuthUser,
  CallOutcome,
  NotificationCategory,
  NotificationChannel,
} from '../src/types.ts';

interface AuthedRequest extends Request {
  user?: AuthUser;
}

type AuthMiddleware = (req: AuthedRequest, res: Response, next: NextFunction) => void;

const VALID_APPOINTMENT_TYPES = new Set<AppointmentType>([
  'Home Visit',
  'Antenatal Checkup',
  'Vaccination',
  'Follow-up Visit',
]);

const VALID_APPOINTMENT_STATUSES = new Set<AppointmentStatus>([
  'Scheduled',
  'Completed',
  'Missed',
  'Cancelled',
]);

const VALID_CALL_OUTCOMES = new Set<CallOutcome>([
  'Dialer Opened (Pending Outcome)',
  'Answered',
  'Not Answered',
  'Call Back Required',
]);

const VALID_NOTIFICATION_CHANNELS = new Set<NotificationChannel>(['SMS', 'WhatsApp']);

const VALID_NOTIFICATION_CATEGORIES = new Set<NotificationCategory>([
  'Appointment Reminder',
  'ANC Checkup Reminder',
  'Vaccination Reminder',
  'Follow-up Notification',
  'Recent Health Update',
  'Health Report Summary',
]);

const VALID_LANGUAGES = new Set(['en', 'kn', 'hi', 'te', 'ta', 'mr']);

export function createCareModuleRouter(requireAuth: AuthMiddleware): Router {
  const router = Router();
  router.use(requireAuth);

  // ====================================================================
  // FEATURE 1: SMART SCHEDULE CALENDAR (/api/appointments)
  // ====================================================================

  router.get('/appointments', (req, res) => {
    const personId = req.query.person_id ? Number(req.query.person_id) : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const fromDate =
      typeof req.query.from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.from)
        ? req.query.from
        : undefined;
    const toDate =
      typeof req.query.to === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.to)
        ? req.query.to
        : undefined;

    res.json({
      appointments: listAppointments({
        personId: personId && Number.isInteger(personId) && personId > 0 ? personId : undefined,
        status,
        fromDate,
        toDate,
      }),
    });
  });

  router.post('/appointments', (req: AuthedRequest, res) => {
    const person_id = Number(req.body?.person_id);
    if (!Number.isInteger(person_id) || person_id <= 0 || !personExists(person_id)) {
      res.status(400).json({ error: 'Please select a valid existing patient from the database.' });
      return;
    }

    const rawType = String(req.body?.appointment_type ?? 'Home Visit').trim() as AppointmentType;
    const appointment_type: AppointmentType = VALID_APPOINTMENT_TYPES.has(rawType)
      ? rawType
      : 'Home Visit';

    const appointment_date = String(req.body?.appointment_date ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(appointment_date)) {
      res.status(400).json({ error: 'Appointment date must be in YYYY-MM-DD format.' });
      return;
    }

    const rawTime = String(req.body?.appointment_time ?? '10:00').trim();
    const appointment_time = /^\d{2}:\d{2}$/.test(rawTime) ? rawTime : '10:00';

    const purpose = String(req.body?.purpose ?? '').trim();
    if (purpose.length < 3 || purpose.length > 200) {
      res.status(400).json({ error: 'Appointment purpose must be between 3 and 200 characters.' });
      return;
    }

    const notes = String(req.body?.notes ?? '').trim().slice(0, 600);
    const rawStatus = String(req.body?.status ?? 'Scheduled').trim() as AppointmentStatus;
    const status: AppointmentStatus = VALID_APPOINTMENT_STATUSES.has(rawStatus)
      ? rawStatus
      : 'Scheduled';

    const appointment = createAppointment({
      person_id,
      appointment_type,
      appointment_date,
      appointment_time,
      purpose,
      notes,
      status,
      created_by: `${req.user!.full_name} (${req.user!.username})`,
    });

    res.status(201).json({ appointment });
  });

  router.put('/appointments/:id', (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid appointment ID.' });
      return;
    }

    const existing = getAppointmentById(id);
    if (!existing) {
      res.status(404).json({ error: 'Appointment not found.' });
      return;
    }

    let nextPersonId: number | undefined;
    if (req.body?.person_id !== undefined) {
      const pid = Number(req.body.person_id);
      if (!Number.isInteger(pid) || pid <= 0 || !personExists(pid)) {
        res.status(400).json({ error: 'Invalid patient selected.' });
        return;
      }
      nextPersonId = pid;
    }

    let nextType: AppointmentType | undefined;
    if (req.body?.appointment_type !== undefined) {
      const t = String(req.body.appointment_type).trim() as AppointmentType;
      if (!VALID_APPOINTMENT_TYPES.has(t)) {
        res.status(400).json({ error: 'Invalid appointment type.' });
        return;
      }
      nextType = t;
    }

    let nextDate: string | undefined;
    if (req.body?.appointment_date !== undefined) {
      const d = String(req.body.appointment_date).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
        res.status(400).json({ error: 'Invalid appointment date format (YYYY-MM-DD).' });
        return;
      }
      nextDate = d;
    }

    let nextTime: string | undefined;
    if (req.body?.appointment_time !== undefined) {
      const tm = String(req.body.appointment_time).trim();
      if (!/^\d{2}:\d{2}$/.test(tm)) {
        res.status(400).json({ error: 'Invalid appointment time format (HH:MM).' });
        return;
      }
      nextTime = tm;
    }

    let nextPurpose: string | undefined;
    if (req.body?.purpose !== undefined) {
      const p = String(req.body.purpose).trim();
      if (p.length < 3 || p.length > 200) {
        res.status(400).json({ error: 'Purpose must be between 3 and 200 characters.' });
        return;
      }
      nextPurpose = p;
    }

    let nextStatus: AppointmentStatus | undefined;
    if (req.body?.status !== undefined) {
      const s = String(req.body.status).trim() as AppointmentStatus;
      if (!VALID_APPOINTMENT_STATUSES.has(s)) {
        res.status(400).json({ error: 'Invalid appointment status.' });
        return;
      }
      nextStatus = s;
    }

    const updated = updateAppointment(id, {
      person_id: nextPersonId,
      appointment_type: nextType,
      appointment_date: nextDate,
      appointment_time: nextTime,
      purpose: nextPurpose,
      notes:
        req.body?.notes !== undefined ? String(req.body.notes).trim().slice(0, 600) : undefined,
      status: nextStatus,
      reminder_sent:
        typeof req.body?.reminder_sent === 'boolean' ? req.body.reminder_sent : undefined,
    });

    res.json({ appointment: updated });
  });

  router.delete('/appointments/:id', (_req, res) => {
    const id = Number(_req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid appointment ID.' });
      return;
    }
    if (!deleteAppointment(id)) {
      res.status(404).json({ error: 'Appointment not found.' });
      return;
    }
    res.json({ ok: true });
  });

  // ====================================================================
  // FEATURE 2: DIRECT PATIENT CALLING (/api/calls)
  // ====================================================================

  router.get('/calls', (req, res) => {
    const personId = req.query.person_id ? Number(req.query.person_id) : undefined;
    res.json({
      calls: listCallLogs(
        personId && Number.isInteger(personId) && personId > 0 ? personId : undefined
      ),
    });
  });

  router.post('/calls', (req: AuthedRequest, res) => {
    const person_id = Number(req.body?.person_id);
    const patient = Number.isInteger(person_id) && person_id > 0 ? personExists(person_id) : null;
    if (!patient) {
      res.status(400).json({ error: 'Valid existing patient ID is required.' });
      return;
    }

    const rawPhone = String(req.body?.phone_number ?? patient.phone ?? '').trim();
    if (rawPhone.replace(/\D/g, '').length < 7) {
      res.status(400).json({ error: 'A valid patient phone number is required to log a call.' });
      return;
    }

    const rawOutcome = String(
      req.body?.outcome ?? 'Dialer Opened (Pending Outcome)'
    ).trim() as CallOutcome;
    const outcome: CallOutcome = VALID_CALL_OUTCOMES.has(rawOutcome)
      ? rawOutcome
      : 'Dialer Opened (Pending Outcome)';

    const notes = String(req.body?.notes ?? '').trim().slice(0, 600);
    const rawTime = typeof req.body?.call_initiated_at === 'string' ? req.body.call_initiated_at.trim() : '';
    const call_initiated_at =
      rawTime && !Number.isNaN(Date.parse(rawTime)) ? new Date(rawTime).toISOString() : new Date().toISOString();

    const call = createCallLog({
      person_id,
      phone_number: rawPhone.slice(0, 24),
      call_initiated_at,
      outcome,
      notes,
      recorded_by: `${req.user!.full_name} (${req.user!.username})`,
    });

    res.status(201).json({ call });
  });

  router.patch('/calls/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid call log ID.' });
      return;
    }

    const rawOutcome = req.body?.outcome !== undefined ? String(req.body.outcome).trim() as CallOutcome : undefined;
    if (rawOutcome !== undefined && !VALID_CALL_OUTCOMES.has(rawOutcome)) {
      res.status(400).json({
        error: 'Outcome must be Answered, Not Answered, Call Back Required, or Dialer Opened (Pending Outcome).',
      });
      return;
    }

    const updated = updateCallLog(id, {
      outcome: rawOutcome,
      notes: req.body?.notes !== undefined ? String(req.body.notes).trim().slice(0, 600) : undefined,
    });
    if (!updated) {
      res.status(404).json({ error: 'Call log record not found.' });
      return;
    }
    res.json({ call: updated });
  });

  // ====================================================================
  // FEATURE 3: PATIENT NOTIFICATIONS & HEALTH UPDATES (/api/notifications)
  // ====================================================================

  router.get('/notifications/provider-status', (_req, res) => {
    res.json(getMessagingProviderStatus());
  });

  router.get('/notifications', (req, res) => {
    const personId = req.query.person_id ? Number(req.query.person_id) : undefined;
    res.json({
      notifications: listNotifications(
        personId && Number.isInteger(personId) && personId > 0 ? personId : undefined
      ),
    });
  });

  router.post('/notifications/send', async (req: AuthedRequest, res) => {
    const person_id = Number(req.body?.person_id);
    const patient = Number.isInteger(person_id) && person_id > 0 ? personExists(person_id) : null;
    if (!patient) {
      res.status(400).json({ error: 'Please select a valid existing patient from the database.' });
      return;
    }

    const consent_confirmed = req.body?.consent_confirmed === true;
    if (!consent_confirmed) {
      res.status(400).json({
        error: 'Patient consent must be confirmed before sending any health update or reminder.',
      });
      return;
    }

    const rawChannel = String(req.body?.channel ?? 'SMS').trim() as NotificationChannel;
    if (!VALID_NOTIFICATION_CHANNELS.has(rawChannel)) {
      res.status(400).json({ error: 'Channel must be SMS or WhatsApp.' });
      return;
    }

    const rawCategory = String(
      req.body?.category ?? 'Appointment Reminder'
    ).trim() as NotificationCategory;
    const category: NotificationCategory = VALID_NOTIFICATION_CATEGORIES.has(rawCategory)
      ? rawCategory
      : 'Appointment Reminder';

    const rawLang = String(req.body?.language ?? 'en').trim().toLowerCase();
    const language = VALID_LANGUAGES.has(rawLang) ? rawLang : 'en';

    const message_body = String(req.body?.message_body ?? '').trim();
    if (message_body.length < 10 || message_body.length > 1000) {
      res.status(400).json({ error: 'Message body must be between 10 and 1000 characters.' });
      return;
    }

    const privacyError = checkSmsPrivacyCompliance(rawChannel, message_body);
    if (privacyError) {
      res.status(400).json({ error: privacyError });
      return;
    }

    // Always retrieve the registered phone number from the existing patient record (or fallback to provided override only if patient record has none)
    const targetRawPhone = (patient.phone || '').trim();
    const normalizedPhone = normalizePhoneE164(targetRawPhone);
    if (!normalizedPhone) {
      res.status(400).json({
        error: `No valid registered phone number is on file for ${patient.full_name}. Please update the patient's contact number first.`,
      });
      return;
    }

    const dispatch = await dispatchPatientNotification({
      channel: rawChannel,
      toPhoneE164: normalizedPhone,
      messageBody: message_body,
    });

    const notification = createNotificationRecord({
      person_id,
      phone_number: normalizedPhone,
      channel: rawChannel,
      category,
      language,
      message_body,
      consent_confirmed: true,
      delivery_status: dispatch.delivery_status,
      provider_name: dispatch.provider_name,
      provider_message_id: dispatch.provider_message_id,
      error_detail: dispatch.error_detail,
      sent_by: `${req.user!.full_name} (${req.user!.username})`,
    });

    // Mark linked appointment reminder_sent only when the provider actually accepted the message
    const linkedAppointmentId = Number(req.body?.appointment_id);
    if (
      Number.isInteger(linkedAppointmentId) &&
      linkedAppointmentId > 0 &&
      (dispatch.delivery_status === 'Sent' || dispatch.delivery_status === 'Queued')
    ) {
      updateAppointment(linkedAppointmentId, { reminder_sent: true });
    }

    res.status(201).json({
      notification,
      providerStatus: getMessagingProviderStatus(),
    });
  });

  // ====================================================================
  // FEATURE 4: INDIVIDUAL PATIENT REPORT DATA (/api/patients/:id/report)
  // ====================================================================

  router.get('/patients/:id/report', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid patient ID.' });
      return;
    }
    const report = getPatientFullReportData(id);
    if (!report) {
      res.status(404).json({ error: 'Patient record not found.' });
      return;
    }
    res.json({ report });
  });

  return router;
}
