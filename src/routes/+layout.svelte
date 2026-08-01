<!-- Root layout. Every route renders inside AppLayout (Header + StatusBar + scrollable main + BottomNavigation). Per-route title and refresh handler derive from the route path; health state comes from the stores the relevant routes populate. -->
<script lang="ts">
  import '$lib/styles/app.css';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { Heart, MapPin, Settings } from 'lucide-svelte';
  import { AppLayout, type HeaderHealth } from '$lib/ui';
  import { usePwa } from '$lib/composables/usePwa.svelte';
  import { useBackgroundSuspend } from '$lib/composables/useBackgroundSuspend.svelte';
  import { useLayoutSideEffects } from '$lib/composables/useLayoutSideEffects.svelte';
  import { useGtfsBind } from '$lib/composables/useGtfsBind.svelte';
  import { useRefreshFeedback } from '$lib/composables/useRefreshFeedback.svelte';
  import { getGtfsRepo, suspendGtfs } from '$lib/data/gtfs/repo';
  import { connectionStore } from '$lib/stores/connectionStore.svelte';
  import { feedsStore } from '$lib/stores/feedsStore.svelte';
  import { locationStore } from '$lib/stores/gps/locationStore.svelte';
  import { reconciledVehiclesStore } from '$lib/stores/reconciledVehiclesStore.svelte';
  import { userPrefs } from '$lib/stores/userPrefs.svelte';

  let { children } = $props();

  // ── Cross-cutting startup concerns ────────────────────────────────────
  // Each composable owns one concern and its WHY comments. The layout
  // is a composition root; the implementation lives in lib/composables/.

  // PWA service worker registration + version-check handshake +
  // update-banner restore.
  usePwa();

  // Small mount-once effects: theme reflection, GPS auto-start, user
  // prefs persistence to localStorage, dev/debug window.neary hooks.
  useLayoutSideEffects();

  // GTFS worker auto-bind + boot watchdog. Owns the bind effect and
  // its internal state (lastBoundFeedKey, bindEpoch, bindFailed).
  const gtfs = useGtfsBind();

  // Refresh button → StatusBar entry with timeout + completion watcher.
  const { startRefresh } = useRefreshFeedback();

  // Background suspend/resume: when the page is hidden / pagehide /
  // Page-Lifecycle freeze, release the GTFS worker's OPFS handles and
  // bump the bind epoch on resume so the feed re-binds.
  useBackgroundSuspend({
    onSuspend: () => {
      // Stop pages from querying a suspending worker, and force the
      // bind effect into a full re-bind on resume.
      feedsStore.boundFeedId = null;
      gtfs.clearLastBound();
      // Disarm the watchdog — the OS may freeze this tab for seconds
      // to minutes without firing any JS. A pre-freeze timer that fires
      // after thaw reloads a hidden tab and the user sees a flash of
      // the loading screen instead of their previous state.
      window.__nearyBoot?.disarm();
      void suspendGtfs().catch((e) => {
        console.warn('[pwa] GTFS suspend failed', e);
      });
    },
    onResume: () => {
      // No feed selected: the picker is a healthy state, nothing
      // re-binds — don't arm the watchdog (nothing is coming to
      // disarm it).
      if (userPrefs.feedId == null) return;
      // The re-bind is a boot-class operation again: re-arm the stall
      // watchdog so a wedged resume can't hang silently.
      window.__nearyBoot?.arm();
      gtfs.bumpEpoch();
    },
  });

  // Tab-swap reset: deliberately NOT wired. Returning from /favorites
  // or /settings back to / should restore the rider's previous
  // expansion + route filter rather than wipe them - that's the same
  // preservation semantics we already use for drilldown navigation
  // (/map/..., /schedule/...). Issue #203.

  // ── Nav + title ──────────────────────────────────────────────────────
  type NavValue = '/' | '/favorites' | '/settings';

  const NAV_ITEMS = [
    { value: '/', label: 'Stations', icon: stationsIcon },
    { value: '/favorites', label: 'Favorites', icon: favoritesIcon },
    { value: '/settings', label: 'Settings', icon: settingsIcon },
  ] as const;

  const TITLES: Record<NavValue, string> = {
    '/': 'Stations',
    '/favorites': 'Favorites',
    '/settings': 'Settings',
  };

  // Active tab = first nav prefix match. Drill-down routes (/schedule/...,
  // /map/...) currently inherit "Stations" — refined when those routes ship.
  const activeNav = $derived<NavValue>(
    (NAV_ITEMS.find((n) => page.url.pathname === n.value)?.value ?? '/') as NavValue,
  );

  const title = $derived(TITLES[activeNav]);

  // ── Header health dots ───────────────────────────────────────────────
  // Schedule and Live dots both reflect the single GTFS worker. Schedule
  // lights up when the worker has a feed bound; Live reflects the
  // worker's reconciliation broadcast (lastFetchMs / error). GPS and
  // Connection are real — see locationStore + connectionStore. The GPS
  // watch starts in useLayoutSideEffects when the user has previously
  // opted in (#110); otherwise the Stations view drives the opt-in flow.
  const health: HeaderHealth = $derived({
    gps: {
      state: locationStore.freshness,
      tooltip: locationStore.tooltip,
    },
    connection: {
      state: connectionStore.online ? 'ok' : 'error',
      tooltip: connectionStore.online ? 'Online' : 'Offline',
    },
    schedule: {
      state: userPrefs.feedId == null ? 'idle' : 'ok',
      tooltip: userPrefs.feedId == null ? 'No feed selected' : 'Schedule loaded',
    },
    live: (() => {
      // Health of the GTFS-RT poller.
      //   no feed bound yet            -> idle
      //   error and never succeeded    -> error
      //   last successful fetch < 30s  -> ok
      //   last successful fetch < 2min -> stale
      //   older                        -> error
      if (reconciledVehiclesStore.error && reconciledVehiclesStore.lastFetchMs == null) {
        return { state: 'error', tooltip: `Live feed error: ${reconciledVehiclesStore.error}` };
      }
      if (reconciledVehiclesStore.lastFetchMs == null) {
        return { state: 'idle', tooltip: 'Live feed not started' };
      }
      const age = Date.now() - reconciledVehiclesStore.lastFetchMs;
      // "live vehicles seen" = matched (reconciled) + orphan live obs.
      // Scheduled-only rows in the snapshot aren't "live".
      const stats = reconciledVehiclesStore.stats;
      const count = stats ? stats.matched + stats.live : 0;
      if (age < 30_000) return { state: 'ok', tooltip: `${count} live vehicles · just now` };
      if (age < 2 * 60_000) return { state: 'stale', tooltip: `${count} live vehicles · ${Math.round(age / 1000)}s ago` };
      return { state: 'error', tooltip: `Live feed last fetched ${Math.round(age / 60_000)} min ago` };
    })(),
  });
</script>

{#snippet stationsIcon()}<MapPin size={20} />{/snippet}
{#snippet favoritesIcon()}<Heart size={20} />{/snippet}
{#snippet settingsIcon()}<Settings size={20} />{/snippet}

<AppLayout
  {title}
  {health}
  navItems={NAV_ITEMS}
  {activeNav}
  onnav={(to) => goto(to)}
  onrefresh={startRefresh}
  // Search icon is the global entry point to the station/route picker
  // overlay; available on every page that has a bound feed.
  showSearch={userPrefs.feedId != null}
>
  {@render children()}
</AppLayout>
