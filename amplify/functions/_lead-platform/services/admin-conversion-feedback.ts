import type {
  LeadConversionDecision,
  LeadConversionFeedbackOutboxItem,
  LeadConversionFeedbackOutcome,
} from '../domain/conversion-feedback.ts';

export type LeadAdminConversionDecisionSummary = {
  decision_id: string;
  decision_type: LeadConversionDecision['decision_type'];
  decision_status: LeadConversionDecision['decision_status'];
  actor: LeadConversionDecision['actor'];
  reason: string | null;
  conversion_value: number | null;
  currency_code: string | null;
  occurred_at_ms: number;
  updated_at_ms: number;
};

export type LeadAdminConversionOutcomeSummary = {
  outbox_id: string;
  outcome_id: string;
  status: LeadConversionFeedbackOutcome['status'];
  message: string | null;
  provider_response_id: string | null;
  error_code: string | null;
  diagnostics_url: string | null;
  occurred_at_ms: number;
};

export type LeadAdminConversionFeedbackOutboxSummary = {
  outbox_id: string;
  decision_id: string;
  destination_key: LeadConversionFeedbackOutboxItem['destination_key'];
  destination_label: string;
  status: LeadConversionFeedbackOutboxItem['status'];
  status_reason: string | null;
  signal_keys: string[];
  attempt_count: number;
  lease_owner: string | null;
  lease_expires_at_ms: number | null;
  next_attempt_at_ms: number | null;
  last_outcome_at_ms: number | null;
  updated_at_ms: number;
  latest_outcome: LeadAdminConversionOutcomeSummary | null;
};

export type LeadAdminConversionFeedbackDetail = {
  decisions: LeadAdminConversionDecisionSummary[];
  outbox_items: LeadAdminConversionFeedbackOutboxSummary[];
  outcomes: LeadAdminConversionOutcomeSummary[];
};

function byNewestTimestamp<T>(items: T[], readTimestamp: (item: T) => number): T[] {
  return [...items].sort((a, b) => readTimestamp(b) - readTimestamp(a));
}

function toConversionDecisionSummary(
  decision: LeadConversionDecision,
): LeadAdminConversionDecisionSummary {
  return {
    decision_id: decision.decision_id,
    decision_type: decision.decision_type,
    decision_status: decision.decision_status,
    actor: decision.actor,
    reason: decision.reason,
    conversion_value: decision.conversion_value,
    currency_code: decision.currency_code,
    occurred_at_ms: decision.occurred_at_ms,
    updated_at_ms: decision.updated_at_ms,
  };
}

function toConversionOutcomeSummary(
  outcome: LeadConversionFeedbackOutcome,
): LeadAdminConversionOutcomeSummary {
  return {
    outbox_id: outcome.outbox_id,
    outcome_id: outcome.outcome_id,
    status: outcome.status,
    message: outcome.message,
    provider_response_id: outcome.provider_response_id,
    error_code: outcome.error_code,
    diagnostics_url: outcome.diagnostics_url,
    occurred_at_ms: outcome.occurred_at_ms,
  };
}

function toConversionOutboxSummary(args: {
  item: LeadConversionFeedbackOutboxItem;
  outcomesByOutboxId: Map<string, LeadAdminConversionOutcomeSummary[]>;
}): LeadAdminConversionFeedbackOutboxSummary {
  return {
    outbox_id: args.item.outbox_id,
    decision_id: args.item.decision_id,
    destination_key: args.item.destination_key,
    destination_label: args.item.destination_label,
    status: args.item.status,
    status_reason: args.item.status_reason,
    signal_keys: args.item.signal_keys,
    attempt_count: args.item.attempt_count,
    lease_owner: args.item.lease_owner,
    lease_expires_at_ms: args.item.lease_expires_at_ms,
    next_attempt_at_ms: args.item.next_attempt_at_ms,
    last_outcome_at_ms: args.item.last_outcome_at_ms,
    updated_at_ms: args.item.updated_at_ms,
    latest_outcome: args.outcomesByOutboxId.get(args.item.outbox_id)?.[0] ?? null,
  };
}

export function buildLeadAdminConversionFeedbackDetail(args: {
  conversionDecisions?: LeadConversionDecision[];
  conversionFeedbackOutboxItems?: LeadConversionFeedbackOutboxItem[];
  conversionFeedbackOutcomes?: LeadConversionFeedbackOutcome[];
}): LeadAdminConversionFeedbackDetail {
  const outcomes = byNewestTimestamp(
    (args.conversionFeedbackOutcomes ?? []).map(toConversionOutcomeSummary),
    (outcome) => outcome.occurred_at_ms,
  );
  const outcomesByOutboxId = new Map<string, LeadAdminConversionOutcomeSummary[]>();
  for (const outcome of outcomes) {
    const list = outcomesByOutboxId.get(outcome.outbox_id) ?? [];
    list.push(outcome);
    outcomesByOutboxId.set(outcome.outbox_id, list);
  }

  return {
    decisions: byNewestTimestamp(
      (args.conversionDecisions ?? []).map(toConversionDecisionSummary),
      (decision) => decision.occurred_at_ms,
    ),
    outbox_items: byNewestTimestamp(
      (args.conversionFeedbackOutboxItems ?? []).map((item) =>
        toConversionOutboxSummary({ item, outcomesByOutboxId }),
      ),
      (item) => item.updated_at_ms,
    ),
    outcomes,
  };
}
