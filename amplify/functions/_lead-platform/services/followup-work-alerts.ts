import type {
  LeadFollowupFailureAlertKind,
  LeadFollowupWorkItem,
} from '../domain/lead-followup-work.ts';

export const LEAD_FOLLOWUP_STALE_QUEUED_SECONDS = 10 * 60;

export function summarizeLeadFollowupError(record: LeadFollowupWorkItem): string | null {
  return (
    record.customer_email_error ||
    record.sms_error ||
    record.lead_notification_error ||
    record.ai_error ||
    null
  );
}

export function wasLeadFollowupCustomerResponseSent(record: LeadFollowupWorkItem): boolean {
  return record.sms_status === 'sent' || record.email_status === 'sent';
}

export function classifyLeadFollowupAlertKind(args: {
  nowEpochSeconds: number;
  record: LeadFollowupWorkItem;
}): LeadFollowupFailureAlertKind {
  if (args.record.operator_resolution) return null;
  if (args.record.status === 'error') return 'error';
  if (args.record.status === 'queued') {
    return args.nowEpochSeconds - args.record.updated_at >= LEAD_FOLLOWUP_STALE_QUEUED_SECONDS
      ? 'stale_queued'
      : null;
  }
  if (args.record.status === 'processing') {
    return (args.record.lock_expires_at ?? 0) <= args.nowEpochSeconds ? 'stale_processing' : null;
  }
  return null;
}

export function isLeadFollowupWorkStale(args: {
  nowEpochSeconds: number;
  record: LeadFollowupWorkItem;
}): boolean {
  return classifyLeadFollowupAlertKind(args) !== null;
}

export function isLeadFollowupFailureAlertSent(record: LeadFollowupWorkItem): boolean {
  return record.failure_alert_status === 'sent' || typeof record.failure_alert_sent_at === 'number';
}

export function isLeadFollowupFailureAlertCoolingDown(args: {
  minIntervalSeconds: number;
  nowEpochSeconds: number;
  record: LeadFollowupWorkItem;
}): boolean {
  return (
    args.record.failure_alert_status === 'failed' &&
    typeof args.record.failure_alert_last_attempt_at === 'number' &&
    args.nowEpochSeconds - args.record.failure_alert_last_attempt_at < args.minIntervalSeconds
  );
}
