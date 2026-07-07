<!--
  StationMarkerBadge: a single icon representing a station's marker
  (favorite / home / work / cityCenter). 12-16px, used wherever a
  station's marker should be visible inline (station name rows, vehicle
  stop lists, route card subtitle, search overlay results, etc.).
-->
<script lang="ts">
  import { Briefcase, Heart, Home, Radio } from 'lucide-svelte';
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

  // Lucide's `Radio` icon reads as concentric circles at this size
  // and is the closest match in the iconset to "city center".
  const Icon = $derived(
    marker === 'favorite'
      ? Heart
      : marker === 'home'
        ? Home
        : marker === 'work'
          ? Briefcase
          : Radio,
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