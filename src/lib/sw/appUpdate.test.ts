import { describe, expect, it, vi } from 'vitest';
import { handleAppUpdate, type AppUpdateEnv } from './appUpdate';

function makeEnv(initialHidden: boolean) {
  const state = { hidden: initialHidden };
  const cbs: Array<() => void> = [];
  const env: AppUpdateEnv = {
    isHidden: () => state.hidden,
    onVisibilityChange: (cb) => {
      cbs.push(cb);
      return () => {
        const i = cbs.indexOf(cb);
        if (i >= 0) cbs.splice(i, 1);
      };
    },
    reload: vi.fn(),
    showPrompt: vi.fn(),
  };
  const fireVisibility = () => cbs.forEach((cb) => cb());
  return { state, cbs, env, fireVisibility };
}

describe('handleAppUpdate', () => {
  it('reloads immediately when the tab is already hidden — no prompt, no listener', () => {
    const { env, cbs } = makeEnv(true);
    const cleanup = handleAppUpdate(env);
    expect(env.reload).toHaveBeenCalledTimes(1);
    expect(env.showPrompt).not.toHaveBeenCalled();
    expect(cbs).toHaveLength(0);
    expect(cleanup).toBeUndefined();
  });

  it('shows the prompt without reloading when the tab is visible', () => {
    const { env } = makeEnv(false);
    handleAppUpdate(env);
    expect(env.showPrompt).toHaveBeenCalledTimes(1);
    expect(env.reload).not.toHaveBeenCalled();
  });

  it('applies the update on the first backgrounding after the prompt', () => {
    const { env, state, fireVisibility } = makeEnv(false);
    handleAppUpdate(env);
    state.hidden = true;
    fireVisibility();
    expect(env.reload).toHaveBeenCalledTimes(1);
  });

  it('does not reload while the tab stays visible', () => {
    const { env, fireVisibility } = makeEnv(false);
    handleAppUpdate(env);
    fireVisibility(); // e.g. a bfcache/pageshow-style event while visible
    expect(env.reload).not.toHaveBeenCalled();
  });

  it('stops watching after cleanup — no reload on later backgrounding', () => {
    const { env, state, fireVisibility } = makeEnv(false);
    const cleanup = handleAppUpdate(env);
    cleanup?.();
    state.hidden = true;
    fireVisibility();
    expect(env.reload).not.toHaveBeenCalled();
  });
});
