<!-- Surface container. Tokenized via CSS variables so theme.css fully controls the look. variant adds a small accent stripe used by the unified Station / Route / Vehicle cards. tone swaps the surface for callers that want a different background (currently 'elevated' for the "Your favorites" anchor). -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { cn } from './cn';

  type Variant = 'plain' | 'station' | 'route' | 'vehicle';
  type Tone = 'plain' | 'elevated';

  type Props = {
    variant?: Variant;
    tone?: Tone;
    class?: string;
    children?: Snippet;
  };

  let { variant = 'plain', tone = 'plain', class: className, children }: Props = $props();

  const ACCENT: Record<Variant, string> = {
    plain: '',
    station: 'border-l-4 border-l-[color:var(--color-primary)]',
    route: 'border-l-4 border-l-[color:var(--color-success)]',
    vehicle: 'border-l-4 border-l-[color:var(--color-warning)]',
  };
  const TONE: Record<Tone, string> = {
    plain: 'bg-[color:var(--color-surface)]',
    // 'elevated' = the anchor card (currently "Your favorites"). Subtle,
    // token-driven, doesn't fight the AppLayout shell.
    elevated: 'bg-[color:var(--color-surface-elevated)]',
  };
</script>

<div
  class={cn(
    TONE[tone],
    'text-[color:var(--color-fg)]',
    'rounded-[var(--radius-card)] border border-[color:var(--color-border)] shadow-sm',
    ACCENT[variant],
    className,
  )}
>
  {@render children?.()}
</div>
