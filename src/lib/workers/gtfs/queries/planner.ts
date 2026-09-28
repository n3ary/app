/*
 * planJourney -- walk + transit journey planning over the bound feed.
 *
 * Thin adapter: gather access/egress candidate stops (getStopsNear),
 * resolve the day's active services (activeServicesOn), run the pure
 * RAPTOR engine (domain/raptor.ts) against the cached network
 * (plannerNetwork.ts), then hydrate the ID-only result into UI legs with
 * names, coordinates, route metadata, and vehicle mode.
 *
 * All the routing logic is in the pure engine so it's unit-tested there;
 * this file only does DB fetches + shaping.
 */

import type { Database } from '@sqlite.org/sqlite-wasm';
import { plan, type RaptorJourney, type StopWalk } from '$lib/domain/raptor';
import type { PlanJourneyOptions, PlannerJourney, PlannerLeg, PlannerStopTime } from '$lib/data/gtfs/types';
import { activeServicesOn } from '../activeServices';
import { getPlannerNetwork, type LatLon, type PlannerNetwork } from '../plannerNetwork';
import { getStopsNear } from './stops';

const WALK_SPEED_MPS = 1.3;
const CANDIDATE_RADIUS_M = 700;
const MAX_CANDIDATES = 8;

export function planJourney(db: Database, opts: PlanJourneyOptions): PlannerJourney[] {
  const network = getPlannerNetwork(db);
  const active = new Set(activeServicesOn(db, opts.localDate));

  const access = toWalks(getStopsNear(db, opts.fromLat, opts.fromLon, CANDIDATE_RADIUS_M, MAX_CANDIDATES));
  const egress = toWalks(getStopsNear(db, opts.toLat, opts.toLon, CANDIDATE_RADIUS_M, MAX_CANDIDATES));
  if (access.length === 0 || egress.length === 0) return [];

  const journeys = plan(network.net, {
    access,
    egress,
    departTime: opts.departMin * 60,
    activeServices: active,
    maxResults: opts.maxResults ?? 4,
  });

  return journeys.map((j) => hydrate(j, network, opts));
}

function toWalks(stops: ReadonlyArray<{ id: string; distance?: number }>): StopWalk[] {
  return stops.map((s) => {
    const meters = Math.round(s.distance ?? 0);
    return { stopId: s.id, seconds: Math.round(meters / WALK_SPEED_MPS), meters };
  });
}

/** The trip's shape between board and alight, by projecting each stop onto
 *  the nearest shape point. Gives a road-following polyline per leg instead
 *  of a straight line through stops. Undefined when the feed has no shape. */
function clipShape(net: PlannerNetwork, tripId: string, boardId: string, alightId: string): LatLon[] | undefined {
  const shapeId = net.tripShape.get(tripId);
  const shp = shapeId ? net.shapes.get(shapeId) : undefined;
  if (!shp || shp.length < 2) return undefined;
  const nearest = (id: string): number => {
    const m = net.stops.get(id);
    if (!m) return 0;
    let bi = 0;
    let bd = Infinity;
    for (let i = 0; i < shp.length; i++) {
      const d = (shp[i].lat - m.lat) ** 2 + (shp[i].lon - m.lon) ** 2;
      if (d < bd) {
        bd = d;
        bi = i;
      }
    }
    return bi;
  };
  const bi = nearest(boardId);
  const ai = nearest(alightId);
  const seg = bi <= ai ? shp.slice(bi, ai + 1) : shp.slice(ai, bi + 1).reverse();
  return seg.length >= 2 ? seg.map((p) => ({ lat: p.lat, lon: p.lon })) : undefined;
}

function hydrate(j: RaptorJourney, net: PlannerNetwork, opts: PlanJourneyOptions): PlannerJourney {
  const stopPoint = (stopId: string, time: number): PlannerStopTime => {
    const m = net.stops.get(stopId);
    return { id: stopId, name: m?.name ?? stopId, lat: m?.lat ?? 0, lon: m?.lon ?? 0, time };
  };
  const named = (stopId: string) => {
    const m = net.stops.get(stopId);
    return { lat: m?.lat ?? 0, lon: m?.lon ?? 0, name: m?.name ?? stopId };
  };

  const legs: PlannerLeg[] = j.legs.map((leg): PlannerLeg => {
    if (leg.kind === 'walk') {
      const from =
        leg.fromStop === null ? { lat: opts.fromLat, lon: opts.fromLon } : named(leg.fromStop);
      const to = leg.toStop === null ? { lat: opts.toLat, lon: opts.toLon } : named(leg.toStop);
      return { kind: 'walk', variant: leg.variant, meters: leg.meters, seconds: leg.seconds, from, to };
    }
    const meta = net.routeMeta.get(leg.routeId);
    return {
      kind: 'transit',
      routeId: leg.routeId,
      routeShortName: meta?.shortName ?? '?',
      routeColor: meta?.color ?? '#666666',
      routeType: meta?.type ?? 'bus',
      headsign: net.tripHeadsign.get(leg.tripId) ?? null,
      waitSec: leg.waitSec,
      board: stopPoint(leg.boardStop, leg.boardTime),
      alight: stopPoint(leg.alightStop, leg.alightTime),
      stops: leg.stopIds.map((id, i) => stopPoint(id, leg.stopTimes[i])),
      shape: clipShape(net, leg.tripId, leg.boardStop, leg.alightStop),
    };
  });

  return {
    departTime: j.departTime,
    arriveTime: j.arriveTime,
    durationSec: j.durationSec,
    transfers: j.transfers,
    legs,
  };
}
