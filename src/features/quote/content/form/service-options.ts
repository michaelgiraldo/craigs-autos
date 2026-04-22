import { PAGE_LABELS } from '../../../../lib/site-data/page-meta.js';
import type { LocaleKey } from '../../../../types/site';
import type { QuoteServiceOption } from './types';

const SERVICE_OPTION_KEYS = [
  { value: 'auto-upholstery', pageKey: 'autoUpholstery' },
  { value: 'car-seats', pageKey: 'carSeats' },
  { value: 'headliners', pageKey: 'headliners' },
  { value: 'convertible-tops', pageKey: 'convertibleTops' },
  { value: 'classic-cars', pageKey: 'classicCars' },
  { value: 'commercial-fleet', pageKey: 'commercialFleet' },
  { value: 'motorcycle-seats', pageKey: 'motorcycleSeats' },
] as const;

function getPageLabel(pageKey: string, locale: LocaleKey): string | null {
  const labelsByLocale = PAGE_LABELS as Record<string, Record<string, string>>;
  return labelsByLocale[locale]?.[pageKey] ?? null;
}

export function getQuoteServiceOptions(
  locale: LocaleKey,
  otherServiceLabel: string,
): QuoteServiceOption[] {
  const serviceOptions: QuoteServiceOption[] = SERVICE_OPTION_KEYS.map(({ value, pageKey }) => ({
    value,
    label: getPageLabel(pageKey, locale) ?? getPageLabel(pageKey, 'en') ?? value,
  }));

  serviceOptions.push({
    value: 'other',
    label: otherServiceLabel,
  });

  return serviceOptions;
}
