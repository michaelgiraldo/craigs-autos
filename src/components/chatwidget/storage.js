import { OPEN_KEY, THREAD_STORAGE_KEY, USER_KEY } from './constants.js';

export function getLocalStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function getSessionStorage() {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

export function getStorageValue(storage, key) {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function setStorageValue(storage, key, value) {
  try {
    storage?.setItem(key, value);
  } catch {
    // Ignore storage access issues.
  }
}

export function removeStorageValue(storage, key) {
  try {
    storage?.removeItem(key);
  } catch {
    // Ignore storage access issues.
  }
}

export function getOrCreateUserId() {
  const localStorage = getLocalStorage();
  const existing = getStorageValue(localStorage, USER_KEY);
  if (existing) return existing;

  const randomId =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  const value = `anon_${randomId}`;
  setStorageValue(localStorage, USER_KEY, value);
  return value;
}

export function initializeThreadState() {
  return getStorageValue(getSessionStorage(), THREAD_STORAGE_KEY);
}

export function initializeOpenState() {
  let nextOpen = !isMobile();
  const saved = getStorageValue(getSessionStorage(), OPEN_KEY);
  if (saved === 'true') {
    nextOpen = true;
  }
  if (saved === 'false') {
    nextOpen = false;
  }
  return nextOpen;
}

export function persistOpenState(open) {
  setStorageValue(getSessionStorage(), OPEN_KEY, open ? 'true' : 'false');
}

export function clearThreadState() {
  removeStorageValue(getSessionStorage(), THREAD_STORAGE_KEY);
}

export function persistThreadState(threadId) {
  if (!threadId) {
    clearThreadState();
    return;
  }
  setStorageValue(getSessionStorage(), THREAD_STORAGE_KEY, threadId);
}

export function lockBodyScroll() {
  if (!globalThis.document?.body) return;
  const scrollY = globalThis.scrollY || document.documentElement.scrollTop;
  document.body.dataset.chatScrollY = String(scrollY);
  document.body.style.position = 'fixed';
  document.body.style.top = `-${scrollY}px`;
  document.body.style.left = '0';
  document.body.style.right = '0';
  document.body.style.width = '100%';
}

export function unlockBodyScroll() {
  if (!globalThis.document?.body) return;
  const scrollY = parseInt(document.body.dataset.chatScrollY || '0', 10);
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.left = '';
  document.body.style.right = '';
  document.body.style.width = '';
  delete document.body.dataset.chatScrollY;
  globalThis.scrollTo?.(0, scrollY);
}

export function isMobile() {
  return globalThis.matchMedia?.('(max-width: 900px)').matches ?? false;
}
