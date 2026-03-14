import type { ImageMetadata } from 'astro';
import type { CollectionEntry } from 'astro:content';
export type LocaleKey =
	| 'en'
	| 'es'
	| 'vi'
	| 'zh-hans'
	| 'tl'
	| 'id'
	| 'fa'
	| 'te'
	| 'fr'
	| 'ko'
	| 'hi'
	| 'pa'
	| 'pt-br'
	| 'zh-hant'
	| 'ja'
	| 'ar'
	| 'ru'
	| 'ta';
export type LocaleMap<T> = Partial<Record<LocaleKey, T>>;
export type LocalizedText = LocaleMap<string>;
export type LocalizedTextList = LocaleMap<string[]>;
export type SiteData = typeof import('../lib/site-data/core.js').SITE;
export type UiCopy = (typeof import('../lib/site-data/ui-copy.js').UI_COPY)[string];

export type PageEntry = CollectionEntry<'pages'>;
export type PageModule = NonNullable<PageEntry['data']['pageModules']>[number];
export type PageFaqItem = NonNullable<NonNullable<PageEntry['data']['faq']>['items']>[number];

export type GalleryImage = {
	id?: string;
	asset: ImageMetadata;
	alt?: LocalizedText;
	caption?: LocalizedText;
};

export type BeforeAfterPair = {
	id?: string;
	pairId?: string;
	before: GalleryImage;
	after: GalleryImage;
};

export type ProjectImage = CollectionEntry<'projects'>['data']['images'][number] & {
	asset: ImageMetadata;
};

export type ProjectData = Omit<CollectionEntry<'projects'>['data'], 'images'> & {
	id: string;
	images: ProjectImage[];
};

export type LanguageLink = {
	key: LocaleKey;
	label: string;
	menuLabel?: string;
	searchLabel?: string;
	href: string;
};

export type NavItem = {
	key: string;
	href: string;
	label: string;
};

export type HreflangLink = {
	hreflang: string;
	href: string;
};
