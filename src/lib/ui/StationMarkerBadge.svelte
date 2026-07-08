<!--
  StationMarkerBadge: a single icon representing a station's marker
  (favorite / home / work / cityCenter). 12-16px, used wherever a
  station's marker should be visible inline (station name rows, vehicle
  stop lists, route card subtitle, search overlay results, etc.).
-->
<script lang="ts">
  import { Briefcase, Heart, Home, Landmark } from 'lucide-svelte';
  import type { StationMarker } from '$lib/stores/favoritesStore.svelte';
  import { cn } from './cn';

  type Props = {
    marker: StationMarker;
    /** 12 fits inline next to a station name; 14 next to a route
     *  long name; 16 standalone. Default 14. */
    size?: 12 | 14 | 16;
    class?: string;
  };

  let { marker, size = 14, class: className }: Props = $props();

  // Lucide's `Landmark` icon (classical building silhouette) reads as
  // "city center / notable central place" at 12-16px. Distinct from
  // Heart / Home / Briefcase shapes so the four markers read as a
  // distinct set when shown together.
  const Icon = $derived(
    marker === 'favorite'
      ? Heart
      : marker === 'home'
        ? Home
        : marker === 'work'
          ? Briefcase
          : Landmark,
  );
</script>

<Icon
  {size}
  strokeWidth={2.25}
  fill={marker === 'favorite' ? 'currentColor' : 'none'}
  class={cn(
    marker === 'favorite'
      ? 'text-[color:var(--color-danger)]'
      : 'text-[color:var(--color-primary)]',
    'shrink-0',
    className,
  )}
  aria-label={marker}
/>