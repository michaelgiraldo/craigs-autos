export const DEFAULT_CHATKIT_RUNTIME_URLS = [
  // The ChatKit React bindings wrap the <openai-chatkit> web component, but do not ship its runtime.
  // Load the official runtime from the ChatKit docs.
  'https://cdn.platform.openai.com/deployments/chatkit/chatkit.js',
];

export const CHATKIT_RUNTIME_URLS = (() => {
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

export const CHATKIT_LOCALE_MAP = {
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

export const THREAD_STORAGE_KEY = 'chatkit-thread-id';
export const USER_KEY = 'chatkit-user-id';
export const OPEN_KEY = 'chatkit-open';
export const LEAD_SENT_KEY_PREFIX = 'chatkit-lead-sent:';
export const AMPLIFY_OUTPUTS_PATH = '/amplify_outputs.json';

// Send leads after a quiet period. This avoids forcing the customer to "end" the chat.
// Five minutes lets the user continue a natural conversation before we attempt to build/send
// a lead summary. Shorter windows can generate incomplete leads too early.
export const LEAD_QUIET_SEND_MS = 300_000;

// Allow up to 12 MB per attachment in the composer.
export const CHATKIT_MAX_ATTACHMENT_BYTES = 12 * 1024 * 1024;
export const CHATKIT_MAX_ATTACHMENTS = 7;
export const CHATKIT_ATTACHMENT_ACCEPT = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'image/heic': ['.heic'],
  'image/heif': ['.heif'],
};
