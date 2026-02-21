import OpenAI from 'openai';
import type { TranscriptLine } from './lead-types';
import { normalizeWhitespace } from './text-utils';

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

  const thread = await args.openai.beta.chatkit.threads.retrieve(args.threadId);

  const items: any[] = [];
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
      const parts = Array.isArray(item.content) ? item.content : [];
      const text = parts
        .map((part: any) => (part && typeof part.text === 'string' ? part.text : ''))
        .filter(Boolean)
        .join('\n');

      const attachments = Array.isArray(item.attachments) ? item.attachments : [];
      const attachmentLines = attachments
        .map((att: any) => {
          const name = typeof att?.name === 'string' ? att.name : 'attachment';
          const mime = typeof att?.mime_type === 'string' ? att.mime_type : '';
          const url = typeof att?.preview_url === 'string' ? att.preview_url : '';
          return `Attachment: ${name}${mime ? ` (${mime})` : ''}${url ? ` ${url}` : ''}`;
        })
        .filter(Boolean);

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
      const parts = Array.isArray(item.content) ? item.content : [];
      const text = parts
        .map((part: any) => (part && typeof part.text === 'string' ? part.text : ''))
        .filter(Boolean)
        .join('\n');

      const fullText = normalizeWhitespace(text);
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
