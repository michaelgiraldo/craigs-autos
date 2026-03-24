import { trackLeadClick, trackPaidLanding } from './events';

const CLICK_HANDLER_KEY = '__craigsLeadSignalsClickHandler';
const PAGE_LOAD_HANDLER_KEY = '__craigsLeadSignalsPageLoadHandler';

type LeadSignalsWindow = Window &
  typeof globalThis & {
    [CLICK_HANDLER_KEY]?: EventListener;
    [PAGE_LOAD_HANDLER_KEY]?: EventListener;
  };

export const initLeadSignals = () => {
  const leadSignalsWindow = window as LeadSignalsWindow;

  if (!leadSignalsWindow[CLICK_HANDLER_KEY]) {
    const onDocumentClick: EventListener = (event) => {
      if (event instanceof MouseEvent) {
        trackLeadClick(event);
      }
    };
    leadSignalsWindow[CLICK_HANDLER_KEY] = onDocumentClick;
    document.addEventListener('click', onDocumentClick, { capture: true });
  }

  if (!leadSignalsWindow[PAGE_LOAD_HANDLER_KEY]) {
    const onPageLoad: EventListener = () => {
      trackPaidLanding();
    };
    leadSignalsWindow[PAGE_LOAD_HANDLER_KEY] = onPageLoad;
    document.addEventListener('astro:page-load', onPageLoad);
  }

  trackPaidLanding();
};
