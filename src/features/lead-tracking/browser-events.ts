export type LeadDataLayerValue = boolean | number | string | null | undefined;
export type LeadDataLayerParams = Record<string, LeadDataLayerValue>;

export function createClientEventId(prefix: string): string {
  const runtimeCrypto = globalThis.crypto;
  if (typeof runtimeCrypto?.randomUUID === 'function') {
    return `${prefix}_${runtimeCrypto.randomUUID()}`;
  }

  return `${prefix}_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export function pushLeadDataLayerEvent(
  eventName: string,
  params: LeadDataLayerParams,
  attribution: LeadDataLayerParams | null = null,
): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const dataLayerWindow = window as Window & { dataLayer?: LeadDataLayerParams[] };
    dataLayerWindow.dataLayer = dataLayerWindow.dataLayer || [];
    dataLayerWindow.dataLayer.push({
      event: eventName,
      ...(attribution ?? {}),
      ...params,
    });
  } catch {
    // Ignore analytics failures.
  }
}
