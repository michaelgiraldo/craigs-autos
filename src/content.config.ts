import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const localizedText = z.record(z.string(), z.string());
const localizedTextList = z.record(z.string(), z.array(z.string()));
const faqItem = z.object({
	q: z.string(),
	a: z.string(),
});
const pageModule = z.discriminatedUnion('type', [
	z.object({
		type: z.literal('featuredProject'),
		projectId: z.string(),
	}),
	z.object({
		type: z.literal('showcase'),
		pageKey: z.string(),
	}),
	z.object({
		type: z.literal('convertibleTopMarqueAtlas'),
	}),
]);

const pages = defineCollection({
  loader: glob({ pattern: ['**/*.md', '**/*.mdx'], base: './src/content/pages' }),
  schema: z.object({
    title: z.string(),
    description: z.string().min(1),
    pageKey: z.string(),
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
    projectId: z.string().optional(),
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
    images: z.array(
      z.object({
        id: z.string(),
        assetPath: z.string(),
        alt: localizedText,
        caption: localizedText.optional(),
      }),
    ),
  }),
});

export const collections = { pages, projects };
