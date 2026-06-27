/*
 * Tiny SQL helper + week-day column names. Shared by every query
 * module so they don't reach into the worker's sqlite primitives
 * directly.
 */

import type { BindableValue, Database } from '@sqlite.org/sqlite-wasm';

/** Run a SELECT and return rows as plain JS objects.
 *  Cleaner than the `resultRows`-mutate-in-place pattern. */
export function selectAll<T>(
  db: Database,
  sql: string,
  bind?: readonly BindableValue[],
): T[] {
  return db.exec({
    sql,
    bind: bind as BindableValue[],
    rowMode: 'object',
    returnValue: 'resultRows',
  }) as unknown as T[];
}

/** GTFS calendar.txt day-of-week column names in JS `Date.getDay()`
 *  Sunday-first order, but we index with `(dow + 6) % 7` everywhere so
 *  Monday is column 0 (GTFS week order). Defined once here so every
 *  query that filters by service.day reads the same names. */
export const dayKeyCols = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;
