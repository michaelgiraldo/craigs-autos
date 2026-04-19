import {
  MANAGED_CONVERSION_CONTRACT,
  summarizeManagedConversionFeedback,
  type ManagedConversionDestinationKey,
  type ManagedConversionFeedbackStatus,
  type ManagedConversionFeedbackSummary,
} from '@craigs/contracts/managed-conversion-contract';
import type {
  LeadConversionDecision,
  LeadConversionFeedbackOutboxItem,
  LeadConversionFeedbackOutcome,
  ProviderConversionDestination,
} from '../domain/conversion-feedback.ts';
import type { LeadContact } from '../domain/contact.ts';
import {
  createConversionFeedbackOutcomeId,
  createConversionFeedbackOutcomeSortKey,
  createStableConversionDecisionId,
  createStableConversionFeedbackOutboxId,
} from '../domain/ids.ts';
import type { LeadRecord } from '../domain/lead-record.ts';
import type { LeadPlatformRepos } from '../repos/dynamo.ts';

const OUTBOX_POSITIVE_STATUSES = new Set<ManagedConversionFeedbackStatus>([
  'ready',
  'queued',
  'manual',
  'sent',
  'accepted',
  'warning',
  'attributed',
]);

function uniq(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function mapStatusLabel(status: ManagedConversionFeedbackStatus): string {
  switch (status) {
    case 'not_ready':
      return 'Not ready';
    case 'needs_signal':
      return 'Needs signal';
    case 'needs_destination_config':
      return 'Configure destination';
    case 'ready':
      return 'Ready';
    case 'queued':
      return 'Queued';
    case 'manual':
      return 'Manual';
    case 'sent':
      return 'Sent';
    case 'accepted':
      return 'Accepted';
    case 'warning':
      return 'Warning';
    case 'failed':
      return 'Failed';
    case 'attributed':
      return 'Attributed';
    case 'suppressed':
      return 'Suppressed';
    case 'retracted':
      return 'Retracted';
  }
}

function scoreStatus(status: ManagedConversionFeedbackStatus): number {
  switch (status) {
    case 'failed':
      return 90;
    case 'warning':
      return 80;
    case 'attributed':
      return 70;
    case 'accepted':
      return 60;
    case 'sent':
      return 50;
    case 'manual':
      return 45;
    case 'queued':
      return 40;
    case 'ready':
      return 30;
    case 'retracted':
      return 25;
    case 'suppressed':
      return 20;
    case 'needs_destination_config':
      return 15;
    case 'needs_signal':
      return 10;
    case 'not_ready':
      return 0;
  }
}

function pickSummaryStatus(
  items: LeadConversionFeedbackOutboxItem[],
): ManagedConversionFeedbackStatus {
  return items.reduce<ManagedConversionFeedbackStatus>(
    (selected, item) => (scoreStatus(item.status) > scoreStatus(selected) ? item.status : selected),
    'queued',
  );
}

export function summarizeDurableConversionFeedback(args: {
  qualified: boolean;
  attribution: LeadRecord['attribution'];
  contact: LeadContact | null;
  configuredDestinationKeys: ManagedConversionDestinationKey[];
  outboxItems: LeadConversionFeedbackOutboxItem[];
}): ManagedConversionFeedbackSummary {
  if (!args.outboxItems.length) {
    return summarizeManagedConversionFeedback({
      qualified: args.qualified,
      attribution: args.attribution,
      contact: args.contact,
      configuredDestinationKeys: args.configuredDestinationKeys,
    });
  }

  const status = pickSummaryStatus(args.outboxItems);
  const destinationKeys = uniq(args.outboxItems.map((item) => item.destination_key));
  const destinationLabels = uniq(args.outboxItems.map((item) => item.destination_label));
  const signalKeys = uniq(args.outboxItems.flatMap((item) => item.signal_keys));
  const primaryItem =
    args.outboxItems.find((item) => item.status === status) ?? args.outboxItems[0] ?? null;

  return {
    contract: MANAGED_CONVERSION_CONTRACT,
    status,
    status_label: mapStatusLabel(status),
    reason:
      primaryItem?.status_reason ??
      (OUTBOX_POSITIVE_STATUSES.has(status)
        ? 'Conversion feedback has durable destination state.'
        : 'Conversion feedback is not sendable.'),
    configured_destination_keys: args.configuredDestinationKeys,
    eligible_destination_keys: destinationKeys as ManagedConversionDestinationKey[],
    candidate_destination_keys: destinationKeys as ManagedConversionDestinationKey[],
    primary_destination_key: (primaryItem?.destination_key ??
      null) as ManagedConversionDestinationKey | null,
    destination_labels: destinationLabels,
    signal_keys: signalKeys,
  };
}

export async function createManagedConversionDecisionForLead(args: {
  repos: LeadPlatformRepos;
  leadRecord: LeadRecord;
  contact: LeadContact | null;
  destinations: ProviderConversionDestination[];
  occurredAtMs: number;
  actor: 'admin' | 'system';
}): Promise<{
  decision: LeadConversionDecision;
  outboxItems: LeadConversionFeedbackOutboxItem[];
  summary: ManagedConversionFeedbackSummary;
}> {
  const decisionId = createStableConversionDecisionId({
    leadRecordId: args.leadRecord.lead_record_id,
    decisionType: 'qualified_lead',
  });
  const existingDecision = await args.repos.conversionDecisions.getById(decisionId);
  const configuredDestinationKeys = args.destinations.map(
    (destination) => destination.destination_key,
  );
  const summary = summarizeManagedConversionFeedback({
    qualified: true,
    attribution: args.leadRecord.attribution,
    contact: args.contact,
    configuredDestinationKeys,
  });
  const decision: LeadConversionDecision = {
    decision_id: decisionId,
    lead_record_id: args.leadRecord.lead_record_id,
    journey_id: args.leadRecord.journey_id,
    decision_type: 'qualified_lead',
    decision_status: 'active',
    actor: args.actor,
    reason: summary.reason,
    conversion_value: null,
    currency_code: null,
    source_event_id: null,
    occurred_at_ms: args.occurredAtMs,
    created_at_ms: existingDecision?.created_at_ms ?? args.occurredAtMs,
    updated_at_ms: args.occurredAtMs,
  };

  await args.repos.conversionDecisions.put(decision);

  const outboxItems: LeadConversionFeedbackOutboxItem[] = [];
  const eligibleDestinations = args.destinations.filter((destination) =>
    summary.eligible_destination_keys.includes(destination.destination_key),
  );

  for (const destination of eligibleDestinations) {
    const outboxId = createStableConversionFeedbackOutboxId({
      decisionId,
      destinationKey: destination.destination_key,
    });
    const existingItem = await args.repos.conversionFeedbackOutbox.getById(outboxId);
    if (
      existingItem &&
      existingItem.status !== 'suppressed' &&
      existingItem.status !== 'retracted'
    ) {
      outboxItems.push(existingItem);
      continue;
    }

    const item: LeadConversionFeedbackOutboxItem = {
      outbox_id: outboxId,
      decision_id: decisionId,
      lead_record_id: args.leadRecord.lead_record_id,
      journey_id: args.leadRecord.journey_id,
      destination_key: destination.destination_key,
      destination_label: destination.destination_label,
      status: 'queued',
      status_reason: 'Queued from qualified lead decision.',
      signal_keys: summary.signal_keys,
      dedupe_key: `${decisionId}:${destination.destination_key}`,
      payload_contract: MANAGED_CONVERSION_CONTRACT,
      attempt_count: existingItem?.attempt_count ?? 0,
      lease_owner: null,
      lease_expires_at_ms: null,
      next_attempt_at_ms: args.occurredAtMs,
      last_outcome_at_ms: null,
      created_at_ms: existingItem?.created_at_ms ?? args.occurredAtMs,
      updated_at_ms: args.occurredAtMs,
    };

    await args.repos.conversionFeedbackOutbox.put(item);
    outboxItems.push(item);
  }

  return { decision, outboxItems, summary };
}

export async function suppressManagedConversionFeedbackForLead(args: {
  repos: LeadPlatformRepos;
  leadRecord: LeadRecord;
  occurredAtMs: number;
  reason: string;
}): Promise<LeadConversionFeedbackOutboxItem[]> {
  const items = await args.repos.conversionFeedbackOutbox.listByLeadRecordId(
    args.leadRecord.lead_record_id,
  );
  const updatedItems: LeadConversionFeedbackOutboxItem[] = [];

  for (const item of items) {
    const status: ManagedConversionFeedbackStatus =
      item.status === 'accepted' || item.status === 'attributed' ? 'retracted' : 'suppressed';
    if (item.status === status) {
      updatedItems.push(item);
      continue;
    }

    const updatedItem: LeadConversionFeedbackOutboxItem = {
      ...item,
      status,
      status_reason: args.reason,
      next_attempt_at_ms: null,
      lease_owner: null,
      lease_expires_at_ms: null,
      last_outcome_at_ms: args.occurredAtMs,
      updated_at_ms: args.occurredAtMs,
    };
    const outcomeId = createConversionFeedbackOutcomeId({
      outboxId: item.outbox_id,
      status,
      occurredAtMs: args.occurredAtMs,
      discriminator: args.reason,
    });
    const outcome: LeadConversionFeedbackOutcome = {
      outbox_id: item.outbox_id,
      outcome_sort_key: createConversionFeedbackOutcomeSortKey(args.occurredAtMs, outcomeId),
      outcome_id: outcomeId,
      decision_id: item.decision_id,
      lead_record_id: item.lead_record_id,
      journey_id: item.journey_id,
      destination_key: item.destination_key,
      destination_label: item.destination_label,
      status,
      message: args.reason,
      provider_response_id: null,
      error_code: null,
      diagnostics_url: null,
      occurred_at_ms: args.occurredAtMs,
      recorded_at_ms: args.occurredAtMs,
      payload: {},
    };

    await args.repos.conversionFeedbackOutbox.put(updatedItem);
    await args.repos.conversionFeedbackOutcomes.append(outcome);
    updatedItems.push(updatedItem);
  }

  return updatedItems;
}
