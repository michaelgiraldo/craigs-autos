import React from 'react';
import { ChatKit, useChatKit } from '@openai/chatkit-react';
import { BRAND_NAME, CHAT_COPY } from '../lib/site-data.js';

const DEFAULT_CHATKIT_RUNTIME_URLS = [
  // The ChatKit React bindings wrap the <openai-chatkit> web component, but do not ship its runtime.
  // Load the official runtime from the ChatKit docs.
  'https://cdn.platform.openai.com/deployments/chatkit/chatkit.js',
];

const CHATKIT_RUNTIME_URLS = (() => {
  const list = import.meta?.env?.PUBLIC_CHATKIT_RUNTIME_URLS;
  if (typeof list === 'string') {
    const urls = list
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    if (urls.length) return urls;
  }
  const single = import.meta?.env?.PUBLIC_CHATKIT_RUNTIME_URL;
  if (typeof single === 'string' && single.trim()) return [single.trim()];
  return DEFAULT_CHATKIT_RUNTIME_URLS;
})();

const CHATKIT_LOCALE_MAP = {
  en: 'en',
  es: 'es',
  vi: 'vi',
  'zh-hans': 'zh-CN',
  tl: 'tl',
  ko: 'ko',
  hi: 'hi',
  pa: 'pa',
  'pt-br': 'pt-BR',
  'zh-hant': 'zh-TW',
  ja: 'ja',
  ar: 'ar',
  ru: 'ru',
  ta: 'ta',
};

const THREAD_STORAGE_KEY = 'chatkit-thread-id';
const USER_KEY = 'chatkit-user-id';
const OPEN_KEY = 'chatkit-open';

let chatkitRuntimePromise = null;

function hasChatkitRuntime() {
  return Boolean(globalThis.customElements?.get?.('openai-chatkit'));
}

async function waitForChatkitRuntime(timeoutMs = 2000) {
  if (hasChatkitRuntime()) return;
  const whenDefined = globalThis.customElements?.whenDefined?.('openai-chatkit');
  if (!whenDefined) return;

  let timeoutId;
  await Promise.race([
    whenDefined,
    new Promise((_, reject) => {
      timeoutId = window.setTimeout(() => {
        reject(new Error('Timed out waiting for ChatKit runtime to register.'));
      }, timeoutMs);
    }),
  ]).finally(() => {
    if (timeoutId) window.clearTimeout(timeoutId);
  });
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    // Allow the runtime to be loaded by the document (preferred) or by this component.
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      if (hasChatkitRuntime()) {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), {
        once: true,
      });
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    // Match the docs: load asynchronously and let the web component register itself.
    script.async = true;
    script.dataset.chatkitRuntime = 'true';
    script.addEventListener('load', () => resolve(), { once: true });
    script.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), {
      once: true,
    });
    document.head.appendChild(script);
  });
}

async function ensureChatkitRuntime() {
  if (hasChatkitRuntime()) return;
  if (chatkitRuntimePromise) return chatkitRuntimePromise;

  chatkitRuntimePromise = (async () => {
    const errors = [];
    for (const src of CHATKIT_RUNTIME_URLS) {
      try {
        await loadScript(src);
        await waitForChatkitRuntime();
        if (hasChatkitRuntime()) return;
      } catch (err) {
        errors.push(err);
      }
    }
    const message = errors.map((e) => e?.message).filter(Boolean).join(' | ');
    throw new Error(message || 'ChatKit runtime failed to load.');
  })();

  return chatkitRuntimePromise;
}

function getOrCreateUserId() {
  const existing = globalThis.localStorage?.getItem(USER_KEY);
  if (existing) return existing;
  const value = `anon_${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
  globalThis.localStorage?.setItem(USER_KEY, value);
  return value;
}

function lockBodyScroll() {
  const scrollY = window.scrollY || document.documentElement.scrollTop;
  document.body.dataset.chatScrollY = String(scrollY);
  document.body.style.position = 'fixed';
  document.body.style.top = `-${scrollY}px`;
  document.body.style.left = '0';
  document.body.style.right = '0';
  document.body.style.width = '100%';
}

function unlockBodyScroll() {
  const scrollY = parseInt(document.body.dataset.chatScrollY || '0', 10);
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.left = '';
  document.body.style.right = '';
  document.body.style.width = '';
  delete document.body.dataset.chatScrollY;
  window.scrollTo(0, scrollY);
}

function isMobile() {
  return window.matchMedia('(max-width: 900px)').matches;
}

export default function ChatWidgetReact({ locale = 'en', sessionUrl = '/api/chatkit/session/' }) {
  const copy = CHAT_COPY[locale] ?? CHAT_COPY.en;
  const chatkitLocale = CHATKIT_LOCALE_MAP[locale] ?? 'en';
  const dir = locale === 'ar' ? 'rtl' : 'ltr';

  const [open, setOpen] = React.useState(false);
  const [userId, setUserId] = React.useState(null);
  const [threadId, setThreadId] = React.useState(null);
  const [chatkitReady, setChatkitReady] = React.useState(false);
  const [runtimeReady, setRuntimeReady] = React.useState(false);
  const [runtimeError, setRuntimeError] = React.useState(null);
  const [chatkitError, setChatkitError] = React.useState(null);
  const chatRef = React.useRef(null);
  const isDev = import.meta.env?.DEV;

  React.useEffect(() => {
    setUserId(getOrCreateUserId());
    setThreadId(sessionStorage.getItem(THREAD_STORAGE_KEY));
    setOpen(sessionStorage.getItem(OPEN_KEY) === 'true');
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    ensureChatkitRuntime()
      .then(() => {
        if (cancelled) return;
        setRuntimeReady(true);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(err);
        setRuntimeError(err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    if (!open) {
      unlockBodyScroll();
      sessionStorage.setItem(OPEN_KEY, 'false');
      return;
    }
    sessionStorage.setItem(OPEN_KEY, 'true');
    if (isMobile()) lockBodyScroll();
    return () => unlockBodyScroll();
  }, [open]);

  React.useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const closeChat = React.useCallback(() => setOpen(false), []);

  const startNewChat = React.useCallback(() => {
    sessionStorage.removeItem(THREAD_STORAGE_KEY);
    setThreadId(null);
    chatRef.current?.setThreadId?.(null);
  }, []);

  const options = React.useMemo(() => {
    const initialThread = threadId ?? undefined;
    return {
      api: {
        async getClientSecret(current) {
          const response = await fetch(sessionUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              current,
              locale,
              user: userId ?? 'anonymous',
              pageUrl: window.location.href,
            }),
          });
          const text = await response.text();
          if (!response.ok) {
            // Surface actionable details in DevTools without showing them to end users.
            console.error('ChatKit session error', response.status, text);
            throw new Error(`Chat session request failed (${response.status})`);
          }
          const data = text ? JSON.parse(text) : {};
          return data.client_secret;
        },
      },
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
        attachments: { enabled: false },
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
    sessionUrl,
    threadId,
    userId,
  ]);

  const chat = useChatKit({
    ...options,
    onReady: () => {
      setChatkitReady(true);
      setChatkitError(null);
    },
    onError: (detail) => {
      setChatkitError(detail?.error ?? new Error('Chat unavailable.'));
    },
    onThreadChange: (detail) => {
      const nextId = detail?.threadId;
      if (!nextId) return;
      sessionStorage.setItem(THREAD_STORAGE_KEY, nextId);
      setThreadId(nextId);
    },
  });

  React.useEffect(() => {
    chatRef.current = chat;
  }, [chat]);

  React.useEffect(() => {
    if (!open || !chatkitReady) return;
    chat.focusComposer();
  }, [open, chatkitReady, chat]);

  return (
    <div className="chat-widget" data-open={open ? 'true' : 'false'} dir={dir}>
      {!open ? (
        <button
          className="chat-launcher"
          type="button"
          aria-expanded="false"
          aria-controls="chat-panel"
          aria-label={copy.launcherLabel}
          onClick={() => setOpen(true)}
        >
          <svg className="chat-launcher__icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span className="chat-launcher__label">{copy.launcherLabel}</span>
        </button>
      ) : null}

      <div className="chat-panel" id="chat-panel" hidden={!open} aria-hidden={!open}>
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
              <ChatKit control={chat.control} className="chat-frame" />
              {!chatkitReady && !chatkitError ? (
                <div className="chat-fallback chat-fallback--overlay" role="status">
                  <p className="chat-fallback__body">
                    {copy.loadingLabel ?? 'Loading chat...'}
                  </p>
                </div>
              ) : null}
              {chatkitError ? (
                <div className="chat-fallback chat-fallback--overlay" role="status">
                  <p className="chat-fallback__title">{copy.errorTitle ?? 'Something went wrong.'}</p>
                  <p className="chat-fallback__body">
                    {copy.errorBody ??
                      'Please refresh the page, or call/text us if you need help right away.'}
                  </p>
                  {isDev ? (
                    <p className="chat-fallback__detail">{String(chatkitError?.message ?? '')}</p>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : (
            <div className="chat-fallback" role="status">
              <p className="chat-fallback__body">{copy.loadingLabel ?? 'Loading chat...'}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
