import React from 'react';
import { CHAT_COPY } from '../lib/site-data.js';
import { ChatFallback } from './chatwidget/chat-fallback.jsx';
import { ChatLauncher } from './chatwidget/chat-launcher.jsx';
import { ChatKitErrorBoundary, ChatKitWithHooks } from './chatwidget/chatkit-shell.jsx';
import { CHATKIT_LOCALE_MAP } from './chatwidget/constants.js';
import { useChatkitOptions } from './chatwidget/use-chatkit-options.js';
import { useChatLeadHandoff } from './chatwidget/use-chat-lead-handoff.js';
import { useChatWidgetState } from './chatwidget/use-chat-widget-state.js';
import { useFirstChatMessageTracking } from './chatwidget/use-first-chat-message-tracking.js';
import { useLeadTriggers } from './chatwidget/triggers.js';

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

  const { handleThreadChanged, resetFirstMessageTracking, trackFirstChatMessage } =
    useFirstChatMessageTracking({
      hasUserInteractedRef,
      locale,
      localeRef,
      threadIdRef,
      userIdRef,
    });

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
  }, [setOpen]);

  const { bumpIdleTimer } = useLeadTriggers({
    open,
    chatPanelRef,
    requestLeadHandoff,
    hasUserInteractedRef,
  });

  const closeChat = React.useCallback(() => {
    setOpen(false);
    void requestLeadHandoff({ reason: 'chat_closed' });
  }, [requestLeadHandoff, setOpen]);

  const startNewChat = React.useCallback(() => {
    resetFirstMessageTracking();
    clearStoredThread();
    chatRef.current?.setThreadId?.(null);
  }, [chatRef, clearStoredThread, resetFirstMessageTracking]);

  const resetChat = React.useCallback(() => {
    resetFirstMessageTracking();
    setChatkitReady(false);
    setChatkitError(null);
    setChatInstance(null);
    setChatMountId((value) => value + 1);
  }, [
    resetFirstMessageTracking,
    setChatkitError,
    setChatkitReady,
    setChatMountId,
    setChatInstance,
  ]);

  const openChat = React.useCallback(() => {
    hasUserInteractedRef.current = true;
    setOpen(true);
  }, [hasUserInteractedRef, setOpen]);

  const options = useChatkitOptions({
    chatkitLocale,
    closeChat,
    copy,
    isDev,
    locale,
    localeRef,
    resolvedSessionUrl,
    setActiveLeadHandoffUrl,
    setResolvedSessionUrl,
    startNewChat,
    threadId,
    userId,
    userIdRef,
  });

  React.useEffect(() => {
    if (!open || !chatkitReady || !chatInstance) return;
    chatInstance.focusComposer();
  }, [open, chatkitReady, chatInstance]);

  return (
    <div className="chat-widget" data-open={open ? 'true' : 'false'} dir={dir}>
      {!open ? <ChatLauncher label={copy.launcherLabel} onOpen={openChat} /> : null}

      {open ? (
        <div className="chat-panel" id="chat-panel" ref={chatPanelRef}>
          <div className="chat-panel__body">
            {runtimeError ? (
              <ChatFallback
                title={copy.errorTitle ?? 'Something went wrong.'}
                body={copy.errorBody ?? 'Please try again.'}
                detail={runtimeError?.message}
                isDev={isDev}
              />
            ) : runtimeReady ? (
              <ChatKitErrorBoundary
                key={chatMountId}
                onReset={resetChat}
                fallback={(error, reset) => (
                  <ChatFallback
                    variant="overlay"
                    title={copy.errorTitle ?? 'Something went wrong.'}
                    body={copy.errorBody ?? 'Please try again or call/text us.'}
                    detail={error?.message}
                    isDev={isDev}
                    onRetry={reset}
                  />
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
                    handleThreadChanged(nextId);
                    bumpIdleTimer();
                  }}
                />
                {!chatkitReady && !chatkitError ? (
                  <ChatFallback
                    variant="overlay"
                    body={copy.loadingLabel ?? 'Loading chat...'}
                    isDev={isDev}
                  />
                ) : null}
                {chatkitError ? (
                  <ChatFallback
                    variant="overlay"
                    title={copy.errorTitle ?? 'Something went wrong.'}
                    body={
                      copy.errorBody ??
                      'Please refresh the page, or call/text us if you need help right away.'
                    }
                    detail={chatkitError?.message}
                    isDev={isDev}
                    onRetry={resetChat}
                  />
                ) : null}
              </ChatKitErrorBoundary>
            ) : (
              <ChatFallback body={copy.loadingLabel ?? 'Loading chat...'} isDev={isDev} />
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
