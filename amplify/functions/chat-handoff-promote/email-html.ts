import { escapeHtml, formatListHtml } from './text-utils.ts';
import { linkifyTextToHtml } from './email-mime.ts';
import type { LeadEmailAction, LeadEmailRow, LeadEmailViewModel } from './email-view-model.ts';

function renderTableRows(rows: LeadEmailRow[]): string {
  return rows
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
}

function renderQuickActions(actions: LeadEmailAction[]): string {
  return actions
    .map(
      (action) =>
        `<a href="${escapeHtml(action.href)}" style="display:inline-block;margin:0 10px 10px 0;padding:10px 14px;border:1px solid #e5e7eb;border-radius:999px;background:#f9fafb;color:#111827;text-decoration:none;font-size:13px;line-height:1">${escapeHtml(
          action.label,
        )}</a>`,
    )
    .join('');
}

function renderAttachmentsHtml(viewModel: LeadEmailViewModel): string {
  if (!viewModel.attachments.length) return '';
  const attachedCount = viewModel.attachments.filter(
    (attachment) => attachment.status === 'attached',
  ).length;
  const omittedCount = viewModel.attachments.filter(
    (attachment) => attachment.status === 'omitted',
  ).length;
  const failedCount = viewModel.attachments.filter(
    (attachment) => attachment.status === 'failed',
  ).length;
  const summaryBits = [`${attachedCount} attached`];
  if (omittedCount) summaryBits.push(`${omittedCount} omitted`);
  if (failedCount) summaryBits.push(`${failedCount} failed`);

  return `<div style="font-size:14px;font-weight:700;margin:0 0 6px">Photos/attachments (${viewModel.attachments.length})</div>
       <div style="font-size:12px;color:#6b7280;margin:0 0 12px">${escapeHtml(summaryBits.join(' | '))}</div>
       <ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.5">
         ${viewModel.attachments
           .map((attachment) => {
             const label = `${attachment.name}${attachment.mime ? ` (${attachment.mime})` : ''}`;
             const detail = attachment.detail
               ? `<div style="margin:6px 0 0;color:#6b7280;font-size:12px">${escapeHtml(
                   attachment.detail,
                 )}</div>`
               : '';
             const preview =
               attachment.status === 'attached' && attachment.contentId
                 ? `<div style="margin:8px 0 10px"><img src="cid:${attachment.contentId}" alt="${escapeHtml(
                     attachment.name,
                   )}" style="max-width:100%;height:auto;border:1px solid #e5e7eb;border-radius:8px" /></div>`
                 : '';
             return `<li style="margin:0 0 12px"><span style="color:#111827">${escapeHtml(
               label,
             )}</span>${detail}</li>${preview}`;
           })
           .join('')}
       </ul>`;
}

function renderDraftsHtml(viewModel: LeadEmailViewModel): string {
  const sections: string[] = [];

  if (viewModel.drafts.smsBody && viewModel.drafts.smsLabel) {
    sections.push(`<div style="margin:0 0 12px">
      <div style="font-size:13px;font-weight:700;margin:0 0 6px">${escapeHtml(
        viewModel.drafts.smsLabel,
      )}</div>
      <pre style="margin:0;padding:12px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;white-space:pre-wrap;word-break:break-word;font-size:13px;line-height:1.4">${escapeHtml(
        viewModel.drafts.smsBody,
      )}</pre>
    </div>`);
  }

  if (viewModel.drafts.emailSubject) {
    sections.push(`<div style="margin:0 0 12px">
      <div style="font-size:13px;font-weight:700;margin:0 0 6px">Email subject</div>
      <pre style="margin:0;padding:12px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;white-space:pre-wrap;word-break:break-word;font-size:13px;line-height:1.4">${escapeHtml(
        viewModel.drafts.emailSubject,
      )}</pre>
    </div>`);
  }

  if (viewModel.drafts.emailBody) {
    sections.push(`<div>
      <div style="font-size:13px;font-weight:700;margin:0 0 6px">Email body</div>
      <pre style="margin:0;padding:12px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;white-space:pre-wrap;word-break:break-word;font-size:13px;line-height:1.4">${escapeHtml(
        viewModel.drafts.emailBody,
      )}</pre>
    </div>`);
  }

  return sections.join('');
}

function renderTranscriptHtml(viewModel: LeadEmailViewModel): string {
  return viewModel.transcriptEntries
    .map((entry) => {
      const speakerColor = entry.speaker === 'Customer' ? '#111827' : '#141cff';
      return `[${escapeHtml(entry.when)}] <strong style="color:${speakerColor}">${escapeHtml(
        entry.speaker,
      )}:</strong> ${linkifyTextToHtml(entry.text)}`;
    })
    .join('<br/><br/>');
}

export function renderLeadEmailHtml(viewModel: LeadEmailViewModel): string {
  const atAGlanceRowsHtml = renderTableRows(viewModel.atAGlanceRows);
  const diagnosticRowsHtml = renderTableRows(viewModel.diagnosticRows);
  const initialOutreachRowsHtml = renderTableRows(viewModel.initialOutreachRows);
  const quickActionsHtml = renderQuickActions(viewModel.quickActions);
  const initialOutreachActionHtml = viewModel.initialOutreachAction
    ? `<div style="margin-top:10px"><a href="${escapeHtml(
        viewModel.initialOutreachAction.href,
      )}" style="display:inline-block;padding:10px 14px;border:1px solid #e5e7eb;border-radius:999px;background:#f9fafb;color:#111827;text-decoration:none;font-size:13px;line-height:1">${escapeHtml(
        viewModel.initialOutreachAction.label,
      )}</a></div>`
    : '';
  const attachmentsHtml = renderAttachmentsHtml(viewModel);
  const draftsHtml = renderDraftsHtml(viewModel);
  const transcriptHtml = renderTranscriptHtml(viewModel);
  const callScriptHtml = formatListHtml(viewModel.callScriptPrompts);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(viewModel.subject)}</title>
  </head>
  <body style="margin:0;padding:24px;background:#f6f7f9;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111827">
    <table role="presentation" style="width:100%;border-collapse:collapse">
      <tr>
        <td>
          <table role="presentation" style="width:100%;max-width:720px;margin:0 auto;border-collapse:separate;border-spacing:0;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden">
            <tr>
              <td style="padding:18px 22px;background:#141cff;color:#ffffff">
                <div style="font-size:16px;font-weight:700;line-height:1.2">New chat lead</div>
                <div style="font-size:12px;opacity:.9;margin-top:4px">${escapeHtml(viewModel.shopName)}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 22px">
                <div style="font-size:14px;font-weight:700;margin:0 0 10px">At a glance</div>
                <table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px">
                  ${atAGlanceRowsHtml || '<tr><td style="color:#6b7280">No structured details extracted yet.</td></tr>'}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 22px 18px">
                <div style="font-size:14px;font-weight:700;margin:0 0 10px">Initial outreach</div>
                <table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px">
                  ${initialOutreachRowsHtml}
                </table>
                ${initialOutreachActionHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:0 22px 18px">
                <div style="font-size:14px;font-weight:700;margin:0 0 10px">Quick actions</div>
                <div>${quickActionsHtml || '<span style="color:#6b7280;font-size:13px">No actions available.</span>'}</div>
              </td>
            </tr>
            ${
              viewModel.attachments.length
                ? `<tr>
              <td style="padding:18px 22px;border-top:1px solid #e5e7eb">
                ${attachmentsHtml}
              </td>
            </tr>`
                : ''
            }
            ${
              viewModel.hasLeadSummary
                ? `<tr>
              <td style="padding:18px 22px;border-top:1px solid #e5e7eb">
                <div style="font-size:14px;font-weight:700;margin:0 0 10px">Summary</div>
                <p style="margin:0;line-height:1.5;color:#111827">${escapeHtml(
                  viewModel.summary ?? '',
                )}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 22px;border-top:1px solid #e5e7eb">
                <div style="font-size:14px;font-weight:700;margin:0 0 10px">Suggested next steps</div>
                ${formatListHtml(viewModel.nextSteps)}
              </td>
            </tr>
            <tr>
              <td style="padding:18px 22px;border-top:1px solid #e5e7eb">
                <div style="font-size:14px;font-weight:700;margin:0 0 10px">Follow-up questions</div>
                ${formatListHtml(viewModel.followUpQuestions)}
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
                  ${diagnosticRowsHtml || '<tr><td style="color:#6b7280">No diagnostics available.</td></tr>'}
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
