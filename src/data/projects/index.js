import { BUICK_EIGHT } from './buick-eight.js';
import { PORSCHE_BOXSTER_S_SEAT_PROJECT } from './porsche-boxster-s-seat-project.js';

export const PROJECTS = {
	[PORSCHE_BOXSTER_S_SEAT_PROJECT.id]: PORSCHE_BOXSTER_S_SEAT_PROJECT,
	[BUICK_EIGHT.id]: BUICK_EIGHT,
};

export const getProject = (id) => PROJECTS[id];
