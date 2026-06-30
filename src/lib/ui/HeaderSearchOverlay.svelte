<!--
  HeaderSearchOverlay — full-screen station search dialog opened from the
  header icon. Self-contained: reads the active feed center + the GPS
  position directly so the host (Header) only owns open/close state.

  Empty input → 25 nearest stops to the current anchor (GPS if available,
  otherwise the feed's published center). Non-empty input → diacritic-
  insensitive substring match on stop_name, sorted by distance from the
  same anchor. Debounced 150 ms either way.

  Backdrop click + Escape dismiss via bits-ui Dialog.
-->
<script lang="ts">
  import { goto } from '$app/navigation';
  import { Dialog as Bits } from 'bits-ui';
  import { MapPin, Search, X } from 'lucide-svelte';
  import { getGtfsRepo } from '$lib/data/gtfs/repo';
  import type { StopWithDistance } from '$lib/data/gtfs/types';
  import { feedsStore } from '$lib/stores/feedsStore.svelte';
  import { locationStore } from '$lib/stores/locationStore.svelte';
  import Spinner from './Spinner.svelte';
  import Stack from './Stack.svelte';
  import Typography from './Typography.svelte';
  import { cn } from './cn';

  type Props = {
    open: boolean;
    onclose: () => void;
  };

  let { open, onclose }: Props = $props();

  let query = $state('');
  let debouncedQuery = $state('');
  let results = $state<StopWithDistance[] | null>(null);
  let loading = $state(false);
  let errorMsg = $state<string | null>(null);
  let inputEl = $state<HTMLInputElement | null>(null);

  const anchor = $derived.by(() => {
    const pos = locationStore.position;
    if (pos) return { lat: pos.coords.latitude, lon: pos.coords.longitude };
    const feed = feedsStore.byId(feedsStore.boundFeedId);
    return feed?.center ?? null;
  });
  // When the user hasn't enabled GPS, distance from the feed centroid
  // is noise — sort alphabetically and hide the distance column.
  const hasGps = $derived(locationStore.position != null);
  const sortMode = $derived<'distance' | 'name'>(hasGps ? 'distance' : 'name');
  // With name-sort the user is scanning the alphabet, so a larger
  // page is friendlier than the GPS-sorted "top 25".
  const resultLimit = $derived(hasGps ? 25 : 100);

  // 150 ms debounce on the input so each keystroke doesn't kick off a
  // worker round-trip. Reset when the overlay closes so a re-open starts
  // with a clean state.
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  $effect(() => {
    const q = query;
    if (debounceTimer != null) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debouncedQuery = q;
    }, 150);
    return () => {
      if (debounceTimer != null) clearTimeout(debounceTimer);
    };
  });

  // Reset + autofocus when opened. Autofocus runs on the next tick so
  // bits-ui has mounted the portal.
  $effect(() => {
    if (open) {
      query = '';
      debouncedQuery = '';
      results = null;
      errorMsg = null;
      queueMicrotask(() => inputEl?.focus());
    }
  });

  // Run the search whenever the debounced query or anchor changes while
  // the overlay is open. `untrack` not needed — assignments to results /
  // loading don't re-feed the effect's read set.
  $effect(() => {
    if (!open) return;
    const a = anchor;
    if (!a) {
      results = [];
      return;
    }
    const text = debouncedQuery;
    const limit = resultLimit;
    const mode = sortMode;
    loading = true;
    errorMsg = null;
    (async () => {
      try {
        const repo = getGtfsRepo();
        const r = await repo.searchStops(text, a.lat, a.lon, limit, mode);
        results = r;
      } catch (e) {
        errorMsg = e instanceof Error ? e.message : String(e);
      } finally {
        loading = false;
      }
    })();
  });

  function selectStop(id: string) {
    onclose();
    goto(`/station/${id}`);
  }

  function formatDistance(m: number | undefined): string {
    if (m == null) return '';
    if (m < 1000) return `${Math.round(m)} m`;
    return `${(m / 1000).toFixed(1)} km`;
  }
</script>

<Bits.Root bind:open={() => open, (v) => { if (!v) onclose(); }}>
  <Bits.Portal>
    <Bits.Overlay
      class="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in"
    />
    <Bits.Content
      class={cn(
        'fixed z-50 outline-none',
        'left-1/2 -translate-x-1/2 top-[15svh] w-[min(calc(100vw-2rem),32rem)]',
        'flex flex-col gap-2',
        'data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-95',
      )}
    >
      <Bits.Title class="sr-only">Search stations</Bits.Title>

      <div
        class="relative bg-[color:var(--color-surface)] text-[color:var(--color-fg)] border border-[color:var(--color-border)] rounded-lg shadow-xl"
      >
        <div class="flex items-center gap-2 px-3 py-2 border-b border-[color:var(--color-border)]">
          <Search size={18} class="shrink-0 text-[color:var(--color-fg-muted)]" />
          <input
            bind:this={inputEl}
            bind:value={query}
            type="search"
            inputmode="search"
            placeholder="Search stations…"
            aria-label="Search stations"
            class="flex-1 min-w-0 bg-transparent text-sm outline-none placeholder:text-[color:var(--color-fg-muted)]"
          />
          <button
            type="button"
            onclick={onclose}
            aria-label="Cancel"
            class="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-md hover:bg-[color:var(--color-border)]/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-primary)]"
          >
            <X size={16} />
          </button>
        </div>

        <div class="max-h-[60svh] overflow-y-auto">
          {#if errorMsg}
            <Typography variant="caption" class="block px-3 py-2 text-[color:var(--color-danger)]">
              {errorMsg}
            </Typography>
          {:else if anchor == null}
            <Typography variant="caption" class="block px-3 py-2 text-[color:var(--color-fg-muted)]">
              Pick a feed in Settings to search stations.
            </Typography>
          {:else if loading && results == null}
            <Stack direction="row" spacing={1} align="center" class="px-3 py-2">
              <Spinner size={14} />
              <Typography variant="caption">Searching…</Typography>
            </Stack>
          {:else if results != null && results.length === 0}
            <Typography variant="caption" class="block px-3 py-2 text-[color:var(--color-fg-muted)]">
              {debouncedQuery ? 'No matching stations.' : 'No nearby stations.'}
            </Typography>
          {:else if results != null}
            <ul class="py-1">
              {#each results as stop (stop.id)}
                <li>
                  <button
                    type="button"
                    onclick={() => selectStop(stop.id)}
                    class="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-[color:var(--color-border)]/30 focus-visible:outline-none focus-visible:bg-[color:var(--color-border)]/30"
                  >
                    <MapPin size={14} class="shrink-0 text-[color:var(--color-fg-muted)]" />
                    <span class="flex-1 min-w-0 text-sm truncate">{stop.name}</span>
                    {#if hasGps}
                      <span class="shrink-0 text-xs font-mono text-[color:var(--color-fg-muted)]">
                        {formatDistance(stop.distance)}
                      </span>
                    {/if}
                  </button>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      </div>

      {#if anchor && !hasGps}
        <Typography variant="caption" class="block text-center text-[color:var(--color-fg-muted)]">
          Enable location to sort results by distance.
        </Typography>
      {/if}
    </Bits.Content>
  </Bits.Portal>
</Bits.Root>
