# Implementation Plan: GTFS Schedule Integration

## Overview

This plan implements the GTFS schedule integration feature by building from foundation (types) through the server-side pipeline, client-side store, utility functions, and finally integration with existing components. Each task is individually actionable and builds incrementally on previous steps. The architecture follows an additive-only approach — all existing GPS-based functionality continues working when schedule data is unavailable.

## Tasks

- [x] 1. Define shared types and interfaces
  - [x] 1.1 Create schedule type definitions
    - Create `src/types/schedule.ts` with all schedule-related interfaces: `SchedulePayload`, `ScheduleStopTime`, `CalendarEntry`, `CalendarException`, `UpcomingDeparture`, `GhostVehicleCandidate`, `VehicleMatchResult`
    - Use compact field names for `ScheduleStopTime` (`s`, `q`, `a`, `d`) matching the CDN JSON format
    - Include `UpcomingDeparture` with `tripId`, `routeId`, `departureMinutes`, `minutesUntil`, `hasGpsVehicle`, `isGhost`
    - Include `VehicleMatchResult` with `vehicleId`, `tripId`, `matchConfidence`, `isSuspectDuplicate`, `timingDeltaMinutes`
    - Include `GhostVehicleCandidate` with `tripId`, `routeId`, `scheduledStartMinutes`, `elapsedMinutes`, `estimatedProgress`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

- [x] 2. Implement server-side schedule pipeline
  - [x] 2.1 Create the Netlify scheduled function scaffold
    - Create `netlify/functions/schedule-pipeline.mts` with the Netlify scheduled function config (`@daily`)
    - Implement the handler that fetches the GTFS ZIP from `https://external.gtfs.ro/cluj/CLUJ.zip`
    - Add ZIP size guard (abort if >50 MB)
    - Add error handling that retains previous blob on failure (all-or-nothing write strategy)
    - Add `fflate` dependency for in-memory ZIP decompression
    - _Requirements: 1.1, 1.4, 1.5_

  - [x] 2.2 Implement CSV parsing and data transformation
    - Parse `stop_times.txt`, `calendar.txt`, `calendar_dates.txt`, and `trips.txt` from the extracted ZIP
    - Convert GTFS time strings (HH:MM:SS, including >24:00) to minutes-since-midnight integers
    - Build `SchedulePayload` structure: `stopTimes` keyed by `trip_id`, `calendar` array, `calendarExceptions` array, `tripServiceMap`
    - Add version timestamp to the payload
    - _Requirements: 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x] 2.3 Implement Netlify Blobs storage
    - Write the compact JSON payload to Netlify Blobs (served at `/data/schedule.json`)
    - Add `netlify.toml` headers for the `/data/` path with appropriate caching (e.g., 1 hour `max-age`)
    - Ensure all-or-nothing semantics: only write if full processing succeeds
    - _Requirements: 1.3, 1.4_

  - [x]* 2.4 Write property test for pipeline transformation (Property 1)
    - **Property 1: Pipeline transformation completeness**
    - Test that for any valid CSV input, the transformation produces a JSON payload keyed by trip_id, with all stop times, calendar entries, exceptions, and trip-service mappings
    - Create `src/utils/schedule/pipelineTransform.property.test.ts`
    - **Validates: Requirements 1.2, 1.3, 2.2, 2.4, 2.5**

  - [x]* 2.5 Write property test for time encoding (Property 2)
    - **Property 2: Time encoding round-trip**
    - Test that encoding GTFS time strings to minutes-since-midnight and back preserves hour/minute values for all valid inputs (0-48 hours, 0-59 minutes)
    - Create `src/utils/schedule/timeEncoding.property.test.ts`
    - **Validates: Requirements 2.3**

- [x] 3. Checkpoint - Ensure pipeline tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement client-side schedule store
  - [x] 4.1 Create the schedule store with CDN fetching
    - Create `src/stores/scheduleStore.ts` following existing store patterns (Zustand + `persist` middleware)
    - Implement `loadSchedule()` that fetches from CDN `/data/schedule.json`
    - Implement `isDataFresh()` using 24-hour TTL check
    - Add `loading`, `error`, `lastUpdated`, `dataVersion` state fields
    - Use IndexedDB persistence (single key `"current"` in `schedule-cache` store)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 10.3_

  - [x] 4.2 Implement schedule store query methods
    - Implement `getStopTimesForTrip(tripId)` — O(1) lookup from `stopTimes` record
    - Implement `getScheduledArrival(tripId, stopId)` and `getScheduledDeparture(tripId, stopId)`
    - Implement `isTripActiveToday(tripId)` using `activeServiceIds` set
    - Implement `getTripStartTime(tripId)` returning first stop's departure minutes
    - Implement `getUpcomingDepartures(stopId, routeIds, windowMinutes)` — filters active trips for a station within time window
    - _Requirements: 4.3, 5.1, 6.1, 6.2_

  - [x] 4.3 Implement active service resolution in store
    - Implement `resolveActiveServices()` that computes `activeServiceIds` from calendar + exceptions for current date
    - Wire into `loadSchedule()` so active services are resolved on data load
    - Add midnight date-crossing detection to recalculate active services
    - _Requirements: 4.1, 4.2, 4.4_

  - [x]* 4.4 Write property test for cache freshness logic (Property 3)
    - **Property 3: Cache freshness and version logic**
    - Test that store skips fetch when cache <24h and version matches, fetches when cache ≥24h or version differs
    - Create `src/stores/scheduleStore.property.test.ts`
    - **Validates: Requirements 3.3, 3.6**

- [x] 5. Implement schedule utility functions
  - [x] 5.1 Create active service resolution utility
    - Create `src/utils/schedule/activeServiceUtils.ts`
    - Implement `resolveActiveServices(calendar, exceptions, date)` as a pure function
    - Implement `minutesSinceMidnight(date)` and `isTimeInWindow(scheduledMinutes, currentMinutes, windowMinutes)`
    - _Requirements: 4.1, 4.2_

  - [x]* 5.2 Write property test for active service resolution (Property 4)
    - **Property 4: Active service resolution**
    - Test that for any date, calendar entries, and exceptions, the resolver returns the correct set of active service IDs (calendar weekday match + added exceptions − removed exceptions)
    - Create `src/utils/schedule/activeService.property.test.ts`
    - **Validates: Requirements 4.1, 4.2, 4.3**

  - [x] 5.3 Create ghost vehicle detection utility
    - Create `src/utils/schedule/ghostVehicleUtils.ts`
    - Implement `identifyGhostTrips(activeTrips, gpsVehicleTripIds, scheduleData, currentMinutes)` returning `GhostVehicleCandidate[]`
    - Ghost = active trip with scheduled start in past, end not passed, no GPS vehicle assigned
    - Estimated progress = elapsed time / total trip duration, bounded [0, 1]
    - _Requirements: 7.1, 7.2, 7.5_

  - [x]* 5.4 Write property test for ghost vehicle lifecycle (Property 7)
    - **Property 7: Ghost vehicle lifecycle**
    - Test that ghost candidates are identified when scheduled start is past, end not passed, and no GPS vehicle exists; progress bounded [0,1]; removed after end time
    - Create `src/utils/schedule/ghostVehicle.property.test.ts`
    - **Validates: Requirements 7.1, 7.2, 7.5**

  - [x] 5.5 Create vehicle-to-schedule matching utility
    - Create `src/utils/schedule/vehicleMatchingUtils.ts`
    - Implement `matchVehiclesToSchedule(vehicles, activeTrips, scheduleData, currentMinutes)` returning `VehicleMatchResult[]`
    - Match by closest expected position with ±10 minute tolerance
    - When multiple GPS vehicles match one trip, best match is real, others flagged as suspect duplicates
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [x]* 5.6 Write property test for vehicle-to-schedule matching (Property 8)
    - **Property 8: Vehicle-to-schedule matching**
    - Test matching algorithm assigns vehicles to closest scheduled trip within tolerance, flags unmatched as duplicates
    - Create `src/utils/schedule/vehicleMatching.property.test.ts`
    - **Validates: Requirements 8.1, 8.2, 8.3, 8.4**

  - [x] 5.7 Create start station suppression utility
    - Create `src/utils/schedule/startStationUtils.ts`
    - Implement `shouldSuppressPrediction(vehicle, scheduleData, tripStopTimes, stops, currentMinutes)` returning boolean
    - Suppression when: stop_sequence is first, vehicle near first stop coordinates, current time before scheduled departure, schedule data exists
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [x]* 5.8 Write property test for start station suppression (Property 9)
    - **Property 9: Start station prediction suppression**
    - Test that suppression activates only when all four conditions are met and normal prediction resumes otherwise
    - Create `src/utils/schedule/startStation.property.test.ts`
    - **Validates: Requirements 6.3, 9.1, 9.2, 9.3, 9.4**

- [x] 6. Checkpoint - Ensure all utility tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Integrate schedule with existing arrival service
  - [x] 7.1 Enhance ETA calculation with schedule fallback
    - Modify `src/utils/arrival/arrivalUtils.ts` (or create `src/utils/schedule/etaEnhancementUtils.ts` if >300 lines) to add schedule-based ETA logic
    - When GPS fresh + schedule available: GPS primary, schedule as reference
    - When GPS stale: schedule-based ETA as primary with lower confidence
    - When trip not in schedule: return GPS-based ETA unchanged
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x]* 7.2 Write property test for ETA source selection (Property 5)
    - **Property 5: ETA source selection**
    - Test that GPS-fresh uses GPS primary, GPS-stale uses schedule primary with lower confidence, and missing schedule returns GPS unchanged
    - Create `src/utils/schedule/etaSource.property.test.ts`
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5**

  - [x] 7.3 Implement upcoming departures query
    - Wire `getUpcomingDepartures` in the schedule store to combine active trips, stop times, and GPS vehicle presence
    - Return sorted list within 60-minute window, indicating GPS-assigned vs schedule-only
      > **Pending revision (issue #28):** Invalid for start stations — the next scheduled vehicle may be hours away (or tomorrow) and must still be shown with a schedule-styled ETA. The window is a listing default; a "next departure beyond the window" fallback will be added.
    - _Requirements: 6.1, 6.2, 6.4, 6.5_

  - [x]* 7.4 Write property test for upcoming departures (Property 6)
    - **Property 6: Upcoming departures query**
    - Test that all departures within 60 minutes are returned sorted by time, with correct GPS/schedule-only indicators
    - Create `src/utils/schedule/departures.property.test.ts`
    - **Validates: Requirements 6.1, 6.2, 6.4, 6.5**

- [x] 8. Integrate schedule with vehicle enhancement and display
  - [x] 8.1 Wire ghost vehicle detection into vehicle display layer
    - Integrate `identifyGhostTrips` into the vehicle data flow so ghost candidates appear alongside GPS vehicles
    - Ensure ghost markers are visually distinct (pass data to UI layer)
    - When GPS vehicle appears on a ghost trip, remove the ghost candidate
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [x] 8.2 Wire vehicle-to-schedule matching and duplicate detection
    - Integrate `matchVehiclesToSchedule` into the vehicle enhancement pipeline
    - Flag suspect duplicates with reduced confidence and warning indicator
    - When schedule unavailable, skip matching and show all vehicles (graceful degradation)
    - _Requirements: 8.1, 8.4, 8.5, 8.6_

  - [x] 8.3 Wire start station prediction suppression
    - Integrate `shouldSuppressPrediction` into `positionPredictionUtils.ts` or the enhancement pipeline
    - When suppression active: vehicle shows at station without forward prediction
    - When schedule unavailable: existing prediction behavior unchanged
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [x]* 8.4 Write property test for graceful degradation (Property 10)
    - **Property 10: Graceful degradation**
    - Test that when schedule data is null, all schedule-consuming functions produce output identical to existing non-schedule behavior
    - Create `src/utils/schedule/degradation.property.test.ts`
    - **Validates: Requirements 10.2**

- [x] 9. Checkpoint - Ensure integration tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Data attribution and final wiring
  - [x] 10.1 Add GTFS data attribution to the app
    - Add CC-BY-SA-4.0 attribution for the GTFS data source in the app's about/info section
    - Ensure attribution is visible without navigating to external links
    - _Requirements: 11.1, 11.2, 11.3_

  - [x] 10.2 Wire schedule store initialization into app startup
    - Call `loadSchedule()` during app initialization (non-blocking, schedule is additive-only)
    - Ensure existing stores (`vehicleStore`, `tripStore`, `stopTimeStore`) are NOT modified
    - Verify main bundle size impact stays under 50KB (excluding CDN JSON)
    - _Requirements: 3.1, 10.1, 10.2, 10.4, 10.5_

- [x] 11. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The `netlify/functions/` directory does not yet exist and will be created in task 2.1
- All schedule features are additive-only: if schedule data is unavailable, existing GPS behavior continues unchanged
- The project already has `fast-check` in devDependencies for property-based testing

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "4.1", "5.1"] },
    { "id": 2, "tasks": ["2.2", "4.3", "5.3", "5.5", "5.7"] },
    { "id": 3, "tasks": ["2.3", "4.2", "5.2", "5.4", "5.6", "5.8"] },
    { "id": 4, "tasks": ["2.4", "2.5", "4.4"] },
    { "id": 5, "tasks": ["7.1", "7.3", "8.1", "8.2", "8.3"] },
    { "id": 6, "tasks": ["7.2", "7.4", "8.4"] },
    { "id": 7, "tasks": ["10.1", "10.2"] }
  ]
}
```
