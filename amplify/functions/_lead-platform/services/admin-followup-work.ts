import type {
  LeadFollowupSendStatus,
  LeadFollowupWorkItem,
  LeadFollowupWorkStatus,
} from '../domain/lead-followup-work.ts';
import type { CustomerResponsePolicy, LeadSummary } from '../domain/lead-summary.ts';
import { isLeadFollowupWorkStale, summarizeLeadFollowupError } from './followup-work-alerts.ts';

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
  lead_summary: LeadSummary | null;
  customer_response_policy: CustomerResponsePolicy;
  customer_response_policy_reason: string;
  origin: string;
  page_url: string;
  sms_status: LeadFollowupSendStatus;
  email_status: LeadFollowupSendStatus;
  lead_notification_status: LeadFollowupSendStatus;
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

function hasUnconfirmedDeliveryAttempt(record: LeadFollowupWorkItem): boolean {
  return (
    record.sms_status === 'sending' ||
    record.email_status === 'sending' ||
    record.lead_notification_status === 'sending'
  );
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
    lead_summary: args.record.lead_summary ?? null,
    customer_response_policy: args.record.customer_response_policy ?? 'automatic',
    customer_response_policy_reason: args.record.customer_response_policy_reason ?? '',
    origin: args.record.origin,
    page_url: args.record.page_url,
    sms_status: args.record.sms_status,
    email_status: args.record.email_status,
    lead_notification_status: args.record.lead_notification_status,
    outreach_result: args.record.outreach_result,
    error: summarizeLeadFollowupError(args.record),
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
