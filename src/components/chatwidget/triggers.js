import React from 'react';
import { LEAD_QUIET_SEND_MS } from './constants.js';

export function useLeadTriggers({
  open,
  chatPanelRef,
  sendLeadEmail,
  hasUserInteractedRef,
}) {
  const idleTimerRef = React.useRef(null);

  const bumpIdleTimer = React.useCallback(() => {
    if (!hasUserInteractedRef.current) return;
    if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
    idleTimerRef.current = window.setTimeout(() => {
      void sendLeadEmail({ reason: 'idle' });
    }, LEAD_QUIET_SEND_MS);
  }, [hasUserInteractedRef, sendLeadEmail]);

  React.useEffect(() => {
    return () => {
      if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
    };
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const panel = chatPanelRef.current;
    if (!panel) return;

    const onActivity = (event) => {
      if (event?.isTrusted) {
        hasUserInteractedRef.current = true;
      }
      bumpIdleTimer();
    };

    // Treat in-chat interaction as activity so we don't fire the idle lead send
    // while the customer is actively typing/clicking in the chat UI.
    panel.addEventListener('keydown', onActivity, true);
    panel.addEventListener('pointerdown', onActivity, true);
    panel.addEventListener('touchstart', onActivity, true);
    panel.addEventListener('focusin', onActivity, true);

    return () => {
      panel.removeEventListener('keydown', onActivity, true);
      panel.removeEventListener('pointerdown', onActivity, true);
      panel.removeEventListener('touchstart', onActivity, true);
      panel.removeEventListener('focusin', onActivity, true);
    };
  }, [bumpIdleTimer, chatPanelRef, hasUserInteractedRef, open]);

  React.useEffect(() => {
    const sendOnPageHide = () => {
      void sendLeadEmail({ reason: 'pagehide' });
    };

    window.addEventListener('pagehide', sendOnPageHide);
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') sendOnPageHide();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.removeEventListener('pagehide', sendOnPageHide);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [sendLeadEmail]);

  return { bumpIdleTimer };
}
