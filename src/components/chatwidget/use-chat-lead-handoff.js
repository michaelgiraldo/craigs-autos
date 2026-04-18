import React from 'react';
import { LEAD_EVENTS } from '../../../shared/lead-event-contract.js';
import { createClientEventId } from '../../features/lead-tracking/browser-events.ts';
import { getAttributionPayload, getJourneyId } from '../../lib/attribution.js';
import { isPlaceholderUrl, postLeadHandoff, resolveLeadHandoffEndpoint } from './api-client.js';
import { LEAD_HANDOFF_COMPLETED_KEY_PREFIX } from './constants.js';
import { pushLeadDataLayer } from './data-layer.js';
import { getLocalStorage, getStorageValue, setStorageValue } from './storage.js';

const BLOCKED_HANDOFF_REASONS = new Set(['empty_thread', 'missing_contact', 'not_ready']);

function classifyChatHandoffReason(reason) {
  return BLOCKED_HANDOFF_REASONS.has(reason)
    ? LEAD_EVENTS.chatHandoffBlocked
    : LEAD_EVENTS.chatHandoffDeferred;
}

function getPageLocation() {
  return {
    pageUrl: globalThis.location?.href ?? '',
    pagePath: globalThis.location?.pathname ?? '',
  };
}

export function useChatLeadHandoff({
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
          if (isDev) console.error('Chat lead handoff error', response.status, text);
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
        if (data?.completed === true) {
          setStorageValue(localStorage, completedKey, 'true');
          pushLeadDataLayer(LEAD_EVENTS.chatHandoffCompleted, {
            ...baseEvent,
            lead_reason: backendReason || reason,
          });
        } else if (data?.completed === false) {
          const handoffEventName = classifyChatHandoffReason(backendReason || 'unknown');
          pushLeadDataLayer(handoffEventName, {
            ...baseEvent,
            lead_reason: backendReason || 'unknown',
          });
        }
      } catch (err) {
        if (isDev) console.error('Chat lead handoff request failed', err);
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
