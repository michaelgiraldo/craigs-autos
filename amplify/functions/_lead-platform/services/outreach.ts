import { LEAD_EVENTS } from '@craigs/contracts/lead-event-contract';
import { trimToNull } from '../domain/normalize.ts';
import type { JourneyEvent } from '../domain/journey-event.ts';
import type {
  LeadOutreachSnapshot,
  LeadQualificationSnapshot,
  LeadRecordStatus,
} from '../domain/lead-record.ts';
import { buildJourneyEvent } from './journey-events.ts';

export type QuoteRequestOutreachLike = {
  sms_status?: string | null;
  sms_message_id?: string | null;
  sms_error?: string | null;
  email_status?: string | null;
  customer_email_message_id?: string | null;
  customer_email_error?: string | null;
  created_at?: number | null;
  updated_at?: number | null;
};

export function createDefaultOutreachSnapshot(): LeadOutreachSnapshot {
  return {
    channel: null,
    status: 'not_attempted',
    provider: null,
    external_id: null,
    error: null,
    sent_at_ms: null,
  };
}

export function deriveLeadRecordStatus(args: {
  qualification: LeadQualificationSnapshot;
  latestOutreach: LeadOutreachSnapshot;
}): LeadRecordStatus {
  if (args.qualification.qualified) return 'qualified';
  if (args.latestOutreach.status === 'sent') return 'outreach_sent';
  if (args.latestOutreach.status === 'failed') return 'error';
  if (args.latestOutreach.status === 'skipped') return 'new';
  return 'ready_for_outreach';
}

export function deriveQuoteRequestOutreach(record: QuoteRequestOutreachLike): LeadOutreachSnapshot {
  const smsStatus = trimToNull(record.sms_status, 32);
  const emailStatus = trimToNull(record.email_status, 32);
  const updatedAtMs = typeof record.updated_at === 'number' ? record.updated_at * 1000 : null;
  const createdAtMs = typeof record.created_at === 'number' ? record.created_at * 1000 : null;
  const eventAtMs = updatedAtMs ?? createdAtMs;

  if (smsStatus === 'sent') {
    return {
      channel: 'sms',
      status: 'sent',
      provider: 'quo',
      external_id: trimToNull(record.sms_message_id, 200),
      error: null,
      sent_at_ms: eventAtMs,
    };
  }

  if (smsStatus === 'failed') {
    return {
      channel: 'sms',
      status: 'failed',
      provider: 'quo',
      external_id: trimToNull(record.sms_message_id, 200),
      error: trimToNull(record.sms_error, 500),
      sent_at_ms: null,
    };
  }

  if (emailStatus === 'sent') {
    return {
      channel: 'email',
      status: 'sent',
      provider: 'ses',
      external_id: trimToNull(record.customer_email_message_id, 200),
      error: null,
      sent_at_ms: eventAtMs,
    };
  }

  if (emailStatus === 'failed') {
    return {
      channel: 'email',
      status: 'failed',
      provider: 'ses',
      external_id: trimToNull(record.customer_email_message_id, 200),
      error: trimToNull(record.customer_email_error, 500),
      sent_at_ms: null,
    };
  }

  if (smsStatus === 'skipped' || emailStatus === 'skipped') {
    return {
      channel: smsStatus === 'skipped' ? 'sms' : emailStatus === 'skipped' ? 'email' : null,
      status: 'skipped',
      provider: null,
      external_id: null,
      error: null,
      sent_at_ms: null,
    };
  }

  return createDefaultOutreachSnapshot();
}

export function buildQuoteRequestOutreachEvents(args: {
  journeyId: string;
  leadRecordId: string;
  occurredAtMs: number;
  recordedAtMs: number;
  record: QuoteRequestOutreachLike;
  discriminator: string;
}): JourneyEvent[] {
  const smsStatus = trimToNull(args.record.sms_status, 32);
  const emailStatus = trimToNull(args.record.email_status, 32);
  const eventAtMs =
    typeof args.record.updated_at === 'number'
      ? args.record.updated_at * 1000
      : typeof args.record.created_at === 'number'
        ? args.record.created_at * 1000
        : args.occurredAtMs;
  const events: JourneyEvent[] = [];

  if (smsStatus === 'sent' || smsStatus === 'failed') {
    events.push(
      buildJourneyEvent({
        journeyId: args.journeyId,
        leadRecordId: args.leadRecordId,
        eventName:
          smsStatus === 'sent' ? LEAD_EVENTS.outreachSmsSent : LEAD_EVENTS.outreachSmsFailed,
        occurredAtMs: eventAtMs,
        recordedAtMs: args.recordedAtMs,
        actor: 'system',
        discriminator: `${args.discriminator}:sms:${smsStatus}`,
        payload: {
          provider: 'quo',
          external_id: trimToNull(args.record.sms_message_id, 200),
          error: trimToNull(args.record.sms_error, 500),
        },
      }),
    );
  }

  if (emailStatus === 'sent' || emailStatus === 'failed') {
    events.push(
      buildJourneyEvent({
        journeyId: args.journeyId,
        leadRecordId: args.leadRecordId,
        eventName:
          emailStatus === 'sent' ? LEAD_EVENTS.outreachEmailSent : LEAD_EVENTS.outreachEmailFailed,
        occurredAtMs: eventAtMs,
        recordedAtMs: args.recordedAtMs,
        actor: 'system',
        discriminator: `${args.discriminator}:email:${emailStatus}`,
        payload: {
          provider: 'ses',
          external_id: trimToNull(args.record.customer_email_message_id, 200),
          error: trimToNull(args.record.customer_email_error, 500),
        },
      }),
    );
  }

  return events;
}
