import type {
  MessagingProviderStatus,
  NotificationChannel,
  NotificationDeliveryStatus,
} from '../src/types.ts';

function cleanEnv(name: string): string {
  const val = (process.env[name] || '').trim();
  if (!val || val.startsWith('MY_')) return '';
  return val;
}

/**
 * Formats an Indian or international phone number to E.164 format (+91XXXXXXXXXX for 10-digit Indian numbers).
 */
export function normalizePhoneE164(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10 && /^[6-9]/.test(digits)) {
    return `+91${digits}`;
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    return `+${digits}`;
  }
  if (digits.length >= 10 && digits.length <= 15) {
    return trimmed.startsWith('+') ? `+${digits}` : `+${digits}`;
  }
  return null;
}

/**
 * Reports only boolean provider availability (never exposes API keys or credentials).
 */
export function getMessagingProviderStatus(): MessagingProviderStatus {
  const twilioSid = cleanEnv('TWILIO_ACCOUNT_SID');
  const twilioToken = cleanEnv('TWILIO_AUTH_TOKEN');
  const twilioSmsFrom = cleanEnv('TWILIO_SMS_FROM');
  const twilioWaFrom = cleanEnv('TWILIO_WHATSAPP_FROM');
  const metaWaToken = cleanEnv('WHATSAPP_CLOUD_ACCESS_TOKEN');
  const metaWaPhoneId = cleanEnv('WHATSAPP_CLOUD_PHONE_NUMBER_ID');
  const smsGatewayUrl = cleanEnv('SMS_GATEWAY_URL');
  const smsGatewayKey = cleanEnv('SMS_GATEWAY_API_KEY');

  const hasTwilioSms = Boolean(twilioSid && twilioToken && twilioSmsFrom);
  const hasCustomSms = Boolean(smsGatewayUrl && smsGatewayKey);
  const hasMetaWa = Boolean(metaWaToken && metaWaPhoneId);
  const hasTwilioWa = Boolean(twilioSid && twilioToken && twilioWaFrom);

  return {
    smsConfigured: hasTwilioSms || hasCustomSms,
    whatsappConfigured: hasMetaWa || hasTwilioWa,
    smsProvider: hasTwilioSms
      ? 'Twilio SMS API'
      : hasCustomSms
      ? 'Configured SMS Gateway'
      : 'Not Configured',
    whatsappProvider: hasMetaWa
      ? 'Meta WhatsApp Business Cloud API'
      : hasTwilioWa
      ? 'Twilio WhatsApp Business API'
      : 'Not Configured',
  };
}

/**
 * Privacy safeguard: standard SMS is unencrypted. Rejects messages containing raw clinical
 * test dumps or sensitive diagnosis strings unless sanitized to brief care reminders.
 */
export function checkSmsPrivacyCompliance(
  channel: NotificationChannel,
  messageBody: string
): string | null {
  if (channel !== 'SMS') return null;
  if (messageBody.length > 480) {
    return 'SMS messages should be concise (max 480 characters) and must not include full medical records. Use the Patient PDF Report for detailed records.';
  }
  const sensitivePatterns = [
    /\b(hiv|aids|tb|tuberculosis|syphilis|hepatitis\s*[bc]|abortion|miscarriage)\b/i,
    /\b(aadhaar|aadhar)\s*[:#-]?\s*\d{4}/i,
  ];
  for (const pat of sensitivePatterns) {
    if (pat.test(messageBody)) {
      return 'Privacy protection: Avoid sending sensitive medical diagnoses or ID numbers via ordinary SMS. Rephrase as a general appointment or PHC visit reminder.';
    }
  }
  return null;
}

export interface DispatchResult {
  delivery_status: NotificationDeliveryStatus;
  provider_name: string;
  provider_message_id: string;
  error_detail: string;
}

/**
 * Dispatches an SMS or WhatsApp update using configured server-side credentials.
 * Never fabricates a "Sent" status when credentials are missing or when the provider returns an error.
 */
export async function dispatchPatientNotification(params: {
  channel: NotificationChannel;
  toPhoneE164: string;
  messageBody: string;
}): Promise<DispatchResult> {
  const { channel, toPhoneE164, messageBody } = params;

  const twilioSid = cleanEnv('TWILIO_ACCOUNT_SID');
  const twilioToken = cleanEnv('TWILIO_AUTH_TOKEN');
  const twilioSmsFrom = cleanEnv('TWILIO_SMS_FROM');
  const twilioWaFrom = cleanEnv('TWILIO_WHATSAPP_FROM');
  const metaWaToken = cleanEnv('WHATSAPP_CLOUD_ACCESS_TOKEN');
  const metaWaPhoneId = cleanEnv('WHATSAPP_CLOUD_PHONE_NUMBER_ID');
  const smsGatewayUrl = cleanEnv('SMS_GATEWAY_URL');
  const smsGatewayKey = cleanEnv('SMS_GATEWAY_API_KEY');
  const smsGatewaySenderId = cleanEnv('SMS_GATEWAY_SENDER_ID') || 'ASHASK';

  if (channel === 'WhatsApp') {
    // 1. Meta WhatsApp Business Cloud API
    if (metaWaToken && metaWaPhoneId) {
      try {
        const waDigits = toPhoneE164.replace(/\D/g, '');
        const res = await fetch(
          `https://graph.facebook.com/v20.0/${encodeURIComponent(metaWaPhoneId)}/messages`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${metaWaToken}`,
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              recipient_type: 'individual',
              to: waDigits,
              type: 'text',
              text: { preview_url: false, body: messageBody },
            }),
          }
        );
        const data = (await res.json().catch(() => ({}))) as {
          messages?: Array<{ id?: string }>;
          error?: { message?: string };
        };
        if (res.ok && data.messages?.[0]?.id) {
          return {
            delivery_status: 'Sent',
            provider_name: 'Meta WhatsApp Business Cloud API',
            provider_message_id: String(data.messages[0].id),
            error_detail: '',
          };
        }
        return {
          delivery_status: 'Failed',
          provider_name: 'Meta WhatsApp Business Cloud API',
          provider_message_id: '',
          error_detail: data.error?.message || `WhatsApp API returned HTTP ${res.status}`,
        };
      } catch (err: unknown) {
        return {
          delivery_status: 'Failed',
          provider_name: 'Meta WhatsApp Business Cloud API',
          provider_message_id: '',
          error_detail: err instanceof Error ? err.message : 'Network error calling WhatsApp API.',
        };
      }
    }

    // 2. Twilio WhatsApp Business API
    if (twilioSid && twilioToken && twilioWaFrom) {
      return sendViaTwilio({
        accountSid: twilioSid,
        authToken: twilioToken,
        from: twilioWaFrom.startsWith('whatsapp:') ? twilioWaFrom : `whatsapp:${twilioWaFrom}`,
        to: `whatsapp:${toPhoneE164}`,
        body: messageBody,
        providerName: 'Twilio WhatsApp Business API',
      });
    }

    return {
      delivery_status: 'Provider Not Configured',
      provider_name: 'WhatsApp Gateway Not Configured',
      provider_message_id: '',
      error_detail:
        'Configure WHATSAPP_CLOUD_ACCESS_TOKEN + WHATSAPP_CLOUD_PHONE_NUMBER_ID (or TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_WHATSAPP_FROM) in Settings > Secrets to deliver WhatsApp messages.',
    };
  }

  // Channel: SMS
  if (twilioSid && twilioToken && twilioSmsFrom) {
    return sendViaTwilio({
      accountSid: twilioSid,
      authToken: twilioToken,
      from: twilioSmsFrom,
      to: toPhoneE164,
      body: messageBody,
      providerName: 'Twilio SMS API',
    });
  }

  if (smsGatewayUrl && smsGatewayKey) {
    try {
      const parsedUrl = new URL(smsGatewayUrl);
      if (parsedUrl.protocol !== 'https:') {
        return {
          delivery_status: 'Failed',
          provider_name: 'Configured SMS Gateway',
          provider_message_id: '',
          error_detail: 'SMS_GATEWAY_URL must use HTTPS.',
        };
      }
      const res = await fetch(parsedUrl.toString(), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${smsGatewayKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          to: toPhoneE164,
          sender_id: smsGatewaySenderId,
          message: messageBody,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (res.ok) {
        return {
          delivery_status: 'Sent',
          provider_name: 'Configured SMS Gateway',
          provider_message_id: String(data.message_id || data.id || data.request_id || ''),
          error_detail: '',
        };
      }
      return {
        delivery_status: 'Failed',
        provider_name: 'Configured SMS Gateway',
        provider_message_id: '',
        error_detail: String(data.error || data.message || `SMS gateway returned HTTP ${res.status}`),
      };
    } catch (err: unknown) {
      return {
        delivery_status: 'Failed',
        provider_name: 'Configured SMS Gateway',
        provider_message_id: '',
        error_detail: err instanceof Error ? err.message : 'Network error calling SMS gateway.',
      };
    }
  }

  return {
    delivery_status: 'Provider Not Configured',
    provider_name: 'SMS Gateway Not Configured',
    provider_message_id: '',
    error_detail:
      'Configure TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_SMS_FROM (or SMS_GATEWAY_URL + SMS_GATEWAY_API_KEY) in Settings > Secrets to deliver SMS messages.',
  };
}

async function sendViaTwilio(opts: {
  accountSid: string;
  authToken: string;
  from: string;
  to: string;
  body: string;
  providerName: string;
}): Promise<DispatchResult> {
  try {
    const authHeader = Buffer.from(`${opts.accountSid}:${opts.authToken}`).toString('base64');
    const form = new URLSearchParams();
    form.set('From', opts.from);
    form.set('To', opts.to);
    form.set('Body', opts.body);

    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(opts.accountSid)}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${authHeader}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: form.toString(),
      }
    );

    const data = (await res.json().catch(() => ({}))) as {
      sid?: string;
      status?: string;
      message?: string;
    };

    if (res.ok && data.sid) {
      return {
        delivery_status: data.status === 'queued' ? 'Queued' : 'Sent',
        provider_name: opts.providerName,
        provider_message_id: data.sid,
        error_detail: '',
      };
    }

    return {
      delivery_status: 'Failed',
      provider_name: opts.providerName,
      provider_message_id: '',
      error_detail: data.message || `Twilio returned HTTP ${res.status}`,
    };
  } catch (err: unknown) {
    return {
      delivery_status: 'Failed',
      provider_name: opts.providerName,
      provider_message_id: '',
      error_detail: err instanceof Error ? err.message : 'Network error calling Twilio.',
    };
  }
}
