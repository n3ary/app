# PWA

Reasoning behind the PWA setup. Implementation:
[svelte.config.js](../../svelte.config.js), [vite.config.ts](../../vite.config.ts),
[netlify.toml](../../netlify.toml).

## Goals

- Installable on iOS Safari and Android Chrome.
- Updates propagate without forcing the user to clear caches.
- Safe-area aware on iPhone X+ (notch, home indicator).

## Update propagation

SvelteKit emits a `_app/version.json` on every build. The client polls it
periodically and reloads when the version changes.

**Netlify cache headers** must NOT cache `version.json`, the service
worker, or `index.html`; otherwise updates appear delayed by the CDN TTL.
The headers in [netlify.toml](../../netlify.toml) enforce this.

## iOS safe-area

`AppLayout` applies `env(safe-area-inset-*)` so the header and bottom
navigation don't get cut by the notch / home indicator when launched
from the home screen.

## What we deliberately don't do

- No custom install prompt UI — rely on the browser's native install affordance.
- No background sync — we re-fetch on focus instead.
- No push notifications — out of scope.

## Manifest

`static/manifest.json` is the source. Update icons + name there; the
PWA plugin picks it up at build time.
