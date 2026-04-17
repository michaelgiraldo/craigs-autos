import { FETCH_TIMEOUT_MS, OUTPUTS_PATH } from './config';
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
  let endpoint: string | null = null;

  const resolveEndpoint = async (): Promise<string> => {
    if (endpoint) {
      return endpoint;
    }

    const response = await fetch(OUTPUTS_PATH, withFetchTimeout({ cache: 'no-store' }));
    if (!response.ok) {
      throw new Error('Missing admin endpoint.');
    }

    const data = (await response.json()) as { custom?: { chatkit_lead_admin_url?: string } };
    const url = data?.custom?.chatkit_lead_admin_url;
    if (typeof url !== 'string' || !url.trim()) {
      throw new Error('Missing admin endpoint.');
    }

    endpoint = url.trim();
    return endpoint;
  };

  return {
    async fetchLeads(args: {
      auth: string;
      recordsCursor: string | null;
      journeysCursor: string | null;
      qualifiedFilter: QualificationFilter;
    }): Promise<LeadsApiResponse> {
      const resolvedEndpoint = await resolveEndpoint();
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
      const resolvedEndpoint = await resolveEndpoint();
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
  };
}
