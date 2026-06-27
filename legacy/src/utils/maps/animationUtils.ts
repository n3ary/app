/**
 * Animation utilities for smooth map transitions
 * Handles vehicle position interpolation and smooth marker movement
 */

import type { Coordinates } from '../../types/arrivalTime';

export interface AnimationState {
  startPosition: Coordinates;
  endPosition: Coordinates;
  startTime: number;
  duration: number;
}

/**
 * Linear interpolation between two coordinates
 */
export function interpolateCoordinates(
  start: Coordinates,
  end: Coordinates,
  progress: number // 0 to 1
): Coordinates {
  return {
    lat: start.lat + (end.lat - start.lat) * progress,
    lon: start.lon + (end.lon - start.lon) * progress
  };
}

/**
 * Calculate animation progress with easing
 * Uses ease-out function for natural movement
 */
export function calculateAnimationProgress(
  startTime: number,
  duration: number,
  currentTime: number = Date.now()
): number {
  const elapsed = currentTime - startTime;
  const rawProgress = Math.min(elapsed / duration, 1);
  
  // Ease-out cubic function for natural deceleration
  return 1 - Math.pow(1 - rawProgress, 3);
}

/**
 * Check if animation should continue
 */
export function isAnimationComplete(
  startTime: number,
  duration: number,
  currentTime: number = Date.now()
): boolean {
  return (currentTime - startTime) >= duration;
}

/**
 * Calculate distance between two coordinates in meters
 * Used to determine if animation is needed
 */
export function calculateCoordinateDistance(
  coord1: Coordinates,
  coord2: Coordinates
): number {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = coord1.lat * Math.PI / 180;
  const φ2 = coord2.lat * Math.PI / 180;
  const Δφ = (coord2.lat - coord1.lat) * Math.PI / 180;
  const Δλ = (coord2.lon - coord1.lon) * Math.PI / 180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c;
}

/**
 * Determine if position change warrants animation
 * Skip animation for very small movements to avoid jitter
 */
export function shouldAnimateMovement(
  oldPosition: Coordinates,
  newPosition: Coordinates,
  minDistance: number = 5 // meters
): boolean {
  const distance = calculateCoordinateDistance(oldPosition, newPosition);
  return distance >= minDistance;
}