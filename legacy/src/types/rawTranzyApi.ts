/**
 * Raw Tranzy API Response Interfaces
 * 
 * These interfaces define the exact structure of data returned by the Tranzy API.
 * Field names match the API response exactly - no transformations or renaming.
 * 
 * @see https://api.tranzy.ai/v1/opendata/ - Official API documentation
 * @version Based on API responses as of January 2026
 */

/**
 * Transit agency information from Tranzy API
 * Represents a public transportation agency/operator
 */
export interface TranzyAgencyResponse {
  /** Unique identifier for the transit agency */
  agency_id: number;
  /** Display name of the transit agency */
  agency_name: string;
  /** Official website URL (optional) */
  agency_url?: string;
  /** Timezone for agency operations (optional) */
  agency_timezone?: string;
  /** Contact phone number (optional, may be null) */
  agency_phone?: string | null;
  /** Primary language code (optional) */
  agency_lang?: string;
  /** Fare information URL (optional, may be null) */
  agency_fare_url?: string | null;
  /** Additional agency URLs (some agencies have multiple) */
  agency_urls?: string[];
}

/**
 * Route definition from Tranzy API
 * Represents a transit route (bus line, tram line, etc.)
 */
export interface TranzyRouteResponse {
  /** ID of the agency operating this route */
  agency_id: number;
  /** Unique identifier for this route */
  route_id: number;
  /** Short name/number displayed to passengers (e.g., "24", "1A") */
  route_short_name: string;
  /** Full descriptive name of the route */
  route_long_name: string;
  /** Hex color code for route visualization (e.g., "#FF0000") */
  route_color: string;
  /** GTFS route type (0=Tram, 3=Bus, 11=Trolleybus) */
  route_type: number;
  /** Detailed description of the route */
  route_desc: string;
}

/**
 * GTFS route type labels for display purposes
 * Maps numeric route types to human-readable labels
 */
export const ROUTE_TYPE_LABELS = {
  0: 'Tram',
  3: 'Bus', 
  11: 'Trolleybus'
} as const;

export type RouteType = keyof typeof ROUTE_TYPE_LABELS;

/**
 * Get human-readable label for a route type
 * @param routeType - Numeric route type from API
 * @returns Display label or "Unknown" for unrecognized types
 */
export const getRouteTypeLabel = (routeType: number): string => {
  return ROUTE_TYPE_LABELS[routeType as RouteType] || 'Unknown';
};

/**
 * Transport type mapping for filtering (inverse of ROUTE_TYPE_LABELS)
 * Maps filter keys to GTFS route type numbers
 */
export const TRANSPORT_TYPE_MAP = {
  bus: 3,
  tram: 0,
  trolleybus: 11
} as const;

export type TransportTypeKey = keyof typeof TRANSPORT_TYPE_MAP;

/**
 * Get transport type options for UI components
 * Dynamically generates filter options from available transport types
 * @returns Array of transport type options with keys and display labels
 */
export function getTransportTypeOptions(): { key: TransportTypeKey; label: string }[] {
  return Object.keys(TRANSPORT_TYPE_MAP).map(key => {
    const transportKey = key as TransportTypeKey;
    const routeType = TRANSPORT_TYPE_MAP[transportKey];
    const label = ROUTE_TYPE_LABELS[routeType as RouteType];
    return { key: transportKey, label };
  });
}

/**
 * Station/stop information from Tranzy API
 * Represents a physical location where vehicles stop
 */
export interface TranzyStopResponse {
  /** Unique identifier for this stop */
  stop_id: number;
  /** Display name of the stop */
  stop_name: string;
  /** Latitude coordinate (WGS84) */
  stop_lat: number;
  /** Longitude coordinate (WGS84) */
  stop_lon: number;
  /** GTFS location type (0=stop, 1=station) */
  location_type: number;
  /** Short code for the stop (may be null) */
  stop_code: string | null;
}

/**
 * Live vehicle position from Tranzy API
 * Represents real-time location and status of a transit vehicle
 */
export interface TranzyVehicleResponse {
  /** Unique identifier for this vehicle (Note: API uses 'id', not 'vehicle_id') */
  id: number;
  /** Vehicle label/number displayed to passengers */
  label: string;
  /** Current latitude position (Note: API uses 'latitude', not 'position_latitude') */
  latitude: number;
  /** Current longitude position (Note: API uses 'longitude', not 'position_longitude') */
  longitude: number;
  /** Timestamp of last position update (ISO string format) */
  timestamp: string;
  /** Current speed in km/h */
  speed: number;
  /** ID of route this vehicle is serving (null if not in service) */
  route_id: number | null;
  /** ID of current trip (null if not in service) */
  trip_id: string | null;
  /** Vehicle type identifier */
  vehicle_type: number;
  /** Bicycle accessibility status */
  bike_accessible: 'BIKE_INACCESSIBLE' | 'BIKE_ACCESSIBLE';
  /** Wheelchair accessibility status */
  wheelchair_accessible: 'WHEELCHAIR_ACCESSIBLE' | 'WHEELCHAIR_INACCESSIBLE';
}

/**
 * Stop time sequence from Tranzy API
 * Represents the order of stops in a trip
 * 
 * Note: arrival_time and departure_time are NOT included in the API response.
 * The API only returns trip_id, stop_id, and stop_sequence.
 */
export interface TranzyStopTimeResponse {
  /** ID of the trip this stop belongs to */
  trip_id: string;
  /** ID of the stop in this sequence */
  stop_id: number;
  /** Order of this stop in the trip (starting from 0) */
  stop_sequence: number;
}

/**
 * Trip definition from Tranzy API
 * Represents a scheduled journey along a route
 */
export interface TranzyTripResponse {
  /** Unique identifier for this trip */
  trip_id: string;
  /** ID of the route this trip follows */
  route_id: number;
  /** Service calendar ID for scheduling */
  service_id: string;
  /** Destination displayed to passengers */
  trip_headsign: string;
  /** Direction of travel (0 or 1) */
  direction_id: number;
  /** Block ID for vehicle scheduling */
  block_id: number;
  /** ID of the shape defining the trip's path */
  shape_id: string;
}

/**
 * Route shape point from Tranzy API
 * Represents a single point in a route's geographic path
 */
export interface TranzyShapeResponse {
  /** ID of the shape this point belongs to */
  shape_id: string;
  /** Latitude of this shape point */
  shape_pt_lat: number;
  /** Longitude of this shape point */
  shape_pt_lon: number;
  /** Order of this point in the shape sequence */
  shape_pt_sequence: number;
}