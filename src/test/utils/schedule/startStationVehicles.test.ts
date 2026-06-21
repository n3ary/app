import { describe, it, expect } from 'vitest';
import { getStartStationVehicles } from '../../../utils/schedule/startStationVehicles';
import type { SchedulePayload, ScheduleStopTime } from '../../../types/schedule';

const START = 100; // the station under view (route start)
const MID = 101;
const END = 102;

/** A trip starting at START (stop 100) departing `start`, ending at `start+dur`. */
function tripFromStart(start: number, dur = 20): ScheduleStopTime[] {
  return [
    { s: START, q: 0, a: start, d: start },
    { s: MID, q: 1, a: start + Math.floor(dur / 2), d: start + Math.floor(dur / 2) },
    { s: END, q: 2, a: start + dur, d: start + dur },
  ];
}

/** A trip that does NOT start at START (originates at MID). */
function tripFromMid(start: number): ScheduleStopTime[] {
  return [
    { s: MID, q: 0, a: start, d: start },
    { s: END, q: 1, a: start + 10, d: start + 10 },
  ];
}

function schedule(stopTimes: Record<string, ScheduleStopTime[]>): SchedulePayload {
  return { version: 'v', stopTimes, calendar: [], calendarExceptions: [], tripServiceMap: {} };
}

const ROUTES = { A: 42, B: 42, C: 7, FUT2: 42, GH: 42, MID1: 9 } as Record<string, number>;

describe('getStartStationVehicles', () => {
  it('returns the single next upcoming departure per route as a scheduled entry', () => {
    // now 08:00 (480). Route 42 has departures at 08:10 and 08:25 from START.
    const sched = schedule({ A: tripFromStart(490), B: tripFromStart(505) });
    const result = getStartStationVehicles({
      stationId: START,
      activeTrips: ['A', 'B'],
      scheduleData: sched,
      gpsVehicleTripIds: new Set(),
      tripRouteMap: { A: 42, B: 42 },
      currentMinutes: 480,
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      tripId: 'A',
      routeId: 42,
      phase: 'scheduled',
      scheduledDepartureMinutes: 490,
      minutesUntil: 10,
      estimatedProgress: 0,
    });
  });

  it('emits a ghost entry once the scheduled departure has passed and no GPS exists', () => {
    // now 08:05 (485); trip departed 08:00 (480), ends 08:20 (500). 5/20 elapsed.
    const sched = schedule({ GH: tripFromStart(480, 20) });
    const result = getStartStationVehicles({
      stationId: START,
      activeTrips: ['GH'],
      scheduleData: sched,
      gpsVehicleTripIds: new Set(),
      tripRouteMap: { GH: 42 },
      currentMinutes: 485,
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ tripId: 'GH', phase: 'ghost', minutesUntil: -5 });
    expect(result[0].estimatedProgress).toBeCloseTo(0.25, 5);
  });

  it('excludes a trip that already has a GPS vehicle (real flow renders it)', () => {
    const sched = schedule({ GH: tripFromStart(480, 20) });
    const result = getStartStationVehicles({
      stationId: START,
      activeTrips: ['GH'],
      scheduleData: sched,
      gpsVehicleTripIds: new Set(['GH']),
      tripRouteMap: { GH: 42 },
      currentMinutes: 485,
    });
    expect(result).toEqual([]);
  });

  it('omits trips whose scheduled end has passed', () => {
    const sched = schedule({ GH: tripFromStart(400, 20) }); // ended 07:00 (420)
    const result = getStartStationVehicles({
      stationId: START,
      activeTrips: ['GH'],
      scheduleData: sched,
      gpsVehicleTripIds: new Set(),
      tripRouteMap: { GH: 42 },
      currentMinutes: 480,
    });
    expect(result).toEqual([]);
  });

  it('ignores trips that do not originate at this station (direction-aware)', () => {
    const sched = schedule({ MID1: tripFromMid(490) });
    const result = getStartStationVehicles({
      stationId: START,
      activeTrips: ['MID1'],
      scheduleData: sched,
      gpsVehicleTripIds: new Set(),
      tripRouteMap: { MID1: 9 },
      currentMinutes: 480,
    });
    expect(result).toEqual([]);
  });

  it('handles a station that is start for multiple routes (one scheduled each) plus a ghost', () => {
    const sched = schedule({
      A: tripFromStart(490), // route 42 upcoming
      C: tripFromStart(500), // route 7 upcoming
      GH: tripFromStart(470, 30), // route 42 ghost (departed 07:50, ends 08:20)
    });
    const result = getStartStationVehicles({
      stationId: START,
      activeTrips: ['A', 'C', 'GH'],
      scheduleData: sched,
      gpsVehicleTripIds: new Set(),
      tripRouteMap: { A: 42, C: 7, GH: 42 },
      currentMinutes: 480,
    });

    const ghost = result.filter((r) => r.phase === 'ghost');
    const scheduled = result.filter((r) => r.phase === 'scheduled');
    expect(ghost.map((g) => g.tripId)).toEqual(['GH']);
    expect(scheduled.map((s) => s.routeId).sort((a, b) => a - b)).toEqual([7, 42]);
    // route 42 scheduled entry is the upcoming A (490), not the ghost.
    expect(scheduled.find((s) => s.routeId === 42)?.tripId).toBe('A');
  });

  it('returns empty for empty inputs', () => {
    expect(
      getStartStationVehicles({
        stationId: START,
        activeTrips: [],
        scheduleData: schedule({}),
        gpsVehicleTripIds: new Set(),
        tripRouteMap: {},
        currentMinutes: 480,
      }),
    ).toEqual([]);
  });
});
