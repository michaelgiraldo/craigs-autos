import { defineCollection, reference } from 'astro:content';
import { file, glob } from 'astro/loaders';
import { z } from 'astro/zod';

const localizedText = z.record(z.string(), z.string());
const localizedTextList = z.record(z.string(), z.array(z.string()));
const faqItem = z.object({
	q: z.string(),
	a: z.string(),
});
const uiCopyEntry = z.object({
	callCta: z.string(),
	textCta: z.string(),
	directionsCta: z.string(),
	emailCta: z.string().optional(),
	menuLabel: z.string(),
	languageLabel: z.string(),
	quickActionsLabel: z.string(),
	hoursLabel: z.string(),
	hoursSummary: z.string(),
	reviewsLabel: z.string(),
	yelpLabel: z.string(),
	googleLabel: z.string(),
	appleMapsLabel: z.string(),
	trust: z.array(z.string()),
});
const businessCopyEntry = z.object({
	name: z.string(),
	description: z.string(),
	services: z.array(z.string()),
});
const navLabelEntry = z.object({
	services: z.string(),
	resources: z.string(),
});
const convertibleTopFamilyLabels = z.object({
	european: z.string(),
	british: z.string(),
	american: z.string(),
	japanese: z.string(),
});
const galleryMedia = z.object({
	id: z.string().optional(),
	assetPath: z.string(),
	alt: localizedText,
	caption: localizedText.optional(),
});
const galleryShowcaseItem = z.discriminatedUnion('type', [
	z.object({
		type: z.literal('projectImage'),
		project: reference('projects'),
		imageId: z.string(),
	}),
	z.object({
		type: z.literal('galleryImage'),
		gallery: reference('galleries'),
		imageId: z.string(),
	}),
]);
const pageModule = z.discriminatedUnion('type', [
	z.object({
		type: z.literal('featuredProject'),
		project: reference('projects'),
	}),
	z.object({
		type: z.literal('showcase'),
		showcase: reference('showcases'),
	}),
	z.object({
		type: z.literal('convertibleTopMarqueAtlas'),
	}),
]);
const gallerySection = z
	.object({
		type: z.literal('gallery'),
		title: localizedText.optional(),
		gallery: reference('galleries').optional(),
		items: z.array(galleryShowcaseItem).optional(),
	})
	.superRefine((section, ctx) => {
		const hasGallery = Boolean(section.gallery);
		const hasItems = Boolean(section.items?.length);

		if (hasGallery === hasItems) {
			ctx.addIssue({
				code: 'custom',
				message: 'Gallery showcase sections must define either gallery or items.',
				path: hasGallery ? ['items'] : ['gallery'],
			});
		}
	});
const beforeAfterSection = z.object({
	type: z.literal('beforeAfter'),
	title: localizedText.optional(),
	gallery: reference('galleries'),
});

const pages = defineCollection({
	loader: glob({
		pattern: ['**/*.md', '**/*.mdx'],
		base: './src/content/pages',
		generateId: ({ data, entry }) =>
			`${String(data.locale ?? entry.split('/')[0])}/${String(data.slug ?? entry.replace(/\.[^.]+$/u, ''))}`,
	}),
	schema: z.object({
		title: z.string(),
		description: z.string().min(1),
		pageKey: z.string(),
		locale: z.string(),
		slug: z.string(),
		template: z.enum(['standard', 'project']).optional(),
		hero: z
			.object({
				title: z.string(),
				lead: z.string().optional(),
				kicker: z.string().optional(),
				showTrust: z.boolean().optional(),
			})
			.optional(),
		showServiceCards: z.boolean().optional(),
		serviceCardsCurrentKey: z.string().optional(),
		pageModules: z.array(pageModule).optional(),
		faq: z
			.object({
				heading: z.string(),
				items: z.array(faqItem),
			})
			.optional(),
		project: reference('projects').optional(),
		noindex: z.boolean().optional(),
	}),
});

const projects = defineCollection({
	loader: glob({ pattern: '**/*.json', base: './src/content/projects' }),
	schema: z.object({
		id: z.string(),
		slug: z.string(),
		pageKey: z.string(),
		featuredImageId: z.string().optional(),
		copy: z.object({
			title: localizedText,
			lead: localizedText,
			overviewTitle: localizedText,
			overviewBody: localizedText,
			workTitle: localizedText,
			workItems: localizedTextList,
			galleryTitle: localizedText,
			featuredKicker: localizedText,
			featuredCta: localizedText,
		}),
		images: z.array(galleryMedia.extend({ id: z.string() })),
	}),
});

const chatCopy = defineCollection({
	loader: file('./src/content/chat-copy.json'),
	schema: z.object({
		id: z.string(),
		launcherLabel: z.string(),
		quoteCta: z.string(),
		recapCta: z.string(),
		quoteTitle: z.string(),
		recapTitle: z.string(),
		nameLabel: z.string(),
		emailLabel: z.string(),
		phoneLabel: z.string(),
		vehicleLabel: z.string(),
		detailsLabel: z.string(),
		submitQuote: z.string(),
		submitRecap: z.string(),
		cancelLabel: z.string(),
		successTitle: z.string(),
		successBody: z.string(),
		errorTitle: z.string(),
		errorBody: z.string(),
		startGreeting: z.string(),
		startMessage: z.string(),
		composerPlaceholder: z.string(),
		startPrompts: z.array(
			z.object({
				icon: z.string(),
				label: z.string(),
				prompt: z.string(),
			}),
		),
		loadingLabel: z.string(),
		sendingLabel: z.string(),
	}),
});

const uiCopy = defineCollection({
	loader: file('./src/content/ui-copy.json'),
	schema: uiCopyEntry,
});

const businessCopy = defineCollection({
	loader: file('./src/content/business-copy.json'),
	schema: businessCopyEntry,
});

const navLabels = defineCollection({
	loader: file('./src/content/nav-labels.json'),
	schema: navLabelEntry,
});

const pageMeta = defineCollection({
	loader: file('./src/content/page-meta.json'),
	schema: z.object({
		id: z.string(),
		navLabel: localizedText,
	}),
});

const galleries = defineCollection({
	loader: file('./src/content/galleries.json'),
	schema: z.discriminatedUnion('kind', [
		z.object({
			id: z.string(),
			kind: z.literal('gallery'),
			images: z.array(galleryMedia.extend({ id: z.string() })),
		}),
		z.object({
			id: z.string(),
			kind: z.literal('beforeAfter'),
			pairs: z.array(
				z.object({
					pairId: z.string(),
					before: galleryMedia,
					after: galleryMedia,
				}),
			),
		}),
	]),
});

const showcases = defineCollection({
	loader: file('./src/content/showcases.json'),
	schema: z.object({
		id: z.string(),
		sections: z.array(z.union([gallerySection, beforeAfterSection])),
	}),
});

const convertibleTopAtlas = defineCollection({
	loader: file('./src/content/convertible-top-marque-atlas.json'),
	schema: z.object({
		id: z.string(),
		families: z.array(
			z.object({
				key: z.enum(['european', 'british', 'american', 'japanese']),
				brands: z.array(z.string()),
			}),
		),
		featuredBrands: z.array(z.string()),
		copy: z.record(
			z.string(),
			z.object({
				eyebrow: z.string(),
				heading: z.string(),
				leadHtml: z.string(),
				familyLabels: convertibleTopFamilyLabels,
				itemListName: z.string(),
			}),
		),
	}),
});

export const collections = {
	pages,
	projects,
	chatCopy,
	uiCopy,
	businessCopy,
	navLabels,
	pageMeta,
	galleries,
	showcases,
	convertibleTopAtlas,
};
