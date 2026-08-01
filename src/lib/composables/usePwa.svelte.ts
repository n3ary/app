// PWA service worker registration + version-check handshake + update
// banner restoration. Extracted from +layout.svelte so the layout stops
// being a 90-line inline service worker setup.
//
// Two effects:
//
// 1. On mount, restore the update banner immediately. `updated.check()`
//    sets `updated.current` synchronously before its fetch resolves, so
//    consumers see the banner right away instead of waiting for the
//    first auto-poll (which fires up to 60 s after page load).
//
// 2. Register the service worker (prod only — in dev the SW would
//    interfere with Vite HMR and the rebuild-on-save loop). The SW
//    itself lives at src/service-worker.ts; @vite-pwa/sveltekit bundles
//    it and emits it at /service-worker.js (vite.config.ts config).
//
//    The SW deliberately does NOT call skipWaiting() or clients.claim()
//    unconditionally. Instead it waits for the app to send 'CHECK_VERSION'
//    with the app's __APP_VERSION__. The SW compares that against its
//    own baked __APP_VERSION__ and decides:
//      - versions match -> SW stays waiting, activates on next nav,
//        no reload, user sees nothing
//      - versions differ -> SW calls skipWaiting + clients.claim,
//        page reloads on the new shell
//
//    `updateViaCache: 'none'` tells the browser to bypass its own
//    HTTP cache for the SW file itself. Without this the browser
//    can serve a 24h-cached sw.js and a new deploy is invisible
//    for a day. With it, the browser re-fetches sw.js on every
//    page load; the SW's own cache strategy then decides what
//    happens.
//
//    On a version mismatch the SW asks the app to reload with a
//    `__sw_reload` query param. The SW's navigation handler uses
//    that param to bypass its runtime HTML cache for the post-update
//    reload (see service-worker.ts for why we do this instead of
//    skipWaiting + clients.claim() on first paint).

import { updated } from '$app/state';

export function usePwa(): void {
  // Restore the update banner immediately on mount, without waiting
  // for the first auto-poll (which fires up to 60 s after page load).
  // updated.check() sets updated.current synchronously before its fetch
  // resolves, so consumers see updated.current=true right away.
  $effect(() => {
    if (typeof window === 'undefined') return;
    void updated.check();
  });

  // PWA service worker registration. Prod only — in dev the SW
  // would interfere with Vite HMR and the rebuild-on-save loop.
  $effect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    if (!import.meta.env.PROD) {
      // Unregister any SW left over from a previous production
      // build. The previous SW source contains `__APP_VERSION__`
      // (Vite-replaced at build time) -- if the user opens the
      // dev server with a stale SW still registered, it tries to
      // evaluate the un-replaced source and throws
      // "Can't find variable: __APP_VERSION__".
      void navigator.serviceWorker.getRegistrations().then((regs) => {
        for (const r of regs) void r.unregister();
      });
      return;
    }
    // Defer registration so it doesn't compete with the initial
    // route hydration. The SW will pick up the page on the next
    // navigation if it installs faster than the first paint.
    const handle = window.setTimeout(() => {
      void navigator.serviceWorker.register('/service-worker.js', {
        scope: '/',
        type: 'module',
        updateViaCache: 'none',
      }).then(async (reg) => {
        // A new SW downloaded but is waiting (skipWaiting is NOT called
        // in the SW install handler — see service-worker.ts). Send our
        // app version to the SW and let it decide whether to activate.
        // If versions match the SW stays waiting and activates on the
        // next navigation. If they differ the SW calls skipWaiting +
        // clients.claim itself and the page reloads.
        if (!reg?.waiting) return;
        // SW responds with its own version and any reload instruction.
        // Use a one-shot message listener so we don't accumulate handlers.
        const channel = new MessageChannel();
        channel.port1.onmessage = async (e) => {
          const data = e.data;
          if (data?.type === 'VERSION_CHECKED') {
            console.info(`[pwa] sw version: ${data.swVersion}`);
          } else if (data?.type === 'RELOAD_APP') {
            // SW confirmed full deploy and wants us to reload. Add a
            // __sw_reload param so the OLD SW's navigation handler
            // bypasses its runtime HTML cache on this post-update reload
            // and fetches fresh HTML. See service-worker.ts for why
            // we do this instead of skipWaiting + clients.claim().
            console.info('[pwa] SW requested reload — reloading with cache-bust');
            void updated.check();
            // Navigate to the same page with a __sw_reload param so the
            // SW's navigation handler bypasses its runtime HTML cache.
            // location.reload() doesn't accept a URL arg — use URL reassignment.
            const reloadUrl = new URL(location.href);
            reloadUrl.searchParams.set('__sw_reload', String(data.timestamp));
            location.href = reloadUrl.href;
          }
        };
        reg.waiting!.postMessage(
          { type: 'CHECK_VERSION', appVersion: __APP_VERSION__ },
          [channel.port2],
        );
      }).catch((err) => {
        console.warn('[pwa] service worker registration failed', err);
      });
    }, 0);
    return () => window.clearTimeout(handle);
  });
}
