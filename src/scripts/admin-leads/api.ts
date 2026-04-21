import { PUBLIC_API_ROUTES, type PublicApiRoute } from '@craigs/contracts/public-api-contract';
import { resolvePublicApiUrl } from '../../lib/backend/public-api-client';
import { FETCH_TIMEOUT_MS } from './config';
import type { LeadsApiResponse, QualificationFilter } from './types';

export class AdminUnauthorizedError extends Error {
  constructor() {
    super('Unauthorized.');
    this.name = 'AdminUnauthorizedError';
  }
}

export function isAdminUnauthorizedError(error: unknown): error is AdminUnauthorizedError {
  return error instanceof AdminUnauthorizedError;
}

function withFetchTimeout(options: RequestInit = {}): RequestInit {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return { ...options, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) };
  }
  return options;
}

function jsonHeaders(auth: string): Headers {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (auth) {
    headers.set('Authorization', auth);
  }
  return headers;
}

async function assertOk(response: Response, fallbackMessage: string): Promise<void> {
  if (response.status === 401) {
    throw new AdminUnauthorizedError();
  }
  if (!response.ok) {
    throw new Error(fallbackMessage);
  }
}

export function createAdminLeadsApi() {
  let listEndpoint: string | null = null;
  let qualificationEndpoint: string | null = null;
  let followupRetryEndpoint: string | null = null;
  let followupManualEndpoint: string | null = null;

  const resolveEndpoint = async (
    route: PublicApiRoute,
    current: string | null,
  ): Promise<string> => {
    if (current) {
      return current;
    }

    const url = await resolvePublicApiUrl(route);
    if (typeof url !== 'string' || !url.trim()) {
      throw new Error('Missing admin endpoint.');
    }

    return url.trim();
  };

  const resolveListEndpoint = async (): Promise<string> => {
    listEndpoint = await resolveEndpoint(PUBLIC_API_ROUTES.adminLeads, listEndpoint);
    return listEndpoint;
  };

  const resolveQualificationEndpoint = async (): Promise<string> => {
    qualificationEndpoint = await resolveEndpoint(
      PUBLIC_API_ROUTES.adminLeadQualification,
      qualificationEndpoint,
    );
    return qualificationEndpoint;
  };

  const resolveFollowupRetryEndpoint = async (): Promise<string> => {
    followupRetryEndpoint = await resolveEndpoint(
      PUBLIC_API_ROUTES.adminFollowupRetry,
      followupRetryEndpoint,
    );
    return followupRetryEndpoint;
  };

  const resolveFollowupManualEndpoint = async (): Promise<string> => {
    followupManualEndpoint = await resolveEndpoint(
      PUBLIC_API_ROUTES.adminFollowupManual,
      followupManualEndpoint,
    );
    return followupManualEndpoint;
  };

  return {
    async fetchLeads(args: {
      auth: string;
      recordsCursor: string | null;
      journeysCursor: string | null;
      qualifiedFilter: QualificationFilter;
    }): Promise<LeadsApiResponse> {
      const resolvedEndpoint = await resolveListEndpoint();
      const url = new URL(resolvedEndpoint);
      url.searchParams.set('limit', '200');
      if (args.recordsCursor) {
        url.searchParams.set('records_cursor', args.recordsCursor);
      }
      if (args.journeysCursor) {
        url.searchParams.set('journeys_cursor', args.journeysCursor);
      }
      if (args.qualifiedFilter) {
        url.searchParams.set('qualified', args.qualifiedFilter);
      }

      const response = await fetch(
        url.toString(),
        withFetchTimeout({
          method: 'GET',
          headers: jsonHeaders(args.auth),
        }),
      );
      await assertOk(response, 'Failed to load leads.');

      return (await response.json()) as LeadsApiResponse;
    },

    async updateLead(args: {
      auth: string;
      leadRecordId: string;
      qualified: boolean;
    }): Promise<void> {
      const resolvedEndpoint = await resolveQualificationEndpoint();
      const response = await fetch(
        resolvedEndpoint,
        withFetchTimeout({
          method: 'POST',
          headers: jsonHeaders(args.auth),
          body: JSON.stringify({
            lead_record_id: args.leadRecordId,
            qualified: args.qualified,
          }),
        }),
      );

      await assertOk(response, 'Update failed.');
      await response.json();
    },

    async retryFollowupWork(args: { auth: string; idempotencyKey: string }): Promise<void> {
      const resolvedEndpoint = await resolveFollowupRetryEndpoint();
      const response = await fetch(
        resolvedEndpoint,
        withFetchTimeout({
          method: 'POST',
          headers: jsonHeaders(args.auth),
          body: JSON.stringify({
            idempotency_key: args.idempotencyKey,
          }),
        }),
      );

      await assertOk(response, 'Retry failed.');
      await response.json();
    },

    async resolveFollowupWorkManually(args: {
      auth: string;
      idempotencyKey: string;
      reason: string;
    }): Promise<void> {
      const resolvedEndpoint = await resolveFollowupManualEndpoint();
      const response = await fetch(
        resolvedEndpoint,
        withFetchTimeout({
          method: 'POST',
          headers: jsonHeaders(args.auth),
          body: JSON.stringify({
            idempotency_key: args.idempotencyKey,
            reason: args.reason,
          }),
        }),
      );

      await assertOk(response, 'Manual resolution failed.');
      await response.json();
    },
  };
}
