/**
 * Distance calculation utilities using the Haversine formula
 * for accurate distance calculations between GPS coordinates.
 */

// Earth's radius in meters for Haversine formula
const EARTH_RADIUS_METERS = 6371000;

export interface Coordinates {
  lat: number;
  lon: number;
}

export interface LocationWithCoordinates extends Coordinates {
  // Base interface for any object that has coordinates
}

/**
 * Calculate the straight-line distance between two points using the Haversine formula.
 * This provides accurate distance calculations accounting for the Earth's curvature.
 * 
 * @param from - Starting coordinates
 * @param to - Destination coordinates
 * @returns Distance in meters
 */
export function calculateDistance(from: Coordinates, to: Coordinates): number {
  // Handle edge case: identical coordinates
  if (from.lat === to.lat && from.lon === to.lon) {
    return 0;
  }

  // Handle invalid coordinates
  if (!isValidCoordinate(from) || !isValidCoordinate(to)) {
    throw new Error('Invalid coordinates provided');
  }

  const φ1 = (from.lat * Math.PI) / 180; // φ, λ in radians
  const φ2 = (to.lat * Math.PI) / 180;
  const Δφ = ((to.lat - from.lat) * Math.PI) / 180;
  const Δλ = ((to.lon - from.lon) * Math.PI) / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const distance = EARTH_RADIUS_METERS * c; // Distance in meters
  return Math.round(distance); // Round to nearest meter
}

/**
 * Filter an array of items by distance from a center point.
 * 
 * @param items - Array of items with coordinates
 * @param center - Center point for distance calculation
 * @param maxDistanceMeters - Maximum distance in meters
 * @returns Filtered array of items within the specified distance
 */
export function filterByDistance<T extends LocationWithCoordinates>(
  items: T[],
  center: Coordinates,
  maxDistanceMeters: number
): T[] {
  if (!isValidCoordinate(center) || maxDistanceMeters < 0) {
    return items; // Return unfiltered if invalid parameters
  }

  return items.filter(item => {
    try {
      const distance = calculateDistance(center, item);
      return distance <= maxDistanceMeters;
    } catch {
      // If distance calculation fails, exclude the item
      return false;
    }
  });
}

/**
 * Sort an array of items by distance from a center point (closest first).
 * 
 * @param items - Array of items with coordinates
 * @param center - Center point for distance calculation
 * @returns Array sorted by distance (closest first)
 */
export function sortByDistance<T extends LocationWithCoordinates>(
  items: T[],
  center: Coordinates
): T[] {
  if (!isValidCoordinate(center)) {
    return items; // Return unsorted if invalid center
  }

  return [...items].sort((a, b) => {
    try {
      const distanceA = calculateDistance(center, a);
      const distanceB = calculateDistance(center, b);
      return distanceA - distanceB;
    } catch {
      // If distance calculation fails, maintain original order
      return 0;
    }
  });
}



/**
 * Validate that coordinates are within valid ranges.
 * 
 * @param coords - Coordinates to validate
 * @returns True if coordinates are valid
 */
function isValidCoordinate(coords: Coordinates): boolean {
  return (
    typeof coords.lat === 'number' &&
    typeof coords.lon === 'number' &&
    !isNaN(coords.lat) &&
    !isNaN(coords.lon) &&
    coords.lat >= -90 &&
    coords.lat <= 90 &&
    coords.lon >= -180 &&
    coords.lon <= 180
  );
}

