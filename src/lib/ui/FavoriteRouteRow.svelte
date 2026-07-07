<!--
  FavoriteRouteRow - single source of truth for the favorited-route
  row layout so a change to the heart, the Calendar icon, or the body
  tap target propagates to /favorites, the search overlay, and the
  home page in one edit. Two chrome variants: 'card' (bordered) for
  standalone use, 'inline' (flat) for embedding inside an existing
  Card on the home page.
-->
<script lang="ts">
  import { Calendar, Heart } from 'lucide-svelte';
  import type { Route } from '$lib/domain/types';
  import { vehicleTypeLabel } from '$lib/domain/types';
  import { cn } from './cn';
  import { iconButtonClass } from './iconButtonClass';
  import RouteBadge from './RouteBadge.svelte';

  type Props = {
    route: Route;
    isFav: boolean;
    onToggleFavorite: () => void;
    /** Optional body tap. When null/undefined the row is non-interactive
     *  (no role, no tabindex, no key handler) and only the inner
     *  controls do anything. */
    onbodyclick?: (() => void) | null;
    variant?: 'card' | 'inline';
    class?: string;
  };

  let {
    route,
    isFav,
    onToggleFavorite,
    onbodyclick = null,
    variant = 'card',
    class: className,
  }: Props = $props();

  const type = $derived(route.type ?? 'unknown');
  const typeLabel = $derived(vehicleTypeLabel(type));
  const primaryLabel = $derived(route.longName ?? typeLabel);
  const hasSchedule = $derived(route.hasSchedule !== false);
  const scheduleHref = $derived(
    hasSchedule ? `/schedule/route/${route.id}_0` : null,
  );
  const mapHref = $derived(`/map/route/${route.id}_0`);
  const interactive = $derived(typeof onbodyclick === 'function');
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  role={interactive ? 'button' : undefined}
  tabindex={interactive ? 0 : undefined}
  aria-expanded={undefined}
  onclick={interactive
    ? (e) => {
        // Bail when the click came from an inner anchor/button so the
        // badge (map), calendar (schedule), and heart (favorite) taps
        // don't also fire the row's body action. Single source for
        // this guard across all four call sites.
        if ((e.target as Element | null)?.closest('a, button')) return;
        onbodyclick?.();
      }
    : undefined}
  onkeydown={interactive
    ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          if ((e.target as Element | null)?.closest('a, button')) return;
          e.preventDefault();
          onbodyclick?.();
        }
      }
    : undefined}
  class={cn(
    'flex items-center gap-3 rounded-md transition-colors',
    variant === 'card'
      ? 'px-3 py-2 border-2 border-solid border-[color:var(--color-border)] cursor-pointer hover:bg-[color:var(--color-border)]/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-primary)]'
      : 'px-1 py-1.5 -mx-1 hover:bg-[color:var(--color-border)]/20',
    className,
  )}
>
  <a
    href={mapHref}
    aria-label={`Open map for ${typeLabel.toLowerCase()} ${route.shortName}`}
    title="Open route map"
    class="shrink-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-primary)]"
  >
    <RouteBadge {route} size="medium" class="min-w-14" />
  </a>
  <div class="min-w-0 flex-1">
    <div class="text-sm font-medium truncate">{primaryLabel}</div>
    {#if route.description}
      <div class="text-xs truncate text-[color:var(--color-fg-muted)]">{route.description}</div>
    {/if}
  </div>
  <div class="flex items-center gap-1 shrink-0">
    {#if scheduleHref}
      <a
        href={scheduleHref}
        aria-label={`Open schedule for ${typeLabel.toLowerCase()} ${route.shortName}`}
        title="Open route schedule"
        class={iconButtonClass}
      >
        <Calendar size={16} strokeWidth={2.25} />
      </a>
    {/if}
    <button
      type="button"
      aria-label={`${isFav ? 'Unfavorite' : 'Favorite'} ${typeLabel.toLowerCase()} ${route.shortName}`}
      aria-pressed={isFav}
      onclick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
      class={iconButtonClass}
    >
      <Heart
        size={16}
        strokeWidth={2.25}
        fill={isFav ? 'currentColor' : 'none'}
        class={isFav ? 'text-[color:var(--color-danger)]' : 'text-[color:var(--color-fg-muted)]'}
      />
    </button>
  </div>
</div>