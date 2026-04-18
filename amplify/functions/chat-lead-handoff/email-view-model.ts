import type { AttachmentResolution } from './attachments.ts';
import { buildOutreachDrafts } from '../_lead-core/services/outreach-drafts.ts';
import { buildLeadEmailSubject } from './drafts.ts';
import { inferMessageLinkBaseUrl } from './message-link.ts';
import {
  emailToMailto,
  extractCustomerContact,
  localeToLanguageLabel,
  mailtoWithDraft,
  phoneToTelHref,
  safeHttpUrl,
} from './text-utils.ts';
import type { LeadAttributionPayload, LeadSummary, TranscriptLine } from './lead-types.ts';

type MessageLinkKind = 'customer' | 'draft';

export type InitialOutreachState = {
  provider: 'quo';
  channel: 'sms';
  status: 'sent' | 'failed' | 'not_attempted';
  body: string;
  sentAt?: number;
  messageId?: string | null;
  error?: string | null;
  manualSmsLink?: string | null;
};

export type BuildMessageLinkUrl = (args: {
  threadId: string;
  kind: MessageLinkKind;
  toPhone: string;
  body: string;
  baseUrl: string;
}) => Promise<string | null>;

export type LeadEmailRow = {
  label: string;
  value: string;
  href?: string | null;
};

export type LeadEmailAction = {
  label: string;
  href: string;
};

export type LeadEmailAttachmentView = {
  contentId?: string | null;
  detail?: string | null;
  mime: string | null;
  name: string;
  status: 'attached' | 'omitted' | 'failed';
};

export type LeadEmailTranscriptEntry = {
  speaker: string;
  text: string;
  when: string;
};

export type LeadEmailViewModel = {
  attributionRows: LeadEmailRow[];
  atAGlanceRows: LeadEmailRow[];
  attachments: LeadEmailAttachmentView[];
  callScriptPrompts: string[];
  customerEmail: string | null;
  diagnosticRows: LeadEmailRow[];
  drafts: {
    emailBody?: string;
    emailSubject?: string;
    smsBody?: string;
    smsLabel?: string;
  };
  followUpQuestions: string[];
  hasAttribution: boolean;
  hasLeadSummary: boolean;
  initialOutreach: InitialOutreachState;
  initialOutreachAction: LeadEmailAction | null;
  initialOutreachBody: string;
  initialOutreachRows: LeadEmailRow[];
  nextSteps: string[];
  openAiLogsHref: string;
  quickActions: LeadEmailAction[];
  shopName: string;
  sourceLabel: string;
  subject: string;
  summary: string | null;
  transcriptEntries: LeadEmailTranscriptEntry[];
};

function formatTimestamp(timestampSeconds: number): string {
  const date = new Date(timestampSeconds * 1000);
  return date.toISOString().replace('T', ' ').replace('Z', 'Z');
}

function buildCallScriptPrompts(leadSummary: LeadSummary | null): string[] {
  const defaultCallScriptPrompts = [
    "Can you confirm the year/make/model (or what item we're working on)?",
    'Can you send 2-4 photos (1 wide + 1-2 close-ups) so we can take a proper look?',
    "What's the best way to reach you if we have a quick follow-up question?",
  ];

  const prompts = (leadSummary?.call_script_prompts ?? [])
    .map((prompt) => (typeof prompt === 'string' ? prompt.trim() : ''))
    .filter(Boolean)
    .slice(0, 3);

  while (prompts.length < 3) {
    prompts.push(defaultCallScriptPrompts[prompts.length]);
  }

  return prompts;
}

function buildSourceLabel(pageHref: string | null): string {
  try {
    const url = pageHref ? new URL(pageHref) : null;
    return url?.host || 'craigs.autos';
  } catch {
    return 'craigs.autos';
  }
}

function buildAttributionRows(attribution: LeadAttributionPayload | null): LeadEmailRow[] {
  if (!attribution) return [];

  const rows: LeadEmailRow[] = [];
  if (attribution.source_platform)
    rows.push({ label: 'Source platform', value: attribution.source_platform });
  if (attribution.acquisition_class)
    rows.push({ label: 'Acquisition class', value: attribution.acquisition_class });
  if (attribution.device_type) rows.push({ label: 'Device', value: attribution.device_type });
  if (attribution.gclid) rows.push({ label: 'GCLID', value: attribution.gclid });
  if (attribution.gbraid) rows.push({ label: 'GBRAID', value: attribution.gbraid });
  if (attribution.wbraid) rows.push({ label: 'WBRAID', value: attribution.wbraid });
  if (attribution.msclkid) rows.push({ label: 'MSCLKID', value: attribution.msclkid });
  if (attribution.fbclid) rows.push({ label: 'FBCLID', value: attribution.fbclid });
  if (attribution.ttclid) rows.push({ label: 'TTCLID', value: attribution.ttclid });

  const utm = [
    attribution.utm_source ? `utm_source=${attribution.utm_source}` : null,
    attribution.utm_medium ? `utm_medium=${attribution.utm_medium}` : null,
    attribution.utm_campaign ? `utm_campaign=${attribution.utm_campaign}` : null,
    attribution.utm_term ? `utm_term=${attribution.utm_term}` : null,
    attribution.utm_content ? `utm_content=${attribution.utm_content}` : null,
  ]
    .filter(Boolean)
    .join(' | ');
  if (utm) rows.push({ label: 'UTM', value: utm });

  if (attribution.landing_page)
    rows.push({ label: 'Landing page', value: attribution.landing_page });
  if (attribution.referrer) rows.push({ label: 'Referrer', value: attribution.referrer });
  if (attribution.referrer_host)
    rows.push({ label: 'Referrer host', value: attribution.referrer_host });
  if (attribution.first_touch_ts)
    rows.push({ label: 'First touch', value: attribution.first_touch_ts });
  if (attribution.last_touch_ts)
    rows.push({ label: 'Last touch', value: attribution.last_touch_ts });

  return rows;
}

export async function buildLeadEmailViewModel(args: {
  threadId: string;
  locale: string;
  pageUrl: string;
  chatUser: string;
  reason: string;
  threadTitle: string | null;
  transcript: TranscriptLine[];
  leadSummary: LeadSummary | null;
  attribution: LeadAttributionPayload | null;
  shopName: string;
  shopPhoneDisplay: string;
  shopPhoneDigits: string;
  shopAddress: string;
  initialOutreach: InitialOutreachState;
  createMessageLinkUrl: BuildMessageLinkUrl;
  attachments: AttachmentResolution[];
}): Promise<LeadEmailViewModel> {
  const {
    threadId,
    locale,
    pageUrl,
    chatUser,
    reason,
    threadTitle,
    transcript,
    leadSummary,
    attribution,
    shopName,
    shopPhoneDisplay,
    shopPhoneDigits,
    shopAddress,
    initialOutreach,
    attachments,
  } = args;

  const detectedContact = extractCustomerContact(transcript, shopPhoneDigits);
  const customerPhone = leadSummary?.customer_phone ?? detectedContact.phone;
  const customerEmail = leadSummary?.customer_email ?? detectedContact.email;
  const customerTelHref = customerPhone ? phoneToTelHref(customerPhone) : null;
  const customerMailHref = customerEmail ? emailToMailto(customerEmail) : null;
  const pageHref = pageUrl ? safeHttpUrl(pageUrl) : null;
  const openAiLogsHref = `https://platform.openai.com/logs/${encodeURIComponent(threadId)}`;
  const customerLanguage =
    leadSummary?.customer_language ?? (locale ? localeToLanguageLabel(locale) : null);
  const subject = buildLeadEmailSubject({ leadSummary, threadTitle });
  const { smsDraft, emailDraftSubject, emailDraftBody } = buildOutreachDrafts({
    leadSummary,
    shopName,
    shopPhoneDisplay,
    shopPhoneDigits,
    shopAddress,
  });
  const messageLinkBaseUrl = inferMessageLinkBaseUrl(pageHref);
  const smsCustomerLink =
    initialOutreach.status === 'failed' && customerPhone
      ? await args.createMessageLinkUrl({
          threadId,
          kind: 'customer',
          toPhone: customerPhone,
          body: smsDraft,
          baseUrl: messageLinkBaseUrl,
        })
      : null;
  const effectiveInitialOutreach: InitialOutreachState = {
    ...initialOutreach,
    manualSmsLink: smsCustomerLink,
  };
  const initialOutreachBody = effectiveInitialOutreach.body.trim() || smsDraft;

  const emailDraftHref = customerEmail
    ? mailtoWithDraft(customerEmail, emailDraftSubject, emailDraftBody)
    : null;

  const attachedPhotoCount = attachments.filter(
    (attachment) => attachment.status === 'attached',
  ).length;
  const omittedPhotoCount = attachments.filter(
    (attachment) => attachment.status === 'omitted',
  ).length;
  const failedPhotoCount = attachments.filter(
    (attachment) => attachment.status === 'failed',
  ).length;

  const atAGlanceRows: LeadEmailRow[] = [];
  if (leadSummary?.customer_name)
    atAGlanceRows.push({ label: 'Customer', value: leadSummary.customer_name });
  if (customerPhone)
    atAGlanceRows.push({ label: 'Phone', value: customerPhone, href: customerTelHref });
  if (customerEmail)
    atAGlanceRows.push({ label: 'Email', value: customerEmail, href: customerMailHref });
  if (leadSummary?.customer_location)
    atAGlanceRows.push({ label: 'Location', value: leadSummary.customer_location });
  if (leadSummary?.vehicle) atAGlanceRows.push({ label: 'Vehicle', value: leadSummary.vehicle });
  if (leadSummary?.project) atAGlanceRows.push({ label: 'Project', value: leadSummary.project });
  if (leadSummary?.timeline) atAGlanceRows.push({ label: 'Timeline', value: leadSummary.timeline });
  if (attachments.length) {
    atAGlanceRows.push({
      label: 'Photos',
      value: `${attachedPhotoCount}/${attachments.length} attached`,
    });
  }

  const quickActions: LeadEmailAction[] = [];
  if (customerTelHref) quickActions.push({ label: 'Call customer', href: customerTelHref });
  if (customerMailHref) quickActions.push({ label: 'Email customer', href: customerMailHref });
  if (emailDraftHref) quickActions.push({ label: 'Email draft', href: emailDraftHref });

  const initialOutreachRows: LeadEmailRow[] = [];
  if (effectiveInitialOutreach.status === 'sent') {
    initialOutreachRows.push({ label: 'Status', value: 'Sent via QUO' });
    if (effectiveInitialOutreach.sentAt) {
      initialOutreachRows.push({
        label: 'Sent at',
        value: formatTimestamp(effectiveInitialOutreach.sentAt),
      });
    }
    if (effectiveInitialOutreach.messageId) {
      initialOutreachRows.push({
        label: 'QUO message ID',
        value: effectiveInitialOutreach.messageId,
      });
    }
  } else if (effectiveInitialOutreach.status === 'failed') {
    initialOutreachRows.push({ label: 'Status', value: 'Initial outreach failed' });
    if (effectiveInitialOutreach.error) {
      initialOutreachRows.push({ label: 'Error', value: effectiveInitialOutreach.error });
    }
  } else {
    initialOutreachRows.push({ label: 'Status', value: 'Not sent automatically' });
    if (effectiveInitialOutreach.error) {
      initialOutreachRows.push({ label: 'Reason', value: effectiveInitialOutreach.error });
    }
  }

  const diagnosticRows: LeadEmailRow[] = [];
  if (locale) diagnosticRows.push({ label: 'Locale', value: locale });
  if (customerLanguage) diagnosticRows.push({ label: 'Language', value: customerLanguage });
  if (attribution?.device_type)
    diagnosticRows.push({ label: 'Device', value: attribution.device_type });
  if (pageHref) diagnosticRows.push({ label: 'Page', value: pageHref, href: pageHref });
  diagnosticRows.push({ label: 'Thread', value: threadId, href: openAiLogsHref });
  if (reason) diagnosticRows.push({ label: 'Trigger', value: reason });
  if (chatUser) diagnosticRows.push({ label: 'Chat user', value: chatUser });
  if (attachments.length) {
    diagnosticRows.push({ label: 'Photos attached', value: String(attachedPhotoCount) });
    if (omittedPhotoCount) {
      diagnosticRows.push({ label: 'Photos omitted', value: String(omittedPhotoCount) });
    }
    if (failedPhotoCount) {
      diagnosticRows.push({ label: 'Photos failed', value: String(failedPhotoCount) });
    }
  }
  if (leadSummary?.missing_info?.length) {
    diagnosticRows.push({ label: 'Missing', value: leadSummary.missing_info.join(', ') });
  }

  return {
    attributionRows: buildAttributionRows(attribution),
    atAGlanceRows,
    attachments: attachments.map((attachment) => ({
      contentId: attachment.contentId ?? null,
      detail: attachment.detail ?? null,
      mime: attachment.mime,
      name: attachment.name,
      status: attachment.status,
    })),
    callScriptPrompts: buildCallScriptPrompts(leadSummary),
    customerEmail,
    diagnosticRows,
    drafts: {
      emailBody: customerEmail ? emailDraftBody : undefined,
      emailSubject: customerEmail ? emailDraftSubject : undefined,
      smsBody: customerPhone ? initialOutreachBody : undefined,
      smsLabel: customerPhone
        ? effectiveInitialOutreach.status === 'sent'
          ? 'SMS sent via QUO'
          : effectiveInitialOutreach.status === 'failed'
            ? 'SMS draft (manual fallback)'
            : 'SMS draft'
        : undefined,
    },
    followUpQuestions: leadSummary?.follow_up_questions ?? [],
    hasAttribution: Boolean(attribution),
    hasLeadSummary: Boolean(leadSummary),
    initialOutreach: effectiveInitialOutreach,
    initialOutreachAction: effectiveInitialOutreach.manualSmsLink
      ? { label: 'Send via SMS', href: effectiveInitialOutreach.manualSmsLink }
      : null,
    initialOutreachBody,
    initialOutreachRows,
    nextSteps: leadSummary?.next_steps ?? [],
    openAiLogsHref,
    quickActions,
    shopName,
    sourceLabel: buildSourceLabel(pageHref),
    subject,
    summary: leadSummary?.summary ?? null,
    transcriptEntries: transcript.map((line) => ({
      speaker: line.speaker,
      text: line.text,
      when: formatTimestamp(line.created_at),
    })),
  };
}
