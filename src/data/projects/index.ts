import type { ImageMetadata } from 'astro';
import { getCollection, type CollectionEntry } from 'astro:content';
import type { ProjectData, ProjectImage } from '../../types/site';

type ProjectEntry = CollectionEntry<'projects'>;
type ProjectImageEntry = ProjectEntry['data']['images'][number];

const PROJECT_IMAGE_MODULES = import.meta.glob<ImageMetadata>(
  '../../assets/images/projects/**/*.{avif,gif,jpeg,jpg,png,webp}',
  {
    eager: true,
    import: 'default',
  },
);

const PROJECT_IMAGE_PREFIX = '../../assets/images/';

const PROJECT_IMAGE_ASSETS = new Map<string, ImageMetadata>(
  Object.entries(PROJECT_IMAGE_MODULES).map(([assetPath, asset]) => [
    assetPath.slice(PROJECT_IMAGE_PREFIX.length),
    asset,
  ]),
);

const hydrateProjectImage = (image: ProjectImageEntry, projectId: string): ProjectImage => {
  const asset = PROJECT_IMAGE_ASSETS.get(image.assetPath);

  if (!asset) {
    throw new Error(`Missing project asset for ${projectId}: ${image.assetPath}`);
  }

  return {
    ...image,
    asset,
  };
};

const hydrateProject = (entry: ProjectEntry): ProjectData => ({
  ...entry.data,
  id: entry.data.id ?? entry.id,
  images: (entry.data.images ?? []).map((image) => hydrateProjectImage(image, entry.id)),
});

let projectsByIdPromise: Promise<Map<string, ProjectData>> | undefined;

const getProjectsById = async () => {
  if (!projectsByIdPromise) {
    projectsByIdPromise = getCollection('projects').then((entries) => {
      const projects = entries.map(hydrateProject);
      return new Map(projects.map((project) => [project.id, project]));
    });
  }

  return projectsByIdPromise;
};

export const getProjects = async (): Promise<ProjectData[]> => {
  const projectsById = await getProjectsById();
  return [...projectsById.values()];
};

export const getProject = async (id: string): Promise<ProjectData | undefined> => {
  const projectsById = await getProjectsById();
  return projectsById.get(id);
};

export const getProjectImage = async (
  projectId: string,
  imageId: string,
): Promise<ProjectImage | undefined> => {
  const project = await getProject(projectId);
  return project?.images?.find((image) => image.id === imageId);
};
