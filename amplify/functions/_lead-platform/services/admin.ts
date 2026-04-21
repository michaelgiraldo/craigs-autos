import type {
  ManagedConversionDestinationKey,
  ManagedConversionFeedbackSummary,
} from '@craigs/contracts/managed-conversion-contract';
import type { DeviceType } from '../domain/attribution.ts';
import type {
  LeadConversionDecision,
  LeadConversionFeedbackOutboxItem,
  LeadConversionFeedbackOutcome,
} from '../domain/conversion-feedback.ts';
import type { LeadContact } from '../domain/contact.ts';
import type { Journey } from '../domain/journey.ts';
import type { LeadRecord } from '../domain/lead-record.ts';
import type {
  LeadFollowupSendStatus,
  LeadFollowupWorkItem,
  LeadFollowupWorkStatus,
} from '../domain/lead-followup-work.ts';
import { summarizeDurableConversionFeedback } from './managed-conversion-feedback.ts';

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

export type LeadAdminRecordSummary = {
  lead_record_id: string;
  journey_id: string;
  status: LeadRecord['status'];
  capture_channel: LeadRecord['capture_channel'];
  title: string;
  display_name: string | null;
  normalized_phone: string | null;
  normalized_email: string | null;
  device_type: DeviceType | null;
  source_platform: string | null;
  acquisition_class: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  landing_page: string | null;
  referrer_host: string | null;
  click_id_type: string | null;
  click_id: string | null;
  qualified: boolean;
  conversion_feedback: ManagedConversionFeedbackSummary;
  conversion_feedback_detail: LeadAdminConversionFeedbackDetail;
  outreach_channel: LeadRecord['latest_outreach']['channel'];
  outreach_status: LeadRecord['latest_outreach']['status'];
  first_action: LeadRecord['first_action'];
  latest_action: LeadRecord['latest_action'];
  action_types: LeadRecord['action_types'];
  action_count: number;
  created_at_ms: number;
  updated_at_ms: number;
};

export type LeadAdminJourneySummary = {
  journey_id: string;
  lead_record_id: string | null;
  journey_status: Journey['journey_status'];
  status_reason: string | null;
  capture_channel: Journey['capture_channel'];
  first_action: Journey['first_action'];
  latest_action: Journey['latest_action'];
  action_types: Journey['action_types'];
  action_count: number;
  thread_id: string | null;
  lead_user_id: string | null;
  device_type: DeviceType | null;
  source_platform: string | null;
  acquisition_class: string | null;
  landing_page: string | null;
  referrer_host: string | null;
  created_at_ms: number;
  updated_at_ms: number;
};

export type LeadAdminFollowupWorkSummary = {
  idempotency_key: string;
  followup_work_id: string;
  source_event_id: string;
  status: LeadFollowupWorkStatus;
  capture_channel: LeadFollowupWorkItem['capture_channel'];
  lead_record_id: string | null;
  journey_id: string | null;
  contact_id: string | null;
  name: string;
  email: string;
  phone: string;
  vehicle: string;
  service: string;
  origin: string;
  page_url: string;
  sms_status: LeadFollowupSendStatus;
  email_status: LeadFollowupSendStatus;
  owner_email_status: LeadFollowupSendStatus;
  outreach_result: LeadFollowupWorkItem['outreach_result'];
  error: string | null;
  lock_expires_at: number | null;
  created_at: number;
  updated_at: number;
  age_seconds: number;
  stale: boolean;
  retry_allowed: boolean;
  manual_resolution_allowed: boolean;
  action_block_reason: string | null;
  operator_resolution: LeadFollowupWorkItem['operator_resolution'] | null;
  operator_resolution_reason: string | null;
  operator_resolved_at: number | null;
};

export const LEAD_FOLLOWUP_STALE_QUEUED_SECONDS = 10 * 60;

function hasUnconfirmedDeliveryAttempt(record: LeadFollowupWorkItem): boolean {
  return (
    record.sms_status === 'sending' ||
    record.email_status === 'sending' ||
    record.owner_email_status === 'sending'
  );
}

function summarizeFollowupError(record: LeadFollowupWorkItem): string | null {
  return (
    record.customer_email_error ||
    record.sms_error ||
    record.owner_email_error ||
    record.ai_error ||
    null
  );
}

export function isLeadFollowupWorkStale(args: {
  nowEpochSeconds: number;
  record: LeadFollowupWorkItem;
}): boolean {
  if (args.record.status === 'error') return true;
  if (args.record.status === 'queued') {
    return args.nowEpochSeconds - args.record.updated_at >= LEAD_FOLLOWUP_STALE_QUEUED_SECONDS;
  }
  if (args.record.status === 'processing') {
    return (args.record.lock_expires_at ?? 0) <= args.nowEpochSeconds;
  }
  return false;
}

export function getLeadFollowupRetryBlockReason(args: {
  nowEpochSeconds: number;
  record: LeadFollowupWorkItem;
}): string | null {
  if (args.record.status === 'completed') return 'already_completed';
  if (hasUnconfirmedDeliveryAttempt(args.record)) return 'delivery_attempt_unconfirmed';
  if (
    args.record.status === 'processing' &&
    (args.record.lock_expires_at ?? 0) > args.nowEpochSeconds
  ) {
    return 'active_lease';
  }
  if (args.record.status === 'queued' && !isLeadFollowupWorkStale(args)) return 'recently_queued';
  return null;
}

export function toLeadAdminFollowupWorkSummary(args: {
  nowEpochSeconds: number;
  record: LeadFollowupWorkItem;
}): LeadAdminFollowupWorkSummary {
  const blockReason = getLeadFollowupRetryBlockReason(args);
  return {
    idempotency_key: args.record.idempotency_key,
    followup_work_id: args.record.followup_work_id,
    source_event_id: args.record.source_event_id,
    status: args.record.status,
    capture_channel: args.record.capture_channel,
    lead_record_id: args.record.lead_record_id,
    journey_id: args.record.journey_id,
    contact_id: args.record.contact_id,
    name: args.record.name,
    email: args.record.email,
    phone: args.record.phone,
    vehicle: args.record.vehicle,
    service: args.record.service,
    origin: args.record.origin,
    page_url: args.record.page_url,
    sms_status: args.record.sms_status,
    email_status: args.record.email_status,
    owner_email_status: args.record.owner_email_status,
    outreach_result: args.record.outreach_result,
    error: summarizeFollowupError(args.record),
    lock_expires_at: args.record.lock_expires_at ?? null,
    created_at: args.record.created_at,
    updated_at: args.record.updated_at,
    age_seconds: Math.max(0, args.nowEpochSeconds - args.record.updated_at),
    stale: isLeadFollowupWorkStale(args),
    retry_allowed: blockReason === null,
    manual_resolution_allowed: args.record.status !== 'completed',
    action_block_reason: blockReason,
    operator_resolution: args.record.operator_resolution ?? null,
    operator_resolution_reason: args.record.operator_resolution_reason ?? null,
    operator_resolved_at: args.record.operator_resolved_at ?? null,
  };
}

function pickClickId(record: { attribution: LeadRecord['attribution'] | Journey['attribution'] }) {
  return (
    record.attribution?.gclid ??
    record.attribution?.gbraid ??
    record.attribution?.wbraid ??
    record.attribution?.msclkid ??
    record.attribution?.fbclid ??
    record.attribution?.ttclid ??
    record.attribution?.li_fat_id ??
    record.attribution?.epik ??
    record.attribution?.sc_click_id ??
    record.attribution?.yelp_lead_id ??
    null
  );
}

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

function buildConversionFeedbackDetail(args: {
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

export function toLeadAdminRecordSummary(args: {
  leadRecord: LeadRecord;
  contact: LeadContact | null;
  configuredConversionDestinations?: ManagedConversionDestinationKey[];
  conversionDecisions?: LeadConversionDecision[];
  conversionFeedbackOutboxItems?: LeadConversionFeedbackOutboxItem[];
  conversionFeedbackOutcomes?: LeadConversionFeedbackOutcome[];
}): LeadAdminRecordSummary {
  return {
    lead_record_id: args.leadRecord.lead_record_id,
    journey_id: args.leadRecord.journey_id,
    status: args.leadRecord.status,
    capture_channel: args.leadRecord.capture_channel,
    title: args.leadRecord.title,
    display_name: args.contact?.display_name ?? null,
    normalized_phone: args.contact?.normalized_phone ?? null,
    normalized_email: args.contact?.normalized_email ?? null,
    device_type: args.leadRecord.attribution?.device_type ?? null,
    source_platform: args.leadRecord.attribution?.source_platform ?? null,
    acquisition_class: args.leadRecord.attribution?.acquisition_class ?? null,
    utm_source: args.leadRecord.attribution?.utm_source ?? null,
    utm_medium: args.leadRecord.attribution?.utm_medium ?? null,
    utm_campaign: args.leadRecord.attribution?.utm_campaign ?? null,
    utm_term: args.leadRecord.attribution?.utm_term ?? null,
    utm_content: args.leadRecord.attribution?.utm_content ?? null,
    landing_page: args.leadRecord.attribution?.landing_page ?? null,
    referrer_host: args.leadRecord.attribution?.referrer_host ?? null,
    click_id_type: args.leadRecord.attribution?.click_id_type ?? null,
    click_id: pickClickId(args.leadRecord),
    qualified: args.leadRecord.qualification.qualified,
    conversion_feedback: summarizeDurableConversionFeedback({
      qualified: args.leadRecord.qualification.qualified,
      attribution: args.leadRecord.attribution,
      contact: args.contact,
      configuredDestinationKeys: args.configuredConversionDestinations ?? [],
      outboxItems: args.conversionFeedbackOutboxItems ?? [],
    }),
    conversion_feedback_detail: buildConversionFeedbackDetail({
      conversionDecisions: args.conversionDecisions,
      conversionFeedbackOutboxItems: args.conversionFeedbackOutboxItems,
      conversionFeedbackOutcomes: args.conversionFeedbackOutcomes,
    }),
    outreach_channel: args.leadRecord.latest_outreach.channel,
    outreach_status: args.leadRecord.latest_outreach.status,
    first_action: args.leadRecord.first_action,
    latest_action: args.leadRecord.latest_action,
    action_types: args.leadRecord.action_types,
    action_count: args.leadRecord.action_count,
    created_at_ms: args.leadRecord.created_at_ms,
    updated_at_ms: args.leadRecord.updated_at_ms,
  };
}

export function toLeadAdminJourneySummary(journey: Journey): LeadAdminJourneySummary {
  return {
    journey_id: journey.journey_id,
    lead_record_id: journey.lead_record_id,
    journey_status: journey.journey_status,
    status_reason: journey.status_reason,
    capture_channel: journey.capture_channel,
    first_action: journey.first_action,
    latest_action: journey.latest_action,
    action_types: journey.action_types,
    action_count: journey.action_count,
    thread_id: journey.thread_id,
    lead_user_id: journey.lead_user_id,
    device_type: journey.attribution?.device_type ?? null,
    source_platform: journey.attribution?.source_platform ?? null,
    acquisition_class: journey.attribution?.acquisition_class ?? null,
    landing_page: journey.attribution?.landing_page ?? null,
    referrer_host: journey.attribution?.referrer_host ?? null,
    created_at_ms: journey.created_at_ms,
    updated_at_ms: journey.updated_at_ms,
  };
}
