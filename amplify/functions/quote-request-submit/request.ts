import { z } from 'zod';
import { sanitizeAttributionSnapshot } from '../_lead-platform/domain/attribution.ts';
import { normalizeWorkString } from '../_lead-platform/domain/lead-followup-work.ts';
import { decodeBody } from '../_shared/http.ts';

export type LambdaHeaders = Record<string, string | undefined>;

export type QuoteRequestSubmittedAttachment = {
  attachmentId: string;
  byteSize: number;
  contentType: string;
  filename: string;
  key: string;
};

export type QuoteRequestSubmitEvent = {
  headers?: LambdaHeaders | null;
  requestContext?: { http?: { method?: string } } | null;
  httpMethod?: string;
  body?: string | null;
  isBase64Encoded?: boolean;
};

export type QuoteRequestSubmitRequest = {
  attribution: ReturnType<typeof sanitizeAttributionSnapshot>;
  attachments: QuoteRequestSubmittedAttachment[];
  clientEventId: string | null;
  company: string;
  effectivePageUrl: string;
  email: string;
  isSmokeTest: boolean;
  journeyId: string | null;
  locale: string;
  message: string;
  name: string;
  origin: string;
  pageUrl: string;
  phone: string;
  service: string;
  unsupportedAttachmentCount: number;
  userId: string;
  vehicle: string;
};

export type ParseQuoteRequestSubmitRequestResult =
  | { ok: true; request: QuoteRequestSubmitRequest }
  | { ok: false; reason: 'invalid_json' | 'invalid_payload' };

const payloadSchema = z.looseObject({
  name: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  vehicle: z.string().optional(),
  service: z.string().optional(),
  message: z.string().optional(),
  company: z.string().optional(),
  locale: z.string().optional(),
  pageUrl: z.string().optional(),
  user: z.string().optional(),
  journey_id: z.string().optional(),
  client_event_id: z.string().optional(),
  attribution: z.unknown().optional(),
  attachments: z
    .array(
      z.looseObject({
        attachment_id: z.string().optional(),
        byte_size: z.number().optional(),
        content_type: z.string().optional(),
        filename: z.string().optional(),
        key: z.string().optional(),
      }),
    )
    .optional(),
  __smoke_test: z.boolean().optional(),
  unsupported_attachment_count: z.number().optional(),
});

function readOrigin(headers: LambdaHeaders | null | undefined): string {
  return normalizeWorkString(headers?.origin || headers?.Origin);
}

export function parseQuoteRequestSubmitRequest(
  event: QuoteRequestSubmitEvent,
  isHttpRequest: boolean,
): ParseQuoteRequestSubmitRequestResult {
  let parsedJson: unknown = event;

  if (isHttpRequest) {
    try {
      const rawBody = decodeBody(event);
      parsedJson = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      return { ok: false, reason: 'invalid_json' };
    }
  }

  const payloadResult = payloadSchema.safeParse(
    parsedJson && typeof parsedJson === 'object' ? parsedJson : {},
  );

  if (!payloadResult.success) {
    return { ok: false, reason: 'invalid_payload' };
  }

  const payload = payloadResult.data;
  const pageUrl = normalizeWorkString(payload.pageUrl);
  const origin = readOrigin(event.headers);

  return {
    ok: true,
    request: {
      attribution: sanitizeAttributionSnapshot(payload.attribution),
      attachments: (payload.attachments ?? [])
        .map((attachment) => ({
          attachmentId: normalizeWorkString(attachment.attachment_id),
          byteSize:
            typeof attachment.byte_size === 'number' && Number.isFinite(attachment.byte_size)
              ? Math.max(0, Math.trunc(attachment.byte_size))
              : 0,
          contentType: normalizeWorkString(attachment.content_type).toLowerCase(),
          filename: normalizeWorkString(attachment.filename),
          key: normalizeWorkString(attachment.key),
        }))
        .filter((attachment) => attachment.attachmentId && attachment.key),
      clientEventId: normalizeWorkString(payload.client_event_id) || null,
      company: normalizeWorkString(payload.company),
      effectivePageUrl: pageUrl || origin,
      email: normalizeWorkString(payload.email),
      isSmokeTest: !isHttpRequest && payload.__smoke_test === true,
      journeyId: normalizeWorkString(payload.journey_id) || null,
      locale: normalizeWorkString(payload.locale),
      message: normalizeWorkString(payload.message),
      name: normalizeWorkString(payload.name),
      origin,
      pageUrl,
      phone: normalizeWorkString(payload.phone),
      service: normalizeWorkString(payload.service),
      unsupportedAttachmentCount:
        typeof payload.unsupported_attachment_count === 'number' &&
        Number.isFinite(payload.unsupported_attachment_count)
          ? Math.max(0, Math.trunc(payload.unsupported_attachment_count))
          : 0,
      userId: normalizeWorkString(payload.user),
      vehicle: normalizeWorkString(payload.vehicle),
    },
  };
}
