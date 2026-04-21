import { buildReplySubject } from '../_shared/email-threading.ts';
import { getErrorDetails } from '../_shared/safe.ts';
import { isPlausibleEmail, phoneToE164 } from '../_shared/text-utils.ts';
import type {
  LeadFollowupOutreachResult,
  LeadFollowupSendStatus,
  LeadFollowupWorkItem,
} from '../_lead-platform/domain/lead-followup-work.ts';
import type {
  LeadFollowupWorkerDeps,
  LeadFollowupWorkflowOutcome,
  LeasedLeadFollowupWorkItem,
} from './types.ts';

export function isEmailFirst(record: LeadFollowupWorkItem): boolean {
  return record.capture_channel === 'email' || record.preferred_outreach_channel === 'email';
}

export function getUsableEmail(record: LeadFollowupWorkItem): string {
  return isPlausibleEmail(record.email) ? record.email.trim() : '';
}

export function getOutreachResult(record: LeadFollowupWorkItem): LeadFollowupOutreachResult {
  const hasPhone = Boolean(phoneToE164(record.phone));
  const hasEmail = isPlausibleEmail(record.email);

  if (record.sms_status === 'sent') return 'sms_sent';
  if (record.email_status === 'sent') {
    return isEmailFirst(record) ? 'email_sent' : 'email_sent_fallback';
  }
  if (
    hasPhone &&
    record.sms_status === 'skipped' &&
    record.sms_error === 'manual_followup_required'
  ) {
    return 'manual_followup_required';
  }
  if (!hasPhone && !hasEmail) return 'no_customer_contact_method';
  if (hasPhone && record.sms_status === 'failed' && !hasEmail)
    return 'sms_failed_no_email_fallback';
  if (record.sms_status === 'failed' || record.email_status === 'failed') {
    return 'customer_outreach_failed';
  }
  return null;
}

export function isStaleFollowupWorkLeaseError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'StaleFollowupWorkLeaseError' || error.message === 'stale_followup_work_lease')
  );
}

export function staleLeaseOutcome(): LeadFollowupWorkflowOutcome {
  return {
    statusCode: 200,
    body: { ok: true, skipped: true, reason: 'stale_lease' },
  };
}

function isDeliveryAttemptInProgress(status: LeadFollowupSendStatus): boolean {
  return status === 'sending';
}

function hasPendingDeliveryAttempt(record: LeadFollowupWorkItem): boolean {
  return (
    isDeliveryAttemptInProgress(record.sms_status) ||
    isDeliveryAttemptInProgress(record.email_status) ||
    isDeliveryAttemptInProgress(record.owner_email_status)
  );
}

async function pendingDeliveryAttemptOutcome(
  deps: LeadFollowupWorkerDeps,
  record: LeadFollowupWorkItem,
): Promise<LeadFollowupWorkflowOutcome> {
  record.status = 'error';
  record.lock_expires_at = undefined;
  record.owner_email_error = record.owner_email_error || 'delivery_attempt_unconfirmed';
  await persistRecord(deps, record);
  return {
    statusCode: 502,
    body: {
      error: 'Delivery attempt outcome is unknown.',
      reason: 'delivery_attempt_unconfirmed',
    },
  };
}

function requireActiveLease(record: LeadFollowupWorkItem): LeasedLeadFollowupWorkItem {
  if (!record.lease_id) {
    const error = new Error('stale_followup_work_lease');
    error.name = 'StaleFollowupWorkLeaseError';
    throw error;
  }
  return record as LeasedLeadFollowupWorkItem;
}

export async function persistRecord(deps: LeadFollowupWorkerDeps, record: LeadFollowupWorkItem) {
  record.updated_at = deps.nowEpochSeconds();
  await deps.saveFollowupWork(requireActiveLease(record));
}

function chooseEmailSubject(record: LeadFollowupWorkItem, generatedSubject: string): string {
  return isEmailFirst(record) && record.inbound_email_subject
    ? buildReplySubject(record.inbound_email_subject)
    : generatedSubject;
}

export async function ensureDrafts(deps: LeadFollowupWorkerDeps, record: LeadFollowupWorkItem) {
  if (isEmailFirst(record) && record.email_subject && record.email_body) {
    const replySubject = chooseEmailSubject(record, record.email_subject);
    if (replySubject !== record.email_subject) {
      record.email_subject = replySubject;
      await persistRecord(deps, record);
    }
    return;
  }

  if (!isEmailFirst(record) && record.sms_body && record.email_subject && record.email_body) {
    return;
  }

  const generated = await deps.generateDrafts(record);
  record.ai_status = generated.aiStatus;
  record.ai_model = generated.aiModel;
  record.ai_error = generated.aiError;
  record.sms_body = generated.drafts.smsBody;
  record.email_subject = chooseEmailSubject(record, generated.drafts.emailSubject);
  record.email_body = generated.drafts.emailBody;
  record.missing_info = generated.drafts.missingInfo;
  await persistRecord(deps, record);
}

export async function attemptSmsOutreach(
  deps: LeadFollowupWorkerDeps,
  record: LeadFollowupWorkItem,
  usablePhone: string | null,
) {
  if (record.sms_status === 'sending') {
    return;
  }

  if (usablePhone && record.sms_status !== 'sent') {
    if (!deps.smsAutomationEnabled) {
      record.sms_status = 'skipped';
      record.sms_error = 'manual_followup_required';
      record.outreach_channel = null;
      await persistRecord(deps, record);
      return;
    }

    record.sms_status = 'sending';
    record.sms_error = '';
    await persistRecord(deps, record);

    try {
      const smsResult = await deps.sendSms({ toE164: usablePhone, body: record.sms_body });
      record.sms_status = 'sent';
      record.sms_message_id = smsResult.id;
      record.sms_error = '';
      record.outreach_channel = 'sms';
    } catch (error: unknown) {
      const { message } = getErrorDetails(error);
      record.sms_status = 'failed';
      record.sms_error = message ?? 'SMS send failed';
    }
    await persistRecord(deps, record);
    return;
  }

  if (!usablePhone && !record.sms_status) {
    record.sms_status = 'skipped';
  }
}

export async function skipSmsForEmailFirst(
  deps: LeadFollowupWorkerDeps,
  record: LeadFollowupWorkItem,
) {
  if (!record.sms_status) {
    record.sms_status = 'skipped';
    await persistRecord(deps, record);
  }
}

export async function attemptEmailOutreach(
  deps: LeadFollowupWorkerDeps,
  record: LeadFollowupWorkItem,
  usablePhone: string | null,
  usableEmail: string,
) {
  if (record.email_status === 'sending') {
    return;
  }

  const shouldSendEmailFallback =
    usableEmail &&
    record.email_status !== 'sent' &&
    (isEmailFirst(record) ||
      (Boolean(usablePhone) &&
        (record.sms_status === 'failed' || record.sms_status === 'skipped')) ||
      !usablePhone);

  if (shouldSendEmailFallback) {
    record.email_status = 'sending';
    record.customer_email_error = '';
    await persistRecord(deps, record);

    try {
      const emailResult = await deps.sendCustomerEmail({
        record,
        to: usableEmail,
        subject: record.email_subject,
        body: record.email_body,
      });
      record.email_status = 'sent';
      record.customer_email_message_id = emailResult.messageId;
      record.customer_email_error = '';
      if (record.outreach_channel !== 'sms') {
        record.outreach_channel = 'email';
      }
    } catch (error: unknown) {
      const { message } = getErrorDetails(error);
      record.email_status = 'failed';
      record.customer_email_error = message ?? 'Customer email send failed';
    }
    await persistRecord(deps, record);
    return;
  }

  if (!record.email_status) {
    record.email_status = 'skipped';
  }
}

async function cleanupInboundEmailSource(
  deps: LeadFollowupWorkerDeps,
  record: LeadFollowupWorkItem,
) {
  if (
    !deps.cleanupInboundEmailSource ||
    !record.inbound_email_s3_bucket ||
    !record.inbound_email_s3_key
  ) {
    return;
  }

  try {
    await deps.cleanupInboundEmailSource(record);
  } catch (error: unknown) {
    console.error('Failed to clean up inbound email source object.', error);
  }
}

async function sendOwnerNotification(
  deps: LeadFollowupWorkerDeps,
  record: LeadFollowupWorkItem,
): Promise<LeadFollowupWorkflowOutcome | null> {
  if (record.owner_email_status === 'sent' || record.owner_email_status === 'sending') {
    return null;
  }

  record.owner_email_status = 'sending';
  record.owner_email_error = '';
  await persistRecord(deps, record);

  try {
    const ownerEmailResult = await deps.sendOwnerEmail({ record });
    record.owner_email_status = 'sent';
    record.owner_email_message_id = ownerEmailResult.messageId;
    record.owner_email_error = '';
    return null;
  } catch (error: unknown) {
    const { message } = getErrorDetails(error);
    record.owner_email_status = 'failed';
    record.owner_email_error = message ?? 'Internal owner email send failed';
    record.status = 'error';
    record.lock_expires_at = undefined;
    await persistRecord(deps, record);
    return {
      statusCode: 502,
      body: { error: 'Owner notification failed' },
    };
  }
}

export async function completeWorkflow(args: {
  deps: LeadFollowupWorkerDeps;
  followupWorkId: string;
  record: LeadFollowupWorkItem;
}): Promise<LeadFollowupWorkflowOutcome> {
  const { deps, followupWorkId, record } = args;

  record.outreach_result = getOutreachResult(record);

  if (hasPendingDeliveryAttempt(record)) {
    return pendingDeliveryAttemptOutcome(deps, record);
  }

  const ownerFailure = await sendOwnerNotification(deps, record);
  if (ownerFailure) {
    return ownerFailure;
  }

  record.status = 'completed';
  record.lock_expires_at = undefined;
  await persistRecord(deps, record);
  await cleanupInboundEmailSource(deps, record);

  return {
    statusCode: 200,
    body: {
      ok: true,
      followup_work_id: followupWorkId,
      outreach_result: record.outreach_result,
    },
  };
}

export async function failWorkflow(args: {
  deps: LeadFollowupWorkerDeps;
  record: LeadFollowupWorkItem;
  error: unknown;
}): Promise<LeadFollowupWorkflowOutcome> {
  if (isStaleFollowupWorkLeaseError(args.error)) {
    return staleLeaseOutcome();
  }

  const { message } = getErrorDetails(args.error);
  args.record.status = 'error';
  args.record.lock_expires_at = undefined;
  args.record.owner_email_error =
    args.record.owner_email_error || message || 'Quote follow-up failed';
  await persistRecord(args.deps, args.record);
  return {
    statusCode: 502,
    body: { error: 'Unable to process lead follow-up right now.' },
  };
}
