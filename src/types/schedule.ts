/**
 * GTFS Schedule Integration TypeScript interfaces and types
 * Shared types for the compact CDN schedule payload, calendar/service data,
 * and the derived results used by schedule-consuming features (upcoming
 * departures, ghost vehicles, vehicle-to-schedule matching).
 *
 * These types are additive: they enhance the existing Tranzy API flow and do
 * not modify any Tranzy API interfaces (see `rawTranzyApi.ts`).
 */

import type { ConfidenceLevel } from '../utils/core/stringConstants';

// ============================================================================
// Compact CDN Payload
// ============================================================================

/**
 * The complete schedule payload served from the CDN (`/data/schedule.json`).
 * Produced by the daily Netlify schedule pipeline and cached client-side.
 */
export interface SchedulePayload {
  /** ISO timestamp of when the payload was last processed */
  version: string;
  /** Stop times keyed by trip_id for O(1) lookup */
  stopTimes: Record<string, ScheduleStopTime[]>;
  /** Calendar entries from calendar.txt */
  calendar: CalendarEntry[];
  /** Date-specific overrides from calendar_dates.txt */
  calendarExceptions: CalendarException[];
  /** Mapping of trip_id to service_id */
  tripServiceMap: Record<string, string>;
}

/**
 * A single stop time within a trip.
 * Uses compact field names matching the CDN JSON format to minimize payload size.
 */
export interface ScheduleStopTime {
  /** stop_id */
  s: number;
  /** stop_sequence */
  q: number;
  /** arrival_time (minutes since midnight) */
  a: number;
  /** departure_time (minutes since midnight) */
  d: number;
}

/** Calendar entry from calendar.txt */
export interface CalendarEntry {
  serviceId: string;
  monday: boolean;
  tuesday: boolean;
  wednesday: boolean;
  thursday: boolean;
  friday: boolean;
  saturday: boolean;
  sunday: boolean;
  /** YYYYMMDD */
  startDate: string;
  /** YYYYMMDD */
  endDate: string;
}

/** Calendar exception from calendar_dates.txt */
export interface CalendarException {
  serviceId: string;
  /** YYYYMMDD */
  date: string;
  /** 1 = service added, 2 = service removed */
  exceptionType: 1 | 2;
}

// ============================================================================
// Derived Results
// ============================================================================

/** Upcoming departure for station display */
export interface UpcomingDeparture {
  tripId: string;
  routeId: number;
  /** minutes since midnight */
  departureMinutes: number;
  /** minutes relative to now */
  minutesUntil: number;
  hasGpsVehicle: boolean;
  isGhost: boolean;
}

/** Ghost vehicle candidate (scheduled but no GPS signal) */
export interface GhostVehicleCandidate {
  tripId: string;
  routeId: number;
  /** minutes since midnight */
  scheduledStartMinutes: number;
  /** minutes elapsed since scheduled start */
  elapsedMinutes: number;
  /** fraction along route, bounded [0, 1] */
  estimatedProgress: number;
}

/** Vehicle-to-schedule match result */
export interface VehicleMatchResult {
  vehicleId: number;
  tripId: string;
  matchConfidence: ConfidenceLevel;
  isSuspectDuplicate: boolean;
  /** difference from expected schedule position, in minutes */
  timingDeltaMinutes: number;
}
