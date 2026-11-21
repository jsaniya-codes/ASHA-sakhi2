import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Eye,
  MessageSquare,
  Phone,
  Send,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import { parseApiResponse } from '../utils/apiClient';
import { APP_LANGUAGE_OPTIONS } from '../utils/i18n';
import type {
  AppLanguage,
  AppointmentRecord,
  MessagingProviderStatus,
  NotificationCategory,
  NotificationChannel,
  NotificationRecord,
  PersonRecord,
} from '../types';

export interface NotificationPrefill {
  personId: number;
  category?: NotificationCategory;
  appointment?: AppointmentRecord;
}

interface PatientNotificationsProps {
  people: PersonRecord[];
  notifications: NotificationRecord[];
  appointments: AppointmentRecord[];
  appLanguage: AppLanguage;
  authToken: string | null;
  prefill?: NotificationPrefill | null;
  onClearPrefill?: () => void;
  onRequestAuth: () => void;
  onRefresh: () => Promise<void>;
}

const CATEGORIES: NotificationCategory[] = [
  'Appointment Reminder',
  'ANC Checkup Reminder',
  'Vaccination Reminder',
  'Follow-up Notification',
  'Recent Health Update',
  'Health Report Summary',
];

function buildRegionalTemplate(
  category: NotificationCategory,
  lang: AppLanguage,
  patient: PersonRecord | null,
  appointment?: AppointmentRecord | null
): string {
  const name = patient?.full_name || 'Beneficiary';
  const village = patient?.village || 'your village';
  const dateStr = appointment?.appointment_date || 'your upcoming scheduled date';
  const timeStr = appointment?.appointment_time || '10:00';
  const purposeStr = appointment?.purpose || 'scheduled health checkup';

  const templates: Record<AppLanguage, Record<NotificationCategory, string>> = {
    en: {
      'Appointment Reminder': `Namaste ${name}, this is a reminder from your ASHA worker for your ${purposeStr} on ${dateStr} at ${timeStr}. Please carry your health card.`,
      'ANC Checkup Reminder': `Namaste ${name}, your antenatal (ANC) checkup is scheduled on ${dateStr} at ${timeStr} at the ${village} health center / PHC. Please bring your MCP card.`,
      'Vaccination Reminder': `Namaste ${name}, your scheduled immunization / vaccination appointment is due on ${dateStr} at ${timeStr} at the Anganwadi / PHC. Please bring the vaccination card.`,
      'Follow-up Notification': `Namaste ${name}, your ASHA worker is following up regarding your recent health visit (${dateStr}). Please contact your ASHA worker or visit the PHC if you feel unwell.`,
      'Recent Health Update': `Namaste ${name}, your recent home visit health record has been updated by your ASHA worker. Please follow the nutrition and care guidance shared during your visit.`,
      'Health Report Summary': `Namaste ${name}, your AshaSakhi health summary has been prepared by your ASHA worker. For full medical details, please review your printed PDF copy in person at the PHC or with your ASHA worker.`,
    },
    kn: {
      'Appointment Reminder': `ನಮಸ್ಕಾರ ${name}, ನಿಮ್ಮ ಆಶಾ ಕಾರ್ಯಕರ್ತೆಯಿಂದ ನೆನಪಿಸುವಿಕೆ: ${dateStr} ರಂದು ${timeStr} ಕ್ಕೆ ನಿಮ್ಮ ${purposeStr} ನಿಗದಿಯಾಗಿದೆ. ದಯವಿಟ್ಟು ಆರೋಗ್ಯ ಕಾರ್ಡ್ ತರಲು ಮರೆಯಬೇಡಿ.`,
      'ANC Checkup Reminder': `ನಮಸ್ಕಾರ ${name}, ನಿಮ್ಮ ಗರ್ಭಿಣಿ ತಪಾಸಣೆ (ANC) ${dateStr} ರಂದು ${timeStr} ಕ್ಕೆ ${village} ಆರೋಗ್ಯ ಕೇಂದ್ರ / PHC ಯಲ್ಲಿ ನಿಗದಿಯಾಗಿದೆ. ದಯವಿಟ್ಟು ತಾಯಿ-ಮಗು ಕಾರ್ಡ್ (MCP) ತೆಗೆದುಕೊಂಡು ಬನ್ನಿ.`,
      'Vaccination Reminder': `ನಮಸ್ಕಾರ ${name}, ${dateStr} ರಂದು ${timeStr} ಕ್ಕೆ ಅಂಗನವಾಡಿ / PHC ಯಲ್ಲಿ ಲಸಿಕೆ (Vaccination) ಹಾಕಿಸುವ ಸಮಯವಾಗಿದೆ. ದಯವಿಟ್ಟು ಲಸಿಕೆ ಕಾರ್ಡ್ ತೆಗೆದುಕೊಂಡು ಬನ್ನಿ.`,
      'Follow-up Notification': `ನಮಸ್ಕಾರ ${name}, ನಿಮ್ಮ ಇತ್ತೀಚಿನ ಆರೋಗ್ಯ ಭೇಟಿಯ ಫಾಲೋ-ಅಪ್ ಕುರಿತು ಆಶಾ ಕಾರ್ಯಕರ್ತೆಯ ಸಂದೇಶ. ಯಾವುದೇ ಅಸ್ವಸ್ಥತೆ ಇದ್ದಲ್ಲಿ ತಕ್ಷಣ PHC ಅಥವಾ ಆಶಾ ಕಾರ್ಯಕರ್ತೆಯನ್ನು ಸಂಪರ್ಕಿಸಿ.`,
      'Recent Health Update': `ನಮಸ್ಕಾರ ${name}, ನಿಮ್ಮ ಇತ್ತೀಚಿನ ಆರೋಗ್ಯ ಭೇಟಿಯ ಮಾಹಿತಿಯನ್ನು ನವೀಕರಿಸಲಾಗಿದೆ. ಭೇಟಿಯಲ್ಲಿ ತಿಳಿಸಿದ ಆಹಾರ ಮತ್ತು ಆರೈಕೆ ಸಲಹೆಗಳನ್ನು ಪಾಲಿಸಿ.`,
      'Health Report Summary': `ನಮಸ್ಕಾರ ${name}, ನಿಮ್ಮ ಆಶಾಸಖಿ ಆರೋಗ್ಯ ವರದಿಯ ಸಾರಾಂಶ ಸಿದ್ಧವಾಗಿದೆ. ಪೂರ್ಣ ವಿವರಗಳಿಗಾಗಿ ದಯವಿಟ್ಟು ನಿಮ್ಮ ಆಶಾ ಕಾರ್ಯಕರ್ತೆ ಅಥವಾ PHC ಯಲ್ಲಿ ಮುದ್ರಿತ ವರದಿಯನ್ನು ಪಡೆಯಿರಿ.`,
    },
    hi: {
      'Appointment Reminder': `नमस्ते ${name}, आपकी आशा कार्यकर्ता की ओर से स्मरण: ${dateStr} को ${timeStr} बजे आपकी ${purposeStr} निर्धारित है। कृपया अपना स्वास्थ्य कार्ड साथ लाएं।`,
      'ANC Checkup Reminder': `नमस्ते ${name}, आपकी प्रसवपूर्व जांच (ANC) ${dateStr} को ${timeStr} बजे ${village} स्वास्थ्य केंद्र / PHC पर निर्धारित है। कृपया अपना MCP कार्ड साथ लाएं।`,
      'Vaccination Reminder': `नमस्ते ${name}, ${dateStr} को ${timeStr} बजे आंगनवाड़ी / PHC में टीकाकरण निर्धारित है। कृपया टीकाकरण कार्ड साथ लेकर आएं।`,
      'Follow-up Notification': `नमस्ते ${name}, आपकी हाल की स्वास्थ्य जांच के फॉलो-अप के लिए आशा कार्यकर्ता का संदेश। किसी भी परेशानी में तुरंत PHC या आशा दीदी से संपर्क करें।`,
      'Recent Health Update': `नमस्ते ${name}, आपकी हाल की गृह भेंट का स्वास्थ्य अपडेट दर्ज कर लिया गया है। कृपया भेंट में दी गई पोषण और देखभाल की सलाह का पालन करें।`,
      'Health Report Summary': `नमस्ते ${name}, आपकी आशासखी स्वास्थ्य रिपोर्ट का संक्षिप्त विवरण तैयार है। पूर्ण चिकित्सा विवरण के लिए कृपया आशा कार्यकर्ता या PHC से प्रिंटेड रिपोर्ट प्राप्त करें।`,
    },
    te: {
      'Appointment Reminder': `నమస్కారం ${name}, మీ ఆశా కార్యకర్త నుండి గుర్తుచేయడం: ${dateStr} నాడు ${timeStr} కు మీ ${purposeStr} ఉంది. దయచేసి మీ ఆరోగ్య కార్డు తీసుకురండి.`,
      'ANC Checkup Reminder': `నమస్కారం ${name}, మీ గర్భిణి పరీక్ష (ANC) ${dateStr} నాడు ${timeStr} కు ${village} PHC లో ఉంది. దయచేసి MCP కార్డు తీసుకురండి.`,
      'Vaccination Reminder': `నమస్కారం ${name}, ${dateStr} నాడు ${timeStr} కు అంగన్‌వాడీ / PHC లో టీకా వేయించుకునే సమయం ఉంది. టీకా కార్డు తీసుకురండి.`,
      'Follow-up Notification': `నమస్కారం ${name}, మీ ఇటీవలి ఆరోగ్య సందర్శన ఫాలో-అప్ సందేశం. ఏదైనా అసౌకర్యం ఉంటే వెంటనే ఆశా కార్యకర్తను లేదా PHC ని సంప్రదించండి.`,
      'Recent Health Update': `నమస్కారం ${name}, మీ ఇటీవలి ఆరోగ్య సందర్శన వివరాలు నమోదు చేయబడ్డాయి. సూచించిన పోషకాహార మరియు ఆరోగ్య జాగ్రత్తలు పాటించండి.`,
      'Health Report Summary': `నమస్కారం ${name}, మీ ఆశాసఖి ఆరోగ్య నివేదిక సారాంశం సిద్ధంగా ఉంది. పూర్తి వివరాల కోసం ఆశా కార్యకర్త లేదా PHC వద్ద ప్రింటెడ్ నివేదికను పొందండి.`,
    },
    ta: {
      'Appointment Reminder': `வணக்கம் ${name}, உங்கள் ஆஷா பணியாளரின் நினைவூட்டல்: ${dateStr} அன்று ${timeStr} மணிக்கு ${purposeStr} திட்டமிடப்பட்டுள்ளது. சுகாதார அட்டையை கொண்டு வாருங்கள்.`,
      'ANC Checkup Reminder': `வணக்கம் ${name}, உங்கள் கர்ப்பகால பரிசோதனை (ANC) ${dateStr} அன்று ${timeStr} மணிக்கு ${village} PHC-ல் நடைபெறும். MCP அட்டையை எடுத்து வாருங்கள்.`,
      'Vaccination Reminder': `வணக்கம் ${name}, ${dateStr} அன்று ${timeStr} மணிக்கு அங்கன்வாடி / PHC-ல் தடுப்பூசி போடப்பட உள்ளது. தடுப்பூசி அட்டையை கொண்டு வாருங்கள்.`,
      'Follow-up Notification': `வணக்கம் ${name}, உங்கள் சமீபத்திய உடல்நல பரிசோதனையின் தொடர் தகவல். ஏதேனும் சிரமம் இருந்தால் உடனடியாக ஆஷா பணியாளர் அல்லது PHC-ஐ அணுகவும்.`,
      'Recent Health Update': `வணக்கம் ${name}, உங்கள் சமீபத்திய வீட்டு வருகை உடல்நல தகவல் புதுப்பிக்கப்பட்டுள்ளது. வழங்கப்பட்ட ஆலோசனைகளை பின்பற்றவும்.`,
      'Health Report Summary': `வணக்கம் ${name}, உங்கள் ஆஷாசகி உடல்நல அறிக்கை சுருக்கம் தயாராக உள்ளது. முழு விவரங்களுக்கு ஆஷா பணியாளர் அல்லது PHC-ல் அச்சிடப்பட்ட அறிக்கையை பெறவும்.`,
    },
    mr: {
      'Appointment Reminder': `नमस्कार ${name}, तुमच्या आशा सेविकेची आठवण: ${dateStr} रोजी ${timeStr} वाजता तुमची ${purposeStr} निश्चित केली आहे. कृपया आरोग्य कार्ड सोबत आणा.`,
      'ANC Checkup Reminder': `नमस्कार ${name}, तुमची प्रसूतीपूर्व तपासणी (ANC) ${dateStr} रोजी ${timeStr} वाजता ${village} PHC मध्ये आहे. कृपया MCP कार्ड सोबत आणा.`,
      'Vaccination Reminder': `नमस्कार ${name}, ${dateStr} रोजी ${timeStr} वाजता अंगणवाडी / PHC मध्ये लसीकरण आहे. कृपया लसीकरण कार्ड सोबत आणा.`,
      'Follow-up Notification': `नमस्कार ${name}, तुमच्या अलीकडील आरोग्य भेटीचा फॉलो-अप संदेश. कोणतीही अडचण असल्यास त्वरित आशा सेविका किंवा PHC शी संपर्क साधा.`,
      'Recent Health Update': `नमस्कार ${name}, तुमच्या अलीकडील गृहभेटीची आरोग्य नोंद अद्यतनित केली आहे. दिलेल्या आहार आणि काळजीच्या सूचना पाळा.`,
      'Health Report Summary': `नमस्कार ${name}, तुमचा आशासखी आरोग्य अहवाल सारांश तयार आहे. संपूर्ण वैद्यकीय तपशीलांसाठी आशा सेविका किंवा PHC कडून छापील अहवाल घ्या.`,
    },
  };

  return templates[lang]?.[category] || templates.en[category];
}

export function PatientNotifications({
  people,
  notifications,
  appointments,
  appLanguage,
  authToken,
  prefill,
  onClearPrefill,
  onRequestAuth,
  onRefresh,
}: PatientNotificationsProps) {
  const [selectedPersonId, setSelectedPersonId] = useState<string>(
    people[0] ? String(people[0].id) : ''
  );
  const [channel, setChannel] = useState<NotificationChannel>('SMS');
  const [category, setCategory] = useState<NotificationCategory>('Appointment Reminder');
  const [messageLang, setMessageLang] = useState<AppLanguage>(appLanguage);
  const [linkedAppointmentId, setLinkedAppointmentId] = useState<number | null>(null);
  const [messageBody, setMessageBody] = useState('');
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [previewApproved, setPreviewApproved] = useState(false);

  const [providerStatus, setProviderStatus] = useState<MessagingProviderStatus | null>(null);
  const [historyFilterPerson, setHistoryFilterPerson] = useState<string>('All');
  const [sending, setSending] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const selectedPerson = useMemo(
    () => people.find((p) => String(p.id) === selectedPersonId) || null,
    [people, selectedPersonId]
  );

  const patientAppointments = useMemo(
    () =>
      selectedPerson
        ? appointments.filter((a) => a.person_id === selectedPerson.id && a.status === 'Scheduled')
        : [],
    [appointments, selectedPerson]
  );

  const linkedAppointment = useMemo(
    () =>
      appointments.find((a) => a.id === linkedAppointmentId) ||
      patientAppointments[0] ||
      null,
    [appointments, linkedAppointmentId, patientAppointments]
  );

  // Fetch live backend messaging provider configuration status
  useEffect(() => {
    if (!authToken) return;
    fetch('/api/notifications/provider-status', {
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
    })
      .then((res) => parseApiResponse<MessagingProviderStatus>(res, 'Could not check messaging gateway status.'))
      .then((data) => setProviderStatus(data))
      .catch(() => {});
  }, [authToken]);

  // Apply prefill when jumped from ScheduleCalendar or Patient Profile
  useEffect(() => {
    if (!prefill) return;
    setSelectedPersonId(String(prefill.personId));
    const person = people.find((p) => p.id === prefill.personId) || null;
    const nextCat: NotificationCategory =
      prefill.category ||
      (prefill.appointment?.appointment_type === 'Antenatal Checkup'
        ? 'ANC Checkup Reminder'
        : prefill.appointment?.appointment_type === 'Vaccination'
        ? 'Vaccination Reminder'
        : prefill.appointment?.appointment_type === 'Follow-up Visit'
        ? 'Follow-up Notification'
        : 'Appointment Reminder');
    setCategory(nextCat);
    setLinkedAppointmentId(prefill.appointment?.id ?? null);
    setMessageBody(buildRegionalTemplate(nextCat, messageLang, person, prefill.appointment || null));
    setPreviewApproved(false);
    setConsentConfirmed(false);
    onClearPrefill?.();
  }, [prefill, people, messageLang, onClearPrefill]);

  // Auto-populate template when empty
  useEffect(() => {
    if (!messageBody && selectedPerson) {
      setMessageBody(buildRegionalTemplate(category, messageLang, selectedPerson, linkedAppointment));
    }
  }, [selectedPerson, category, messageLang, linkedAppointment, messageBody]);

  const handleLoadTemplate = (
    nextCategory: NotificationCategory = category,
    nextLang: AppLanguage = messageLang,
    nextPerson: PersonRecord | null = selectedPerson
  ) => {
    const appt = nextPerson
      ? appointments.find((a) => a.id === linkedAppointmentId && a.person_id === nextPerson.id) ||
        appointments.find((a) => a.person_id === nextPerson.id && a.status === 'Scheduled') ||
        null
      : null;
    setMessageBody(buildRegionalTemplate(nextCategory, nextLang, nextPerson, appt));
    setPreviewApproved(false);
  };

  const smsTooLongWarning = channel === 'SMS' && messageBody.length > 480;

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authToken) {
      onRequestAuth();
      return;
    }
    if (!selectedPerson) {
      setErrorMsg('Please select a patient.');
      return;
    }
    if (!consentConfirmed) {
      setErrorMsg('Confirm patient consent before sending any health update or reminder.');
      return;
    }
    if (!previewApproved) {
      setErrorMsg('Please review and check "I have previewed and approved this message" before sending.');
      return;
    }

    setSending(true);
    setErrorMsg(null);
    setStatusMsg(null);

    try {
      const res = await fetch('/api/notifications/send', {
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
          channel,
          category,
          language: messageLang,
          message_body: messageBody.trim(),
          consent_confirmed: consentConfirmed,
          appointment_id: linkedAppointmentId,
        }),
      });
      const data = await parseApiResponse<{
        notification: NotificationRecord;
        providerStatus: MessagingProviderStatus;
      }>(res, 'Could not process patient notification.');

      setProviderStatus(data.providerStatus);
      setPreviewApproved(false);
      await onRefresh();

      if (
        data.notification.delivery_status === 'Sent' ||
        data.notification.delivery_status === 'Queued'
      ) {
        setStatusMsg(
          `${data.notification.channel} notification delivered (${data.notification.delivery_status}) to ${selectedPerson.full_name} via ${data.notification.provider_name}.`
        );
      } else {
        setErrorMsg(
          `Logged with status "${data.notification.delivery_status}": ${data.notification.error_detail}`
        );
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Notification dispatch failed.');
    } finally {
      setSending(false);
    }
  };

  const filteredHistory = useMemo(() => {
    if (historyFilterPerson === 'All') return notifications;
    return notifications.filter((n) => String(n.person_id) === historyFilterPerson);
  }, [notifications, historyFilterPerson]);

  const activeChannelConfigured =
    channel === 'SMS'
      ? Boolean(providerStatus?.smsConfigured)
      : Boolean(providerStatus?.whatsappConfigured);

  return (
    <div className="space-y-5">
      {/* Provider & Privacy Banner */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="flex items-start gap-3 rounded-xl border border-[#e2e7e0] bg-white p-4">
          <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-[#1f6f5c]" />
          <div className="text-xs">
            <p className="font-bold text-slate-900">Backend Messaging Gateway Status</p>
            <p className="mt-1 text-slate-600">
              SMS:{' '}
              <strong className={providerStatus?.smsConfigured ? 'text-emerald-700' : 'text-amber-700'}>
                {providerStatus?.smsProvider || 'Checking...'}
              </strong>{' '}
              · WhatsApp:{' '}
              <strong className={providerStatus?.whatsappConfigured ? 'text-emerald-700' : 'text-amber-700'}>
                {providerStatus?.whatsappProvider || 'Checking...'}
              </strong>
            </p>
            {providerStatus && !activeChannelConfigured && (
              <p className="mt-1 text-[11px] text-amber-800">
                Add your authorized SMS or WhatsApp Business API credentials in server environment
                variables (Settings &gt; Secrets) for live delivery. Unconfigured attempts are logged
                honestly as &ldquo;Provider Not Configured&rdquo;.
              </p>
            )}
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-xl border border-[#dce8e3] bg-[#f4faf8] p-4">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#1f6f5c]" />
          <div className="text-xs">
            <p className="font-bold text-slate-900">Patient Privacy & Consent Safeguard</p>
            <p className="mt-1 text-slate-600">
              Always obtain verbal or written patient consent before sending updates. Keep ordinary
              SMS messages brief (reminders and care guidance only) — never transmit sensitive
              diagnoses or full medical records over plain SMS.
            </p>
          </div>
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
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-medium text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Main Split: Composer + Delivery History */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* Composer & Preview/Approve Panel */}
        <section className="xl:col-span-6 rounded-xl border border-[#e2e7e0] bg-white p-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Compose Patient Update</h2>
              <p className="text-xs text-slate-500">
                Select a registered patient, pick a regional template, preview & approve
              </p>
            </div>
            <Bell className="h-4 w-4 text-[#1f6f5c]" />
          </div>

          <form onSubmit={handleSend} className="mt-4 space-y-4">
            {/* Patient Selector + Auto-Retrieved Phone */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Select Patient *
                </label>
                <select
                  required
                  value={selectedPersonId}
                  onChange={(e) => {
                    const nextId = e.target.value;
                    setSelectedPersonId(nextId);
                    const p = people.find((x) => String(x.id) === nextId) || null;
                    setLinkedAppointmentId(null);
                    handleLoadTemplate(category, messageLang, p);
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#1f6f5c] focus:outline-none"
                >
                  <option value="">-- Choose existing patient --</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.person_code} — {p.full_name} ({p.village})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Registered Phone (From DB)
                </label>
                <div className="mt-1 flex items-center gap-2 rounded-lg border border-slate-200 bg-[#f4f6f2] px-3 py-2 text-xs font-mono font-semibold text-slate-800">
                  <Phone className="h-3.5 w-3.5 text-slate-400" />
                  <span>{selectedPerson?.phone || 'No phone number on file'}</span>
                </div>
              </div>
            </div>

            {/* Channel & Update Category & Template Language */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700">Channel</label>
                <div className="mt-1 grid grid-cols-2 gap-1 rounded-lg border border-slate-200 bg-[#f4f6f2] p-0.5 text-xs font-semibold">
                  {(['SMS', 'WhatsApp'] as NotificationChannel[]).map((ch) => (
                    <button
                      key={ch}
                      type="button"
                      onClick={() => {
                        setChannel(ch);
                        setPreviewApproved(false);
                      }}
                      className={`rounded-md py-1.5 transition-colors ${
                        channel === ch
                          ? 'bg-white text-[#1f6f5c] shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {ch}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Update Type</label>
                <select
                  value={category}
                  onChange={(e) => {
                    const nextCat = e.target.value as NotificationCategory;
                    setCategory(nextCat);
                    handleLoadTemplate(nextCat, messageLang, selectedPerson);
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-900"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Template Language
                </label>
                <select
                  value={messageLang}
                  onChange={(e) => {
                    const nextLang = e.target.value as AppLanguage;
                    setMessageLang(nextLang);
                    handleLoadTemplate(category, nextLang, selectedPerson);
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-900"
                >
                  {APP_LANGUAGE_OPTIONS.map((opt) => (
                    <option key={opt.code} value={opt.code}>
                      {opt.native} ({opt.code.toUpperCase()})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Editable Message Body */}
            <div>
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-700">
                  Message Content (Editable)
                </label>
                <button
                  type="button"
                  onClick={() => handleLoadTemplate()}
                  className="text-[11px] font-semibold text-[#1f6f5c] hover:underline"
                >
                  Reset to Regional Template
                </button>
              </div>
              <textarea
                required
                rows={4}
                maxLength={1000}
                value={messageBody}
                onChange={(e) => {
                  setMessageBody(e.target.value);
                  setPreviewApproved(false);
                }}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-[#1f6f5c] focus:outline-none"
              />
              <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                <span>
                  {channel === 'SMS'
                    ? 'Keep SMS concise and avoid raw clinical details.'
                    : 'WhatsApp Business delivery via configured backend API.'}
                </span>
                <span className={smsTooLongWarning ? 'font-bold text-red-700' : 'font-mono'}>
                  {messageBody.length} / {channel === 'SMS' ? 480 : 1000}
                </span>
              </div>
            </div>

            {/* Live Message Preview Card */}
            <div className="rounded-xl border border-[#d7dfd5] bg-[#f9faf8] p-3.5">
              <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wide text-slate-500">
                <span className="inline-flex items-center gap-1.5">
                  <Eye className="h-3.5 w-3.5 text-[#1f6f5c]" />
                  Message Preview
                </span>
                <span>
                  {channel} → {selectedPerson?.phone || 'No phone'}
                </span>
              </div>
              <div className="mt-2 rounded-lg border border-slate-200 bg-white p-3 text-xs leading-relaxed text-slate-800 whitespace-pre-wrap">
                {messageBody.trim() || 'Select a patient to preview the regional message...'}
              </div>
            </div>

            {/* Mandatory Consent & Approval Checkboxes */}
            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-xs">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={consentConfirmed}
                  onChange={(e) => setConsentConfirmed(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-[#1f6f5c] focus:ring-[#1f6f5c]"
                />
                <span className="text-slate-700">
                  <strong>Patient Consent Confirmed:</strong> The patient / household has consented
                  to receive healthcare reminders and updates on their registered phone number.
                </span>
              </label>

              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={previewApproved}
                  onChange={(e) => setPreviewApproved(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-[#1f6f5c] focus:ring-[#1f6f5c]"
                />
                <span className="text-slate-700">
                  <strong>Message Approved:</strong> I have previewed the message above and verified
                  it does not expose sensitive medical records over plain SMS.
                </span>
              </label>
            </div>

            <button
              type="submit"
              disabled={
                sending ||
                !selectedPerson ||
                !selectedPerson.phone ||
                !consentConfirmed ||
                !previewApproved ||
                smsTooLongWarning
              }
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#1f6f5c] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#185848] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              {sending ? `Sending via ${channel}...` : `Approve & Send ${channel} Update`}
            </button>
          </form>
        </section>

        {/* Notification History & Delivery Status */}
        <section className="xl:col-span-6 rounded-xl border border-[#e2e7e0] bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Notification History & Delivery Status ({filteredHistory.length})
              </h2>
              <p className="text-xs text-slate-500">
                Audit log of all SMS and WhatsApp reminders linked to patient profiles
              </p>
            </div>
            <select
              value={historyFilterPerson}
              onChange={(e) => setHistoryFilterPerson(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700"
            >
              <option value="All">All Patients</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name} ({p.person_code})
                </option>
              ))}
            </select>
          </div>

          <div className="mt-3 max-h-[600px] space-y-2.5 overflow-y-auto pr-1">
            {filteredHistory.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 py-14 text-center text-xs text-slate-500">
                <MessageSquare className="h-8 w-8 text-slate-300" />
                <p className="mt-2 font-semibold text-slate-700">No notifications recorded yet</p>
                <p className="mt-1 max-w-xs text-slate-500">
                  Compose and approve an appointment, ANC, vaccination, or follow-up message on the left.
                </p>
              </div>
            ) : (
              filteredHistory.map((n) => (
                <div key={n.id} className="rounded-xl border border-slate-200 p-3.5 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-bold text-slate-900">
                        {n.patient_name || `Patient #${n.person_id}`}
                      </span>
                      <span className="font-mono text-[11px] text-[#1f6f5c]">
                        {n.person_code || ''}
                      </span>
                      <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                        {n.channel} · {n.category}
                      </span>
                    </div>
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                        n.delivery_status === 'Sent' || n.delivery_status === 'Queued'
                          ? 'bg-emerald-50 text-emerald-800'
                          : n.delivery_status === 'Provider Not Configured'
                          ? 'bg-amber-50 text-amber-800'
                          : 'bg-red-50 text-red-800'
                      }`}
                    >
                      {n.delivery_status}
                    </span>
                  </div>

                  <p className="mt-2 rounded-lg bg-[#f9faf8] p-2.5 text-slate-700 whitespace-pre-wrap">
                    {n.message_body}
                  </p>

                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                    <span className="font-mono">
                      To: {n.phone_number} · Lang: {n.language.toUpperCase()}
                    </span>
                    <span>
                      {new Date(n.created_at).toLocaleString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>

                  {n.error_detail && (
                    <p className="mt-1.5 text-[11px] text-amber-800">{n.error_detail}</p>
                  )}
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
