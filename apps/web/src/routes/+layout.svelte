<!--
  Root layout — every route renders inside AppLayout (Header + StatusBar +
  scrollable main + BottomNavigation). Per-route title and refresh handler
  are derived from the route path; agency / health state come from stores
  that the relevant routes populate.
-->
<script lang="ts">
  import '$lib/styles/app.css';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { Heart, Home, MapPin, Settings } from 'lucide-svelte';
  import { AppLayout, type HeaderHealth } from '$lib/ui';
  import { userPrefs } from '$lib/stores/userPrefs.svelte';

  let { children } = $props();

  // Persist user prefs on any change. Browser-only — $effect doesn't run on
  // the server during prerender.
  $effect(() => {
    const snap = userPrefs.snapshot();
    try {
      localStorage.setItem('neary-user-prefs', JSON.stringify(snap));
    } catch {
      // localStorage may be unavailable (privacy mode); silent fallback.
    }
  });

  // Reflect the user's chosen theme on the root element so theme.css overrides
  // pick up immediately. Idempotent — setting the same value is a no-op.
  $effect(() => {
    document.documentElement.dataset.theme = userPrefs.theme;
  });

  type NavValue = '/' | '/favorites' | '/planner' | '/settings';

  const NAV_ITEMS = [
    { value: '/', label: 'Stations', icon: stationsIcon },
    { value: '/favorites', label: 'Favorites', icon: favoritesIcon },
    { value: '/planner', label: 'Planner', icon: plannerIcon },
    { value: '/settings', label: 'Settings', icon: settingsIcon },
  ] as const;

  const TITLES: Record<NavValue, string> = {
    '/': 'Stations',
    '/favorites': 'Favorites',
    '/planner': 'Planner',
    '/settings': 'Settings',
  };

  // Active tab = first nav prefix match. Drill-down routes (/schedule/...,
  // /map/...) currently inherit "Stations" — refined when those routes ship.
  const activeNav = $derived<NavValue>(
    (NAV_ITEMS.find((n) => page.url.pathname === n.value)?.value ?? '/') as NavValue,
  );

  const title = $derived(TITLES[activeNav]);

  // Phase 3 ships placeholder health states. Real wiring lands in Phase 4
  // (Schedule), Phase 5 (Live), and the GPS / connection listeners.
  const health: HeaderHealth = $derived({
    gps: { state: 'idle', tooltip: 'GPS not requested yet' },
    connection: {
      state: typeof navigator !== 'undefined' && navigator.onLine === false ? 'error' : 'idle',
      tooltip: 'Network',
    },
    schedule: {
      state: userPrefs.agencyId == null ? 'idle' : 'ok',
      tooltip: userPrefs.agencyId == null ? 'No agency selected' : 'Schedule loaded',
    },
    live: {
      state: userPrefs.apiKey ? 'idle' : 'idle',
      tooltip: userPrefs.apiKey
        ? 'API key present — live worker will start when implemented'
        : 'Live tracking disabled (add API key in Settings → Advanced)',
    },
  });
</script>

{#snippet stationsIcon()}<MapPin size={20} />{/snippet}
{#snippet favoritesIcon()}<Heart size={20} />{/snippet}
{#snippet plannerIcon()}<Home size={20} />{/snippet}
{#snippet settingsIcon()}<Settings size={20} />{/snippet}

<AppLayout
  {title}
  {health}
  navItems={NAV_ITEMS}
  {activeNav}
  onnav={(to) => goto(to)}
>
  {@render children()}
</AppLayout>

