import adapter from '@sveltejs/adapter-node';

/** @type {import('@sveltejs/kit').Config} */
export default {
  kit: {
    adapter: adapter(),
    files: { lib: 'src/lib', routes: 'src/routes', appTemplate: 'src/app.html' },
  },
};
