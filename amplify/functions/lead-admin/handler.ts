import { emptyResponse, getHttpMethod, jsonResponse } from '../_shared/http.ts';
import { isAuthorized, unauthorizedResponse } from './auth.ts';
import { listLeadAdminPage } from './list-leads.ts';
import { qualifyLeadRecord } from './qualify-lead.ts';
import { parseLeadAdminListRequest, parseLeadQualificationRequest } from './request.ts';
import { createProductionLeadAdminDeps } from './runtime.ts';
import type { LambdaEvent, LambdaResult, LeadAdminDeps } from './types.ts';

export function createLeadAdminHandler(deps: LeadAdminDeps) {
  return async (event: LambdaEvent): Promise<LambdaResult> => {
    const method = getHttpMethod(event);

    if (method === 'OPTIONS') {
      return emptyResponse(204);
    }

    if (!deps.configValid) {
      return jsonResponse(500, { error: 'Server missing configuration' });
    }

    if (!isAuthorized(event, deps.adminPassword)) {
      return unauthorizedResponse();
    }

    if (method === 'GET') {
      const request = parseLeadAdminListRequest(event);
      return jsonResponse(200, await listLeadAdminPage(deps, request));
    }

    if (method === 'POST') {
      const parsedRequest = parseLeadQualificationRequest(event);
      if (!parsedRequest.ok) return parsedRequest.response;

      const result = await qualifyLeadRecord(deps, parsedRequest.value);
      if (!result.found) {
        return jsonResponse(404, { error: 'Lead record not found' });
      }

      return jsonResponse(200, {
        ok: true,
        lead_record_id: parsedRequest.value.leadRecordId,
        qualified: parsedRequest.value.qualified,
      });
    }

    return jsonResponse(405, { error: 'Method not allowed' });
  };
}

export const handler = createLeadAdminHandler(createProductionLeadAdminDeps(process.env));
