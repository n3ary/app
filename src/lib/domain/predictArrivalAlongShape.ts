/*
 * predictArrivalAlongShape — multi-tier ETA module, replacing the
 * single-tier `predictEta`. Composes the speed cascade
 * (`estimateSegmentSpeed`) with shape projection so the rendered ETA
 * uses the best-available speed source per segment instead of the
 * vehicle's instantaneous `speedMs`.
 *
 * Today's single-segment cut: speed is asked once for the segment the
 * bus is currently on (driving tier 1 when moving; tier 3 / TOD when
 * not). The full per-segment walk + dwell accumulation is a future
 * refinement once we have a meaningful number of downstream stops on
 * a single ETA query — the Schedule view's "next 10 stops" use case.
 * For the current Stations-board use case (one bus → one stop), the
 * single-segment walk delivers most of the win.
 *
 * Closes item 2 of docs/plan/prediction-v2.md.
 *
 * Pure. No DOM, no stores, no I/O.
 */

import {
  distAlongBetween,
  projectOnPolyline,
  type LatLon,
  type Polyline,
} from './shapeProjection';
import {
  estimateSegmentSpeed,
  type FeedSpeedConfig,
  type NearbyVehicle,
  type SpeedSample,
} from './speedCascade';
import type { TodBucket } from './timeOfDay';
import type { Confidence } from './types';

export interface PredictArrivalInputs {
  /** Latest GPS position of the vehicle. */
  vehiclePos: LatLon;
  /** Stop the user is waiting at. */
  stopPos: LatLon;
  /** Route shape for the vehicle's current trip (worker
   *  `getShapesForTrips`). Must have ≥ 2 points. */
  polyline: Polyline;
  /** Vehicle's reported instant speed in m/s, or null when absent.
   *  Drives cascade tier 1 when present and > 0. */
  vehicleSpeedMs: number | null;
  /** Vehicle's direction_id from GTFS-RT. Used by cascade tier 2 to
   *  filter opposite-direction fleet samples. Undefined / -1 means
   *  unknown. */
  vehicleDirectionId?: 0 | 1 | -1;
  /** TOD bucket for `now`, computed from feed-local minutes via
   *  `clockToBucket`. Drives tier 3. */
  todBucket: TodBucket;
  feedConfig: FeedSpeedConfig;
  /** Other reconciled vehicles for cascade tier 2 (fleet p60).
   *  Optional; empty / undefined short-circuits tier 2. */
  nearbyVehicles?: ReadonlyArray<NearbyVehicle>;
}

export interface ArrivalPrediction {
  /** Minutes until the vehicle reaches the stop. Negative when the
   *  vehicle has already passed the stop (vehicle distAlong > stop
   *  distAlong). */
  minutes: number;
  /** Absolute distance along the polyline from vehicle to stop, in
   *  metres. */
  distanceMeters: number;
  /** Which cascade tier produced the speed used for this prediction. */
  source: SpeedSample['source'];
  /** Trust grade. Pure function of the cascade tier + perpendicular
   *  projection distances (off-shape projections downgrade). */
  confidence: Confidence;
}

/** Perpendicular projection thresholds (metres). If either the vehicle
 *  or the stop projects further than `MEDIUM_CONF_PERP_M` from the
 *  polyline, confidence is clamped to 'low' regardless of cascade tier
 *  — the inputs aren't trustworthy enough to bank on. */
const HIGH_CONF_PERP_M = 50;
const MEDIUM_CONF_PERP_M = 150;

export function predictArrivalAlongShape(
  input: PredictArrivalInputs,
): ArrivalPrediction {
  const vehProj = projectOnPolyline(input.vehiclePos, input.polyline);
  const stopProj = projectOnPolyline(input.stopPos, input.polyline);

  // Signed: positive when vehicle is before stop, negative when past.
  const signedDistM = distAlongBetween(vehProj, stopProj);
  const absDistM = Math.abs(signedDistM);

  // Speed: ask the cascade once for the segment containing the
  // vehicle (segmentDistanceFromVehicleM = 0 forces tier 1 if the bus
  // is moving). When the bus is stopped, the cascade falls through to
  // tier 3 (TOD) automatically.
  const sample = estimateSegmentSpeed({
    segment: {
      fromLat: input.vehiclePos.lat, fromLon: input.vehiclePos.lon,
      toLat: input.stopPos.lat, toLon: input.stopPos.lon,
    },
    segmentDistanceFromVehicleM: 0,
    vehicle:
      input.vehicleSpeedMs != null && input.vehicleSpeedMs > 0
        ? {
            lat: input.vehiclePos.lat,
            lon: input.vehiclePos.lon,
            speedMs: input.vehicleSpeedMs,
            directionId: input.vehicleDirectionId,
          }
        : undefined,
    nearbyVehicles: input.nearbyVehicles,
    todBucket: input.todBucket,
    feedConfig: input.feedConfig,
  });

  // Time = (signed distance in km) / speed in km/h × 60 → minutes,
  // signed so the bucketer can drop already-passed vehicles correctly.
  const minutes = (signedDistM / 1000) / sample.kmh * 60;

  return {
    minutes,
    distanceMeters: absDistM,
    source: sample.source,
    confidence: downgradeForOffShape(sample.confidence, vehProj.perpDistM, stopProj.perpDistM),
  };
}

function downgradeForOffShape(
  cascadeConf: Confidence,
  vehPerpM: number,
  stopPerpM: number,
): Confidence {
  const worst = Math.max(vehPerpM, stopPerpM);
  if (worst < HIGH_CONF_PERP_M) return cascadeConf;
  if (worst < MEDIUM_CONF_PERP_M) return cascadeConf === 'high' ? 'medium' : cascadeConf;
  return 'low';
}
