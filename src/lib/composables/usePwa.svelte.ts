// PWA service worker registration + version-check handshake. Extracted from
// +layout.svelte so the layout stops being a 90-line inline service worker
// setup.
//
// Two effects:
//
// 1. On mount, check for a new deploy immediately. `updated.check()` fetches
//    `_app/version.json` and flips `updated.current` when the deployed
//    version differs from the one the app booted with, so consumers see the
//    update right away instead of waiting for the first auto-poll (which
//    fires up to 60 s after page load). Since SvelteKit 3 the same check
//    also runs when the tab regains focus or becomes visible.
//
// 2. Register the service worker (prod only — in dev the SW would
//    interfere with Vite HMR and the rebuild-on-save loop). The SW
//    itself lives at src/service-worker/index.ts; @vite-pwa/sveltekit bundles
//    it and emits it at /service-worker.js (vite.config.ts config).
//
//    The SW deliberately does NOT call skipWaiting() or clients.claim()
//    unconditionally. Instead it waits for the app to send 'CHECK_VERSION'
//    with the app's __APP_VERSION__. The SW compares that against its
//    own baked __APP_VERSION__ and decides:
//      - versions match -> SW stays waiting, activates on next nav,
//        no reload, user sees nothing
//      - versions differ -> SW asks the app to reload with a cache-bust,
//        the page reloads on the new shell
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
//    reload (see src/service-worker/index.ts for why we do this instead of
//    skipWaiting + clients.claim() on first paint).
//
//    The handshake has to be triggered from the SW's lifecycle events, not
//    from a one-shot check right after register() resolves -- see
//    `registerServiceWorker` below for why.

import { updated } from '$app/state';

/** Set once the app has asked for a reload, so the RELOAD_APP reply and
 *  the controllerchange event can't both trigger a second navigation. */
let reloadRequested = false;

/**
 * Reload the page onto the newly deployed shell.
 *
 * The `__sw_reload` param is what makes this work: the service worker's
 * navigation handler sees it and fetches the HTML straight from the
 * network instead of serving the stale copy from its runtime HTML cache.
 * Without the param a plain reload hands back the OLD shell (the
 * navigation handler is stale-while-revalidate), so the app would keep
 * running the old bundle and the "update available" state would come
 * straight back.
 *
 * Exported so the settings page can offer the same action to a user who
 * wants to update on demand.
 */
export function requestAppReload(): void {
  if (reloadRequested) return;
  reloadRequested = true;
  const url = new URL(location.href);
  url.searchParams.set('__sw_reload', String(Date.now()));
  location.href = url.href;
}

/** Handle a message from a service worker. */
function handleSwMessage(data: { type?: string; swVersion?: string } | null): void {
  if (data?.type === 'VERSION_CHECKED') {
    console.info(`[pwa] sw version: ${data.swVersion}`);
  } else if (data?.type === 'RELOAD_APP') {
    console.info('[pwa] SW requested reload - reloading with cache-bust');
    requestAppReload();
  }
}

/**
 * Ask one service worker to compare its baked version with the app's.
 *
 * Each handshake needs its own MessageChannel: port2 is transferred to the
 * worker on postMessage and cannot be transferred twice, so a shared
 * channel would throw on the second handshake.
 */
function askSwVersion(worker: ServiceWorker | null): void {
  if (!worker) return;
  const channel = new MessageChannel();
  channel.port1.onmessage = (e) => handleSwMessage(e.data);
  worker.postMessage({ type: 'CHECK_VERSION', appVersion: __APP_VERSION__ }, [channel.port2]);
}

export function usePwa(): void {
  // Check for a new deploy immediately on mount, without waiting for the
  // first auto-poll (which fires up to 60 s after page load).
  // updated.check() flips updated.current once its `_app/version.json`
  // fetch resolves and the deployed version differs from the booted one.
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
      void registerServiceWorker();
    }, 0);
    return () => window.clearTimeout(handle);
  });
}

/**
 * Register the service worker and wire the version handshake to the
 * worker's lifecycle events.
 *
 * WHY NOT JUST `if (reg.waiting)`: `register()` resolves as soon as the
 * registration exists. The browser's update algorithm (fetch the script,
 * compare bytes, install the new worker) is kicked off by that call but
 * runs in the background, and `registration.waiting` is only set once the
 * new worker has reached the `installed` state. So reading `reg.waiting`
 * straight after `register()` resolves is a race, and it usually loses --
 * `reg.waiting` is still null. The new worker then installs, parks
 * itself in `waiting` (the SW deliberately does not call skipWaiting),
 * and NOTHING ever asks it to compare versions: the app shows
 * "update available" and the app never updates itself, no matter how many
 * times the user restarts it.
 *
 * So the handshake is driven off the events that can produce a waiting
 * worker: one parked by an earlier visit, the one installing right now,
 * and any the browser finds later.
 */
async function registerServiceWorker(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.register('/service-worker.js', {
      scope: '/',
      type: 'module',
      updateViaCache: 'none',
    });

    // Ask each distinct waiting worker exactly once. Two events can fire
    // for the same worker (the `updatefound` listener and the direct
    // `reg.installing` check), and the SW would answer both -- which
    // would mean two reload requests.
    let asked: ServiceWorker | null = null;
    const askWaiting = (): void => {
      const worker = reg.waiting;
      if (!worker || worker === asked) return;
      asked = worker;
      askSwVersion(worker);
    };

    // A worker parked by an earlier visit (e.g. the user closed the app
    // before the handshake could run).
    askWaiting();

    // A worker installing right now.
    const current = reg.installing;
    if (current) {
      current.addEventListener('statechange', () => {
        if (current.state === 'installed') askWaiting();
      });
    }

    // Any worker the browser finds from now on.
    reg.addEventListener('updatefound', () => {
      const installing = reg.installing;
      if (!installing) return;
      installing.addEventListener('statechange', () => {
        if (installing.state === 'installed') askWaiting();
      });
    });

    // Safety net: when a waiting worker finally activates it takes over
    // as this page's controller. The page is still running the old
    // bundle at that point, so reload onto the new shell. (The SW does
    // not call clients.claim(), so this only fires on a real update.)
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      console.info('[pwa] controller changed - reloading onto the new shell');
      requestAppReload();
    });
  } catch (err) {
    console.warn('[pwa] service worker registration failed', err);
  }
}
