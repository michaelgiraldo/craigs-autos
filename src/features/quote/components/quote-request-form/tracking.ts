import {
  getAttributionForDataLayer,
  getAttributionPayload,
  getJourneyId,
  getLeadUserId,
} from '../../../../lib/attribution.js';
import { LEAD_EVENTS } from '../../../../../shared/lead-event-contract.js';
import {
  createClientEventId,
  pushLeadDataLayerEvent,
  type LeadDataLayerParams,
} from '../../../lead-tracking/browser-events';
import type { LocaleKey } from '../../../../types/site';

export type QuoteFormTrackingContext = {
  attributionPayload: unknown;
  attributionForDataLayer: LeadDataLayerParams | null;
  userId: string | null;
  journeyId: string | null;
  clientEventId: string;
  occurredAtMs: number;
  pageUrl: string;
  pagePath: string;
  locale: LocaleKey;
};

export function createQuoteFormTrackingContext(locale: LocaleKey): QuoteFormTrackingContext {
  return {
    attributionPayload: getAttributionPayload(),
    attributionForDataLayer: getAttributionForDataLayer(),
    userId: getLeadUserId(),
    journeyId: getJourneyId(),
    clientEventId: createClientEventId('form'),
    occurredAtMs: Date.now(),
    pageUrl: window.location.href,
    pagePath: window.location.pathname,
    locale,
  };
}

function getBaseFormEvent(context: QuoteFormTrackingContext): LeadDataLayerParams {
  return {
    locale: context.locale,
    journey_id: context.journeyId,
    client_event_id: context.clientEventId,
    occurred_at_ms: context.occurredAtMs,
    page_path: context.pagePath,
    page_url: context.pageUrl,
    user_id: context.userId,
  };
}

export function pushQuoteSubmitError(context: QuoteFormTrackingContext, errorCode: string) {
  pushLeadDataLayerEvent(
    LEAD_EVENTS.formSubmitError,
    {
      ...getBaseFormEvent(context),
      error_code: errorCode,
    },
    context.attributionForDataLayer,
  );
}

export function pushQuoteSubmitSuccess(
  context: QuoteFormTrackingContext,
  leadRecordId: string | null,
) {
  pushLeadDataLayerEvent(
    LEAD_EVENTS.formSubmitSuccess,
    {
      ...getBaseFormEvent(context),
      lead_record_id: leadRecordId,
    },
    context.attributionForDataLayer,
  );
}
