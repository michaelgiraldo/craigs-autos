export function createClientEventId(prefix) {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `${prefix}_${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}
