import type {
  LeadFollowupFailureAlertKind,
  LeadFollowupWorkItem,
} from '../_lead-platform/domain/lead-followup-work.ts';
import { escapeHtml } from '../_shared/text-utils.ts';
import {
  LEAD_FOLLOWUP_STALE_QUEUED_SECONDS,
  summarizeLeadFollowupError,
  wasLeadFollowupCustomerResponseSent,
} from '../_lead-platform/services/followup-work-alerts.ts';

type AlertSeverity = 'ACTION REQUIRED' | 'STUCK' | 'CHECK SYSTEM';
type EmailTableRow = [string, string];

function renderPlainTextRows(rows: EmailTableRow[]): string[] {
  return rows.map(([label, value]) => `${label}: ${value}`);
}

function renderHtmlTableRows(rows: EmailTableRow[]): string {
  return rows
    .map(
      ([label, value]) => `
        <tr>
          <td style="border:1px solid #ddd;background:#f7f4ef;font-weight:700;width:220px;padding:8px;">${escapeHtml(
            label,
          )}</td>
          <td style="border:1px solid #ddd;padding:8px;">${escapeHtml(value)}</td>
        </tr>
      `,
    )
    .join('');
}

function trimText(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

function fallbackText(value: string | null | undefined, fallback: string): string {
  const trimmed = trimText(value);
  return trimmed || fallback;
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1).trimEnd()}...` : value;
}

function buildAlertSeverity(args: {
  alertKind: Exclude<LeadFollowupFailureAlertKind, null>;
  record: LeadFollowupWorkItem;
}): AlertSeverity {
  if (args.alertKind === 'stale_processing' || args.alertKind === 'stale_queued') {
    return 'STUCK';
  }
  return wasLeadFollowupCustomerResponseSent(args.record) ? 'CHECK SYSTEM' : 'ACTION REQUIRED';
}

function buildAlertReason(args: {
  alertKind: Exclude<LeadFollowupFailureAlertKind, null>;
  record: LeadFollowupWorkItem;
}): string {
  switch (args.alertKind) {
    case 'error':
      return summarizeLeadFollowupError(args.record) ?? 'Lead follow-up entered an error state.';
    case 'stale_queued':
      return `Work item remained queued for at least ${
        LEAD_FOLLOWUP_STALE_QUEUED_SECONDS / 60
      } minutes.`;
    case 'stale_processing':
      return 'Work item remained in processing after the worker lease expired.';
  }
}

function buildImmediateAction(args: {
  alertKind: Exclude<LeadFollowupFailureAlertKind, null>;
  record: LeadFollowupWorkItem;
  severity: AlertSeverity;
}): string {
  if (args.severity === 'ACTION REQUIRED') {
    return 'Call or email the customer manually as soon as possible.';
  }
  if (args.alertKind === 'stale_queued' || args.alertKind === 'stale_processing') {
    return wasLeadFollowupCustomerResponseSent(args.record)
      ? 'Inspect the workflow issue and confirm whether any manual customer follow-up is still needed.'
      : 'Inspect the stalled work item and contact the customer manually if no response has been sent.';
  }
  return 'Inspect the workflow failure and confirm whether the customer still needs manual follow-up.';
}

function buildSubjectSuffix(args: {
  alertKind: Exclude<LeadFollowupFailureAlertKind, null>;
  record: LeadFollowupWorkItem;
  severity: AlertSeverity;
}): string {
  if (args.alertKind === 'stale_processing' || args.alertKind === 'stale_queued') {
    return 'work item stuck';
  }
  return args.severity === 'ACTION REQUIRED'
    ? 'no customer reply sent'
    : 'internal follow-up failed';
}

function buildShortSummary(record: LeadFollowupWorkItem): string {
  return truncate(
    fallbackText(
      record.lead_summary?.project_summary,
      record.message || 'No lead summary provided.',
    ),
    280,
  );
}

export function buildLeadFailureAlertEmailContent(args: {
  alertKind: Exclude<LeadFollowupFailureAlertKind, null>;
  record: LeadFollowupWorkItem;
}): {
  html: string;
  severity: AlertSeverity;
  subject: string;
  text: string;
} {
  const { record } = args;
  const severity = buildAlertSeverity(args);
  const displayName =
    trimText(record.name) || trimText(record.email) || trimText(record.phone) || 'Unknown customer';
  const alertReason = buildAlertReason(args);
  const immediateAction = buildImmediateAction({ ...args, severity });
  const customerResponseSent = wasLeadFollowupCustomerResponseSent(record) ? 'yes' : 'no';
  const photoCount = record.photo_attachment_count ?? record.inbound_photo_attachment_count ?? 0;
  const attachmentCount = record.attachment_count ?? record.inbound_attachment_count ?? 0;
  const diagnosticsRows: EmailTableRow[] = [
    ['Severity', severity],
    ['Capture channel', fallbackText(record.capture_channel, 'Unknown')],
    ['Failure reason', alertReason],
    ['Customer response sent', customerResponseSent],
    ['Work status', fallbackText(record.status, 'Unknown')],
    ['Idempotency key', fallbackText(record.idempotency_key, 'Unknown')],
    ['Lead record id', fallbackText(record.lead_record_id, 'Not available')],
    ['Journey id', fallbackText(record.journey_id, 'Not available')],
  ];
  const customerRows: EmailTableRow[] = [
    ['Customer', displayName],
    ['Phone', fallbackText(record.phone, 'Not provided')],
    ['Email', fallbackText(record.email, 'Not provided')],
    ['Vehicle', fallbackText(record.vehicle, 'Not provided')],
    ['Service', fallbackText(record.service, 'Not provided')],
    ['Photos', `${photoCount}`],
    ['Attachments', `${attachmentCount}`],
  ];
  const shortSummary = buildShortSummary(record);
  const latestMessage = truncate(
    fallbackText(record.message, 'No customer message provided.'),
    400,
  );
  const subject = `[Lead Alert][${severity}][${record.capture_channel}] ${displayName} - ${buildSubjectSuffix(
    { ...args, severity },
  )}`;
  const text = [
    `Lead follow-up alert for Craig's Auto Upholstery`,
    '',
    ...renderPlainTextRows(diagnosticsRows),
    '',
    ...renderPlainTextRows(customerRows),
    '',
    `Immediate action: ${immediateAction}`,
    '',
    `Lead summary: ${shortSummary}`,
    '',
    `Latest customer message: ${latestMessage}`,
  ].join('\n');
  const html = `
    <div style="font-family:Arial,sans-serif;color:#1a1a1a;">
      <h1 style="font-size:20px;margin:0 0 16px;">Lead follow-up alert</h1>
      <p style="margin:0 0 16px;color:#6b7280;">${escapeHtml(
        `Severity: ${severity}. Customer response sent: ${customerResponseSent}.`,
      )}</p>
      <h2 style="font-size:16px;margin:24px 0 8px;">Status</h2>
      <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:720px;">
        ${renderHtmlTableRows(diagnosticsRows)}
      </table>
      <h2 style="font-size:16px;margin:24px 0 8px;">Customer</h2>
      <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:720px;">
        ${renderHtmlTableRows(customerRows)}
      </table>
      <h2 style="font-size:16px;margin:24px 0 8px;">Immediate action</h2>
      <p style="margin:0 0 16px;line-height:1.5;">${escapeHtml(immediateAction)}</p>
      <h2 style="font-size:16px;margin:24px 0 8px;">Lead summary</h2>
      <p style="margin:0 0 16px;white-space:pre-wrap;line-height:1.5;">${escapeHtml(shortSummary)}</p>
      <h2 style="font-size:16px;margin:24px 0 8px;">Latest customer message</h2>
      <p style="margin:0;white-space:pre-wrap;line-height:1.5;">${escapeHtml(latestMessage)}</p>
    </div>
  `;

  return { html, severity, subject, text };
}
