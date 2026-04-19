export const STORAGE_KEY = 'craigs_attribution_v1';
export const USER_STORAGE_KEY = 'chatkit-user-id';
export const JOURNEY_STORAGE_KEY = 'craigs_lead_journey_v1';
export const JOURNEY_IDLE_TIMEOUT_MS = 30 * 60 * 1000;

export const CLICK_KEYS = [
  'gclid',
  'gbraid',
  'wbraid',
  'msclkid',
  'fbclid',
  'ttclid',
  'li_fat_id',
  'epik',
  'sc_click_id',
  'ScCid',
  'yelp_lead_id',
] as const;
export const UTM_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
] as const;
