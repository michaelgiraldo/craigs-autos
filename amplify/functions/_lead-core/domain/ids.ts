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
  sourceKind: 'form_submission' | 'chat_thread' | 'journey';
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

export function createClientEventId(prefix = 'evt'): string {
  return `${prefix}_${randomUUID()}`;
}
