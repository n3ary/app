/*
 * userPrefs — the user's persistent preferences. Loaded once from localStorage
 * on construction, written by the +layout effect on every change.
 *
 * Class instance (not a function) so consumers can do `userPrefs.theme = 'dark'`
 * directly with full reactivity — the $state-annotated fields are tracked.
 *
 * SSR-safe: the constructor checks for localStorage before reading, so
 * prerender just uses DEFAULTS.
 */

const STORAGE_KEY = 'neary-user-prefs';

export type Theme = 'auto' | 'light' | 'dark';

class UserPrefs {
  theme = $state<Theme>('auto');
  /** Selected transit agency id, or null when the user hasn't chosen yet. */
  agencyId = $state<number | null>(null);
  /** Show "Drop off only" indicators on station / vehicle cards. */
  showDropOffOnly = $state(true);
  /** Show ghost vehicles (scheduled run, GPS missing) in lists. */
  showGhostVehicles = $state(true);
  /** User's optional Tranzy API key — when set, live data layer activates. */
  apiKey = $state<string | null>(null);

  constructor() {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const o = JSON.parse(raw) as Partial<{
        theme: Theme;
        agencyId: number | null;
        showDropOffOnly: boolean;
        showGhostVehicles: boolean;
        apiKey: string | null;
      }>;
      if (o.theme === 'auto' || o.theme === 'light' || o.theme === 'dark') this.theme = o.theme;
      if (typeof o.agencyId === 'number' || o.agencyId === null) this.agencyId = o.agencyId;
      if (typeof o.showDropOffOnly === 'boolean') this.showDropOffOnly = o.showDropOffOnly;
      if (typeof o.showGhostVehicles === 'boolean') this.showGhostVehicles = o.showGhostVehicles;
      if (typeof o.apiKey === 'string' || o.apiKey === null) this.apiKey = o.apiKey;
    } catch {
      // Corrupt or unreadable storage — fall back to defaults silently.
    }
  }

  /** JSON-safe plain object snapshot for serialization. */
  snapshot() {
    return {
      theme: this.theme,
      agencyId: this.agencyId,
      showDropOffOnly: this.showDropOffOnly,
      showGhostVehicles: this.showGhostVehicles,
      apiKey: this.apiKey,
    };
  }
}

export const userPrefs = new UserPrefs();
export const STORAGE_KEY_USER_PREFS = STORAGE_KEY;
