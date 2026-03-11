import type OpenAI from 'openai';
import type { TranscriptLine } from './lead-types';
import { normalizeWhitespace } from './text-utils';

type ChatKitThread = Awaited<ReturnType<OpenAI['beta']['chatkit']['threads']['retrieve']>>;
type ChatKitThreadItem = Awaited<
  ReturnType<OpenAI['beta']['chatkit']['threads']['listItems']>
>['data'][number];

function joinTextParts(parts: Array<{ text: string }>): string {
  return parts
    .map((part) => part.text)
    .filter(Boolean)
    .join('\n');
}

function formatAttachmentLine(attachment: {
  name: string;
  mime_type: string;
  preview_url: string | null;
}): string {
  const url = attachment.preview_url ?? '';
  return `Attachment: ${attachment.name}${attachment.mime_type ? ` (${attachment.mime_type})` : ''}${url ? ` ${url}` : ''}`;
}

export async function buildTranscript(args: {
  openai: OpenAI;
  threadId: string;
  assistantName?: string;
}): Promise<{
  threadTitle: string | null;
  threadUser: string;
  lines: TranscriptLine[];
}> {
  const assistantName =
    typeof args.assistantName === 'string' && args.assistantName.trim()
      ? args.assistantName.trim()
      : 'Assistant';

  const thread: ChatKitThread = await args.openai.beta.chatkit.threads.retrieve(args.threadId);

  const items: ChatKitThreadItem[] = [];
  let after: string | undefined;

  for (let pageCount = 0; pageCount < 20; pageCount += 1) {
    const page = await args.openai.beta.chatkit.threads.listItems(args.threadId, {
      order: 'asc',
      limit: 100,
      ...(after ? { after } : {}),
    });

    items.push(...(page?.data ?? []));

    if (!page?.has_more) break;
    after = page?.last_id ?? after;
    if (!after) break;
  }

  const lines: TranscriptLine[] = [];

  for (const item of items) {
    if (!item || typeof item !== 'object') continue;

    if (item.type === 'chatkit.user_message') {
      const text = joinTextParts(item.content);
      const attachmentLines = item.attachments.map(formatAttachmentLine);

      const fullText = normalizeWhitespace([text, ...attachmentLines].filter(Boolean).join('\n'));
      if (fullText) {
        lines.push({
          created_at: typeof item.created_at === 'number' ? item.created_at : 0,
          speaker: 'Customer',
          text: fullText,
        });
      }
      continue;
    }

    if (item.type === 'chatkit.assistant_message') {
      const fullText = normalizeWhitespace(joinTextParts(item.content));
      if (fullText) {
        lines.push({
          created_at: typeof item.created_at === 'number' ? item.created_at : 0,
          speaker: assistantName,
          text: fullText,
        });
      }
    }
  }

  return {
    threadTitle: thread?.title ?? null,
    threadUser: thread?.user ?? 'unknown',
    lines,
  };
}
