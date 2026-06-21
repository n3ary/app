# Requirements Document

## Introduction

The GTFS Schedule Integration feature adds scheduled arrival/departure times to Neary by consuming the public GTFS static feed for Cluj-Napoca. Currently, the Tranzy API provides stop times with only trip_id, stop_id, and stop_sequence — no clock times. A pre-processing pipeline will fetch and compact the GTFS schedule data, and the client will use it to enhance ETA calculations, show upcoming departures, detect ghost vehicles, and suppress prediction at start stations.

## Glossary

- **Schedule_Pipeline**: The server-side function (Netlify scheduled function) that fetches, extracts, and compacts GTFS schedule data into a CDN-hosted JSON file
- **Schedule_Store**: The client-side Zustand store responsible for fetching, caching, and exposing schedule data to other components
- **Schedule_Data**: The compact JSON payload containing arrival/departure times, calendar patterns, and service IDs
- **GTFS_Feed**: The static GTFS ZIP archive at `https://external.gtfs.ro/cluj/CLUJ.zip` (CC-BY-SA-4.0)
- **Service_Calendar**: The mapping of service IDs to active weekdays and date ranges from calendar.txt
- **Calendar_Exception**: A date-specific override from calendar_dates.txt (added or removed service)
- **Scheduled_Arrival**: The arrival_time value from stop_times.txt for a specific trip/stop combination
- **Scheduled_Departure**: The departure_time value from stop_times.txt for a specific trip/stop combination
- **Ghost_Vehicle**: A vehicle that should be running per schedule but has no GPS signal
- **Active_Service**: The set of service IDs valid for a given date considering calendar and exceptions

## Requirements

### Requirement 1: GTFS Feed Fetching and Extraction

**User Story:** As a system operator, I want a pipeline that automatically fetches and processes the GTFS feed daily, so that schedule data stays current without manual intervention.

#### Acceptance Criteria

1. WHEN triggered on schedule, THE Schedule_Pipeline SHALL fetch the GTFS ZIP archive from `https://external.gtfs.ro/cluj/CLUJ.zip`
2. WHEN the ZIP archive is fetched, THE Schedule_Pipeline SHALL extract only stop_times.txt, calendar.txt, calendar_dates.txt, and the service_id column from trips.txt
3. WHEN extraction is complete, THE Schedule_Pipeline SHALL produce a single compact JSON file containing arrival times, departure times, calendar patterns, calendar exceptions, and trip-to-service mappings
4. IF the GTFS feed fetch fails, THEN THE Schedule_Pipeline SHALL retain the previous valid JSON output and log the failure
5. THE Schedule_Pipeline SHALL execute once per day on a configurable schedule

### Requirement 2: Compact Schedule Data Format

**User Story:** As a developer, I want the schedule data to be structured for fast client-side lookups, so that ETA and departure queries are efficient without excessive payload size.

#### Acceptance Criteria

1. THE Schedule_Pipeline SHALL produce a JSON payload under 500KB (gzipped) for the entire Cluj transit network
2. THE Schedule_Data SHALL be keyed by trip_id for O(1) lookup of stop times within a trip
3. THE Schedule_Data SHALL include arrival_time and departure_time for each stop in each trip, encoded as minutes-since-midnight integers
4. THE Schedule_Data SHALL include calendar entries with service_id, start_date, end_date, and active weekdays
5. THE Schedule_Data SHALL include calendar exception entries with service_id, date, and exception type (added or removed)
6. THE Schedule_Data SHALL include a version timestamp indicating when the data was last processed

### Requirement 3: Client-Side Schedule Loading and Caching

**User Story:** As a user, I want the app to load schedule data once and cache it locally, so that schedule features work quickly and remain available offline.

#### Acceptance Criteria

1. WHEN the app starts, THE Schedule_Store SHALL fetch the compact JSON from the CDN
2. WHEN the Schedule_Data is fetched, THE Schedule_Store SHALL persist it to IndexedDB for offline access
3. WHEN cached Schedule_Data exists and is less than 24 hours old, THE Schedule_Store SHALL use the cached version without refetching
4. IF the CDN fetch fails and cached data exists, THEN THE Schedule_Store SHALL use the cached data and indicate reduced freshness
5. IF the CDN fetch fails and no cached data exists, THEN THE Schedule_Store SHALL expose an error state and the app SHALL continue operating without schedule features
6. WHEN the CDN version timestamp differs from the cached version, THE Schedule_Store SHALL replace the cached data with the new version

### Requirement 4: Active Service Resolution

**User Story:** As a user, I want the app to know which trips run today, so that schedule features show only relevant departures for the current day.

#### Acceptance Criteria

1. WHEN determining active trips, THE Schedule_Store SHALL resolve Active_Service by checking calendar entries for the current date and weekday
2. WHEN resolving Active_Service, THE Schedule_Store SHALL apply Calendar_Exceptions by adding services with exception_type=1 and removing services with exception_type=2
3. THE Schedule_Store SHALL expose a method to check whether a given trip_id is active on the current date
4. WHEN the date changes (midnight crossing), THE Schedule_Store SHALL recalculate Active_Service for the new date

### Requirement 5: Schedule-Enhanced ETA

**User Story:** As a user, I want arrival time estimates to use scheduled times as a baseline, so that ETAs are more accurate when GPS data is stale or unavailable.

#### Acceptance Criteria

1. WHEN calculating arrival time for a vehicle with a known trip_id, THE System SHALL look up the Scheduled_Arrival for the target stop in the current trip
2. WHEN GPS-based ETA and Scheduled_Arrival are both available, THE System SHALL use GPS-based ETA as primary and display Scheduled_Arrival as a reference
3. WHEN GPS data is stale (exceeds GPS_DATA_AGE_THRESHOLDS), THE System SHALL fall back to Scheduled_Arrival as the primary ETA source
4. WHEN displaying schedule-based ETA, THE System SHALL indicate lower confidence compared to GPS-based estimates
5. WHEN a trip_id is not found in Schedule_Data, THE System SHALL continue using existing GPS-based ETA without schedule enhancement

### Requirement 6: Upcoming Departures

**User Story:** As a user, I want to see when the next vehicles depart from a station, so that I can plan my trip even when no vehicles are currently GPS-visible on the route.

#### Acceptance Criteria

1. WHEN viewing a station, THE System SHALL display upcoming scheduled departures for all active routes serving that station
2. THE System SHALL show upcoming departures for the next 60 minutes from the current time
   > **Pending revision (issue #28):** The 60-minute window is the default *listing* window only. For start stations (and any station with no in-window departures), the System SHALL also surface the *next* scheduled departure even when it is beyond 60 minutes (e.g. "scheduled in 2h" / "06:05 tomorrow"), rendered with schedule-styled ETA. The original "next 60 minutes" wording is too restrictive and will be relaxed.
3. WHEN a scheduled departure has a GPS-visible vehicle assigned to its trip AND the vehicle is at or near the start station before Scheduled_Departure, THE System SHALL display the Scheduled_Departure time and suppress position prediction rather than using the GPS-based estimate
4. WHEN no GPS-visible vehicle exists for a scheduled trip, THE System SHALL display the departure time from Schedule_Data with a schedule-based indicator
5. THE System SHALL sort upcoming departures by scheduled departure time ascending

### Requirement 7: Ghost Vehicle Detection

**User Story:** As a user, I want to see vehicles that should be running according to schedule but have no GPS signal, so that I know a vehicle may still arrive even without real-time tracking.

#### Acceptance Criteria

1. WHEN an active trip has a Scheduled_Departure from its start station that is in the past and no GPS-visible vehicle is assigned to that trip, THE System SHALL identify the trip as a ghost vehicle candidate
2. WHEN displaying ghost vehicle candidates, THE System SHALL show the scheduled position along the route based on elapsed time since scheduled departure from the start station
3. THE System SHALL visually distinguish ghost vehicles from GPS-tracked vehicles using a distinct marker style
4. WHEN a GPS-visible vehicle appears on a trip previously identified as ghost, THE System SHALL remove the ghost vehicle marker and display the real vehicle
5. IF the scheduled end time for a trip has passed, THEN THE System SHALL remove the ghost vehicle candidate

### Requirement 8: Vehicle-to-Schedule Matching and Duplicate Detection

**User Story:** As a user, I want the app to match GPS-visible vehicles to their scheduled trips and flag duplicates, so that I see accurate vehicle counts and don't confuse phantom GPS signals with real service.

#### Acceptance Criteria

1. WHEN a GPS-visible vehicle is on a route, THE System SHALL attempt to match it to an active scheduled trip on that route by comparing the vehicle's progress along the route to the expected scheduled position (based on elapsed time since Scheduled_Departure from the start station)
2. WHEN multiple scheduled trips are active on the same route, THE System SHALL match each GPS-visible vehicle to the closest-matching scheduled trip using timing tolerance (±10 minutes from expected position)
3. WHEN only one scheduled trip is active on a route but multiple GPS-visible vehicles appear, THE System SHALL identify the vehicle whose position best matches the expected schedule position as the real vehicle
4. WHEN a GPS-visible vehicle cannot be matched to any scheduled trip within tolerance, THE System SHALL flag it as a suspect duplicate (likely defective GPS) and visually distinguish it from matched vehicles
5. WHEN a GPS-visible vehicle is flagged as a suspect duplicate, THE System SHALL display it with reduced confidence and a warning indicator
6. WHEN schedule data is unavailable, THE System SHALL skip matching and display all GPS-visible vehicles without duplicate detection

### Requirement 9: Start Station Detection and Prediction Suppression

**User Story:** As a user, I want vehicles waiting at their start station before departure to show as stationary, so that position prediction does not incorrectly move them along the route.

#### Acceptance Criteria

1. WHEN a vehicle is at the start station of its trip and the current time is before the Scheduled_Departure from that station, THE System SHALL suppress position prediction for that vehicle
2. WHEN determining start station status, THE System SHALL compare the vehicle's stop_sequence to the first stop in the trip and validate proximity to the station coordinates
3. WHEN the current time reaches or exceeds the Scheduled_Departure, THE System SHALL resume normal position prediction for the vehicle
4. WHEN schedule data is unavailable for a trip, THE System SHALL use existing position prediction behavior without suppression

### Requirement 10: Non-Disruptive Integration

**User Story:** As a system maintainer, I want schedule integration to enhance existing functionality without breaking current behavior, so that the app remains stable if schedule data is unavailable.

#### Acceptance Criteria

1. THE System SHALL treat schedule data as an optional enhancement layer over the existing Tranzy API flow
2. WHEN Schedule_Data is unavailable or loading, THE System SHALL continue operating with existing GPS-based behavior
3. THE Schedule_Store SHALL follow existing store patterns (Zustand with persistence, loading/error states, cache freshness checks)
4. THE System SHALL not modify existing TranzyStopTimeResponse or other Tranzy API interfaces
5. WHEN schedule features are active, THE System SHALL not increase the main bundle size by more than 50KB (excluding the schedule JSON payload)

### Requirement 11: Data Attribution

**User Story:** As a responsible data consumer, I want the app to comply with the CC-BY-SA-4.0 license, so that data attribution is properly displayed.

#### Acceptance Criteria

1. THE System SHALL display attribution for the GTFS data source in the app's about/info section
2. THE attribution SHALL reference the data source and the CC-BY-SA-4.0 license
3. THE attribution SHALL be visible to users without requiring navigation to external links

### Requirement 12: Start-Station Scheduled & Ghost Vehicle Display (primary user-facing surface)

**User Story:** As a user at a route's start station, I want to see the next scheduled vehicle (and vehicles that should have departed but have no GPS yet), so that I know when service is coming even when no real-time vehicle is visible.

This is the primary user-facing surface for the schedule feature. It unifies the
UI intent of Requirements 6 (upcoming departures), 7 (ghost vehicles), and 9
(start-station handling). It applies only at a station that is the **start
station** for a route (direction-aware: the direction where this station is the
trip's first stop).

#### Acceptance Criteria

1. WHERE a station is the start station for a route, THE System SHALL show, in addition to any GPS-visible vehicles, one scheduled entry for the next scheduled departure of that route from that station.
2. WHILE the current time is before the next Scheduled_Departure, THE System SHALL display that entry with a distinct "scheduled" ETA bubble (blue) reading "Scheduled in X" (minutes, or hours+minutes when far away), distinct from the green "in X minutes" bubble for GPS vehicles and the "departed" bubble for recently departed vehicles.
3. WHEN the Scheduled_Departure time has passed, THE System SHALL show the vehicle as moving with predicted position and ETA estimates along the route, even when no GPS data has been received for that trip.
4. IF a GPS-visible vehicle is received for that trip, THEN THE System SHALL display it as a normal real (GPS) vehicle.
5. IF no GPS data is received after the Scheduled_Departure has passed (and before the scheduled end), THEN THE System SHALL treat it as a Ghost_Vehicle: on the map it SHALL be rendered visually distinct (e.g., translucent and a different color), and on the station card it SHALL keep the blue "scheduled" indicator visible in addition to the green "in X minutes" estimate.
6. WHEN a Ghost_Vehicle's scheduled end time has passed, THE System SHALL remove it.
7. WHERE schedule data is unavailable, THE System SHALL show only GPS vehicles (existing behavior), with no scheduled or ghost entries.
