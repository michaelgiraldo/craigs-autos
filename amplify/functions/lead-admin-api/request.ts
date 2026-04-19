import { z } from 'zod';
import { decodeBody, jsonResponse } from '../_shared/http.ts';
import { asObject } from '../_shared/safe.ts';
import type {
  CursorKey,
  LambdaEvent,
  LambdaResult,
  LeadAdminListRequest,
  LeadQualificationRequest,
} from './types.ts';

const MAX_LIMIT = 500;

const postPayloadSchema = z.looseObject({
  lead_record_id: z.unknown().optional(),
  qualified: z.unknown().optional(),
});

type ParsedRequest<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
      response: LambdaResult;
    };

function parseLimit(value: string | undefined): number {
  const parsed = parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 100;
  return Math.min(parsed, MAX_LIMIT);
}

function parseBool(value: string | undefined): boolean | null {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

function decodeCursor(value: string | undefined): CursorKey | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64').toString('utf8'));
    const record = asObject(parsed);
    return record ? (record as CursorKey) : undefined;
  } catch {
    return undefined;
  }
}

export function encodeCursor(key: CursorKey | undefined): string | null {
  if (!key) return null;
  return Buffer.from(JSON.stringify(key)).toString('base64');
}

export function parseLeadAdminListRequest(event: LambdaEvent): LeadAdminListRequest {
  const qs = event.queryStringParameters ?? {};
  return {
    limit: parseLimit(qs.limit),
    qualifiedFilter: parseBool(qs.qualified),
    recordsCursor: decodeCursor(qs.records_cursor ?? qs.cursor),
    journeysCursor: decodeCursor(qs.journeys_cursor),
  };
}

export function parseLeadQualificationRequest(
  event: LambdaEvent,
): ParsedRequest<LeadQualificationRequest> {
  let parsedPayload: z.infer<typeof postPayloadSchema>;
  try {
    const body = decodeBody(event);
    const parsed = body ? JSON.parse(body) : {};
    const result = postPayloadSchema.safeParse(parsed);
    if (!result.success) {
      return { ok: false, response: jsonResponse(400, { error: 'Invalid request payload' }) };
    }
    parsedPayload = result.data;
  } catch {
    return { ok: false, response: jsonResponse(400, { error: 'Invalid JSON body' }) };
  }

  const leadRecordIdResult = z.string().trim().min(1).safeParse(parsedPayload.lead_record_id);
  if (!leadRecordIdResult.success) {
    return { ok: false, response: jsonResponse(400, { error: 'Missing lead_record_id' }) };
  }

  const qualifiedResult = z.boolean().safeParse(parsedPayload.qualified);
  if (!qualifiedResult.success) {
    return { ok: false, response: jsonResponse(400, { error: 'Missing qualified boolean' }) };
  }

  return {
    ok: true,
    value: {
      leadRecordId: leadRecordIdResult.data,
      qualified: qualifiedResult.data,
    },
  };
}
