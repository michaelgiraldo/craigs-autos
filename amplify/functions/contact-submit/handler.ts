import { emptyResponse, getHttpMethod, jsonResponse } from '../_shared/http.ts';
import { createContactSubmitRuntime } from './runtime.ts';
import { type ContactSubmitEvent, parseContactSubmitRequest } from './request.ts';
import {
  submitQuoteRequest,
  type SubmitQuoteRequestDeps,
  type SubmitQuoteRequestResult,
} from './submit-quote-request.ts';
import { validateContactSubmitRequest } from './validation.ts';

function responseForSubmitResult(result: SubmitQuoteRequestResult) {
  if (result.kind === 'smoke_test') {
    return jsonResponse(200, {
      ok: true,
      smoke_test: true,
      ...(result.journeyId ? { journey_id: result.journeyId } : {}),
      ...(result.leadRecordId ? { lead_record_id: result.leadRecordId } : {}),
    });
  }

  if (result.kind === 'followup_invoke_failed') {
    return jsonResponse(502, {
      error: 'Unable to submit your request right now.',
      ...(result.leadRecordId ? { lead_record_id: result.leadRecordId } : {}),
    });
  }

  return jsonResponse(200, {
    ok: true,
    ...(result.leadRecordId ? { lead_record_id: result.leadRecordId } : {}),
  });
}

export function createContactSubmitHandler(deps: SubmitQuoteRequestDeps) {
  return async (event: ContactSubmitEvent) => {
    const method = getHttpMethod(event);
    const isHttpRequest = typeof method === 'string' && method.length > 0;

    if (method === 'OPTIONS') {
      return emptyResponse(204);
    }

    if (isHttpRequest && method !== 'POST') {
      return jsonResponse(405, { error: 'Method not allowed' });
    }

    if (!deps.configValid) {
      console.error('Contact submit function is missing required environment variables.');
      return jsonResponse(500, { error: 'Server missing configuration' });
    }

    try {
      const parsed = parseContactSubmitRequest(event, isHttpRequest);
      if (!parsed.ok && parsed.reason === 'invalid_json') {
        return jsonResponse(400, { error: 'Invalid JSON body' });
      }
      if (!parsed.ok) {
        return jsonResponse(400, { error: 'Invalid request payload' });
      }

      const validation = validateContactSubmitRequest(parsed.request);
      if (!validation.ok) return jsonResponse(validation.statusCode, validation.body);

      return responseForSubmitResult(await submitQuoteRequest(parsed.request, deps));
    } catch (error: unknown) {
      console.error('Failed to process contact submit request.', error);
      return jsonResponse(502, { error: 'Unable to submit your request right now.' });
    }
  };
}

export const handler = createContactSubmitHandler(createContactSubmitRuntime());
