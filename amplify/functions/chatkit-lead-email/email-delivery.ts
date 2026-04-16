import { randomUUID } from 'node:crypto';
import { type SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import {
  buildResolutionFromFailure,
  buildResolutionFromInlineAttachment,
  buildResolutionFromOmission,
  compactInlineAttachment,
  prepareInlineAttachment,
  type AttachmentInfo,
  type AttachmentResolution,
  type InlineAttachment,
  type PrepareAttachmentResult,
} from './attachments.ts';
import { buildRawEmail } from './email-mime.ts';
import { renderLeadEmailHtml } from './email-html.ts';
import { renderLeadEmailText } from './email-text.ts';
import {
  buildLeadEmailViewModel,
  type BuildMessageLinkUrl,
  type InitialOutreachState,
} from './email-view-model.ts';
import type {
  LeadAttachment,
  LeadAttributionPayload,
  LeadSummary,
  TranscriptLine,
} from './lead-types.ts';

export type { InitialOutreachState } from './email-view-model.ts';

type EmailArgs = {
  ses: SESv2Client;
  leadToEmail: string;
  leadFromEmail: string;
  threadId: string;
  locale: string;
  pageUrl: string;
  chatUser: string;
  reason: string;
  threadTitle: string | null;
  attachments: LeadAttachment[];
  transcript: TranscriptLine[];
  leadSummary: LeadSummary | null;
  attribution: LeadAttributionPayload | null;
  shopName: string;
  shopPhoneDisplay: string;
  shopPhoneDigits: string;
  shopAddress: string;
  leadEmailRawMessageMaxBytes: number;
  initialOutreach: InitialOutreachState;
  createMessageLinkUrl: BuildMessageLinkUrl;
};

type PreparedAttachments = {
  failedByUrl: Map<string, string>;
  preparedByUrl: Map<string, InlineAttachment>;
};

function buildAttachmentResolutions(
  sourceAttachments: AttachmentInfo[],
  prepared: PreparedAttachments,
  selectedByUrl: Map<string, InlineAttachment>,
): AttachmentResolution[] {
  return sourceAttachments.map((attachment) => {
    const selected = selectedByUrl.get(attachment.url);
    if (selected) return buildResolutionFromInlineAttachment(attachment, selected);

    const failedDetail = prepared.failedByUrl.get(attachment.url);
    if (failedDetail) return buildResolutionFromFailure(attachment, failedDetail);

    return buildResolutionFromOmission(attachment);
  });
}

async function buildEmailArtifacts(
  args: EmailArgs,
  attachmentResolutions: AttachmentResolution[],
  inlineAttachments: InlineAttachment[],
): Promise<{
  rawMessage: Buffer;
}> {
  const viewModel = await buildLeadEmailViewModel({
    threadId: args.threadId,
    locale: args.locale,
    pageUrl: args.pageUrl,
    chatUser: args.chatUser,
    reason: args.reason,
    threadTitle: args.threadTitle,
    transcript: args.transcript,
    leadSummary: args.leadSummary,
    attribution: args.attribution,
    shopName: args.shopName,
    shopPhoneDisplay: args.shopPhoneDisplay,
    shopPhoneDigits: args.shopPhoneDigits,
    shopAddress: args.shopAddress,
    initialOutreach: args.initialOutreach,
    createMessageLinkUrl: args.createMessageLinkUrl,
    attachments: attachmentResolutions,
  });

  const rawMessage = buildRawEmail({
    from: args.leadFromEmail,
    to: args.leadToEmail,
    replyTo: viewModel.customerEmail,
    subject: viewModel.subject,
    textBody: renderLeadEmailText(viewModel),
    htmlBody: renderLeadEmailHtml(viewModel),
    attachments: inlineAttachments,
    mixedBoundary: `mixed-${randomUUID()}`,
    alternativeBoundary: `alternative-${randomUUID()}`,
  });

  return { rawMessage };
}

function logAttachmentEvent(
  args: EmailArgs,
  message: string,
  extra: Record<string, unknown>,
  level: 'info' | 'warn' = 'info',
): void {
  const payload = {
    attachment_count: args.attachments.length,
    reason: args.reason,
    thread_id: args.threadId,
    ...extra,
  };
  if (level === 'warn') {
    console.warn(message, JSON.stringify(payload));
    return;
  }
  console.info(message, JSON.stringify(payload));
}

async function prepareAttachments(args: EmailArgs): Promise<PreparedAttachments> {
  const preparedByUrl = new Map<string, InlineAttachment>();
  const failedByUrl = new Map<string, string>();

  const preparedResults: PrepareAttachmentResult[] = await Promise.all(
    args.attachments.map((attachment) => prepareInlineAttachment(attachment)),
  );

  for (const result of preparedResults) {
    if (result.ok) {
      preparedByUrl.set(result.attachment.sourceUrl, result.attachment);
      continue;
    }

    failedByUrl.set(result.attachment.url, result.detail);
    logAttachmentEvent(
      args,
      'Lead email attachment skipped',
      {
        attachment_name: result.attachment.name,
        detail: result.detail,
      },
      'warn',
    );
  }

  return { failedByUrl, preparedByUrl };
}

async function fitAttachmentsToBudget(
  args: EmailArgs,
  prepared: PreparedAttachments,
): Promise<{
  rawMessage: Buffer;
  resolutions: AttachmentResolution[];
  selectedByUrl: Map<string, InlineAttachment>;
}> {
  const preparedAttachments = args.attachments
    .map((attachment) => prepared.preparedByUrl.get(attachment.url))
    .filter((attachment): attachment is InlineAttachment => Boolean(attachment));

  let selectedAttachments = preparedAttachments;

  const render = async (attachments: InlineAttachment[]) => {
    const selectedByUrl = new Map<string, InlineAttachment>(
      attachments.map((attachment) => [attachment.sourceUrl, attachment]),
    );
    const resolutions = buildAttachmentResolutions(args.attachments, prepared, selectedByUrl);
    const { rawMessage } = await buildEmailArtifacts(args, resolutions, attachments);
    return { rawMessage, resolutions, selectedByUrl };
  };

  let rendered = await render(selectedAttachments);
  if (rendered.rawMessage.length <= args.leadEmailRawMessageMaxBytes) {
    logAttachmentEvent(args, 'Lead email attachments fit initial budget', {
      attached_count: selectedAttachments.length,
      raw_message_bytes: rendered.rawMessage.length,
    });
    return rendered;
  }

  logAttachmentEvent(args, 'Lead email exceeded raw email budget before compaction', {
    attached_count: selectedAttachments.length,
    raw_message_bytes: rendered.rawMessage.length,
  });

  const compactedAttachments = await Promise.all(
    selectedAttachments.map(
      async (attachment) => (await compactInlineAttachment(attachment)) ?? attachment,
    ),
  );
  selectedAttachments = compactedAttachments;
  rendered = await render(selectedAttachments);
  if (rendered.rawMessage.length <= args.leadEmailRawMessageMaxBytes) {
    logAttachmentEvent(args, 'Lead email attachments fit after compaction', {
      attached_count: selectedAttachments.length,
      raw_message_bytes: rendered.rawMessage.length,
    });
    return rendered;
  }

  const removableAttachments = [...selectedAttachments].sort(
    (left, right) => right.bytes.length - left.bytes.length,
  );

  while (
    rendered.rawMessage.length > args.leadEmailRawMessageMaxBytes &&
    removableAttachments.length > 0
  ) {
    const omitted = removableAttachments.shift();
    if (!omitted) break;
    selectedAttachments = selectedAttachments.filter(
      (attachment) => attachment.contentId !== omitted.contentId,
    );
    rendered = await render(selectedAttachments);
    logAttachmentEvent(
      args,
      'Lead email attachment omitted to fit budget',
      {
        attachment_name: omitted.filename,
        attached_count: selectedAttachments.length,
        raw_message_bytes: rendered.rawMessage.length,
      },
      'warn',
    );
  }

  return rendered;
}

export async function sendTranscriptEmail(args: EmailArgs): Promise<string | null> {
  const prepared = await prepareAttachments(args);
  const { rawMessage, resolutions } = await fitAttachmentsToBudget(args, prepared);

  logAttachmentEvent(args, 'Lead email attachment summary', {
    attached_count: resolutions.filter((attachment) => attachment.status === 'attached').length,
    failed_count: resolutions.filter((attachment) => attachment.status === 'failed').length,
    omitted_count: resolutions.filter((attachment) => attachment.status === 'omitted').length,
    raw_message_bytes: rawMessage.length,
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
