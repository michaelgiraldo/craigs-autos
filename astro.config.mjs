// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

const SITEMAP_BLOCKED_SECTIONS = new Set(['message', 'admin']);

/**
 * @param {string} pathname
 */
const isIndexablePath = (pathname) => {
	if (pathname === '/') {
		return false;
	}
	const [firstSegment] = pathname.split('/').filter(Boolean);
	return !SITEMAP_BLOCKED_SECTIONS.has(firstSegment ?? '');
};

// https://astro.build/config
export default defineConfig({
	site: 'https://craigs.autos',
	trailingSlash: 'always',
	devToolbar: {
		enabled: true,
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
					return isIndexablePath(pathname);
				} catch {
					return true;
				}
			},
		}),
	],
});
