import React from 'react';
import { BRAND_NAME } from '../../lib/site-data.js';
import { requestClientSecret, resolveSessionEndpoint } from './api-client.js';
import {
  CHATKIT_ATTACHMENT_ACCEPT,
  CHATKIT_MAX_ATTACHMENTS,
  CHATKIT_MAX_ATTACHMENT_BYTES,
} from './constants.js';

export function useChatkitOptions({
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
}) {
  return React.useMemo(() => {
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
    copy.composerPlaceholder,
    copy.startGreeting,
    copy.startPrompts,
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
  ]);
}
