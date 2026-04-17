import { CLICK_KEYS, UTM_KEYS } from './constants';
import type { TouchRecord } from './types';
import { pickValue } from './browser-values';

export function extractTouch(touch: unknown): TouchRecord | null {
  if (!touch || typeof touch !== 'object') return null;
  const out: TouchRecord = {};
  for (const key of CLICK_KEYS) {
    const value = pickValue(touch, key);
    if (value) out[key] = value;
  }
  for (const key of UTM_KEYS) {
    const value = pickValue(touch, key);
    if (value) out[key] = value;
  }
  const ts = pickValue(touch, 'ts');
  if (ts) out.ts = ts;
  const landing = pickValue(touch, 'landing_page');
  if (landing) out.landing_page = landing;
  return Object.keys(out).length ? out : null;
}
