import { BUICK_EIGHT } from './buick-eight.js';

export const PROJECTS = {
	[BUICK_EIGHT.id]: BUICK_EIGHT,
};

export const getProject = (id) => PROJECTS[id];
