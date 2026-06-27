/*
 * Visual mapping from a domain `Urgency` to the CSS classes the UI
 * uses for ETA / scheduled-departure text. Kept here (not in
 * VehicleCard) so every consumer renders the same colors and weights
 * without redeclaring the palette.
 */

import type { Urgency } from '$lib/domain/buckets';

export const URGENCY_CLASS: Record<Urgency | 'none', string> = {
  go: 'font-bold text-[color:var(--color-success)]',
  stop: 'font-bold text-[color:var(--color-danger)]',
  neutral: 'text-[color:var(--color-fg-muted)]',
  none: 'text-[color:var(--color-fg-muted)]',
};

export function urgencyClass(urgency: Urgency | null | undefined): string {
  return URGENCY_CLASS[urgency ?? 'none'];
}
