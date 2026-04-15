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
export type UiCopy =
	(typeof import('../lib/site-data/ui-copy.js').UI_COPY)[keyof typeof import('../lib/site-data/ui-copy.js').UI_COPY];

export type PageType =
	| 'home'
	| 'service'
	| 'contact'
	| 'quote'
	| 'project'
	| 'reviews'
	| 'gallery'
	| 'guide';
export type PageQuotePromptPlacement = 'none' | 'inline';
export type PageCtaConfig = {
	quotePrompt?: PageQuotePromptPlacement;
};
export type PageCardDeckStrategy = 'explore' | 'related' | 'intent' | 'none';
export type PageCardDeckConfig = {
	strategy?: PageCardDeckStrategy;
	keys?: string[];
	limit?: number;
};

export type PageEntry = CollectionEntry<'pages'>;
export type PageModule = NonNullable<PageEntry['data']['pageModules']>[number];
export type PageFaqItem = NonNullable<NonNullable<PageEntry['data']['faq']>['items']>[number];
export type GalleryEntry = CollectionEntry<'galleries'>;
export type ShowcaseEntry = CollectionEntry<'showcases'>;

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

export type GalleryData =
	| (Omit<Extract<GalleryEntry['data'], { kind: 'gallery' }>, 'images'> & {
			id: string;
			images: GalleryImage[];
	  })
	| (Omit<Extract<GalleryEntry['data'], { kind: 'beforeAfter' }>, 'pairs'> & {
			id: string;
			pairs: BeforeAfterPair[];
	  });

export type ShowcaseSection = ShowcaseEntry['data']['sections'][number];
export type ShowcaseSectionWithMedia =
	| (Extract<ShowcaseSection, { type: 'gallery' }> & {
			images: GalleryImage[];
	  })
	| (Extract<ShowcaseSection, { type: 'beforeAfter' }> & {
			pairs: BeforeAfterPair[];
	  });

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
	tone?: 'default' | 'cta';
};

export type PageCardItem = {
	key: string;
	href: string;
	label: string;
	summary: string;
};

export type HreflangLink = {
	hreflang: string;
	href: string;
};
