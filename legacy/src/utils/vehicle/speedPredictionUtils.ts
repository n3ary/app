/**
 * Speed Prediction Utilities (Simplified)
 * Main interface that combines the split utilities - replaces the 934-line monster file
 */

// Re-export the core functions from the split files
export { 
  predictVehicleSpeed, 
  validateSpeed,
  type SpeedPrediction 
} from './speedCalculationUtils';

export { 
  calculateStationDensityCenter,
  calculateAverageDistanceFromCenter,
  findStationsWithinRadius 
} from './stationDensityUtils';