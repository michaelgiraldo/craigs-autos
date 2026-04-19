import { z } from 'zod';
import { sanitizeAttributionSnapshot } from '../_lead-platform/domain/attribution.ts';
import { normalizeString } from '../_lead-platform/domain/quote-request.ts';
import { decodeBody } from '../_shared/http.ts';

export type LambdaHeaders = Record<string, string | undefined>;

export type QuoteRequestSubmitEvent = {
  headers?: LambdaHeaders | null;
  requestContext?: { http?: { method?: string } } | null;
  httpMethod?: string;
  body?: string | null;
  isBase64Encoded?: boolean;
};

export type QuoteRequestSubmitRequest = {
  attribution: ReturnType<typeof sanitizeAttributionSnapshot>;
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
  __smoke_test: z.boolean().optional(),
});

function readOrigin(headers: LambdaHeaders | null | undefined): string {
  return normalizeString(headers?.origin || headers?.Origin);
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
  const pageUrl = normalizeString(payload.pageUrl);
  const origin = readOrigin(event.headers);

  return {
    ok: true,
    request: {
      attribution: sanitizeAttributionSnapshot(payload.attribution),
      clientEventId: normalizeString(payload.client_event_id) || null,
      company: normalizeString(payload.company),
      effectivePageUrl: pageUrl || origin,
      email: normalizeString(payload.email),
      isSmokeTest: !isHttpRequest && payload.__smoke_test === true,
      journeyId: normalizeString(payload.journey_id) || null,
      locale: normalizeString(payload.locale),
      message: normalizeString(payload.message),
      name: normalizeString(payload.name),
      origin,
      pageUrl,
      phone: normalizeString(payload.phone),
      service: normalizeString(payload.service),
      userId: normalizeString(payload.user),
      vehicle: normalizeString(payload.vehicle),
    },
  };
}
