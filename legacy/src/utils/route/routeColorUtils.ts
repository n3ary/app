// Route color utilities for transportation type-based coloring
// Maps GTFS route types to consistent color schemes

import { APP_COLORS, getTransportTypeColor as getColorFromConstants, getTransportTypeMuiColor as getMuiColorFromConstants } from '../core/colorConstants';

/**
 * Transportation type color mapping
 * Uses distinct colors for each transport type for better visual identification
 */
export const TRANSPORT_TYPE_COLORS = APP_COLORS.TRANSPORT_TYPES;

/**
 * Get color for transportation type
 * @param routeType - GTFS route type (0=Tram, 3=Bus, 11=Trolleybus)
 * @returns Hex color string
 */
export const getTransportTypeColor = getColorFromConstants;

/**
 * Get contrast text color for transportation type background
 * @param routeType - GTFS route type
 * @returns 'white' or 'black' for optimal contrast
 */
export const getTransportTypeTextColor = (routeType: number): string => {
  // All our transport colors are dark enough to use white text
  return APP_COLORS.TEXT_COLORS.WHITE;
};

/**
 * Get Material-UI color variant for transportation type
 * @param routeType - GTFS route type
 * @returns Material-UI color variant
 */
export const getTransportTypeMuiColor = getMuiColorFromConstants;