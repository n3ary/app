/**
 * GTFS time-string encoding helpers.
 *
 * GTFS `stop_times.txt` expresses arrival/departure times as `HH:MM:SS`
 * strings. Hours may exceed 24 for trips that run past midnight (e.g.
 * `"25:30:00"` is 01:30 the following day). These helpers convert between the
 * GTFS string form and a compact minutes-since-midnight integer used in the
 * CDN payload, enabling simple arithmetic comparisons on the client.
 *
 * Pure, dependency-free, and shared between the server-side pipeline
 * (`netlify/functions/schedule-pipeline.mts`) and client/test code.
 *
 * Examples:
 *   gtfsTimeToMinutes("05:05:00") === 305
 *   gtfsTimeToMinutes("23:59:00") === 1439
 *   gtfsTimeToMinutes("25:30:00") === 1530  // overnight trip
 *
 * Design reference: .kiro/specs/gtfs-schedule-integration/design.md
 *   (Minutes-Since-Midnight Encoding, Correctness Property 2)
 */

/** Matches a GTFS `H:MM:SS` / `HH:MM:SS` time string (hours may exceed 24). */
const GTFS_TIME_PATTERN = /^(\d{1,2}):([0-5]\d):([0-5]\d)$/;

/**
 * Convert a GTFS `HH:MM:SS` time string to minutes-since-midnight.
 *
 * Seconds are intentionally discarded — schedule comparisons operate at minute
 * resolution. Hours greater than or equal to 24 are preserved (overnight
 * trips), so the result can exceed 1439.
 *
 * @param time GTFS time string in `H:MM:SS` or `HH:MM:SS` form
 * @returns Integer minutes since midnight (`hours * 60 + minutes`)
 * @throws If the input is not a well-formed GTFS time string
 */
export function gtfsTimeToMinutes(time: string): number {
  const match = GTFS_TIME_PATTERN.exec(time.trim());
  if (!match) {
    throw new Error(`Invalid GTFS time string: "${time}"`);
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours * 60 + minutes;
}

/**
 * Decompose minutes-since-midnight back into hour and minute components.
 *
 * This is the inverse of {@link gtfsTimeToMinutes} at minute resolution: for
 * any valid GTFS time, encoding then decomposing preserves the original hour
 * and minute exactly (seconds are not represented).
 *
 * @param totalMinutes Minutes since midnight (may exceed 1439 for overnight)
 * @returns The hour and minute components
 */
export function minutesToHoursMinutes(totalMinutes: number): {
  hours: number;
  minutes: number;
} {
  return {
    hours: Math.floor(totalMinutes / 60),
    minutes: totalMinutes % 60,
  };
}

/**
 * Format minutes-since-midnight back into a GTFS `HH:MM:SS` string.
 *
 * Seconds are always `00` because they are not retained by
 * {@link gtfsTimeToMinutes}. Hours are zero-padded to at least two digits and
 * may exceed 24 for overnight trips.
 *
 * @param totalMinutes Minutes since midnight (may exceed 1439 for overnight)
 * @returns A GTFS-style `HH:MM:SS` time string
 */
export function minutesToGtfsTime(totalMinutes: number): string {
  const { hours, minutes } = minutesToHoursMinutes(totalMinutes);
  const hh = hours.toString().padStart(2, '0');
  const mm = minutes.toString().padStart(2, '0');
  return `${hh}:${mm}:00`;
}
