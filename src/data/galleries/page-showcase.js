import { getCollection } from 'astro:content';
import { getProjectImage } from '../projects/index.js';

const GALLERY_IMAGE_MODULES = import.meta.glob(
	'../../assets/images/**/*.{avif,gif,jpeg,jpg,png,webp}',
	{
		eager: true,
		import: 'default',
	},
);

const GALLERY_IMAGE_PREFIX = '../../assets/images/';

const GALLERY_IMAGE_ASSETS = new Map(
	Object.entries(GALLERY_IMAGE_MODULES).map(([assetPath, asset]) => [
		assetPath.slice(GALLERY_IMAGE_PREFIX.length),
		asset,
	]),
);

const hydrateGalleryMedia = (image, sourceId) => {
	const asset = GALLERY_IMAGE_ASSETS.get(image.assetPath);

	if (!asset) {
		throw new Error(`Missing gallery asset for ${sourceId}: ${image.assetPath}`);
	}

	return {
		...image,
		asset,
	};
};

const hydrateGallery = (entry) => {
	const id = entry.data.id ?? entry.id;

	if (entry.data.kind === 'beforeAfter') {
		return {
			...entry.data,
			id,
			pairs: (entry.data.pairs ?? []).map((pair) => ({
				...pair,
				before: hydrateGalleryMedia(pair.before, `${id}:before:${pair.pairId}`),
				after: hydrateGalleryMedia(pair.after, `${id}:after:${pair.pairId}`),
			})),
		};
	}

	return {
		...entry.data,
		id,
		images: (entry.data.images ?? []).map((image) => hydrateGalleryMedia(image, id)),
	};
};

const hydrateShowcase = (entry) => ({
	...entry.data,
	id: entry.data.id ?? entry.id,
});

let galleriesByIdPromise;
let showcasesByIdPromise;
const resolveReferenceId = (value) =>
	typeof value === 'string' ? value : value?.id;

const getGalleriesById = async () => {
	if (!galleriesByIdPromise) {
		galleriesByIdPromise = getCollection('galleries').then((entries) => {
			const galleries = entries.map(hydrateGallery);
			return new Map(galleries.map((gallery) => [gallery.id, gallery]));
		});
	}

	return galleriesByIdPromise;
};

const getShowcasesById = async () => {
	if (!showcasesByIdPromise) {
		showcasesByIdPromise = getCollection('showcases').then((entries) => {
			const showcases = entries.map(hydrateShowcase);
			return new Map(showcases.map((showcase) => [showcase.id, showcase]));
		});
	}

	return showcasesByIdPromise;
};

export const getGallery = async (id) => {
	const galleriesById = await getGalleriesById();
	return galleriesById.get(id);
};

export const getShowcase = async (id) => {
	const showcasesById = await getShowcasesById();
	return showcasesById.get(id);
};

const resolveShowcaseItems = async (items = []) =>
	Promise.all(
		items.map(async (item) => {
			if (item.type === 'projectImage') {
				const projectId = resolveReferenceId(item.project);
				const image = await getProjectImage(projectId, item.imageId);

				if (!image) {
					throw new Error(
						`Missing project showcase image for ${projectId}: ${item.imageId}`,
					);
				}

				return image;
			}

			const galleryId = resolveReferenceId(item.gallery);
			const gallery = await getGallery(galleryId);

			if (!gallery || gallery.kind !== 'gallery') {
				throw new Error(`Missing gallery showcase source: ${galleryId}`);
			}

			const image = gallery.images?.find((candidate) => candidate.id === item.imageId);

			if (!image) {
				throw new Error(`Missing gallery showcase image for ${galleryId}: ${item.imageId}`);
			}

			return image;
		}),
	);

export const getShowcaseSections = async (showcaseId) => {
	const showcase = await getShowcase(showcaseId);

	if (!showcase) {
		throw new Error(`Showcase not found: ${showcaseId}`);
	}

	return Promise.all(
		(showcase.sections ?? []).map(async (section) => {
			if (section.type === 'beforeAfter') {
				const galleryId = resolveReferenceId(section.gallery);
				const gallery = await getGallery(galleryId);

				if (!gallery || gallery.kind !== 'beforeAfter') {
					throw new Error(`Before/after gallery not found: ${galleryId}`);
				}

				return {
					...section,
					pairs: gallery.pairs ?? [],
				};
			}

			if (section.gallery) {
				const galleryId = resolveReferenceId(section.gallery);
				const gallery = await getGallery(galleryId);

				if (!gallery || gallery.kind !== 'gallery') {
					throw new Error(`Gallery not found: ${galleryId}`);
				}

				return {
					...section,
					images: gallery.images ?? [],
				};
			}

			return {
				...section,
				images: await resolveShowcaseItems(section.items ?? []),
			};
		}),
	);
};
