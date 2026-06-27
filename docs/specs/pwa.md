# PWA

Reasoning behind the PWA setup. Implementation:
[svelte.config.js](../../svelte.config.js), [vite.config.ts](../../vite.config.ts),
[netlify.toml](../../netlify.toml), [src/routes/+layout.svelte](../../src/routes/+layout.svelte).

## Goals

- Installable on iOS Safari and Android Chrome.
- Updates propagate without forcing the user to clear caches.
- Safe-area aware on iPhone X+ (notch, home indicator).

## Update propagation

The build emits `build/_app/version.json` containing a unique
build identifier (git short SHA, falling back to `t<timestamp>` when the
build runs outside a git checkout). The SvelteKit client polls this file
on a fixed interval and reloads when the string changes.

### Configuration

In [svelte.config.js](../../svelte.config.js):

```js
kit: {
  version: {
    name: buildVersion(),       // git short SHA (e.g. "0b75986") or "t<ms>"
    pollInterval: 60 * 1000,    // 60 s
  },
}
```

Why 60 s: long enough to be invisible in network panels and battery use,
short enough that a returning user catches a fresh deploy within a few
minutes. Lower values don't help — Netlify's edge cache TTL on
`version.json` is bounded anyway.

### Reload trigger

[src/routes/+layout.svelte](../../src/routes/+layout.svelte) subscribes
to `updated.current` from `$app/state`. When the poll detects a new
version, the layout reloads the page.

### Cache headers

[netlify.toml](../../netlify.toml) explicitly excludes `version.json`,
the service worker, and `index.html` from CDN caching. Without these
overrides the version poll would lag the CDN TTL and the update story
silently breaks.

## iOS safe-area

`AppLayout` applies `env(safe-area-inset-*)` so the header and bottom
navigation don't get cut by the notch / home indicator when launched
from the home screen.

## What we deliberately don't do

- No custom install prompt UI — rely on the browser's native install affordance.
- No background sync — re-fetch on focus instead.
- No push notifications — out of scope.

## Manifest

[static/manifest.json](../../static/manifest.json) is the source. Update
icons + name there; the PWA plugin picks it up at build time.
