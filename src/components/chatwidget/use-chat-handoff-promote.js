import React from 'react';
import { LEAD_EVENTS } from '@craigs/contracts/lead-event-contract';
import { createClientEventId } from '../../features/lead-tracking/browser-events.ts';
import { getAttributionPayload, getJourneyId } from '../../lib/attribution.js';
import { isPlaceholderUrl, postLeadHandoff, resolveLeadHandoffEndpoint } from './api-client.js';
import { LEAD_HANDOFF_COMPLETED_KEY_PREFIX } from './constants.js';
import { pushLeadDataLayer } from './data-layer.js';
import { getChatHandoffEventForStatus, isCompletedChatHandoffStatus } from './handoff-status.ts';
import { getLocalStorage, getStorageValue, setStorageValue } from './storage.js';

function getPageLocation() {
  return {
    pageUrl: globalThis.location?.href ?? '',
    pagePath: globalThis.location?.pathname ?? '',
  };
}

export function useChatHandoffPromote({
  isDev,
  hasUserInteractedRef,
  leadHandoffUrlRef,
  localeRef,
  setActiveLeadHandoffUrl,
  threadIdRef,
  userIdRef,
}) {
  const leadHandoffInFlightRef = React.useRef(false);

  return React.useCallback(
    async ({ reason = 'chat_closed' } = {}) => {
      if (leadHandoffInFlightRef.current) return;
      if (!hasUserInteractedRef.current) return;

      const activeThreadId = threadIdRef.current;
      if (!activeThreadId) return;

      const configuredLeadHandoffUrl =
        typeof leadHandoffUrlRef.current === 'string' ? leadHandoffUrlRef.current.trim() : '';
      if (!configuredLeadHandoffUrl) return;

      const localStorage = getLocalStorage();
      const completedKey = `${LEAD_HANDOFF_COMPLETED_KEY_PREFIX}${activeThreadId}`;
      if (getStorageValue(localStorage, completedKey) === 'true') return;

      const activeLocale = localeRef.current ?? 'en';
      const activeUserId = userIdRef.current ?? 'anonymous';
      const { pageUrl, pagePath } = getPageLocation();
      const journeyId = getJourneyId();
      const clientEventId = createClientEventId('chat_handoff');
      const occurredAtMs = Date.now();

      const baseEvent = {
        locale: activeLocale,
        journey_id: journeyId,
        client_event_id: clientEventId,
        occurred_at_ms: occurredAtMs,
        lead_request_reason: reason,
        thread_id: activeThreadId,
        user_id: activeUserId,
        page_url: pageUrl,
        page_path: pagePath,
      };

      try {
        leadHandoffInFlightRef.current = true;
        const endpoint = await resolveLeadHandoffEndpoint({
          isDev,
          endpoint: configuredLeadHandoffUrl,
          onLeadHandoffUrl: setActiveLeadHandoffUrl,
        });
        const resolvedEndpoint = typeof endpoint === 'string' ? endpoint.trim() : '';
        if (
          !resolvedEndpoint ||
          isPlaceholderUrl(resolvedEndpoint) ||
          resolvedEndpoint.startsWith('/')
        ) {
          return;
        }

        const { response, text } = await postLeadHandoff({
          endpoint: resolvedEndpoint,
          payload: {
            threadId: activeThreadId,
            journey_id: journeyId,
            locale: activeLocale,
            user: activeUserId,
            pageUrl,
            reason,
            attribution: getAttributionPayload(),
          },
        });

        if (!response.ok) {
          if (isDev) console.error('Chat handoff promotion error', response.status, text);
          pushLeadDataLayer(LEAD_EVENTS.chatHandoffError, {
            ...baseEvent,
            error_code: `http_${response.status}`,
          });
          return;
        }

        let data = {};
        try {
          data = text ? JSON.parse(text) : {};
        } catch {
          pushLeadDataLayer(LEAD_EVENTS.chatHandoffError, {
            ...baseEvent,
            error_code: 'parse_error',
          });
          return;
        }

        const backendReason = typeof data?.reason === 'string' ? data.reason : '';
        const backendStatus = typeof data?.status === 'string' ? data.status : '';
        if (isCompletedChatHandoffStatus(backendStatus)) {
          setStorageValue(localStorage, completedKey, 'true');
          pushLeadDataLayer(LEAD_EVENTS.chatHandoffCompleted, {
            ...baseEvent,
            lead_reason: backendReason || reason,
          });
        } else if (backendStatus === 'blocked' || backendStatus === 'deferred') {
          pushLeadDataLayer(getChatHandoffEventForStatus(backendStatus), {
            ...baseEvent,
            lead_reason: backendReason || 'unknown',
          });
        } else if (backendStatus === 'worker_failed') {
          pushLeadDataLayer(LEAD_EVENTS.chatHandoffError, {
            ...baseEvent,
            error_code: 'worker_failed',
            lead_reason: backendReason || 'followup_error',
          });
        } else {
          pushLeadDataLayer(LEAD_EVENTS.chatHandoffError, {
            ...baseEvent,
            error_code: 'unknown_status',
          });
        }
      } catch (err) {
        if (isDev) console.error('Chat handoff promotion request failed', err);
        pushLeadDataLayer(LEAD_EVENTS.chatHandoffError, {
          ...baseEvent,
          error_code: 'network_error',
        });
      } finally {
        leadHandoffInFlightRef.current = false;
      }
    },
    [
      hasUserInteractedRef,
      isDev,
      leadHandoffUrlRef,
      localeRef,
      setActiveLeadHandoffUrl,
      threadIdRef,
      userIdRef,
    ],
  );
}
