export type ShopState = {
  shop_timezone: string;
  shop_local_weekday: string;
  shop_local_time_24h: string;
  shop_is_open_now: boolean;
  shop_next_open_day: string;
  shop_next_open_time: string;
};

export function computeShopState(now: Date, timezone: string): ShopState;
