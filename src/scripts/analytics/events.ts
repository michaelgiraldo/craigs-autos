import { attributionForDataLayer, getAttribution, getUserId } from './attribution';
import { pushDataLayer, sendSignal } from './transport';

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
  if (href.startsWith('tel:')) {
    eventName = 'lead_click_to_call';
  } else if (href.startsWith('sms:')) {
    eventName = 'lead_click_to_text';
  } else if (href.startsWith('mailto:')) {
    eventName = 'lead_click_email';
  } else if (href.startsWith('https://www.google.com/maps/dir/')) {
    eventName = 'lead_click_directions';
    provider = 'google_maps';
  } else if (href.startsWith('https://maps.apple.com/')) {
    eventName = 'lead_click_directions';
    provider = 'apple_maps';
  }

  if (!eventName) return;

  const attribution = getAttribution();
  const locale = document.documentElement ? document.documentElement.lang : null;
  const leadIntentType =
    eventName === 'lead_click_to_call'
      ? 'call'
      : eventName === 'lead_click_to_text'
        ? 'text'
        : eventName === 'lead_click_email'
          ? 'email'
          : 'directions';
  const payload = {
    event: eventName,
    pageUrl: window.location.href,
    user: getUserId(),
    locale,
    clickUrl: href,
    provider,
    lead_intent_type: leadIntentType,
    attribution,
  };

  pushDataLayer(eventName, {
    lead_method: eventName,
    lead_intent_type: leadIntentType,
    page_url: window.location.href,
    click_url: href,
    provider,
    locale,
    ...attributionForDataLayer(attribution),
  });

  sendSignal(payload);
};
