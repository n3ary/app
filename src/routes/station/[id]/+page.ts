// `/station/[id]` is a dynamic route whose IDs come from runtime GPS / user
// taps — there are no literal hrefs in the prerendered pages for the
// crawler to resolve. Mark it non-prerenderable; SvelteKit's static
// adapter `fallback: 'index.html'` (svelte.config.js) serves it as a SPA
// route, which hydrates and runs the page component normally.
export const prerender = false;
