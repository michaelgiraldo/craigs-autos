import { LEAD_EVENTS, type LeadInteractionEventName } from '@craigs/contracts/lead-event-contract';
import {
  createClientEventId,
  pushLeadDataLayerEvent,
} from '../../features/lead-tracking/browser-events';
import { attributionForDataLayer, getAttribution, getJourneyId, getUserId } from './attribution';
import { sendLeadInteraction } from './transport';

export const trackLeadClick = (event: MouseEvent) => {
  let element: Element | null = event.target instanceof Element ? event.target : null;
  if (!element) return;
  if (element.closest) {
    element = element.closest('a');
  }
  if (!(element instanceof HTMLAnchorElement)) return;

  const href = element.getAttribute('href') || '';
  if (!href) return;

  let eventName: LeadInteractionEventName | null = null;
  let provider: string | null = null;
  let leadIntentType: string | null = null;
  if (href.startsWith('tel:')) {
    eventName = LEAD_EVENTS.clickToCall;
    leadIntentType = 'call';
  } else if (href.startsWith('sms:')) {
    eventName = LEAD_EVENTS.clickToText;
    leadIntentType = 'text';
  } else if (href.startsWith('mailto:')) {
    eventName = LEAD_EVENTS.clickEmail;
    leadIntentType = 'email';
  } else if (href.startsWith('https://www.google.com/maps/dir/')) {
    eventName = LEAD_EVENTS.clickDirections;
    provider = 'google_maps';
    leadIntentType = 'directions';
  } else if (href.startsWith('https://maps.apple.com/')) {
    eventName = LEAD_EVENTS.clickDirections;
    provider = 'apple_maps';
    leadIntentType = 'directions';
  }

  if (!eventName) return;

  const attribution = getAttribution();
  const locale = document.documentElement ? document.documentElement.lang : null;
  const journeyId = getJourneyId();
  const userId = getUserId();
  const clientEventId = createClientEventId('click');
  const occurredAtMs = Date.now();
  const payload = {
    event: eventName,
    journey_id: journeyId,
    client_event_id: clientEventId,
    occurred_at_ms: occurredAtMs,
    pageUrl: window.location.href,
    pagePath: window.location.pathname,
    user: userId,
    locale,
    clickUrl: href,
    provider,
    attribution,
  };

  pushLeadDataLayerEvent(
    eventName,
    {
      page_path: window.location.pathname,
      page_url: window.location.href,
      click_url: href,
      lead_intent_type: leadIntentType,
      provider,
      locale,
      journey_id: journeyId,
      client_event_id: clientEventId,
      occurred_at_ms: occurredAtMs,
      user_id: userId,
    },
    attributionForDataLayer(attribution),
  );

  sendLeadInteraction(payload);
};
