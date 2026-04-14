import type OpenAI from 'openai';
import type { LeadAttachment, TranscriptLine } from './lead-types';
import { normalizeWhitespace } from './text-utils';

type ChatKitThread = Awaited<ReturnType<OpenAI['beta']['chatkit']['threads']['retrieve']>>;
type ChatKitThreadItem = Awaited<
  ReturnType<OpenAI['beta']['chatkit']['threads']['listItems']>
>['data'][number];

async function* listThreadItems(
  openai: OpenAI,
  threadId: string,
): AsyncGenerator<ChatKitThreadItem> {
  let after: string | undefined;

  for (let pageCount = 0; pageCount < 20; pageCount += 1) {
    const page = await openai.beta.chatkit.threads.listItems(threadId, {
      order: 'asc',
      limit: 100,
      ...(after ? { after } : {}),
    });

    yield* page.data ?? [];

    if (!page.has_more) break;
    after = page.last_id ?? after;
    if (!after) break;
  }
}

function joinTextParts(parts: Array<{ text: string }>): string {
  return parts
    .map((part) => part.text)
    .filter(Boolean)
    .join('\n');
}

function formatAttachmentLine(attachment: {
  name: string;
  mime_type: string;
}): string {
  return `Attachment: ${attachment.name}${attachment.mime_type ? ` (${attachment.mime_type})` : ''}`;
}

function collectAttachments(
  attachments: Array<{
    id?: string | null;
    name: string;
    mime_type: string | null;
    preview_url: string | null;
  }>,
  seen: Set<string>,
): LeadAttachment[] {
  const collected: LeadAttachment[] = [];

  for (const attachment of attachments) {
    const url = attachment.preview_url?.trim() ?? '';
    if (!url || seen.has(url)) continue;
    seen.add(url);
    collected.push({
      id: typeof attachment.id === 'string' ? attachment.id : null,
      name: attachment.name,
      mime: attachment.mime_type?.trim() || null,
      url,
    });
  }

  return collected;
}

export async function buildTranscript(args: {
  openai: OpenAI;
  threadId: string;
  assistantName?: string;
}): Promise<{
  threadTitle: string | null;
  threadUser: string;
  attachments: LeadAttachment[];
  lines: TranscriptLine[];
}> {
  const assistantName =
    typeof args.assistantName === 'string' && args.assistantName.trim()
      ? args.assistantName.trim()
      : 'Assistant';

  const thread: ChatKitThread = await args.openai.beta.chatkit.threads.retrieve(args.threadId);

  const lines: TranscriptLine[] = [];
  const attachments: LeadAttachment[] = [];
  const seenAttachments = new Set<string>();

  for await (const item of listThreadItems(args.openai, args.threadId)) {
    if (!item || typeof item !== 'object') continue;

    if (item.type === 'chatkit.user_message') {
      const text = joinTextParts(item.content);
      const attachmentLines = item.attachments.map(formatAttachmentLine);
      attachments.push(...collectAttachments(item.attachments, seenAttachments));

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
    attachments,
    threadTitle: thread.title ?? null,
    threadUser: thread.user ?? 'unknown',
    lines,
  };
}
