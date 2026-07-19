/*
 * appUpdate.ts — option-2 update flow: never reload a tab the rider
 * is looking at.
 *
 * SvelteKit's version poll flips `updated.current` when a new deploy
 * is live (see svelte.config.js `kit.version`). Previously the root
 * layout reloaded immediately — which yanked the Stations board out
 * from under a rider mid-read, the "app opens, then reloads a few
 * seconds later" complaint. Now the layout delegates here:
 *
 *   - tab hidden  → reload immediately; the rider comes back to the
 *                   new version and never sees an interruption.
 *   - tab visible → show a prompt banner with a manual Reload, and
 *                   keep watching `visibilitychange`; the first
 *                   backgrounding applies the update silently.
 *
 * The env seam (isHidden / onVisibilityChange / reload / showPrompt)
 * keeps the module DOM-free so the flow is unit-testable in node.
 */

export interface AppUpdateEnv {
  isHidden(): boolean;
  /** Register a visibility watcher; must return an unsubscribe. */
  onVisibilityChange(cb: () => void): () => void;
  reload(): void;
  showPrompt(): void;
}

/**
 * Run the update flow once `updated.current` is true. Returns the
 * visibility-listener unsubscribe when a prompt was shown (the caller
 * uses it as its effect cleanup), nothing when it reloaded outright.
 */
export function handleAppUpdate(env: AppUpdateEnv): (() => void) | void {
  if (env.isHidden()) {
    env.reload();
    return;
  }
  env.showPrompt();
  return env.onVisibilityChange(() => {
    if (env.isHidden()) env.reload();
  });
}
