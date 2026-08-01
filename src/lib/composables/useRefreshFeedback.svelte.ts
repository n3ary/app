// Refresh-button feedback. On press, capture the current lastFetchMs
// snapshot and push a loading entry into the StatusBar. A $effect
// watches the reconciled store; when either lastFetchMs advances
// past the snapshot OR error changes, we resolve the loading entry:
//   - error      → red error entry with the message
//   - success    → info entry with the new live-vehicle count
// A safety timeout (`REFRESH_TIMEOUT_MS`) covers the case where the
// worker never responds — the loading state would otherwise hang
// forever. Touch users can't read the dot tooltips, so this is how
// they know whether their refresh actually did anything.
//
// The `startRefresh` callback is returned so the layout can wire it
// to AppLayout's `onrefresh` prop. `useRefreshFeedback` owns the
// pending state, the timeout, and the resolution effect — the layout
// just renders and dispatches.

import { untrack } from 'svelte';
import { nowTicker } from '$lib/stores/nowTicker.svelte';
import { reconciledVehiclesStore } from '$lib/stores/reconciledVehiclesStore.svelte';
import { refreshBus } from '$lib/stores/refreshBus.svelte';
import { statusBus } from '$lib/stores/statusBus.svelte';

const REFRESH_ID = 'refresh';
const REFRESH_TIMEOUT_MS = 8_000;

export function useRefreshFeedback(): { startRefresh: () => void } {
  let pendingRefreshSinceMs = $state<number | null>(null);
  let pendingRefreshSnapMs = $state<number | null>(null);
  let pendingRefreshSnapError = $state<string | null>(null);
  let pendingRefreshTimer: ReturnType<typeof setTimeout> | null = null;

  function clearPendingRefresh() {
    pendingRefreshSinceMs = null;
    pendingRefreshSnapMs = null;
    pendingRefreshSnapError = null;
    if (pendingRefreshTimer) {
      clearTimeout(pendingRefreshTimer);
      pendingRefreshTimer = null;
    }
  }

  function startRefresh() {
    if (pendingRefreshSinceMs != null) return; // ignore re-taps while in flight
    pendingRefreshSinceMs = Date.now();
    pendingRefreshSnapMs = reconciledVehiclesStore.lastFetchMs;
    pendingRefreshSnapError = reconciledVehiclesStore.error;
    statusBus.push({ id: REFRESH_ID, kind: 'loading', message: 'Refreshing live data…' });
    pendingRefreshTimer = setTimeout(() => {
      if (pendingRefreshSinceMs == null) return;
      clearPendingRefresh();
      statusBus.push({
        id: REFRESH_ID,
        kind: 'warning',
        message: 'No response — showing cached data',
      });
    }, REFRESH_TIMEOUT_MS);
    refreshBus.fire();
    reconciledVehiclesStore.refresh();
    nowTicker.bump();
  }

  $effect(() => {
    if (pendingRefreshSinceMs == null) return;
    const nowFetch = reconciledVehiclesStore.lastFetchMs;
    const nowError = reconciledVehiclesStore.error;
    const fetchAdvanced = nowFetch != null && nowFetch !== pendingRefreshSnapMs;
    const errorChanged = nowError !== pendingRefreshSnapError;
    if (!fetchAdvanced && !errorChanged) return;
    // untrack: statusBus.push reads `entries` for dedupe; without
    // wrapping, the push would add it as a dep and re-fire this
    // effect, looping until effect_update_depth. clearPendingRefresh()
    // below would normally break the cycle, but untrack makes the
    // safety explicit. See routes/+page.svelte for the matching pattern.
    if (nowError && !fetchAdvanced) {
      untrack(() => {
        statusBus.push({ id: REFRESH_ID, kind: 'error', message: `Refresh failed: ${nowError}` });
      });
    } else {
      const stats = reconciledVehiclesStore.stats;
      const count = stats ? stats.matched + stats.live : 0;
      untrack(() => {
        statusBus.push({
          id: REFRESH_ID,
          kind: 'success',
          message: count > 0 ? `Updated — ${count} live vehicles` : 'Updated — no live vehicles',
        });
      });
    }
    clearPendingRefresh();
  });

  return { startRefresh };
}
