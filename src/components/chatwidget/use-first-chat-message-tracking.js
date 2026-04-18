import React from 'react';
import { LEAD_EVENTS } from '../../../shared/lead-event-contract.js';
import { createClientEventId } from '../../features/lead-tracking/browser-events.ts';
import { getAttributionPayload, getJourneyId } from '../../lib/attribution.js';
import { sendSignal } from '../../scripts/analytics/transport.ts';
import { FIRST_MESSAGE_SENT_KEY_PREFIX } from './constants.js';
import { pushLeadDataLayer } from './data-layer.js';
import { getLocalStorage, getStorageValue, setStorageValue } from './storage.js';

export function useFirstChatMessageTracking({
  hasUserInteractedRef,
  locale,
  localeRef,
  threadIdRef,
  userIdRef,
}) {
  const pendingFirstMessageRef = React.useRef(false);
  const pendingFirstMessageTimerRef = React.useRef(null);
  const suppressNextThreadFirstMessageRef = React.useRef(false);

  const clearPendingFirstMessageTimer = React.useCallback(() => {
    if (typeof pendingFirstMessageTimerRef.current === 'number') {
      window.clearTimeout(pendingFirstMessageTimerRef.current);
      pendingFirstMessageTimerRef.current = null;
    }
  }, []);

  const emitFirstChatMessageEvent = React.useCallback(
    (trackedThreadId) => {
      clearPendingFirstMessageTimer();
      pendingFirstMessageRef.current = false;

      const activeThreadId = trackedThreadId ?? threadIdRef.current ?? null;
      const activeLocale = localeRef.current ?? locale;
      const activeUserId = userIdRef.current ?? null;
      const pagePath = globalThis.location?.pathname ?? '';
      const pageUrl = globalThis.location?.href ?? '';
      if (activeThreadId) {
        const localStorage = getLocalStorage();
        const sentKey = `${FIRST_MESSAGE_SENT_KEY_PREFIX}${activeThreadId}`;
        if (getStorageValue(localStorage, sentKey) === 'true') {
          return;
        }
        setStorageValue(localStorage, sentKey, 'true');
      }

      const occurredAtMs = Date.now();
      const clientEventId = createClientEventId('chat_first_message');
      const journeyId = getJourneyId();

      pushLeadDataLayer(LEAD_EVENTS.chatFirstMessageSent, {
        locale: activeLocale,
        journey_id: journeyId,
        client_event_id: clientEventId,
        occurred_at_ms: occurredAtMs,
        page_path: pagePath,
        page_url: pageUrl,
        thread_id: activeThreadId,
        user_id: activeUserId,
      });

      sendSignal({
        event: LEAD_EVENTS.chatFirstMessageSent,
        journey_id: journeyId,
        client_event_id: clientEventId,
        occurred_at_ms: occurredAtMs,
        pageUrl,
        pagePath,
        user: activeUserId,
        locale: activeLocale,
        threadId: activeThreadId,
        attribution: getAttributionPayload(),
      });
    },
    [clearPendingFirstMessageTimer, locale, localeRef, threadIdRef, userIdRef],
  );

  const trackFirstChatMessage = React.useCallback(() => {
    hasUserInteractedRef.current = true;
    const activeThreadId = threadIdRef.current;
    if (activeThreadId) {
      suppressNextThreadFirstMessageRef.current = false;
      emitFirstChatMessageEvent(activeThreadId);
      return;
    }

    if (pendingFirstMessageRef.current) {
      return;
    }

    pendingFirstMessageRef.current = true;
    clearPendingFirstMessageTimer();
    pendingFirstMessageTimerRef.current = window.setTimeout(() => {
      suppressNextThreadFirstMessageRef.current = true;
      emitFirstChatMessageEvent(null);
    }, 3000);
  }, [clearPendingFirstMessageTimer, emitFirstChatMessageEvent, hasUserInteractedRef, threadIdRef]);

  const handleThreadChanged = React.useCallback(
    (nextThreadId) => {
      if (pendingFirstMessageRef.current) {
        suppressNextThreadFirstMessageRef.current = false;
        emitFirstChatMessageEvent(nextThreadId);
        return;
      }
      if (suppressNextThreadFirstMessageRef.current) {
        suppressNextThreadFirstMessageRef.current = false;
      }
    },
    [emitFirstChatMessageEvent],
  );

  const resetFirstMessageTracking = React.useCallback(() => {
    clearPendingFirstMessageTimer();
    pendingFirstMessageRef.current = false;
    suppressNextThreadFirstMessageRef.current = false;
  }, [clearPendingFirstMessageTimer]);

  React.useEffect(() => resetFirstMessageTracking, [resetFirstMessageTracking]);

  return {
    handleThreadChanged,
    resetFirstMessageTracking,
    trackFirstChatMessage,
  };
}
