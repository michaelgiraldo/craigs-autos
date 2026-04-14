import { attributionForDataLayer, getAttribution, getJourneyId, getUserId } from './attribution';
import { pushDataLayer, sendSignal } from './transport';

function createClientEventId(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export const trackLeadClick = (event: MouseEvent) => {
  let element: Element | null = event.target instanceof Element ? event.target : null;
  if (!element) return;
  if (element.closest) {
    element = element.closest('a');
  }
  if (!(element instanceof HTMLAnchorElement)) return;

  const href = element.getAttribute('href') || '';
  if (!href) return;

  let eventName: string | null = null;
  let provider: string | null = null;
  let customerAction: string | null = null;
  if (href.startsWith('tel:')) {
    eventName = 'lead_click_to_call';
    customerAction = 'click_call';
  } else if (href.startsWith('sms:')) {
    eventName = 'lead_click_to_text';
    customerAction = 'click_text';
  } else if (href.startsWith('mailto:')) {
    eventName = 'lead_click_email';
    customerAction = 'click_email';
  } else if (href.startsWith('https://www.google.com/maps/dir/')) {
    eventName = 'lead_click_directions';
    customerAction = 'click_directions';
    provider = 'google_maps';
  } else if (href.startsWith('https://maps.apple.com/')) {
    eventName = 'lead_click_directions';
    customerAction = 'click_directions';
    provider = 'apple_maps';
  }

  if (!eventName || !customerAction) return;

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

  pushDataLayer(eventName, {
    event_class: 'customer_action',
    customer_action: customerAction,
    lead_strength: 'soft_intent',
    verification_status: 'unverified',
    page_path: window.location.pathname,
    page_url: window.location.href,
    click_url: href,
    provider,
    locale,
    journey_id: journeyId,
    client_event_id: clientEventId,
    occurred_at_ms: occurredAtMs,
    user_id: userId,
    ...attributionForDataLayer(attribution),
  });

  sendSignal(payload);
};
