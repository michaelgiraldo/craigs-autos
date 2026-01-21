// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
	site: 'https://craigs.autos',
	trailingSlash: 'always',
	vite: {
		build: {
			rollupOptions: {
				onwarn(warning, warn) {
					if (
						warning.code === 'MISSING_EXPORT' &&
						typeof warning.message === 'string' &&
						warning.message.includes('"fontData" is not exported by') &&
						warning.message.includes('virtual:astro:assets/fonts/internal') &&
						warning.message.includes('node_modules/astro/dist/assets/fonts/runtime.js')
					) {
						return;
					}
					warn(warning);
				},
			},
		},
	},
	integrations: [
		mdx(),
		sitemap({
			filter: (page) => page !== '/',
		}),
	],
});
