import type {
  LeadConversionDecision,
  LeadConversionFeedbackOutboxItem,
  LeadConversionFeedbackOutcome,
  ProviderConversionDestination,
} from '../../amplify/functions/_lead-platform/domain/conversion-feedback.ts';
import { MANAGED_CONVERSION_PROVIDER_CONFIG_FIELDS } from '../../amplify/functions/_lead-platform/services/conversion-feedback/adapter-registry.ts';

export function redactDestination(
  destination: ProviderConversionDestination,
): ProviderConversionDestination {
  const fieldsByKey = new Map(
    MANAGED_CONVERSION_PROVIDER_CONFIG_FIELDS.map((field) => [field.providerConfigKey, field]),
  );
  const providerConfig = Object.fromEntries(
    Object.entries(destination.provider_config).map(([key, value]) => [
      key,
      fieldsByKey.get(key)?.secret && value ? '[redacted]' : value,
    ]),
  );

  return {
    ...destination,
    provider_config: providerConfig,
  };
}

export function formatDate(ms: number | null | undefined): string {
  return typeof ms === 'number' && Number.isFinite(ms) ? new Date(ms).toISOString() : '-';
}

export function truncate(value: string | null | undefined, length = 72): string {
  if (!value) return '-';
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
}

export function sortDecisions(items: LeadConversionDecision[]): LeadConversionDecision[] {
  return [...items].sort((a, b) => b.occurred_at_ms - a.occurred_at_ms);
}

export function sortOutboxItems(
  items: LeadConversionFeedbackOutboxItem[],
): LeadConversionFeedbackOutboxItem[] {
  return [...items].sort((a, b) => b.updated_at_ms - a.updated_at_ms);
}

export function sortOutcomes(
  items: LeadConversionFeedbackOutcome[],
): LeadConversionFeedbackOutcome[] {
  return [...items].sort((a, b) => b.occurred_at_ms - a.occurred_at_ms);
}

export function printDecisionRows(items: LeadConversionDecision[]): void {
  console.log(
    'decision_id                              type            status      lead_record_id                           occurred_at',
  );
  for (const item of items) {
    console.log(
      [
        item.decision_id.padEnd(41),
        item.decision_type.padEnd(16),
        item.decision_status.padEnd(12),
        item.lead_record_id.padEnd(41),
        formatDate(item.occurred_at_ms),
      ].join(''),
    );
  }
}

export function printOutboxRows(items: LeadConversionFeedbackOutboxItem[]): void {
  console.log(
    'outbox_id                                destination       status                    attempts  next_attempt_at              updated_at',
  );
  for (const item of items) {
    console.log(
      [
        item.outbox_id.padEnd(41),
        item.destination_key.padEnd(18),
        item.status.padEnd(26),
        String(item.attempt_count).padEnd(10),
        formatDate(item.next_attempt_at_ms).padEnd(29),
        formatDate(item.updated_at_ms),
      ].join(''),
    );
  }
}

export function printOutcomeRows(items: LeadConversionFeedbackOutcome[]): void {
  if (!items.length) {
    console.log('outcomes: (none)');
    return;
  }
  console.log('outcomes');
  for (const item of items) {
    console.log(
      `- ${formatDate(item.occurred_at_ms)} ${item.destination_key} ${item.status}: ${truncate(
        item.message,
      )}`,
    );
  }
}
