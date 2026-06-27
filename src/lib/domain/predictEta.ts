/*
 * predictEta — GPS-derived ETA for a vehicle approaching a stop.
 *
 * Given the vehicle's current GPS position, the stop's coordinates,
 * the route shape polyline, and an effective speed, compute the
 * minutes-until-arrival as
 *
 *   remainingDistanceAlongShape / speed.
 *
 * Why this is better than the scheduled stop_time at intermediate
 * stops: schedules are wall-clock guesses authored months in advance.
 * Real-world ETA depends on traffic, weather, signals, and how late
 * the bus already is. With a live GPS fix we have ground truth for
 * its current position; with shape projection we know how much route
 * remains to our stop; the only soft input is speed, which we take
 * from the live observation when present and fall back to a
 * config-driven average otherwise.
 *
 * Used only at intermediate stops. At the trip origin the bus may be
 * parked waiting for scheduled departure (speed = 0), so a
 * GPS-derived ETA would say "infinity minutes" — the schedule wins
 * there, gated by `isAtTripStart` upstream.
 *
 * Pure. No DOM, no stores, no I/O.
 */

import { distAlongBetween, projectOnPolyline, type LatLon, type Polyline } from './shapeProjection';
import type { Confidence } from './types';

/** Minimum effective speed used by the predictor. Below this the
 *  ETA blows up (a bus briefly at a red light reports speed=0).
 *  Picked to match a slow walk so worst-case ETAs are sane rather
 *  than NaN. ≈3.5 km/h. */
const MIN_EFFECTIVE_SPEED_MS = 1;

/** When the live observation doesn't report speed, fall back to an
 *  urban-transit average. ~18 km/h is a typical figure for
 *  mixed-traffic city bus including stops. */
const FALLBACK_SPEED_MS = 5;

/** Perpendicular-distance thresholds (meters) gating the confidence
 *  field on the returned ETA. Mirrors the v1 thresholds in
 *  apps/legacy/src/utils/arrival/distanceUtils.ts. */
const HIGH_CONF_PERP_M = 50;
const MEDIUM_CONF_PERP_M = 150;

export interface PredictEtaInputs {
  /** Latest GPS position of the vehicle. */
  vehiclePos: LatLon;
  /** Stop the user is waiting at. */
  stopPos: LatLon;
  /** Route shape for the vehicle's current trip (worker
   *  getShapesForTrips). MUST have ≥2 points. */
  polyline: Polyline;
  /** Effective speed in m/s. Use the live observation's `speedMs`
   *  when present; pass `null` to use the fallback. */
  vehicleSpeedMs: number | null;
}

export interface EtaPrediction {
  /** Minutes until the vehicle reaches the stop. Negative when the
   *  vehicle has already passed (vehicle distAlong > stop distAlong). */
  minutes: number;
  /** Distance along the polyline from the vehicle to the stop, in
   *  meters. Always ≥ 0; signed information is on `minutes`. */
  distanceMeters: number;
  /** How much to trust the result. Mostly a function of how well
   *  both points project onto the polyline (off-shape projections =
   *  low confidence). */
  confidence: Confidence;
}

export function predictEta(input: PredictEtaInputs): EtaPrediction {
  const vehProj = projectOnPolyline(input.vehiclePos, input.polyline);
  const stopProj = projectOnPolyline(input.stopPos, input.polyline);

  // Signed: positive when vehicle is before stop, negative when past.
  const signedDistM = distAlongBetween(vehProj, stopProj);
  const absDistM = Math.abs(signedDistM);

  // Clamp speed to MIN so we don't divide by zero or produce
  // nonsensical 99h ETAs when the bus is briefly stopped.
  const rawSpeed =
    input.vehicleSpeedMs != null && Number.isFinite(input.vehicleSpeedMs) && input.vehicleSpeedMs > 0
      ? input.vehicleSpeedMs
      : FALLBACK_SPEED_MS;
  const speed = Math.max(MIN_EFFECTIVE_SPEED_MS, rawSpeed);

  const minutes = (signedDistM / speed) / 60;

  return {
    minutes,
    distanceMeters: absDistM,
    confidence: confidenceFromPerpDistances(vehProj.perpDistM, stopProj.perpDistM),
  };
}

function confidenceFromPerpDistances(
  vehPerpM: number, stopPerpM: number,
): Confidence {
  const worst = Math.max(vehPerpM, stopPerpM);
  if (worst < HIGH_CONF_PERP_M) return 'high';
  if (worst < MEDIUM_CONF_PERP_M) return 'medium';
  return 'low';
}
