import type {
  QuoteOutreachResult,
  QuoteRequestRecord,
} from '../_lead-platform/domain/quote-request.ts';
import { getErrorDetails } from '../_shared/safe.ts';
import { isPlausibleEmail, phoneToE164 } from '../_shared/text-utils.ts';
import type { LeadFollowupWorkerDeps, QuoteWorkflowOutcome } from './types.ts';

export function getOutreachResult(record: QuoteRequestRecord): QuoteOutreachResult {
  const hasPhone = Boolean(phoneToE164(record.phone));
  const hasEmail = isPlausibleEmail(record.email);

  if (record.sms_status === 'sent') return 'sms_sent';
  if (record.email_status === 'sent') return 'email_sent_fallback';
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

async function persistRecord(deps: LeadFollowupWorkerDeps, record: QuoteRequestRecord) {
  record.updated_at = deps.nowEpochSeconds();
  await deps.saveQuoteRequest(record);
}

async function ensureDrafts(deps: LeadFollowupWorkerDeps, record: QuoteRequestRecord) {
  if (record.sms_body && record.email_subject && record.email_body) {
    return;
  }

  const generated = await deps.generateDrafts(record);
  record.ai_status = generated.aiStatus;
  record.ai_model = generated.aiModel;
  record.ai_error = generated.aiError;
  record.sms_body = generated.drafts.smsBody;
  record.email_subject = generated.drafts.emailSubject;
  record.email_body = generated.drafts.emailBody;
  record.missing_info = generated.drafts.missingInfo;
  await persistRecord(deps, record);
}

async function attemptSmsOutreach(
  deps: LeadFollowupWorkerDeps,
  record: QuoteRequestRecord,
  usablePhone: string | null,
) {
  if (usablePhone && record.sms_status !== 'sent') {
    if (!deps.smsAutomationEnabled) {
      record.sms_status = 'skipped';
      record.sms_error = 'manual_followup_required';
      record.outreach_channel = null;
      await persistRecord(deps, record);
      return;
    }

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

async function attemptEmailFallback(
  deps: LeadFollowupWorkerDeps,
  record: QuoteRequestRecord,
  usablePhone: string | null,
  usableEmail: string,
) {
  const shouldSendEmailFallback =
    usableEmail &&
    record.email_status !== 'sent' &&
    ((Boolean(usablePhone) &&
      (record.sms_status === 'failed' || record.sms_status === 'skipped')) ||
      !usablePhone);

  if (shouldSendEmailFallback) {
    try {
      const emailResult = await deps.sendCustomerEmail({
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

async function sendOwnerNotification(
  deps: LeadFollowupWorkerDeps,
  record: QuoteRequestRecord,
): Promise<QuoteWorkflowOutcome | null> {
  if (record.owner_email_status === 'sent') {
    return null;
  }

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

export async function runLeadFollowupWorkerWorkflow(args: {
  deps: LeadFollowupWorkerDeps;
  record: QuoteRequestRecord;
  quoteRequestId: string;
}): Promise<QuoteWorkflowOutcome> {
  const { deps, record, quoteRequestId } = args;

  try {
    await ensureDrafts(deps, record);

    const usablePhone = phoneToE164(record.phone);
    const usableEmail = isPlausibleEmail(record.email) ? record.email.trim() : '';

    await attemptSmsOutreach(deps, record, usablePhone);
    await attemptEmailFallback(deps, record, usablePhone, usableEmail);

    record.outreach_result = getOutreachResult(record);

    const ownerFailure = await sendOwnerNotification(deps, record);
    if (ownerFailure) {
      return ownerFailure;
    }

    record.status = 'completed';
    record.lock_expires_at = undefined;
    await persistRecord(deps, record);

    return {
      statusCode: 200,
      body: {
        ok: true,
        quote_request_id: quoteRequestId,
        outreach_result: record.outreach_result,
      },
    };
  } catch (error: unknown) {
    const { message } = getErrorDetails(error);
    record.status = 'error';
    record.lock_expires_at = undefined;
    record.owner_email_error = record.owner_email_error || message || 'Quote follow-up failed';
    await persistRecord(deps, record);
    return {
      statusCode: 502,
      body: { error: 'Unable to process lead follow-up right now.' },
    };
  }
}
