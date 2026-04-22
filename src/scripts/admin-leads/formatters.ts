import type { JourneyItem, LeadRecordItem, QualificationFilter } from './types';

export function toQualificationFilter(value: string): QualificationFilter {
  return value === 'true' || value === 'false' ? value : '';
}

export function stringOrDash(value: string | null | undefined): string {
  return typeof value === 'string' && value.trim() ? value.trim() : '-';
}

export function optionalString(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function formatDate(ms: number | undefined): string {
  return typeof ms === 'number' ? new Date(ms).toLocaleString() : '-';
}

export function formatLeadContact(item: LeadRecordItem): string {
  const nameSource = [
    optionalString(item.display_name_source_channel),
    optionalString(item.display_name_confidence),
  ]
    .filter((value): value is string => Boolean(value))
    .join('/');
  const contactParts = [
    optionalString(item.display_name)
      ? `${optionalString(item.display_name)}${nameSource ? ` (${nameSource})` : ''}`
      : null,
    optionalString(item.normalized_phone),
    optionalString(item.normalized_email),
  ].filter((value): value is string => Boolean(value));

  return contactParts.length ? contactParts.join(' • ') : '-';
}

export function formatLeadSource(item: LeadRecordItem): string {
  return optionalString(item.source_platform) ?? optionalString(item.utm_source) ?? '-';
}

export function formatLeadActionPath(item: LeadRecordItem): string {
  const actionPath = [optionalString(item.first_action), optionalString(item.latest_action)]
    .filter((value): value is string => Boolean(value))
    .join(' -> ');

  return actionPath || '-';
}

export function formatConversionFeedback(item: LeadRecordItem): {
  label: string;
  detail: string | null;
  positive: boolean;
} {
  const feedback = item.conversion_feedback;
  const status = optionalString(feedback?.status);
  const label = optionalString(feedback?.status_label) ?? 'Not evaluated';
  const destinations = Array.isArray(feedback?.destination_labels)
    ? feedback.destination_labels.filter((value): value is string => optionalString(value) !== null)
    : [];
  const signals = Array.isArray(feedback?.signal_keys)
    ? feedback.signal_keys.filter((value): value is string => optionalString(value) !== null)
    : [];
  const detailParts = [
    destinations.length ? `Destinations: ${destinations.join(', ')}` : null,
    signals.length ? `Signals: ${signals.join(', ')}` : null,
  ].filter((value): value is string => Boolean(value));

  return {
    label,
    detail: detailParts.length ? detailParts.join(' • ') : optionalString(feedback?.reason),
    positive:
      status === 'ready' ||
      status === 'queued' ||
      status === 'validated' ||
      status === 'manual' ||
      status === 'sent' ||
      status === 'accepted',
  };
}

export function formatJourneyActions(journey: JourneyItem): string {
  return Array.isArray(journey.action_types) && journey.action_types.length
    ? journey.action_types.join(', ')
    : '-';
}

export function formatJourneySource(journey: JourneyItem): string {
  return (
    [optionalString(journey.source_platform), optionalString(journey.acquisition_class)]
      .filter((value): value is string => Boolean(value))
      .join(' • ') ||
    optionalString(journey.landing_page) ||
    '-'
  );
}
