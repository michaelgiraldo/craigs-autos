import { PAGE_PATHS_BASE } from './page-paths.base.js';
import { COMMERCIAL_FLEET_PAGE_PATHS } from './page-paths.commercial-fleet.js';
import { WAVE1_PAGE_PATHS } from './page-paths.wave1.js';

const mergeLocalePaths = (baseLocalePaths, extendedLocalePaths = {}) => ({
	...baseLocalePaths,
	...extendedLocalePaths,
});

export const PAGE_PATHS = Object.fromEntries(
	Object.entries(PAGE_PATHS_BASE).map(([pageKey, localePaths]) => [
		pageKey,
		mergeLocalePaths(localePaths, WAVE1_PAGE_PATHS[pageKey]),
	]),
);

PAGE_PATHS.commercialFleet = mergeLocalePaths(
	PAGE_PATHS.commercialFleet ?? {},
	COMMERCIAL_FLEET_PAGE_PATHS,
);
