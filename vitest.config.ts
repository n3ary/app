import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [sveltekit()],
  // Resolve the CLIENT runtime of Svelte, not the server one. Without
  // this, `$state` / `$effect` compile to inert placeholders and a test
  // that exercises reactive wiring would silently pass without the
  // reactivity ever running.
  resolve: {
    conditions: ['browser'],
  },
  test: {
    include: ['src/**/*.{test,spec}.{ts,js}'],
    exclude: ['node_modules/**', 'dist/**'],
  },
});
