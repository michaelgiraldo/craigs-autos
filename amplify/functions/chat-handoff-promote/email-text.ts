import { formatListText } from './text-utils.ts';
import type { LeadEmailViewModel, LeadEmailRow } from './email-view-model.ts';

function renderRowsText(rows: LeadEmailRow[]): string[] {
  return rows.map((row) => `${row.label}: ${row.value}`);
}

export function renderLeadEmailText(viewModel: LeadEmailViewModel): string {
  const bodyParts: string[] = [`New chat lead from ${viewModel.sourceLabel}`, ''];

  if (viewModel.hasLeadSummary) {
    bodyParts.push('At a glance');
    bodyParts.push(
      ...renderRowsText(viewModel.atAGlanceRows.filter((row) => row.label !== 'Photos')),
    );
    bodyParts.push('');
  }

  bodyParts.push('Initial outreach');
  bodyParts.push(...renderRowsText(viewModel.initialOutreachRows));
  if (viewModel.initialOutreachAction) {
    bodyParts.push(`Manual SMS fallback:\n${viewModel.initialOutreachAction.href}`);
  }
  bodyParts.push('');

  if (viewModel.hasAttribution) {
    bodyParts.push('Attribution');
    bodyParts.push(...renderRowsText(viewModel.attributionRows));
    bodyParts.push('');
  }

  if (viewModel.attachments.length) {
    bodyParts.push(`Photos/attachments (${viewModel.attachments.length})`);
    bodyParts.push(
      viewModel.attachments
        .map((attachment) => {
          const label = `${attachment.name}${attachment.mime ? ` (${attachment.mime})` : ''}`;
          const detail = attachment.detail ? ` - ${attachment.detail}` : '';
          return `- ${label}: ${attachment.status}${detail}`;
        })
        .join('\n'),
    );
    bodyParts.push('');
  }

  if (viewModel.summary) {
    bodyParts.push('Summary');
    bodyParts.push(viewModel.summary);
    bodyParts.push('');
  }

  if (viewModel.nextSteps.length) {
    bodyParts.push('Suggested next steps');
    bodyParts.push(formatListText(viewModel.nextSteps, '- '));
    bodyParts.push('');
  }

  if (viewModel.followUpQuestions.length) {
    bodyParts.push('Follow-up questions');
    bodyParts.push(formatListText(viewModel.followUpQuestions, '- '));
    bodyParts.push('');
  }

  if (viewModel.callScriptPrompts.length) {
    bodyParts.push('Call script (3 prompts)');
    bodyParts.push(formatListText(viewModel.callScriptPrompts, '- '));
    bodyParts.push('');
  }

  bodyParts.push('Drafts');
  if (viewModel.drafts.smsBody && viewModel.drafts.smsLabel) {
    bodyParts.push(`${viewModel.drafts.smsLabel}:\n${viewModel.drafts.smsBody}`);
  }
  if (viewModel.drafts.emailSubject) {
    bodyParts.push(`Email subject:\n${viewModel.drafts.emailSubject}`);
  }
  if (viewModel.drafts.emailBody) {
    bodyParts.push(`Email draft:\n${viewModel.drafts.emailBody}`);
  }
  bodyParts.push('');

  bodyParts.push('Transcript');
  bodyParts.push('');
  bodyParts.push(
    ...viewModel.transcriptEntries.map(
      (entry) => `[${entry.when}] ${entry.speaker}: ${entry.text}`,
    ),
  );
  bodyParts.push('');

  bodyParts.push('Diagnostics');
  bodyParts.push(
    ...renderRowsText(viewModel.diagnosticRows.map((row) => ({ ...row, href: null }))),
  );
  bodyParts.push(`OpenAI logs: ${viewModel.openAiLogsHref}`);

  return bodyParts.join('\n\n');
}
