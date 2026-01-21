import { defineCollection, z } from 'astro:content';

const pages = defineCollection({
	type: 'content',
	schema: z.object({
		title: z.string(),
		description: z.string(),
		pageKey: z.string(),
		noindex: z.boolean().optional(),
	}),
});

export const collections = { pages };
