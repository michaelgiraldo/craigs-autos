import { trackLeadClick } from './events';

const CLICK_HANDLER_KEY = '__craigsLeadSignalsClickHandler';

type LeadSignalsWindow = Window &
  typeof globalThis & {
    [CLICK_HANDLER_KEY]?: EventListener;
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
};
