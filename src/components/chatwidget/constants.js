import {
  LEAD_PHOTO_ACCEPT_EXTENSIONS,
  LEAD_PHOTO_LIMITS,
} from '@craigs/contracts/lead-attachment-contract';

export const DEFAULT_CHATKIT_RUNTIME_URLS = [
  // The ChatKit React bindings wrap the <openai-chatkit> web component, but do not ship its runtime.
  // Load the official runtime from the ChatKit docs.
  'https://cdn.platform.openai.com/deployments/chatkit/chatkit.js',
];

export const CHATKIT_RUNTIME_URLS = (() => {
  const list = import.meta.env.PUBLIC_CHATKIT_RUNTIME_URLS;
  if (typeof list === 'string') {
    const urls = list
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    if (urls.length) return urls;
  }
  const single = import.meta.env.PUBLIC_CHATKIT_RUNTIME_URL;
  if (typeof single === 'string' && single.trim()) return [single.trim()];
  return DEFAULT_CHATKIT_RUNTIME_URLS;
})();

export const CHATKIT_LOCALE_MAP = {
  en: 'en',
  es: 'es',
  vi: 'vi',
  'zh-hans': 'zh-CN',
  tl: 'tl',
  id: 'id',
  fa: 'fa',
  te: 'te',
  fr: 'fr',
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

export const THREAD_STORAGE_KEY = 'chatkit-thread-id';
export const USER_KEY = 'chatkit-user-id';
export const OPEN_KEY = 'chatkit-open';
export const LEAD_HANDOFF_COMPLETED_KEY_PREFIX = 'chat-handoff-promote-completed:';
export const FIRST_MESSAGE_SENT_KEY_PREFIX = 'chatkit-first-message-sent:';

// Send leads after a quiet period. This avoids forcing the customer to "end" the chat.
// Five minutes lets the user continue a natural conversation before we attempt to build/send
// a lead summary. Shorter windows can generate incomplete leads too early.
export const LEAD_QUIET_SEND_MS = 300_000;

export const CHATKIT_MAX_ATTACHMENT_BYTES = LEAD_PHOTO_LIMITS.maxBytesPerPhoto;
export const CHATKIT_MAX_ATTACHMENTS = LEAD_PHOTO_LIMITS.maxCount;
export const CHATKIT_ATTACHMENT_ACCEPT = LEAD_PHOTO_ACCEPT_EXTENSIONS;
