import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const localizedText = z.record(z.string(), z.string());
const localizedTextList = z.record(z.string(), z.array(z.string()));

const pages = defineCollection({
  loader: glob({ pattern: ['**/*.md', '**/*.mdx'], base: './src/content/pages' }),
  schema: z.object({
    title: z.string(),
    description: z.string().min(1),
    pageKey: z.string(),
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
