// Page-visibility lifecycle handler. Listens for `visibilitychange`,
// `pagehide`, and the Page Lifecycle API `freeze` event, and dispatches
// the `onSuspend` and `onResume` callbacks the caller provides.
//
// Why this lives behind callbacks (and not as a self-contained GTFS
// concern): the same lifecycle can be reused by anything that owns a
// resource the OS might freeze. Today the only consumer is the GTFS
// worker (see useGtfsBind — its `bumpEpoch()` is called from `onResume`).
// The freeze handling in particular targets Android, which freezes
// standalone PWAs within seconds of backgrounding without killing them.
//
// The `freeze` event is the only one that fires *before* the OS suspends
// the page — visibilitychange fires on every tab switch, pagehide on
// normal navigations, but only freeze gives us our last chance to
// release long-lived resources (OPFS handles, the sqlite-wasm pool).
// It's not in the TS DOM event map; we register structurally on a
// narrowed `document` reference.

export type BackgroundSuspendHandlers = {
  /** Called when the page becomes hidden, is being unloaded, or the OS
   *  is about to freeze it. Idempotent — internally guarded by a
   *  suspended flag so a flurry of events (visibility + pagehide +
   *  freeze) only invokes the callback once until the next resume. */
  onSuspend: () => void;
  /** Called when the page becomes visible after a suspend. Not called
   *  if no suspend was observed. */
  onResume: () => void;
};

export function useBackgroundSuspend(handlers: BackgroundSuspendHandlers): void {
  let suspended = false;

  function doSuspend() {
    if (suspended) return;
    suspended = true;
    handlers.onSuspend();
  }

  function doResume() {
    if (!suspended) return;
    suspended = false;
    handlers.onResume();
  }

  $effect(() => {
    if (typeof document === 'undefined') return;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') doSuspend();
      else doResume();
    };
    const onPagehide = () => doSuspend();
    // Page Lifecycle API `freeze`: fires right before the OS freezes
    // the page — our last chance to release the OPFS handles. Not in
    // the TS DOM event map; register structurally.
    const freezeTarget = document as unknown as {
      addEventListener(type: string, listener: () => void): void;
      removeEventListener(type: string, listener: () => void): void;
    };
    const onFreeze = () => doSuspend();

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPagehide);
    freezeTarget.addEventListener('freeze', onFreeze);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPagehide);
      freezeTarget.removeEventListener('freeze', onFreeze);
    };
  });
}
