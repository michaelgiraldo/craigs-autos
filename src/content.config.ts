import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const pages = defineCollection({
  loader: glob({ pattern: ['**/*.md', '**/*.mdx'], base: './src/content/pages' }),
  schema: z.object({
    title: z.string(),
    description: z.string().min(1),
    pageKey: z.string(),
    noindex: z.boolean().optional(),
  }),
});

export const collections = { pages };
