<!--
  TypeBadge — small badge representing a vehicle type
  (bus / tram / trolleybus / …). Shape matches RouteBadge so it
  reads as a peer to route badges in the same UI surface (rounded
  square, similar padding + font). Color comes from the type's
  accent (VEHICLE_TYPE_COLOR), text from vehicleTypeLabel.

  Used by the /favorites view as a multi-select mode filter. Active
  = solid filled (badge "on"), inactive = outlined (badge "off").
-->
<script lang="ts">
  import type { VehicleType } from '$lib/domain/types';
  import { VEHICLE_TYPE_COLOR, vehicleTypeLabel } from '$lib/domain/types';
  import { cn } from './cn';

  type Size = 'small' | 'medium' | 'large';

  type Props = {
    type: VehicleType;
    active?: boolean;
    onclick?: () => void;
    size?: Size;
    class?: string;
  };

  let { type, active = false, onclick, size = 'medium', class: className }: Props = $props();

  // Match the RouteBadge size scale so a row mixing both reads as
  // visually consistent.
  const SIZE: Record<Size, string> = {
    small: 'h-6 px-1.5 text-xs',
    medium: 'h-7 px-2 text-sm',
    large: 'h-8 px-2.5 text-base',
  };

  const color = $derived(VEHICLE_TYPE_COLOR[type]);
  const label = $derived(vehicleTypeLabel(type));
</script>

<button
  type="button"
  aria-label={`Filter by ${label}`}
  aria-pressed={active}
  title={label}
  onclick={onclick}
  style={active
    ? `background:${color};color:#fff;border-color:${color};`
    : `background:transparent;color:${color};border-color:${color};`}
  class={cn(
    'inline-flex items-center justify-center font-semibold rounded-md select-none whitespace-nowrap border-2 cursor-pointer',
    'transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-primary)]',
    SIZE[size],
    className,
  )}
>
  {label}
</button>
