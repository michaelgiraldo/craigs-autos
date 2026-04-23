import type { NavItem } from '../../types/site';

type NavItemDefinition = {
	key: string;
	tone?: NavItem['tone'];
};

export type HeaderNavStructure = {
	allNavKeys: string[];
	servicesNav: NavItem[];
	desktopNav: NavItem[];
	mobilePrimaryNav: NavItem[];
	mobileSecondaryNav: NavItem[];
};

export const NAV_ITEM_ORDER = [
	'autoUpholstery',
	'carSeats',
	'dashboardReupholstery',
	'motorcycleSeats',
	'boatUpholstery',
	'headliners',
	'convertibleTops',
	'classicCars',
	'commercialFleet',
	'upholsteryGuide',
	'gallery',
	'reviews',
	'requestQuote',
	'contact',
] as const;

const SERVICES_NAV_KEYS = [
	'autoUpholstery',
	'carSeats',
	'dashboardReupholstery',
	'headliners',
	'convertibleTops',
	'classicCars',
	'commercialFleet',
] as const;

const DESKTOP_NAV_ITEMS: NavItemDefinition[] = [
	{ key: 'motorcycleSeats' },
	{ key: 'boatUpholstery' },
	{ key: 'gallery' },
	{ key: 'upholsteryGuide' },
	{ key: 'reviews' },
	{ key: 'contact' },
	{ key: 'requestQuote', tone: 'cta' },
];

const MOBILE_PRIMARY_NAV_ITEMS: NavItemDefinition[] = [
	{ key: 'requestQuote', tone: 'cta' },
	{ key: 'autoUpholstery' },
	{ key: 'carSeats' },
	{ key: 'headliners' },
];

const MOBILE_SECONDARY_NAV_ITEMS: NavItemDefinition[] = [
	{ key: 'dashboardReupholstery' },
	{ key: 'convertibleTops' },
	{ key: 'classicCars' },
	{ key: 'commercialFleet' },
	{ key: 'motorcycleSeats' },
	{ key: 'boatUpholstery' },
	{ key: 'upholsteryGuide' },
	{ key: 'gallery' },
	{ key: 'reviews' },
	{ key: 'contact' },
];

function resolveNavItems(
	definitions: readonly NavItemDefinition[],
	navItemsByKey: Partial<Record<string, NavItem>>,
): NavItem[] {
	return definitions
		.map((definition) => {
			const item = navItemsByKey[definition.key];
			if (!item) {
				return null;
			}

			return definition.tone ? { ...item, tone: definition.tone } : item;
		})
		.filter((item): item is NavItem => Boolean(item));
}

export function buildHeaderNavStructure(
	navItemsByKey: Partial<Record<string, NavItem>>,
): HeaderNavStructure {
	return {
		allNavKeys: [...NAV_ITEM_ORDER],
		servicesNav: resolveNavItems(
			SERVICES_NAV_KEYS.map((key) => ({ key })),
			navItemsByKey,
		),
		desktopNav: resolveNavItems(DESKTOP_NAV_ITEMS, navItemsByKey),
		mobilePrimaryNav: resolveNavItems(MOBILE_PRIMARY_NAV_ITEMS, navItemsByKey),
		mobileSecondaryNav: resolveNavItems(MOBILE_SECONDARY_NAV_ITEMS, navItemsByKey),
	};
}
