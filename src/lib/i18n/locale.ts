/*
 * appLocale — single source for the locale every Intl.* call uses.
 *
 * Pick-up rules:
 *   - browser: `navigator.language` (e.g. 'en-GB' on UK Safari).
 *   - worker / SSR / no-navigator: 'en' fallback.
 *
 * Why centralised: keeps date / time / number formatting consistent
 * across surfaces, and makes the "what locale am I using right now?"
 * question answerable in one place. Replaces the previous mix of
 * hard-coded 'en-CA' / 'en-GB' / 'en-US' literals.
 *
 * Tests: call `setAppLocaleForTest('en-GB')` in a `beforeAll` so
 * formatter snapshots stay stable regardless of the CI runner's
 * runtime locale.
 *
 * Numeric / internal Intl calls (timeUtils helpers): pair the locale
 * with `numberingSystem: 'latn'` in the formatter options so the
 * returned strings are always Latin digits, even on locales that
 * default to Arabic-Indic or other numerals. Without that pin a
 * `Number('٤٢')` round-trip silently returns `NaN`.
 */

let override: string | null = null;

export function appLocale(): string {
  if (override) return override;
  if (typeof navigator !== 'undefined' && navigator.language) return navigator.language;
  return 'en';
}

export function setAppLocaleForTest(locale: string | null): void {
  override = locale;
}
