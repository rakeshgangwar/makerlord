import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => ({ handle: locals.handle });
