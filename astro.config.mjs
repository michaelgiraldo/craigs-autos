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
