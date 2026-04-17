import type { LocaleKey } from '../../../../types/site';
import type { QuoteRequestFormData } from './types';

type PostQuoteRequestArgs = {
  endpoint: string;
  form: QuoteRequestFormData;
  attribution: unknown;
  clientEventId: string;
  journeyId: string | null;
  locale: LocaleKey;
  pageUrl: string;
  userId: string | null;
};

export async function postQuoteRequest({
  endpoint,
  form,
  attribution,
  clientEventId,
  journeyId,
  locale,
  pageUrl,
  userId,
}: PostQuoteRequestArgs): Promise<Record<string, unknown>> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...form,
      attribution,
      client_event_id: clientEventId,
      journey_id: journeyId,
      locale,
      pageUrl,
      service: form.service,
      user: userId,
    }),
  });

  const responseText = await response.text();
  let responseData: Record<string, unknown> = {};
  try {
    responseData = responseText ? (JSON.parse(responseText) as Record<string, unknown>) : {};
  } catch {
    responseData = {};
  }

  if (!response.ok) {
    const serverMessage =
      typeof responseData.error === 'string' && responseData.error.trim()
        ? responseData.error.trim()
        : '';
    const submitError = new Error(serverMessage || `Request failed with status ${response.status}`);
    submitError.name = `http_${response.status}`;
    throw submitError;
  }

  return responseData;
}
