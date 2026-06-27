<!--
  StatusDot — small colored circle used by the header to surface health
  (GPS / Connection / Schedule / Live). Each dot owns a Tooltip explaining
  the source on hover/focus.

  State colors are theme-token-backed so a high-contrast skin recolors them
  automatically:
    ok       → success token
    stale    → warning token
    error    → danger token
    idle     → muted neutral (data source unused or disabled)
-->
<script lang="ts">
  import Tooltip from './Tooltip.svelte';
  import { cn } from './cn';

  type State = 'ok' | 'stale' | 'error' | 'idle';

  type Props = {
    state: State;
    label: string;
    tooltip?: string;
    /** Pulse animation for "ok" state to signal liveness (e.g. live vehicles tick). */
    pulse?: boolean;
    class?: string;
  };

  let { state, label, tooltip, pulse = false, class: className }: Props = $props();

  const COLOR: Record<State, string> = {
    ok: 'bg-[color:var(--color-success)]',
    stale: 'bg-[color:var(--color-warning)]',
    error: 'bg-[color:var(--color-danger)]',
    idle: 'bg-[color:var(--color-fg-muted)]/40',
  };
</script>

<Tooltip title={tooltip ?? label} placement="bottom">
  <span
    role="status"
    aria-label={`${label}: ${state}`}
    class={cn(
      'inline-block w-2.5 h-2.5 rounded-full transition-colors',
      COLOR[state],
      pulse && state === 'ok' && 'animate-pulse',
      className,
    )}
  ></span>
</Tooltip>
