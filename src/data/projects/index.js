import { getCollection } from 'astro:content';

const PROJECT_IMAGE_MODULES = import.meta.glob(
	'../../assets/images/projects/**/*.{avif,gif,jpeg,jpg,png,webp}',
	{
		eager: true,
		import: 'default',
	},
);

const PROJECT_IMAGE_PREFIX = '../../assets/images/';

const PROJECT_IMAGE_ASSETS = new Map(
	Object.entries(PROJECT_IMAGE_MODULES).map(([assetPath, asset]) => [
		assetPath.slice(PROJECT_IMAGE_PREFIX.length),
		asset,
	]),
);

const hydrateProjectImage = (image, projectId) => {
	const asset = PROJECT_IMAGE_ASSETS.get(image.assetPath);

	if (!asset) {
		throw new Error(`Missing project asset for ${projectId}: ${image.assetPath}`);
	}

	return {
		...image,
		asset,
	};
};

const hydrateProject = (entry) => ({
	...entry.data,
	id: entry.data.id ?? entry.id,
	images: (entry.data.images ?? []).map((image) => hydrateProjectImage(image, entry.id)),
});

let projectsByIdPromise;

const getProjectsById = async () => {
	if (!projectsByIdPromise) {
		projectsByIdPromise = getCollection('projects').then((entries) => {
			const projects = entries.map(hydrateProject);
			return new Map(projects.map((project) => [project.id, project]));
		});
	}

	return projectsByIdPromise;
};

export const getProjects = async () => {
	const projectsById = await getProjectsById();
	return [...projectsById.values()];
};

export const getProject = async (id) => {
	const projectsById = await getProjectsById();
	return projectsById.get(id);
};

export const getProjectImage = async (projectId, imageId) => {
	const project = await getProject(projectId);
	return project?.images?.find((image) => image.id === imageId);
};
