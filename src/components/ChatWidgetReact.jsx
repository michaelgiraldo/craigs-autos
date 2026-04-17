import React from 'react';
import { BRAND_NAME, CHAT_COPY } from '../lib/site-data.js';
import { getAttributionPayload, getJourneyId } from '../lib/attribution.js';
import { sendSignal } from '../scripts/analytics/transport.ts';
import { requestClientSecret, resolveSessionEndpoint } from './chatwidget/api-client.js';
import { ChatKitErrorBoundary, ChatKitWithHooks } from './chatwidget/chatkit-shell.jsx';
import {
  CHATKIT_ATTACHMENT_ACCEPT,
  CHATKIT_LOCALE_MAP,
  CHATKIT_MAX_ATTACHMENTS,
  CHATKIT_MAX_ATTACHMENT_BYTES,
  FIRST_MESSAGE_SENT_KEY_PREFIX,
} from './chatwidget/constants.js';
import { pushLeadDataLayer } from './chatwidget/data-layer.js';
import { getLocalStorage, getStorageValue, setStorageValue } from './chatwidget/storage.js';
import { useChatLeadHandoff } from './chatwidget/use-chat-lead-handoff.js';
import { useChatWidgetState } from './chatwidget/use-chat-widget-state.js';
import { useLeadTriggers } from './chatwidget/triggers.js';

function createClientEventId(prefix) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export default function ChatWidgetReact({
  locale = 'en',
  sessionUrl = '/api/chatkit/session/',
  leadHandoffUrl = '/api/chat/lead-handoff/',
}) {
  const copy = CHAT_COPY[locale] ?? CHAT_COPY.en;
  const chatkitLocale = CHATKIT_LOCALE_MAP[locale] ?? 'en';
  const dir = locale === 'ar' || locale === 'fa' ? 'rtl' : 'ltr';
  const isDev = import.meta.env.DEV;
  const {
    open,
    setOpen,
    userId,
    userIdRef,
    threadId,
    threadIdRef,
    setActiveThreadId,
    clearStoredThread,
    resolvedSessionUrl,
    setResolvedSessionUrl,
    setActiveLeadHandoffUrl,
    chatMountId,
    setChatMountId,
    chatkitReady,
    setChatkitReady,
    runtimeReady,
    runtimeError,
    chatkitError,
    setChatkitError,
    chatInstance,
    setChatInstance,
    chatRef,
    localeRef,
    leadHandoffUrlRef,
    chatPanelRef,
    hasUserInteractedRef,
  } = useChatWidgetState({ isDev, leadHandoffUrl, locale, sessionUrl });

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

      pushLeadDataLayer('lead_chat_first_message_sent', {
        event_class: 'customer_action',
        customer_action: 'chat_first_message_sent',
        capture_channel: 'chat',
        lead_strength: 'soft_intent',
        verification_status: 'unverified',
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
        event: 'lead_chat_first_message_sent',
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
  }, [clearPendingFirstMessageTimer, emitFirstChatMessageEvent]);

  React.useEffect(() => {
    return () => {
      clearPendingFirstMessageTimer();
    };
  }, [clearPendingFirstMessageTimer]);

  const requestLeadHandoff = useChatLeadHandoff({
    isDev,
    hasUserInteractedRef,
    leadHandoffUrlRef,
    localeRef,
    setActiveLeadHandoffUrl,
    threadIdRef,
    userIdRef,
  });

  React.useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const { bumpIdleTimer } = useLeadTriggers({
    open,
    chatPanelRef,
    requestLeadHandoff,
    hasUserInteractedRef,
  });

  const closeChat = React.useCallback(() => {
    setOpen(false);
    void requestLeadHandoff({ reason: 'chat_closed' });
  }, [requestLeadHandoff]);

  const startNewChat = React.useCallback(() => {
    clearPendingFirstMessageTimer();
    pendingFirstMessageRef.current = false;
    suppressNextThreadFirstMessageRef.current = false;
    clearStoredThread();
    chatRef.current?.setThreadId?.(null);
  }, [chatRef, clearPendingFirstMessageTimer, clearStoredThread]);

  const resetChat = React.useCallback(() => {
    clearPendingFirstMessageTimer();
    pendingFirstMessageRef.current = false;
    suppressNextThreadFirstMessageRef.current = false;
    setChatkitReady(false);
    setChatkitError(null);
    setChatInstance(null);
    setChatMountId((value) => value + 1);
  }, [clearPendingFirstMessageTimer]);

  const options = React.useMemo(() => {
    const initialThread = threadId ?? undefined;

    const apiConfig = {
      async getClientSecret(current) {
        const endpoint = await resolveSessionEndpoint({
          isDev,
          endpoint: resolvedSessionUrl,
          onSessionUrl: setResolvedSessionUrl,
          onLeadHandoffUrl: setActiveLeadHandoffUrl,
        });

        return await requestClientSecret({
          endpoint,
          current,
          locale: localeRef.current ?? locale,
          userId: userIdRef.current ?? userId,
          pageUrl: globalThis.location?.href ?? '',
        });
      },
    };

    const attachmentConfig = {
      enabled: true,
      maxSize: CHATKIT_MAX_ATTACHMENT_BYTES,
      maxCount: CHATKIT_MAX_ATTACHMENTS,
      accept: CHATKIT_ATTACHMENT_ACCEPT,
    };

    return {
      api: apiConfig,
      locale: chatkitLocale,
      ...(initialThread ? { initialThread } : {}),
      theme: {
        colorScheme: 'light',
        radius: 'pill',
        density: 'normal',
        color: {
          accent: { primary: '#141cff', level: 1 },
          surface: { background: '#edfdf2', foreground: '#ffffff' },
        },
        typography: {
          baseSize: 16,
          fontFamily:
            '"OpenAI Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif',
          fontFamilyMono:
            'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "DejaVu Sans Mono", "Courier New", monospace',
          fontSources: [
            {
              family: 'OpenAI Sans',
              src: 'https://cdn.openai.com/common/fonts/openai-sans/v2/OpenAISans-Regular.woff2',
              weight: 400,
              style: 'normal',
              display: 'swap',
            },
          ],
        },
      },
      header: {
        enabled: true,
        title: { enabled: true, text: BRAND_NAME },
        leftAction: { icon: 'compose', onClick: startNewChat },
        rightAction: { icon: 'close', onClick: closeChat },
      },
      history: { enabled: false },
      threadItemActions: { feedback: false },
      startScreen: { greeting: copy.startGreeting, prompts: copy.startPrompts ?? [] },
      composer: {
        // Avoid "AI" phrasing in the UI; keep it conversational + localized.
        placeholder: copy.composerPlaceholder ?? 'Type a message...',
        attachments: attachmentConfig,
      },
    };
  }, [
    chatkitLocale,
    closeChat,
    startNewChat,
    copy.composerPlaceholder,
    copy.startGreeting,
    copy.startPrompts,
    locale,
    localeRef,
    resolvedSessionUrl,
    setActiveLeadHandoffUrl,
    setResolvedSessionUrl,
    threadId,
    userId,
    userIdRef,
    isDev,
  ]);

  React.useEffect(() => {
    if (!open || !chatkitReady || !chatInstance) return;
    chatInstance.focusComposer();
  }, [open, chatkitReady, chatInstance]);

  return (
    <div className="chat-widget" data-open={open ? 'true' : 'false'} dir={dir}>
      {!open ? (
        <button
          className="chat-launcher"
          type="button"
          aria-expanded="false"
          aria-controls="chat-panel"
          aria-label={copy.launcherLabel}
          onClick={() => {
            hasUserInteractedRef.current = true;
            setOpen(true);
          }}
        >
          <svg className="chat-launcher__icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span className="chat-launcher__label">{copy.launcherLabel}</span>
        </button>
      ) : null}

      {open ? (
        <div className="chat-panel" id="chat-panel" ref={chatPanelRef}>
          <div className="chat-panel__body">
            {runtimeError ? (
              <div className="chat-fallback" role="status">
                <p className="chat-fallback__title">{copy.errorTitle ?? 'Something went wrong.'}</p>
                <p className="chat-fallback__body">{copy.errorBody ?? 'Please try again.'}</p>
                {isDev ? (
                  <p className="chat-fallback__detail">{String(runtimeError?.message ?? '')}</p>
                ) : null}
              </div>
            ) : runtimeReady ? (
              <>
                <ChatKitErrorBoundary
                  key={chatMountId}
                  onReset={resetChat}
                  fallback={(error, reset) => (
                    <div className="chat-fallback chat-fallback--overlay" role="status">
                      <p className="chat-fallback__title">
                        {copy.errorTitle ?? 'Something went wrong.'}
                      </p>
                      <p className="chat-fallback__body">
                        {copy.errorBody ?? 'Please try again or call/text us.'}
                      </p>
                      <button className="chat-fallback__retry" type="button" onClick={reset}>
                        Try again
                      </button>
                      {isDev ? (
                        <p className="chat-fallback__detail">{String(error?.message ?? '')}</p>
                      ) : null}
                    </div>
                  )}
                >
                  {/* Mount ChatKit only when the panel is visible; it can mis-render if initialized inside a hidden container. */}
                  <ChatKitWithHooks
                    key={`chatkit-${chatMountId}`}
                    options={options}
                    onChat={setChatInstance}
                    onReady={() => {
                      setChatkitReady(true);
                      setChatkitError(null);
                      bumpIdleTimer();
                    }}
                    onResponseStart={() => {
                      bumpIdleTimer();
                    }}
                    onResponseEnd={() => {
                      // Bump the idle timer; chat handoff runs on idle/pagehide/close to avoid
                      // snapshotting the thread mid-conversation.
                      bumpIdleTimer();
                    }}
                    onLog={(detail) => {
                      if (detail?.name === 'composer.submit') {
                        trackFirstChatMessage();
                        bumpIdleTimer();
                      }
                    }}
                    onError={(detail) => {
                      setChatkitError(detail?.error ?? new Error('Chat unavailable.'));
                    }}
                    onThreadChange={(detail) => {
                      const nextId = detail?.threadId;
                      if (!nextId) return;
                      setActiveThreadId(nextId);
                      hasUserInteractedRef.current = true;
                      if (pendingFirstMessageRef.current) {
                        suppressNextThreadFirstMessageRef.current = false;
                        emitFirstChatMessageEvent(nextId);
                      } else if (suppressNextThreadFirstMessageRef.current) {
                        suppressNextThreadFirstMessageRef.current = false;
                      }
                      bumpIdleTimer();
                    }}
                  />
                  {!chatkitReady && !chatkitError ? (
                    <div className="chat-fallback chat-fallback--overlay" role="status">
                      <p className="chat-fallback__body">
                        {copy.loadingLabel ?? 'Loading chat...'}
                      </p>
                    </div>
                  ) : null}
                  {chatkitError ? (
                    <div className="chat-fallback chat-fallback--overlay" role="status">
                      <p className="chat-fallback__title">
                        {copy.errorTitle ?? 'Something went wrong.'}
                      </p>
                      <p className="chat-fallback__body">
                        {copy.errorBody ??
                          'Please refresh the page, or call/text us if you need help right away.'}
                      </p>
                      <button className="chat-fallback__retry" type="button" onClick={resetChat}>
                        Try again
                      </button>
                      {isDev ? (
                        <p className="chat-fallback__detail">
                          {String(chatkitError?.message ?? '')}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </ChatKitErrorBoundary>
              </>
            ) : (
              <div className="chat-fallback" role="status">
                <p className="chat-fallback__body">{copy.loadingLabel ?? 'Loading chat...'}</p>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
