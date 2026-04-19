import { trackLeadClick } from './events';

const CLICK_HANDLER_KEY = '__craigsLeadInteractionsClickHandler';

type LeadInteractionsWindow = Window &
  typeof globalThis & {
    [CLICK_HANDLER_KEY]?: EventListener;
  };

export const initLeadInteractions = () => {
  const leadInteractionsWindow = window as LeadInteractionsWindow;

  if (!leadInteractionsWindow[CLICK_HANDLER_KEY]) {
    const onDocumentClick: EventListener = (event) => {
      if (event instanceof MouseEvent) {
        trackLeadClick(event);
      }
    };
    leadInteractionsWindow[CLICK_HANDLER_KEY] = onDocumentClick;
    document.addEventListener('click', onDocumentClick, { capture: true });
  }
};
