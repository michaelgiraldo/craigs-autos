import {
  getAttributionForDataLayer,
  getAttributionPayload,
  getJourneyId,
  getLeadUserId,
} from '../../../../lib/attribution.js';
import { createClientEventId, pushLeadDataLayerEvent } from '../../../lead-tracking/form-events';
import type { LocaleKey } from '../../../../types/site';

type LeadEventValue = boolean | number | string | null | undefined;
type LeadEventParams = Record<string, LeadEventValue>;

export type QuoteFormTrackingContext = {
  attributionPayload: unknown;
  attributionForDataLayer: LeadEventParams | null;
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
    attributionForDataLayer: getAttributionForDataLayer() as LeadEventParams | null,
    userId: getLeadUserId(),
    journeyId: getJourneyId(),
    clientEventId: createClientEventId('form'),
    occurredAtMs: Date.now(),
    pageUrl: window.location.href,
    pagePath: window.location.pathname,
    locale,
  };
}

function getBaseFormEvent(context: QuoteFormTrackingContext): LeadEventParams {
  return {
    event_class: 'diagnostic',
    customer_action: 'form_submit',
    capture_channel: 'form',
    lead_strength: 'captured_lead',
    verification_status: 'unverified',
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
    'lead_form_submit_error',
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
    'lead_form_submit_success',
    {
      ...getBaseFormEvent(context),
      lead_record_id: leadRecordId,
      event_class: 'customer_action',
    },
    context.attributionForDataLayer,
  );
}
