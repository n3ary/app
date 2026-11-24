# PWA

Reasoning behind the PWA setup. Implementation:
[vite.config.ts](../../vite.config.ts),
[src/service-worker/index.ts](../../src/service-worker/index.ts),
[src/lib/composables/usePwa.svelte.ts](../../src/lib/composables/usePwa.svelte.ts),
[src/lib/sw/handshake.ts](../../src/lib/sw/handshake.ts),
[src/routes/+layout.svelte](../../src/routes/+layout.svelte),
[static/manifest.json](../../static/manifest.json).

## Goals

- Installable on iOS Safari and Android Chrome.
- Updates propagate without forcing the user to clear caches.
- The shell (HTML, JS, CSS) loads from cache after first online visit,
  including on the home-screen PWA after a deploy.
- Schedules from feeds.json + a previously downloaded sqlite stay
  accessible on a cold-start offline open.
- Safe-area aware on iPhone X+ (notch, home indicator).

## Single version source

`package.json#version` is the single source of truth for "what build is
this". It's:

- Bumped on every PR by the auto-version GitHub Action — see
  [ci-and-versioning.md](ci-and-versioning.md).
- Read at build time in [vite.config.ts](../../vite.config.ts) and passed
  to SvelteKit as `version.name`.
- Emitted into `build/_app/version.json` (e.g. `{"version":"1.5.20"}`).
- Read by [src/service-worker/index.ts](../../src/service-worker/index.ts) via the
  Vite `define` (`__APP_VERSION__`) and used to namespace the
  precache bucket so old shells can be dropped on activate.
- Available to UI code via `import { version } from '$app/env'` —
  use it anywhere a version string needs to be displayed.

> [!IMPORTANT]
> One version everywhere. Don't introduce a separate git-SHA, build
> timestamp, or PWA-only version string. The auto-bump action guarantees
> uniqueness per shipped bundle.

## Update propagation

Two layers, both keyed on the same `package.json` version. The service
worker applies the update; SvelteKit's polling only *notices* it.

### Service worker handshake (primary)

The SW in [src/service-worker/index.ts](../../src/service-worker/index.ts) precaches
the app shell + manifest in a bucket named `precache-v<version>`.
On `activate`, every other `precache-v*` bucket is dropped, so an
outdated shell never gets served from cache.

**The SW deliberately does NOT call `skipWaiting()` and does NOT call
`clients.claim()`.** That is the whole design, not an oversight:

- `skipWaiting` + `clients.claim` would activate the new worker under
  the running page. The page would then reload through the *old*
  worker's navigation handler, which serves HTML from the runtime HTML
  cache — so the user lands back on the OLD shell and the
  "update available" state comes straight back. That was the original
  "update banner insists after updating" bug.
- Instead, the app and the SW negotiate. The app sends `CHECK_VERSION`
  with its `__APP_VERSION__`; the SW compares it against its own baked
  version, confirms the deploy is complete by re-reading
  `/_app/version.json`, and replies `RELOAD_APP`. The app then
  navigates with `?__sw_reload=<timestamp>`.
- The `__sw_reload` param is what makes the reload bite: the (still
  active, old) SW's navigation handler sees the param, strips it, and
  fetches the HTML straight from the network instead of serving the
  cached copy. The fresh shell is then written back into the runtime
  HTML cache.

Three details make the handshake actually work. Each one was a real,
separately-shipped bug:

1. **The handshake is event-driven, not a one-shot check.**
   `registration.waiting` is only set once a new worker reaches the
   `installed` state, so reading it right after `register()` resolves is
   a race that usually loses — the worker is still installing and
   `waiting` is null. The new worker then parks in `waiting` and
   nothing ever asks it anything, so the app detects the update and
   never applies it, no matter how often the user restarts it. The app
   therefore asks each *distinct* waiting worker exactly once, driven
   from `updatefound`, from the installing worker's `statechange`, and
   once for a worker already parked by an earlier visit.
2. **The reply goes back on the transferred port.** The app sends
   `CHECK_VERSION` with a `MessageChannel` and listens on
   `port1.onmessage`. Replying via `event.source.postMessage()`
   delivers to the page's `navigator.serviceWorker` `message` event —
   a channel the app never reads — so `RELOAD_APP` never arrives. The
   reply goes out on `event.ports[0]`, with `event.source` only as a
   fallback ([handshake.ts](../../src/lib/sw/handshake.ts)).
3. **There is an affordance.** Detection is not an update. Settings
   shows an **Update now** button next to *Check for updates* whenever
   an update is pending; it calls the same `requestAppReload()` the
   handshake uses.

A `controllerchange` listener is the safety net: when a waiting worker
finally activates it takes over as the page's controller, and the page
reloads onto the new shell.

### SvelteKit version polling (secondary)

Belt-and-suspenders. [src/routes/+layout.svelte](../../src/routes/+layout.svelte)
calls `usePwa()`, which runs `updated.check()` on mount so a fresh
deploy is noticed immediately instead of on the first auto-poll tick.
SvelteKit's client polls `/_app/version.json` every 60 s and flips
`updated.current` to true on a mismatch. Since SvelteKit 3 it also
re-checks when the tab regains focus or becomes visible, so the update
is noticed on the way back into the app rather than only on the poll
tick.

`updated.current` is consumed by **Settings only** — the *Check for
updates* button, the *Update now* button, and the result line under the
version. There is no global banner and the app never reloads a tab the
rider is reading on its own; applying the update is always either the
service-worker handshake or an explicit tap. That is deliberate: the
board is often the thing the user is mid-read on.

> [!NOTE]
> There is no re-nag suppression. The spec used to claim a 30-minute
> quiet window backed by `sessionStorage`; no such code exists and none
> is needed, because the "update available" state is only surfaced in
> Settings and the handshake applies the update on its own.

One guard keeps the SW honest:

- **`waitUntil` for background refreshes.** Every piece of SW
  background work (the runtime-HTML revalidate in particular) is
  handed to `FetchEvent.waitUntil`. Without it the browser can kill
  the SW the instant `respondWith` settles — iOS does this
  aggressively — the refresh dies mid-flight, the cached shell stays
  stale forever, and the update state reappears after every reload no
  matter how often the user updates.

```js
// vite.config.ts -- the sveltekit() plugin options
{
  version: {
    name: pkg.version,         // package.json version
    pollInterval: 60 * 1000,   // 60 s
  },
}
```

Why 60 s: long enough to be invisible in network panels and battery use,
short enough that a returning user catches a fresh deploy within a few
minutes. SvelteKit 3 defaults this to one hour, so the 60 s bound is
pinned explicitly rather than inherited.

## Service worker details

[src/service-worker/index.ts](../../src/service-worker/index.ts) is hand-rolled (not
workbox). `@vite-pwa/sveltekit` is used only as the build pipeline: its
`buildSW` strategy injects the precache manifest (`self.__WB_MANIFEST`)
into our source and emits the bundle at `/service-worker.js`. Every
runtime strategy below is ours, in [handlers.ts](../../src/lib/sw/handlers.ts).

### Precache (build-time)

- App shell HTML, the SvelteKit-emitted JS/CSS chunks, the webmanifest,
  and `sqlite3.wasm` (the GTFS worker can't init without it offline).
  The SPA shell `/` isn't in the injected manifest (the glob can't see
  prerendered output), so the SW caches it explicitly at install time;
  `_redirects` rewrites every route to it, which makes any offline
  navigation bootable from the precache alone.
- Cross-origin assets (brand icons at `branding.n3ary.com`) are NOT
  precached — they're served from the brand CDN, which has its own
  cache headers.
- The sqlite_gz and the live GTFS-RT feed
  (`gtfs-rt.n3ary.com/rt/*`) are NOT precached — the OPFS bootstrap
  and the live pipeline handle their own offline behavior (see
  [data-lifecycle.md](multi-feed-data-lifecycle.md)).

### Runtime cache: OSM tiles

- `{s}.tile.openstreetmap.org` tiles are CacheFirst in a fixed-name
  bucket (`runtime-osm-tiles-v1`) that survives SW updates, capped at
  1200 entries (~25 MB, FIFO trim). Cached tiles revalidate in the
  background after 30 days; failures are never cached.
- After a feed binds, `lib/map/offlineTiles.ts` prefetches the feed's
  bbox at idle time — budget-capped at 600 tiles, picking the highest
  zooms z10–z14 that fit (city feeds get the full range; regional
  bboxes get coarse zooms only). Higher zooms are cached lazily as the
  user browses. The prefetch runs at most once per 24 h per feed, is
  skipped on Save-Data / 2g / offline, and re-arms on every `online`
  event. Budget + throttling keep this inside the OSM Tile Usage
  Policy; Leaflet loads tiles in CORS mode so the SW can stamp
  put-time and share entries with the prefetch.

### Runtime cache: feeds.json only

- `https://gtfs.n3ary.com/feeds.json` is served from the SW runtime
  cache when present (revalidated in the background); on a cache miss
  the SW fetches in the foreground and caches the response. The app
  also persists the last fetched registry in localStorage
  (`neary-feeds-registry`) and falls back to it when the fetch fails,
  so a cold-start offline open can still bind a feed whose sqlite is
  already in OPFS.
- /api/rt/* was a same-origin Pages Function in the old
  architecture; now removed. The app calls
  `gtfs-rt.n3ary.com/rt/<feed>/vehicle_positions` directly from
  `feeds.json.realtime.vehicle_positions`. The new proxy host
  is explicitly NOT cached at the SW
  layer. The live pipeline (see [live-pipeline.md](live-data-pipeline.md))
  already keeps the last good vehicle snapshot when the network
  fails, and the OPFS bootstrap already short-circuits when the
  sqlite is local. Caching at the SW would serve stale vehicles or
  double-cache large files; we don't.

### Navigation: stale-while-revalidate, not network-first

`networkFirstNavigation` in [handlers.ts](../../src/lib/sw/handlers.ts)
serves the cached HTML **first** and refreshes it in the background
under `waitUntil`, so a flaky connection never produces a blank screen.
It falls back to the precache bucket (not just the runtime cache)
because the runtime cache is only populated after the first online
visit. The `__sw_reload` param is the one path that bypasses the cache
and refetches from the network.

### Activation

- `install` → precache, and **stop**. No `skipWaiting`: the new worker
  parks in `waiting` until the app's handshake releases it.
- `activate` → delete any other `precache-v*` cache (and any stale
  `runtime-html-v*` bucket). No `clients.claim()`: the page keeps its
  own controller until it reloads onto the new shell.
- The old shell is never served from a pruned precache because the
  precache lookup is keyed on the manifest baked into the *active* SW.

### Registration

Registered in [src/routes/+layout.svelte](../../src/routes/+layout.svelte)
on the client only, in production only. Dev mode skips registration
so Vite HMR isn't fighting the SW cache.

## Boot-stall recovery

The failure class this guards against: a wedged start that never
reaches first content — a stalled SW fetch (browsers apply no timeout
to `respondWith`), a missing chunk after cache eviction, a frozen
zombie session holding the OPFS access handles, a hung socket. Every
one of these used to present as a permanent black (pre-paint) or
white (post-paint, unstyled) screen that only a full app kill
cleared. Four mechanisms, each covering a different wedge:

- **Watchdog** (inline script in
  [src/app.html](../../src/app.html), decision logic in
  [src/lib/sw/bootWatchdog.ts](../../src/lib/sw/bootWatchdog.ts)).
  Inline and dependency-free so it runs even when the bundle itself
  fails to load. The layout reports a healthy state
  (`window.__nearyBoot.done()`) once nothing can hang silently — feed
  bound, feed picker shown, or a bind error surfaced — and beats on
  download progress. Otherwise, after 15 s the watchdog auto-reloads,
  bounded to 2 reloads per 10 min (crash-loop budget), then shows a
  blocking overlay with a manual Reload. It re-arms on every
  background-resume re-bind. The stall window widens to 60 s while a
  feed bind is in flight, so an honestly-retrying seed download on
  patchy signal never triggers a progress-destroying reload (beats
  fire per downloaded chunk; the worst honest beat gap is the 20 s
  per-read stall bound plus retry backoff).
- **Background suspend / resume** (+layout ↔
  `suspendForBackground()` in
  [bootstrap.ts](../../src/lib/workers/gtfs/bootstrap.ts)). On
  `visibilitychange`→hidden / `pagehide` / the Page Lifecycle
  `freeze` event, the worker closes the DB and `pauseVfs()`-releases
  the SAH pool's OPFS sync-access handles — Android *freezes*
  standalone PWAs within seconds of backgrounding rather than
  killing them, and a frozen holder blocks every future bootstrap
  until process death. (`freeze` is Chromium-only; on iOS the
  `visibilitychange`/`pagehide` pair covers the same transition, and
  the suspend message is processed on thaw ahead of the resume
  re-bind if the process was frozen first.) Resume unpauses and
  re-opens the already-seeded OPFS file: pool re-acquire + DB open,
  no re-download.
- **SAH acquisition timeout** (bootstrap.ts). A contested
  `createSyncAccessHandle` stays pending forever; both the initial
  pool install and the resume-side `unpauseVfs()` are bounded to
  10 s, after which the bootstrap rejects into the existing
  user-readable error instead of hanging.
- **Precache fallback fetch timeout**
  ([handlers.ts](../../src/lib/sw/handlers.ts)). The
  `serveFromPrecache` network fall-through carries a 15 s
  `AbortSignal`, so a wedged socket fails the request (and lets the
  watchdog reload) instead of hanging the page forever.

- **Seed-download resilience** (bootstrap.ts). The whole download —
  not just the connect — retries on failure (5 attempts, backoff),
  and every stream read is bounded to 20 s, so a socket that dies
  mid-body on patchy signal fails one attempt and retries on a fresh
  connection instead of hanging to the 10-minute overall timeout.

## Offline behavior

What's offline-safe and what isn't:

| Scenario | Outcome |
| --- | --- |
| User has OPFS sqlite for a feed, opens app offline | **Works.** SW precache serves the shell, OPFS read returns the schedule (the previous snapshot when the registry has advanced past the downloaded sqlite). Live data shows the last good snapshot. StatusBar shows "Refresh failed." |
| User has feeds.json cached, never picked a feed, opens offline | **Partial.** Shell + feed picker load, but no sqlite is downloaded. They can't pick a feed. |
| Map view, offline | **Works** for the feed's bbox at prefetched zooms and for any tile the user previously viewed; uncached areas show the gray grid. Route shapes, stops and vehicles are local data and always render. |
| User has never visited, opens offline | **Fails.** No shell, no data, no fallback. |
| Saved PWA user, post-deploy, opens online | **Works.** The SW parks in `waiting`, the handshake compares versions and asks the page to reload with `__sw_reload`, and the next paint uses the new shell. |
| Saved PWA user, post-deploy, opens offline (new shell not yet precached) | **Degraded but recoverable.** Old shell loads, points at asset paths the network can't serve. The boot watchdog auto-reloads twice, then shows a blocking Reload overlay instead of a dead white screen; once reconnected the next open repairs itself. |

## Cache headers

[static/_headers](../../static/_headers) explicitly excludes `version.json`,
the service worker, and `index.html` from CDN caching. Without these
overrides the version poll would lag the CDN TTL and the update story
silently breaks.

The same file carries the security headers (CSP, HSTS, nosniff, …) for
the whole site. The deploy workflow **appends** the service-worker
no-cache rule to it rather than overwriting it — writing the file with
`>` used to drop the CSP and every per-path cache rule from the live
site.

## iOS safe-area

`AppLayout` applies `env(safe-area-inset-*)` so the header and bottom
navigation don't get cut by the notch / home indicator when launched
from the home screen.

## What we deliberately don't do

- No custom install prompt UI — rely on the browser's native install affordance.
- No background sync — re-fetch on focus instead.
- No push notifications — out of scope.
- No SW-level cache for live data
  (`gtfs-rt.n3ary.com/rt/*`). Caching would serve stale vehicles,
  which is wrong.
- No SW-level cache for the sqlite. The OPFS layer is the durable
  store; the SW doesn't need to duplicate it.

## Manifest

[static/manifest.json](../../static/manifest.json) is the source. Update
icons + name there; the PWA plugin picks it up at build time.

## Test

Two Playwright suites, run against the production build:

- [tests/pwa.spec.ts](../../tests/pwa.spec.ts) — smoke test. Asserts the
  SW is generated, registers, and creates the versioned precache bucket.
- [tests/pwa-update.spec.ts](../../tests/pwa-update.spec.ts) — the update
  regression test. Serves a build over a test-owned static server,
  swaps in a slow-double service worker that never calls
  `skipWaiting`, and asserts the page navigates with `__sw_reload=`
  after the handshake. It fails on the pre-fix code (the worker parks
  in `waiting` and the URL never changes).

Run locally with `pnpm exec playwright test`.
