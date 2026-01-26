import React from 'react';
import { ChatKit, useChatKit } from '@openai/chatkit-react';
import { BRAND_NAME, CHAT_COPY } from '../lib/site-data.js';

class ChatKitErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.reset = this.reset.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  reset() {
    this.setState({ error: null });
    this.props.onReset?.();
  }

  render() {
    const { error } = this.state;
    if (error) return this.props.fallback?.(error, this.reset) ?? null;
    return this.props.children;
  }
}

function ChatKitWithHooks({ options, onReady, onError, onThreadChange, onChat }) {
  const chat = useChatKit({
    ...options,
    onReady,
    onError,
    onThreadChange,
  });

  React.useEffect(() => {
    onChat?.(chat);
  }, [chat, onChat]);

  return <ChatKit control={chat.control} className="chat-frame" />;
}

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
const LEAD_SENT_KEY_PREFIX = 'chatkit-lead-sent:';
const AMPLIFY_OUTPUTS_PATH = '/amplify_outputs.json';

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

function isPlaceholderUrl(value) {
  return typeof value === 'string' && value.includes('<your-backend>');
}

export default function ChatWidgetReact({
  locale = 'en',
  sessionUrl = '/api/chatkit/session/',
  leadEmailUrl = '/api/chatkit/lead/',
}) {
  const copy = CHAT_COPY[locale] ?? CHAT_COPY.en;
  const chatkitLocale = CHATKIT_LOCALE_MAP[locale] ?? 'en';
  const dir = locale === 'ar' ? 'rtl' : 'ltr';

  const [open, setOpen] = React.useState(false);
  const [userId, setUserId] = React.useState(null);
  const [threadId, setThreadId] = React.useState(null);
  const [resolvedSessionUrl, setResolvedSessionUrl] = React.useState(sessionUrl);
  const [resolvedLeadEmailUrl, setResolvedLeadEmailUrl] = React.useState(leadEmailUrl);
  const [chatMountId, setChatMountId] = React.useState(0);
  const [chatkitReady, setChatkitReady] = React.useState(false);
  const [runtimeReady, setRuntimeReady] = React.useState(false);
  const [runtimeError, setRuntimeError] = React.useState(null);
  const [chatkitError, setChatkitError] = React.useState(null);
  const [chatInstance, setChatInstance] = React.useState(null);
  const chatRef = React.useRef(null);
  const isDev = import.meta.env?.DEV;

  React.useEffect(() => {
    setUserId(getOrCreateUserId());
    setThreadId(sessionStorage.getItem(THREAD_STORAGE_KEY));
    setOpen(sessionStorage.getItem(OPEN_KEY) === 'true');
  }, []);

  React.useEffect(() => {
    setResolvedSessionUrl(sessionUrl);
  }, [sessionUrl]);

  React.useEffect(() => {
    setResolvedLeadEmailUrl(leadEmailUrl);
  }, [leadEmailUrl]);

  React.useEffect(() => {
    // In production, prefer the backend URL from Amplify outputs when available.
    // This avoids hard-coding a session endpoint URL per branch.
    if (isDev) return;

    const shouldTryOutputs =
      typeof sessionUrl !== 'string' ||
      isPlaceholderUrl(sessionUrl) ||
      sessionUrl.startsWith('/') ||
      typeof leadEmailUrl !== 'string' ||
      isPlaceholderUrl(leadEmailUrl) ||
      leadEmailUrl.startsWith('/');

    if (!shouldTryOutputs) return;

    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(AMPLIFY_OUTPUTS_PATH, { cache: 'no-store' });
        if (!response.ok) return;
        const data = await response.json();
        const sessionCandidate = data?.custom?.chatkit_session_url;
        if (!cancelled && typeof sessionCandidate === 'string' && sessionCandidate.trim()) {
          setResolvedSessionUrl(sessionCandidate.trim());
        }
        const leadCandidate = data?.custom?.chatkit_lead_email_url;
        if (!cancelled && typeof leadCandidate === 'string' && leadCandidate.trim()) {
          setResolvedLeadEmailUrl(leadCandidate.trim());
        }
      } catch (err) {
        // Ignore; we'll fall back to the configured URL and let the UI surface errors.
        if (isDev) console.error('Failed to read amplify_outputs.json', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isDev, leadEmailUrl, sessionUrl]);

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

  const sendLeadEmail = React.useCallback(
    async ({ reason = 'chat_closed' } = {}) => {
      const activeThreadId = threadId;
      if (!activeThreadId) return;
      if (typeof resolvedLeadEmailUrl !== 'string' || !resolvedLeadEmailUrl.trim()) return;
      if (isPlaceholderUrl(resolvedLeadEmailUrl)) return;

      let endpoint = resolvedLeadEmailUrl.trim();
      if (!isDev && endpoint.startsWith('/')) {
        try {
          const outputsRes = await fetch(AMPLIFY_OUTPUTS_PATH, { cache: 'no-store' });
          if (outputsRes.ok) {
            const outputs = await outputsRes.json();
            const candidate = outputs?.custom?.chatkit_lead_email_url;
            if (typeof candidate === 'string' && candidate.trim()) {
              endpoint = candidate.trim();
              setResolvedLeadEmailUrl(endpoint);
            }
          }
        } catch {
          // Ignore and fall back to the configured endpoint.
        }
      }
      if (endpoint.startsWith('/')) return;

      const sentKey = `${LEAD_SENT_KEY_PREFIX}${activeThreadId}`;
      if (globalThis.localStorage?.getItem(sentKey) === 'true') return;

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          keepalive: true,
          body: JSON.stringify({
            threadId: activeThreadId,
            locale,
            user: userId ?? 'anonymous',
            pageUrl: window.location.href,
            reason,
          }),
        });

        const text = await response.text();
        if (!response.ok) {
          if (isDev) console.error('ChatKit lead email error', response.status, text);
          return;
        }

        const data = text ? JSON.parse(text) : {};
        if (data?.sent === true) {
          globalThis.localStorage?.setItem(sentKey, 'true');
        }
      } catch (err) {
        if (isDev) console.error('ChatKit lead email request failed', err);
      }
    },
    [isDev, locale, resolvedLeadEmailUrl, threadId, userId]
  );

  const closeChat = React.useCallback(() => {
    setOpen(false);
    void sendLeadEmail({ reason: 'chat_closed' });
  }, [sendLeadEmail]);

  const startNewChat = React.useCallback(() => {
    sessionStorage.removeItem(THREAD_STORAGE_KEY);
    setThreadId(null);
    chatRef.current?.setThreadId?.(null);
  }, []);

  const resetChat = React.useCallback(() => {
    setChatkitReady(false);
    setChatkitError(null);
    setChatInstance(null);
    setChatMountId((value) => value + 1);
  }, []);

  const options = React.useMemo(() => {
    const initialThread = threadId ?? undefined;
    return {
      api: {
        async getClientSecret(current) {
          let endpoint = resolvedSessionUrl;
          if (
            !isDev &&
            (typeof endpoint !== 'string' || isPlaceholderUrl(endpoint) || endpoint.startsWith('/'))
          ) {
            try {
              const outputsRes = await fetch(AMPLIFY_OUTPUTS_PATH, { cache: 'no-store' });
              if (outputsRes.ok) {
                const outputs = await outputsRes.json();
                const candidate = outputs?.custom?.chatkit_session_url;
                if (typeof candidate === 'string' && candidate.trim()) {
                  endpoint = candidate.trim();
                  setResolvedSessionUrl(endpoint);
                }
                const leadCandidate = outputs?.custom?.chatkit_lead_email_url;
                if (typeof leadCandidate === 'string' && leadCandidate.trim()) {
                  setResolvedLeadEmailUrl(leadCandidate.trim());
                }
              }
            } catch {
              // Ignore; we'll fall back to the configured endpoint and surface errors from fetch().
            }
          }

          const response = await fetch(endpoint, {
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
    resolvedSessionUrl,
    threadId,
    userId,
  ]);

  React.useEffect(() => {
    chatRef.current = chatInstance;
  }, [chatInstance]);

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
          onClick={() => setOpen(true)}
        >
          <svg className="chat-launcher__icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span className="chat-launcher__label">{copy.launcherLabel}</span>
        </button>
      ) : null}

      {open ? (
        <div className="chat-panel" id="chat-panel">
          <div className="chat-panel__body">
            {runtimeError ? (
              <div className="chat-fallback" role="status">
                <p className="chat-fallback__title">
                  {copy.errorTitle ?? 'Something went wrong.'}
                </p>
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
                    }}
                    onError={(detail) => {
                      setChatkitError(detail?.error ?? new Error('Chat unavailable.'));
                    }}
                    onThreadChange={(detail) => {
                      const nextId = detail?.threadId;
                      if (!nextId) return;
                      sessionStorage.setItem(THREAD_STORAGE_KEY, nextId);
                      setThreadId(nextId);
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
