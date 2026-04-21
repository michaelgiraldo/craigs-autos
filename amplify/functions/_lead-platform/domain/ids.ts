import { createHash, randomUUID } from 'node:crypto';
import type { JourneyEventName } from './journey-event.ts';

function createStableId(prefix: string, parts: Array<string | number | null | undefined>): string {
  const serialized = parts.map((part) => (part == null ? '' : String(part))).join('|');
  const digest = createHash('sha256').update(serialized).digest('hex').slice(0, 24);
  return `${prefix}_${digest}`;
}

export function createStableLeadContactId(args: {
  normalizedPhone: string | null;
  normalizedEmail: string | null;
}): string {
  if (!args.normalizedPhone && !args.normalizedEmail) {
    return `contact_${randomUUID()}`;
  }

  return createStableId('contact', ['lead-contact', args.normalizedPhone, args.normalizedEmail]);
}

export function createStableJourneyId(args: {
  providedJourneyId?: string | null;
  fallbackKind?: string | null;
  fallbackValue?: string | null;
}): string {
  if (typeof args.providedJourneyId === 'string' && args.providedJourneyId.trim()) {
    return args.providedJourneyId.trim();
  }
  if (args.fallbackKind && args.fallbackValue) {
    return createStableId('journey', ['lead-journey', args.fallbackKind, args.fallbackValue]);
  }
  return `journey_${randomUUID()}`;
}

export function createStableLeadRecordId(args: {
  sourceKind: 'quote_request' | 'chat_thread' | 'journey';
  sourceValue: string;
}): string {
  return createStableId('lead', ['lead-record', args.sourceKind, args.sourceValue]);
}

export function createJourneyEventId(args: {
  journeyId: string;
  eventName: JourneyEventName;
  occurredAtMs: number;
  clientEventId?: string | null;
  discriminator?: string | null;
}): string {
  if (args.clientEventId?.trim()) {
    return createStableId('journey_event', [
      'journey-event-client',
      args.journeyId,
      args.clientEventId.trim(),
    ]);
  }

  return createStableId('journey_event', [
    'journey-event',
    args.journeyId,
    args.eventName,
    args.occurredAtMs,
    args.clientEventId,
    args.discriminator,
  ]);
}

export function createJourneyEventSortKey(occurredAtMs: number, eventId: string): string {
  return `${String(occurredAtMs).padStart(16, '0')}#${eventId}`;
}

export function createClientJourneyEventSortKey(args: {
  journeyId: string;
  clientEventId: string;
}): string {
  return createStableId('client_event', [
    'journey-client-event',
    args.journeyId,
    args.clientEventId.trim(),
  ]);
}

export function createClientEventId(prefix = 'evt'): string {
  return `${prefix}_${randomUUID()}`;
}

export function createStableLeadFollowupWorkId(args: {
  idempotencyKey: string;
  prefix?: string | null;
}): string {
  const prefix = args.prefix?.trim() || 'followup_work';
  return createStableId(prefix, ['lead-followup-work', args.idempotencyKey.trim()]);
}

export function createStableConversionDecisionId(args: {
  leadRecordId: string;
  decisionType: string;
}): string {
  return createStableId('conversion_decision', [
    'lead-conversion-decision',
    args.leadRecordId,
    args.decisionType,
  ]);
}

export function createStableConversionFeedbackOutboxId(args: {
  decisionId: string;
  destinationKey: string;
}): string {
  return createStableId('conversion_feedback', [
    'lead-conversion-feedback-outbox',
    args.decisionId,
    args.destinationKey,
  ]);
}

export function createConversionFeedbackOutcomeId(args: {
  outboxId: string;
  status: string;
  occurredAtMs: number;
  discriminator?: string | null;
}): string {
  return createStableId('conversion_outcome', [
    'lead-conversion-feedback-outcome',
    args.outboxId,
    args.status,
    args.occurredAtMs,
    args.discriminator,
  ]);
}

export function createConversionFeedbackOutcomeSortKey(
  occurredAtMs: number,
  outcomeId: string,
): string {
  return `${String(occurredAtMs).padStart(16, '0')}#${outcomeId}`;
}
