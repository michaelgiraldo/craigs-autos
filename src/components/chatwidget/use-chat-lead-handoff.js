import React from 'react';
import { getAttributionPayload, getJourneyId } from '../../lib/attribution.js';
import { isPlaceholderUrl, postLeadEmail, resolveLeadEmailEndpoint } from './api-client.js';
import { LEAD_SENT_KEY_PREFIX } from './constants.js';
import { pushLeadDataLayer } from './data-layer.js';
import { getLocalStorage, getStorageValue, setStorageValue } from './storage.js';

const BLOCKED_HANDOFF_REASONS = new Set(['empty_thread', 'missing_contact', 'not_ready']);

function classifyChatHandoffReason(reason) {
  return BLOCKED_HANDOFF_REASONS.has(reason)
    ? 'lead_chat_handoff_blocked'
    : 'lead_chat_handoff_deferred';
}

function createClientEventId(prefix) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
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
  leadEmailUrlRef,
  localeRef,
  setResolvedLeadEmailUrl,
  threadIdRef,
  userIdRef,
}) {
  const leadEmailInFlightRef = React.useRef(false);

  const updateResolvedLeadEmailUrl = React.useCallback(
    (nextLeadEmailUrl) => {
      leadEmailUrlRef.current = nextLeadEmailUrl;
      setResolvedLeadEmailUrl(nextLeadEmailUrl);
    },
    [leadEmailUrlRef, setResolvedLeadEmailUrl],
  );

  return React.useCallback(
    async ({ reason = 'chat_closed' } = {}) => {
      if (leadEmailInFlightRef.current) return;
      if (!hasUserInteractedRef.current) return;

      const activeThreadId = threadIdRef.current;
      if (!activeThreadId) return;

      const configuredLeadEmailUrl =
        typeof leadEmailUrlRef.current === 'string' ? leadEmailUrlRef.current.trim() : '';
      if (!configuredLeadEmailUrl || isPlaceholderUrl(configuredLeadEmailUrl)) return;

      const localStorage = getLocalStorage();
      const sentKey = `${LEAD_SENT_KEY_PREFIX}${activeThreadId}`;
      if (getStorageValue(localStorage, sentKey) === 'true') return;

      const activeLocale = localeRef.current ?? 'en';
      const activeUserId = userIdRef.current ?? 'anonymous';
      const { pageUrl, pagePath } = getPageLocation();
      const journeyId = getJourneyId();
      const clientEventId = createClientEventId('chat_handoff');
      const occurredAtMs = Date.now();

      const baseEvent = {
        customer_action: 'chat_first_message_sent',
        capture_channel: 'chat',
        verification_status: 'unverified',
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
        leadEmailInFlightRef.current = true;
        const endpoint = await resolveLeadEmailEndpoint({
          isDev,
          endpoint: configuredLeadEmailUrl,
          onLeadEmailUrl: updateResolvedLeadEmailUrl,
        });
        const resolvedEndpoint = typeof endpoint === 'string' ? endpoint.trim() : '';
        if (!resolvedEndpoint || resolvedEndpoint.startsWith('/')) return;

        const { response, text } = await postLeadEmail({
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
          if (isDev) console.error('ChatKit lead email error', response.status, text);
          pushLeadDataLayer('lead_chat_handoff_error', {
            ...baseEvent,
            event_class: 'diagnostic',
            workflow_outcome: 'chat_handoff_error',
            lead_strength: 'soft_intent',
            error_code: `http_${response.status}`,
          });
          return;
        }

        let data = {};
        try {
          data = text ? JSON.parse(text) : {};
        } catch {
          pushLeadDataLayer('lead_chat_handoff_error', {
            ...baseEvent,
            event_class: 'diagnostic',
            workflow_outcome: 'chat_handoff_error',
            lead_strength: 'soft_intent',
            error_code: 'parse_error',
          });
          return;
        }

        const backendReason = typeof data?.reason === 'string' ? data.reason : '';
        if (data?.sent === true) {
          setStorageValue(localStorage, sentKey, 'true');
          pushLeadDataLayer('lead_chat_handoff_sent', {
            ...baseEvent,
            event_class: 'workflow',
            workflow_outcome: 'chat_handoff_sent',
            lead_strength: 'captured_lead',
            lead_reason: backendReason || reason,
          });
        } else if (data?.sent === false) {
          const handoffEventName = classifyChatHandoffReason(backendReason || 'unknown');
          pushLeadDataLayer(handoffEventName, {
            ...baseEvent,
            event_class: 'workflow',
            workflow_outcome:
              handoffEventName === 'lead_chat_handoff_blocked'
                ? 'chat_handoff_blocked'
                : 'chat_handoff_deferred',
            lead_strength: 'soft_intent',
            lead_reason: backendReason || 'unknown',
          });
        }
      } catch (err) {
        if (isDev) console.error('ChatKit lead email request failed', err);
        pushLeadDataLayer('lead_chat_handoff_error', {
          ...baseEvent,
          event_class: 'diagnostic',
          workflow_outcome: 'chat_handoff_error',
          lead_strength: 'soft_intent',
          error_code: 'network_error',
        });
      } finally {
        leadEmailInFlightRef.current = false;
      }
    },
    [
      hasUserInteractedRef,
      isDev,
      leadEmailUrlRef,
      localeRef,
      threadIdRef,
      updateResolvedLeadEmailUrl,
      userIdRef,
    ],
  );
}
