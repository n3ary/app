<!--
  Header — fixed top bar. Carries the view title (left) and the four health
  dots + refresh button (right).

  The dots are wired to a `health` prop, an object the parent fills with
  each source's current state: GPS reflects the geolocation listener,
  Schedule reflects the worker's feed-bind state, Live reflects the
  worker's reconciliation broadcast.

  Refresh callback is optional — when absent (e.g. on routes that have
  nothing to refresh) the button is hidden.
-->
<script lang="ts">
  import { RefreshCw } from 'lucide-svelte';
  import IconButton from './IconButton.svelte';
  import StatusDot from './StatusDot.svelte';
  import type { HeaderHealth, HealthState } from './headerTypes';

  type Props = {
    title: string;
    health: HeaderHealth;
    onrefresh?: () => void;
    refreshing?: boolean;
  };

  let { title, health, onrefresh, refreshing = false }: Props = $props();
</script>

<header
  class="sticky top-0 z-40 flex items-center gap-3 px-4
         h-[calc(3rem+var(--space-safe-top))] pt-[var(--space-safe-top)]
         bg-[color:var(--color-surface)] border-b border-[color:var(--color-border)]"
>
  <h1 class="flex-1 text-base font-semibold truncate">{title}</h1>

  <div class="flex items-center gap-2">
    <StatusDot state={health.gps.state} label="GPS" tooltip={health.gps.tooltip} />
    <StatusDot state={health.connection.state} label="Connection" tooltip={health.connection.tooltip} />
    <StatusDot state={health.schedule.state} label="Schedule" tooltip={health.schedule.tooltip} />
    <StatusDot state={health.live.state} label="Live" tooltip={health.live.tooltip} pulse />
  </div>

  {#if onrefresh}
    <IconButton size="small" onclick={onrefresh} aria-label="Refresh" disabled={refreshing}>
      <RefreshCw size={18} class={refreshing ? 'animate-spin' : ''} />
    </IconButton>
  {/if}
</header>
