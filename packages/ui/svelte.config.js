import adapter from '@sveltejs/adapter-node';

/** @type {import('@sveltejs/kit').Config} */
export default {
  kit: {
    adapter: adapter(),
    version: { pollInterval: 60_000 },
    files: { lib: 'src/lib', routes: 'src/routes', appTemplate: 'src/app.html' },
  },
};
