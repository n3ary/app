import { describe, expect, it, afterEach } from 'vitest';
import { appLocale, setAppLocaleForTest } from './locale';

describe('appLocale', () => {
  afterEach(() => setAppLocaleForTest(null));

  it('honors a test override when set', () => {
    setAppLocaleForTest('fr-FR');
    expect(appLocale()).toBe('fr-FR');
  });

  it('clears the override when set to null', () => {
    setAppLocaleForTest('fr-FR');
    setAppLocaleForTest(null);
    // Falls back to navigator.language (vitest jsdom env) or 'en'.
    const got = appLocale();
    expect(typeof got).toBe('string');
    expect(got.length).toBeGreaterThan(0);
  });

  it('returns a string with at least the language part', () => {
    setAppLocaleForTest(null);
    expect(appLocale()).toMatch(/^[a-z]{2}/i);
  });
});
