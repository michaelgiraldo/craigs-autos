// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
	site: 'https://craigs.autos',
	trailingSlash: 'always',
	vite: {
		server: {
			proxy: {
				'/api/chatkit': {
					target: 'http://localhost:8787',
					changeOrigin: true,
				},
			},
		},
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
		react(),
		mdx(),
		sitemap({
			filter: (page) => page !== '/',
		}),
	],
});
