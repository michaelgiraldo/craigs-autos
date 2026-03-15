import atlasEntries from '../content/convertible-top-marque-atlas.json' with { type: 'json' };

const atlasEntry = atlasEntries.find((entry) => entry.id === 'default') ?? atlasEntries[0];

if (!atlasEntry) {
	throw new Error('Missing convertible top marque atlas content.');
}

export const CONVERTIBLE_TOP_MARQUE_FAMILIES = Object.freeze(atlasEntry.families ?? []);
export const CONVERTIBLE_TOP_FEATURED_BRANDS = Object.freeze(atlasEntry.featuredBrands ?? []);
export const CONVERTIBLE_TOP_MARQUE_COPY = Object.freeze(atlasEntry.copy ?? {});
