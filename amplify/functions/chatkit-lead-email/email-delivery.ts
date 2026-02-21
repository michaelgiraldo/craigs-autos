import { randomUUID } from 'node:crypto';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import type { InlineAttachment } from './attachments';
import { extractAttachments, fetchInlineAttachment } from './attachments';
import { buildLeadEmailSubject, buildOutreachDrafts } from './drafts';
import { buildRawEmail, linkifyTextToHtml } from './email-mime';
import { inferMessageLinkBaseUrl, withLinkChannel } from './message-link';
import {
  emailToMailto,
  escapeHtml,
  extractCustomerContact,
  formatListHtml,
  formatListText,
  localeToLanguageLabel,
  mailtoWithDraft,
  phoneToTelHref,
  safeHttpUrl,
} from './text-utils';
import type { LeadAttributionPayload, LeadSummary, TranscriptLine } from './lead-types';

type MessageLinkKind = 'customer' | 'draft';

type BuildMessageLinkUrl = (args: {
  threadId: string;
  kind: MessageLinkKind;
  toPhone: string;
  body: string;
  baseUrl: string;
}) => Promise<string | null>;

function formatTimestamp(timestampSeconds: number): string {
  const date = new Date(timestampSeconds * 1000);
  return date.toISOString().replace('T', ' ').replace('Z', 'Z');
}

export async function sendTranscriptEmail(args: {
  ses: SESv2Client;
  leadToEmail: string;
  leadFromEmail: string;
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
  leadInlineAttachmentMaxBytes: number;
  createMessageLinkUrl: BuildMessageLinkUrl;
}): Promise<string | null> {
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
  } = args;

  const detectedContact = extractCustomerContact(transcript, shopPhoneDigits);
  const customerPhone = leadSummary?.customer_phone ?? detectedContact.phone;
  const customerEmail = leadSummary?.customer_email ?? detectedContact.email;
  const customerTelHref = customerPhone ? phoneToTelHref(customerPhone) : null;
  const customerMailHref = customerEmail ? emailToMailto(customerEmail) : null;

  const pageHref = pageUrl ? safeHttpUrl(pageUrl) : null;
  const messageLinkBaseUrl = inferMessageLinkBaseUrl(pageHref);
  const threadHref = `https://platform.openai.com/logs/${encodeURIComponent(threadId)}`;
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

  const defaultCallScriptPrompts = [
    "Can you confirm the year/make/model (or what item we're working on)?",
    'Can you send 2-4 photos (1 wide + 1-2 close-ups) so we can take a proper look?',
    "What's the best way to reach you if we have a quick follow-up question?",
  ];
  const callScriptPrompts = (leadSummary?.call_script_prompts ?? [])
    .map((prompt) => (typeof prompt === 'string' ? prompt.trim() : ''))
    .filter(Boolean)
    .slice(0, 3);
  while (callScriptPrompts.length < 3) {
    callScriptPrompts.push(defaultCallScriptPrompts[callScriptPrompts.length]);
  }

  let sourceLabel = 'craigs.autos';
  try {
    const url = pageHref ? new URL(pageHref) : null;
    if (url?.host) sourceLabel = url.host;
  } catch {
    // ignore
  }
  const attachments = extractAttachments(transcript);
  const inlineAttachmentsResolved = (
    await Promise.all(
      attachments.map((attachment) =>
        fetchInlineAttachment(attachment, args.leadInlineAttachmentMaxBytes),
      ),
    )
  ).filter((item): item is InlineAttachment => Boolean(item));
  const inlineAttachmentMap = new Map<string, InlineAttachment>(
    inlineAttachmentsResolved.map((attachment) => [attachment.sourceUrl, attachment]),
  );

  // Gmail often strips protocol-handler links, so we generate an HTTPS token link that resolves into
  // {to_phone, body} and then lets `/message` open the selected channel client locally.
  const smsCustomerLink = customerPhone
    ? await args.createMessageLinkUrl({
        threadId,
        kind: 'customer',
        toPhone: customerPhone,
        body: smsDraft,
        baseUrl: messageLinkBaseUrl,
      })
    : null;
  const googleVoiceCustomerLink = smsCustomerLink
    ? withLinkChannel(smsCustomerLink, 'google_voice')
    : null;

  const emailDraftHref = customerEmail
    ? mailtoWithDraft(customerEmail, emailDraftSubject, emailDraftBody)
    : null;

  const transcriptLines = transcript.map((line) => {
    const when = formatTimestamp(line.created_at);
    return `[${when}] ${line.speaker}: ${line.text}`;
  });

  const bodyParts: string[] = [`New chat lead from ${sourceLabel}`, ''];

  if (leadSummary) {
    bodyParts.push('At a glance');
    if (leadSummary.customer_name) bodyParts.push(`Customer: ${leadSummary.customer_name}`);
    if (customerPhone) bodyParts.push(`Phone: ${customerPhone}`);
    if (customerEmail) bodyParts.push(`Email: ${customerEmail}`);
    if (leadSummary.customer_location) bodyParts.push(`Location: ${leadSummary.customer_location}`);
    if (leadSummary.vehicle) bodyParts.push(`Vehicle: ${leadSummary.vehicle}`);
    if (leadSummary.project) bodyParts.push(`Project: ${leadSummary.project}`);
    if (leadSummary.timeline) bodyParts.push(`Timeline: ${leadSummary.timeline}`);
    bodyParts.push('');
  }

  if (attribution) {
    bodyParts.push('Attribution');
    if (attribution.device_type) bodyParts.push(`Device: ${attribution.device_type}`);
    if (attribution.gclid) bodyParts.push(`GCLID: ${attribution.gclid}`);
    if (attribution.gbraid) bodyParts.push(`GBRAID: ${attribution.gbraid}`);
    if (attribution.wbraid) bodyParts.push(`WBRAID: ${attribution.wbraid}`);
    if (attribution.utm_source || attribution.utm_medium || attribution.utm_campaign) {
      const utm = [
        attribution.utm_source ? `utm_source=${attribution.utm_source}` : null,
        attribution.utm_medium ? `utm_medium=${attribution.utm_medium}` : null,
        attribution.utm_campaign ? `utm_campaign=${attribution.utm_campaign}` : null,
        attribution.utm_term ? `utm_term=${attribution.utm_term}` : null,
        attribution.utm_content ? `utm_content=${attribution.utm_content}` : null,
      ]
        .filter(Boolean)
        .join(' | ');
      if (utm) bodyParts.push(`UTM: ${utm}`);
    }
    if (attribution.landing_page) bodyParts.push(`Landing page: ${attribution.landing_page}`);
    if (attribution.referrer) bodyParts.push(`Referrer: ${attribution.referrer}`);
    if (attribution.first_touch_ts) bodyParts.push(`First touch: ${attribution.first_touch_ts}`);
    if (attribution.last_touch_ts) bodyParts.push(`Last touch: ${attribution.last_touch_ts}`);
    bodyParts.push('');
  }

  if (attachments.length) {
    bodyParts.push(`Photos/attachments (${attachments.length})`);
    bodyParts.push(
      attachments
        .map((att) => `- ${att.name}${att.mime ? ` (${att.mime})` : ''}: ${att.url}`)
        .join('\n'),
    );
    bodyParts.push('');
  }

  if (leadSummary?.summary) {
    bodyParts.push('Summary');
    bodyParts.push(leadSummary.summary);
    bodyParts.push('');
  }

  if (leadSummary?.next_steps?.length) {
    bodyParts.push('Suggested next steps');
    bodyParts.push(formatListText(leadSummary.next_steps, '- '));
    bodyParts.push('');
  }

  if (leadSummary?.follow_up_questions?.length) {
    bodyParts.push('Follow-up questions');
    bodyParts.push(formatListText(leadSummary.follow_up_questions, '- '));
    bodyParts.push('');
  }

  if (callScriptPrompts.length) {
    bodyParts.push('Call script (3 prompts)');
    bodyParts.push(formatListText(callScriptPrompts, '- '));
    bodyParts.push('');
  }

  bodyParts.push('Drafts');
  if (smsCustomerLink) bodyParts.push(`Send via SMS link:\n${smsCustomerLink}`);
  if (googleVoiceCustomerLink) bodyParts.push(`Google Voice link:\n${googleVoiceCustomerLink}`);
  if (customerPhone) bodyParts.push(`Text message:\n${smsDraft}`);
  if (customerEmail) {
    bodyParts.push(`Email subject:\n${emailDraftSubject}`);
    bodyParts.push(`Email draft:\n${emailDraftBody}`);
  }
  bodyParts.push('');

  bodyParts.push('Transcript');
  bodyParts.push('');
  bodyParts.push(...transcriptLines);
  bodyParts.push('');

  bodyParts.push('Diagnostics');
  bodyParts.push(`Thread: ${threadId}`);
  bodyParts.push(`OpenAI logs: ${threadHref}`);
  bodyParts.push(`Trigger: ${reason}`);
  bodyParts.push(`Chat user: ${chatUser}`);
  if (leadSummary?.missing_info?.length) {
    bodyParts.push(`Missing: ${leadSummary.missing_info.join(', ')}`);
  }
  if (locale) bodyParts.push(`Locale: ${locale}`);
  if (customerLanguage) bodyParts.push(`Language: ${customerLanguage}`);
  if (pageHref) bodyParts.push(`Page: ${pageHref}`);

  const bodyText = bodyParts.join('\n\n');

  const atAGlanceRows: Array<{ label: string; value: string; href?: string | null }> = [];
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
  if (attachments.length)
    atAGlanceRows.push({ label: 'Photos', value: String(attachments.length) });

  const diagnosticRows: Array<{ label: string; value: string; href?: string | null }> = [];
  if (locale) diagnosticRows.push({ label: 'Locale', value: locale });
  if (customerLanguage) diagnosticRows.push({ label: 'Language', value: customerLanguage });
  if (pageHref) diagnosticRows.push({ label: 'Page', value: pageHref, href: pageHref });
  diagnosticRows.push({ label: 'Thread', value: threadId, href: threadHref });
  if (reason) diagnosticRows.push({ label: 'Trigger', value: reason });
  if (chatUser) diagnosticRows.push({ label: 'Chat user', value: chatUser });
  if (leadSummary?.missing_info?.length) {
    diagnosticRows.push({ label: 'Missing', value: leadSummary.missing_info.join(', ') });
  }

  const htmlAtAGlanceRows = atAGlanceRows
    .map(({ label, value, href }) => {
      const labelCell = `<td style="padding:6px 0;color:#6b7280;vertical-align:top;width:140px">${escapeHtml(
        label,
      )}</td>`;
      const valueHtml = href
        ? `<a href="${escapeHtml(String(href))}" style="color:#141cff;text-decoration:none">${escapeHtml(
            value,
          )}</a>`
        : escapeHtml(value);
      const valueCell = `<td style="padding:6px 0;color:#111827">${valueHtml}</td>`;
      return `<tr>${labelCell}${valueCell}</tr>`;
    })
    .join('');

  const htmlDiagnosticRows = diagnosticRows
    .map(({ label, value, href }) => {
      const labelCell = `<td style="padding:6px 0;color:#6b7280;vertical-align:top;width:140px">${escapeHtml(
        label,
      )}</td>`;
      const valueHtml = href
        ? `<a href="${escapeHtml(String(href))}" style="color:#141cff;text-decoration:none">${escapeHtml(
            value,
          )}</a>`
        : escapeHtml(value);
      const valueCell = `<td style="padding:6px 0;color:#111827">${valueHtml}</td>`;
      return `<tr>${labelCell}${valueCell}</tr>`;
    })
    .join('');

  const quickActions: Array<{ label: string; href: string }> = [];
  if (customerTelHref) quickActions.push({ label: 'Call customer', href: customerTelHref });
  if (smsCustomerLink) quickActions.push({ label: 'Send via SMS', href: smsCustomerLink });
  if (googleVoiceCustomerLink) {
    quickActions.push({ label: 'Send via Google Voice', href: googleVoiceCustomerLink });
  }
  if (customerMailHref) quickActions.push({ label: 'Email customer', href: customerMailHref });
  if (emailDraftHref) quickActions.push({ label: 'Email draft', href: emailDraftHref });
  if (pageHref) quickActions.push({ label: 'Open page', href: pageHref });
  quickActions.push({ label: 'OpenAI logs', href: threadHref });

  const quickActionsHtml = quickActions
    .map(
      (action) =>
        `<a href="${escapeHtml(action.href)}" style="display:inline-block;margin:0 10px 10px 0;padding:10px 14px;border:1px solid #e5e7eb;border-radius:999px;background:#f9fafb;color:#111827;text-decoration:none;font-size:13px;line-height:1">${escapeHtml(
          action.label,
        )}</a>`,
    )
    .join('');

  const callScriptHtml = formatListHtml(callScriptPrompts);

  const attachmentsHtml = attachments.length
    ? `<div style="font-size:14px;font-weight:700;margin:0 0 10px">Photos/attachments (${attachments.length})</div>
       <ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.5">
         ${attachments
           .map((att) => {
             const label = `${att.name}${att.mime ? ` (${att.mime})` : ''}`;
             const inline = inlineAttachmentMap.get(att.url);
             const preview = inline
               ? `<div style="margin:8px 0 18px"><img src="cid:${inline.contentId}" alt="${escapeHtml(
                   att.name,
                 )}" style="max-width:100%;height:auto;border:1px solid #e5e7eb;border-radius:8px" /></div>`
               : '';
             return `<li style="margin:0 0 8px"><a href="${escapeHtml(att.url)}" style="color:#141cff;text-decoration:none">${escapeHtml(
               label,
             )}</a></li>${preview}`;
           })
           .join('')}
       </ul>`
    : '';

  const draftsHtmlParts: string[] = [];
  if (smsCustomerLink || googleVoiceCustomerLink) {
    const linkRows: string[] = [];
    if (smsCustomerLink) {
      linkRows.push(
        `<div style="margin:0 0 8px"><a href="${escapeHtml(
          smsCustomerLink,
        )}" style="color:#141cff;text-decoration:none">Send via SMS link</a></div>`,
      );
    }
    if (googleVoiceCustomerLink) {
      linkRows.push(
        `<div><a href="${escapeHtml(
          googleVoiceCustomerLink,
        )}" style="color:#141cff;text-decoration:none">Google Voice link</a></div>`,
      );
    }
    draftsHtmlParts.push(`<div style="margin:0 0 12px">
      <div style="font-size:13px;font-weight:700;margin:0 0 6px">Message links</div>
      ${linkRows.join('')}
    </div>`);
  }
  if (customerPhone) {
    draftsHtmlParts.push(`<div style="margin:0 0 12px">
      <div style="font-size:13px;font-weight:700;margin:0 0 6px">Text message</div>
      <pre style="margin:0;padding:12px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;white-space:pre-wrap;word-break:break-word;font-size:13px;line-height:1.4">${escapeHtml(
        smsDraft,
      )}</pre>
    </div>`);
  }
  if (customerEmail) {
    draftsHtmlParts.push(`<div style="margin:0 0 12px">
      <div style="font-size:13px;font-weight:700;margin:0 0 6px">Email subject</div>
      <pre style="margin:0;padding:12px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;white-space:pre-wrap;word-break:break-word;font-size:13px;line-height:1.4">${escapeHtml(
        emailDraftSubject,
      )}</pre>
    </div>`);
    draftsHtmlParts.push(`<div>
      <div style="font-size:13px;font-weight:700;margin:0 0 6px">Email body</div>
      <pre style="margin:0;padding:12px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;white-space:pre-wrap;word-break:break-word;font-size:13px;line-height:1.4">${escapeHtml(
        emailDraftBody,
      )}</pre>
    </div>`);
  }
  const draftsHtml = draftsHtmlParts.join('');

  // Render the transcript in a "per message" layout, but keep the HTML lightweight.
  const transcriptHtml = transcript
    .map((line) => {
      const when = formatTimestamp(line.created_at);
      const speakerColor = line.speaker === 'Customer' ? '#111827' : '#141cff';
      return `[${escapeHtml(when)}] <strong style="color:${speakerColor}">${escapeHtml(
        line.speaker,
      )}:</strong> ${linkifyTextToHtml(line.text)}`;
    })
    .join('<br/><br/>');

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:24px;background:#f6f7f9;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111827">
    <table role="presentation" style="width:100%;border-collapse:collapse">
      <tr>
        <td>
          <table role="presentation" style="width:100%;max-width:720px;margin:0 auto;border-collapse:separate;border-spacing:0;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden">
            <tr>
              <td style="padding:18px 22px;background:#141cff;color:#ffffff">
                <div style="font-size:16px;font-weight:700;line-height:1.2">New chat lead</div>
                <div style="font-size:12px;opacity:.9;margin-top:4px">${escapeHtml(shopName)}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 22px">
                <div style="font-size:14px;font-weight:700;margin:0 0 10px">At a glance</div>
                <table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px">
                  ${htmlAtAGlanceRows || '<tr><td style="color:#6b7280">No structured details extracted yet.</td></tr>'}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 22px 18px">
                <div style="font-size:14px;font-weight:700;margin:0 0 10px">Quick actions</div>
                <div>${quickActionsHtml || '<span style="color:#6b7280;font-size:13px">No actions available.</span>'}</div>
              </td>
            </tr>
            ${
              attachments.length
                ? `<tr>
              <td style="padding:18px 22px;border-top:1px solid #e5e7eb">
                ${attachmentsHtml}
              </td>
            </tr>`
                : ''
            }
            ${
              leadSummary
                ? `<tr>
              <td style="padding:18px 22px;border-top:1px solid #e5e7eb">
                <div style="font-size:14px;font-weight:700;margin:0 0 10px">Summary</div>
                <p style="margin:0;line-height:1.5;color:#111827">${escapeHtml(
                  leadSummary.summary,
                )}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 22px;border-top:1px solid #e5e7eb">
                <div style="font-size:14px;font-weight:700;margin:0 0 10px">Suggested next steps</div>
                ${formatListHtml(leadSummary.next_steps)}
              </td>
            </tr>
            <tr>
              <td style="padding:18px 22px;border-top:1px solid #e5e7eb">
                <div style="font-size:14px;font-weight:700;margin:0 0 10px">Follow-up questions</div>
                ${formatListHtml(leadSummary.follow_up_questions)}
              </td>
            </tr>`
                : ''
            }
            <tr>
              <td style="padding:18px 22px;border-top:1px solid #e5e7eb">
                <div style="font-size:14px;font-weight:700;margin:0 0 10px">Call script (3 prompts)</div>
                ${callScriptHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:18px 22px;border-top:1px solid #e5e7eb">
                <div style="font-size:14px;font-weight:700;margin:0 0 10px">Drafts</div>
                <div style="font-size:12px;color:#6b7280;margin:0 0 10px">Copy/paste (edit as needed).</div>
                ${draftsHtml || '<span style="color:#6b7280;font-size:13px">No drafts available.</span>'}
              </td>
            </tr>
            <tr>
              <td style="padding:18px 22px;border-top:1px solid #e5e7eb">
                <div style="font-size:14px;font-weight:700;margin:0 0 10px">Transcript</div>
                <div style="font-size:13px;line-height:1.5;color:#111827;white-space:pre-wrap;word-break:break-word">${transcriptHtml}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 22px;border-top:1px solid #e5e7eb">
                <div style="font-size:14px;font-weight:700;margin:0 0 10px">Diagnostics</div>
                <table role="presentation" style="width:100%;border-collapse:collapse;font-size:13px">
                  ${htmlDiagnosticRows || '<tr><td style="color:#6b7280">No diagnostics available.</td></tr>'}
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const mixedBoundary = `mixed-${randomUUID()}`;
  const alternativeBoundary = `alternative-${randomUUID()}`;
  const rawMessage = buildRawEmail({
    from: args.leadFromEmail,
    to: args.leadToEmail,
    replyTo: customerEmail ?? null,
    subject,
    textBody: bodyText,
    htmlBody: html,
    attachments: inlineAttachmentsResolved,
    mixedBoundary,
    alternativeBoundary,
  });

  const result = await args.ses.send(
    new SendEmailCommand({
      FromEmailAddress: args.leadFromEmail,
      Destination: {
        ToAddresses: [args.leadToEmail],
      },
      Content: {
        Raw: {
          Data: rawMessage,
        },
      },
    }),
  );
  return result?.MessageId ?? null;
}
