// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
	site: 'https://craigs.autos',
	trailingSlash: 'always',
	devToolbar: {
		placement: 'bottom-left',
	},
	image: {
		service: {
			entrypoint: 'astro/assets/services/sharp',
			config: {
				quality: 90,
				formats: ['avif', 'webp', 'jpeg'],
			},
		},
	},
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
			// Exclude the root (redirects to /en/) and internal utility pages from indexing.
			filter: (page) => {
				try {
					const pathname = new URL(page).pathname;
					return (
						pathname !== '/' &&
						pathname !== '/t/' &&
						!pathname.startsWith('/t/') &&
						pathname !== '/admin/' &&
						!pathname.startsWith('/admin/')
					);
				} catch {
					return true;
				}
			},
		}),
	],
});
