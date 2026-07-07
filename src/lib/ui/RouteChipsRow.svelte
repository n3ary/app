<!--
  RouteChipsRow - horizontal strip of RouteBadges with overflow +N.

  `bind:clientWidth` measures the actual layout width at the call
  site, so the fit calculation adapts to whatever container the
  chip row is rendered in (overlay card, picker row, summary card)
  without hardcoded caps. A soft `maxVisible` ceiling bounds the
  visual length of the row: when the catalogue exceeds it, the
  row collapses to `maxVisible` badges + a "+N" chip so a stop
  with 18 serving routes still renders a scannable summary.

  Soft cap, not hard: if the fit calculation says fewer than
  `maxVisible` badges fit on this particular card (e.g. a narrow
  overlay), the row shows the fitted count and a +N for the rest
  rather than forcing the cap. The row always shows as many badges
  as the available space can hold, up to the cap, before resorting
  to +N.

  The visible-badge + +N pattern means the row's width is bounded
  even when the underlying catalogue has dozens of routes for a stop.
-->
<script lang="ts">
  import type { Route } from '$lib/domain/types';
  import RouteBadge from './RouteBadge.svelte';

  type Props = {
    routes: Route[];
    /** Soft cap on the number of visible badges. The row shows
     *  min(fit, maxVisible) badges + a "+N" chip for the rest.
     *  Default 8 - high enough that a stop with 6-7 routes
     *  paints every badge on a typical card, low enough that a
     *  stop with 18+ routes does not crowd the row. The full
     *  list is still available on the stop's detail page. */
    maxVisible?: number;
    class?: string;
  };

  let { routes, maxVisible = 8, class: className }: Props = $props();

  // Measured badge-row width. `bind:clientWidth` gives us layout size
  // that reflects the actual container bounds, so we don't need to
  // guess mobile vs desktop.
  let rowWidth = $state(0);

  // Estimated pixel width of one RouteBadge (size='small') given its
  // short_name. Matches the badge's `h-6 min-w-6 px-1.5 text-xs`
  // shape: 12px of horizontal padding, minimum 24px total, and ~7px
  // per additional character at text-xs. Verified against multi-feed
  // catalogues (short_names up to 5 chars).
  function badgeWidth(text: string): number {
    return Math.max(24, text.length * 7 + 12);
  }
  const GAP_PX = 4; // matches Tailwind `gap-1`

  const fit = $derived.by(() => {
    if (routes.length === 0) return { visible: 0 };
    // Zero rowWidth means we haven't measured yet - render nothing
    // rather than a first-paint flash of "everything fits, no +N".
    if (rowWidth <= 0) return { visible: 0 };
    // First attempt: does the full row fit without an overflow chip?
    let full = 0;
    for (let i = 0; i < routes.length; i++) {
      full += badgeWidth(routes[i].shortName) + (i > 0 ? GAP_PX : 0);
    }
    if (full <= rowWidth) return { visible: routes.length };
    // Otherwise find the largest N such that first N badges + a
    // "+M" chip fits. M = total - N; overflow chip's width grows
    // with M's digits (26px for "+9", 33px for "+99"), so the fit
    // check accounts for that. Linear scan; N is small enough that
    // the extra pass over cumulative widths is trivial.
    for (let n = routes.length - 1; n >= 0; n--) {
      let width = 0;
      for (let i = 0; i < n; i++) {
        width += badgeWidth(routes[i].shortName) + (i > 0 ? GAP_PX : 0);
      }
      const hidden = routes.length - n;
      const chipWidth = badgeWidth(`+${hidden}`);
      width += (n > 0 ? GAP_PX : 0) + chipWidth;
      if (width <= rowWidth) return { visible: n };
    }
    return { visible: 0 };
  });

  // Soft cap: show whichever is smaller -- the natural fit or the
  // cap. This way a narrow card still collapses via +N, and a wide
  // card with a 20-route stop still gets a +N at the cap, but a
  // card where 5 routes actually fit shows all 5 (no forced +N).
  const cappedFit = $derived(Math.max(0, maxVisible));
  const visibleRoutes = $derived(routes.slice(0, Math.min(fit.visible, cappedFit)));
  const hiddenCount = $derived(routes.length - visibleRoutes.length);
</script>

{#if routes.length > 0}
  <!-- Fixed-height, no-wrap chip row. `overflow-hidden` guards
       against a first-frame paint before rowWidth is measured. -->
  <div
    bind:clientWidth={rowWidth}
    class={`flex items-center gap-1 min-w-0 h-6 overflow-hidden ${className ?? ''}`}
  >
    {#each visibleRoutes as route (route.id)}
      <RouteBadge {route} size="small" class="shrink-0" />
    {/each}
    {#if hiddenCount > 0}
      <span
        class="shrink-0 inline-flex items-center justify-center h-6 min-w-6 px-1.5 text-xs font-medium rounded-md border border-[color:var(--color-border)] text-[color:var(--color-fg-muted)]"
        aria-label={`${hiddenCount} more route${hiddenCount === 1 ? '' : 's'}`}
      >
        +{hiddenCount}
      </span>
    {/if}
  </div>
{/if}