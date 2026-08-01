// Small one-shot effects that the root layout runs at startup. Pulled out
// of +layout.svelte so the layout reads as a composition root instead of
// a 500-line script. None of these need a return value — they install
// $effect callbacks that run for the lifetime of the layout component.
//
// Bundle:
//   1. Reflect the user's chosen theme on the root element so theme.css
//      overrides pick up immediately. Idempotent — setting the same value
//      is a no-op.
//   2. Auto-start the GPS watch on app start when the user previously
//      opted in. GPS is strictly opt-in (#110) — the in-page banner /
//      header dot are the only paths to flip `userPrefs.gpsOptedIn`. We
//      never prompt for permission without that flag, so a returning user
//      doesn't see the browser dialog every time they open the app.
//   3. Persist user prefs to localStorage on any change. $effect doesn't
//      run on the server during prerender, so the try/catch around the
//      setItem is the only safety against privacy-mode browsers (silent
//      fallback per AGENTS.md "no error handling for cases that can't
//      happen" — localStorage unavailable IS a real case).
//   4. Dev/debug console hooks. Lets the user pin a fake GPS location from
//      the browser console - useful in Safari where DevTools doesn't have
//      a built-in location override. Always installed (cheap, no harm in
//      production) so internal users can exercise different neighborhoods.
//
//   neary.setLocation(<lat>, <lon>)        // pin a mock GPS fix
//   neary.clearLocation()                  // resume real GPS

import { favoritesStore } from '$lib/stores/favoritesStore.svelte';
import { feedsStore } from '$lib/stores/feedsStore.svelte';
import { locationStore } from '$lib/stores/gps/locationStore.svelte';
import { reconciledVehiclesStore } from '$lib/stores/reconciledVehiclesStore.svelte';
import { refreshBus } from '$lib/stores/refreshBus.svelte';
import { stationsViewStore } from '$lib/stores/stationsViewStore.svelte';
import { statusBus } from '$lib/stores/statusBus.svelte';
import { userPrefs } from '$lib/stores/userPrefs.svelte';

export function useLayoutSideEffects(): void {
  // Theme: reflect on <html data-theme>.
  $effect(() => {
    document.documentElement.dataset.theme = userPrefs.theme;
  });

  // GPS: resume the watch on app start when the user previously opted in.
  $effect(() => {
    if (userPrefs.gpsOptedIn) locationStore.start();
  });

  // Persist user prefs on any change. Browser-only — $effect doesn't run
  // on the server during prerender.
  $effect(() => {
    const snap = userPrefs.snapshot();
    try {
      localStorage.setItem('neary-user-prefs', JSON.stringify(snap));
    } catch {
      // localStorage may be unavailable (privacy mode); silent fallback.
    }
  });

  // Dev/debug console hooks.
  $effect(() => {
    if (typeof window === 'undefined') return;
    (window as unknown as { neary?: unknown }).neary = {
      setLocation: (lat: number, lon: number, accuracy = 25) =>
        locationStore.setMockPosition(lat, lon, accuracy),
      clearLocation: () => locationStore.clearMockPosition(),
      stores: {
        locationStore, feedsStore, statusBus, userPrefs, refreshBus,
        reconciledVehiclesStore, favoritesStore, stationsViewStore,
      },
    };
  });
}
