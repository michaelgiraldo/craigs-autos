import { getPageCardSummary, getPageLabel, getPageTranslation } from '../../lib/site-data/page-registry.js';
import type {
	LocaleKey,
	PageCardDeckConfig,
	PageCardDeckStrategy,
	PageCardItem,
	PageEntry,
} from '../../types/site';

const EXPLORE_CARD_KEYS = [
	'autoUpholstery',
	'carSeats',
	'dashboard',
	'motorcycleSeats',
	'headliners',
	'convertibleTops',
	'classicCars',
	'commercialFleet',
	'gallery',
	'reviews',
	'contact',
];

const SERVICE_RELATED_KEYS: Record<string, string[]> = {
	autoUpholstery: ['carSeats', 'dashboard', 'headliners'],
	carSeats: ['autoUpholstery', 'dashboard', 'motorcycleSeats'],
	dashboard: ['autoUpholstery', 'carSeats', 'classicCars'],
	motorcycleSeats: ['carSeats', 'autoUpholstery', 'classicCars'],
	boatUpholstery: ['motorcycleSeats', 'carSeats', 'autoUpholstery'],
	headliners: ['autoUpholstery', 'convertibleTops', 'classicCars'],
	convertibleTops: ['classicCars', 'autoUpholstery', 'headliners'],
	classicCars: ['autoUpholstery', 'dashboard', 'carSeats'],
	commercialFleet: ['autoUpholstery', 'carSeats', 'headliners'],
};

const FALLBACK_RELATED_KEYS = EXPLORE_CARD_KEYS.filter((key) =>
	['autoUpholstery', 'carSeats', 'dashboard', 'motorcycleSeats', 'headliners', 'convertibleTops', 'classicCars', 'commercialFleet'].includes(
		key,
	),
);

export type ResolvedPageCardDeck = {
	strategy: PageCardDeckStrategy;
	items: PageCardItem[];
};

function getDefaultStrategy(entry: PageEntry): PageCardDeckStrategy {
	switch (entry.data.pageType) {
		case 'home':
			return 'explore';
		case 'service':
			return 'related';
		default:
			return 'none';
	}
}

function getConfiguredKeys(entry: PageEntry, strategy: PageCardDeckStrategy, config?: PageCardDeckConfig) {
	if (config?.keys?.length) {
		return [...new Set(config.keys)];
	}

	if (strategy === 'explore') {
		return EXPLORE_CARD_KEYS;
	}

	if (strategy === 'related') {
		return SERVICE_RELATED_KEYS[entry.data.pageKey] ?? FALLBACK_RELATED_KEYS;
	}

	return [];
}

function getConfiguredLimit(strategy: PageCardDeckStrategy, config?: PageCardDeckConfig) {
	if (config?.limit) {
		return config.limit;
	}

	return strategy === 'related' ? 3 : null;
}

function buildCardItem(pageKey: string, locale: LocaleKey): PageCardItem {
	const href = getPageTranslation(pageKey, locale);
	const label = getPageLabel(pageKey, locale);
	const summary = getPageCardSummary(pageKey, locale);

	if (!href) {
		throw new Error(`Missing page translation for card "${pageKey}" in locale "${locale}".`);
	}

	if (!label) {
		throw new Error(`Missing page label for card "${pageKey}" in locale "${locale}".`);
	}

	if (!summary) {
		throw new Error(`Missing page card summary for card "${pageKey}" in locale "${locale}".`);
	}

	return {
		key: pageKey,
		href,
		label,
		summary,
	};
}

export function resolvePageCardDeck(entry: PageEntry, locale: LocaleKey): ResolvedPageCardDeck {
	const configuredStrategy = entry.data.pageCardDeck?.strategy;
	const strategy = configuredStrategy ?? getDefaultStrategy(entry);

	if (strategy === 'none') {
		return {
			strategy,
			items: [],
		};
	}

	const keys = getConfiguredKeys(entry, strategy, entry.data.pageCardDeck).filter(
		(pageKey) => pageKey !== entry.data.pageKey,
	);
	const limit = getConfiguredLimit(strategy, entry.data.pageCardDeck);
	const limitedKeys = limit ? keys.slice(0, limit) : keys;

	return {
		strategy,
		items: limitedKeys.map((pageKey) => buildCardItem(pageKey, locale)),
	};
}
