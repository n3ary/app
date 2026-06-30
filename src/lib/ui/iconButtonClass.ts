/*
 * Shared class string for the small (24x24) icon-only action buttons
 * used in row layouts (VehicleCard action column, favorites route row).
 * Solid border-token fill + matching 1px border + focus ring so the
 * controls read as tappable buttons, not decorative glyphs.
 *
 * Pair with a 16px lucide icon (strokeWidth ~2.25) for legibility.
 */
export const iconButtonClass =
  'inline-flex items-center justify-center w-6 h-6 rounded-md ' +
  'bg-[color:var(--color-border)] text-[color:var(--color-fg)] ' +
  'border border-[color:var(--color-border)] ' +
  'hover:bg-[color:var(--color-fg-muted)]/25 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-primary)]';
