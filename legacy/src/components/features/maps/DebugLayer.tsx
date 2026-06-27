/**
 * DebugLayer - Renders debug visualization for distance calculations and vehicle position predictions
 * Shows debug lines, projections, distance labels, and both API/predicted positions
 * Implements requirements 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.3, 5.4, 5.5
 */

import type { FC } from 'react';
import { Polyline, Marker, Popup, Circle } from 'react-leaflet';
import type { DebugLayerProps } from '../../../types/map/mapLayers';
import { calculateDistance } from '../../../utils/location/distanceUtils';
import { createDebugIcon, createDistanceLabelIcon, createVehicleIcon } from '../../../utils/maps/iconUtils';
import type { EnhancedVehicleData } from '../../../utils/vehicle/vehicleEnhancementUtils';

// Calculate midpoint between two coordinates
const calculateMidpoint = (coord1: { lat: number; lon: number }, coord2: { lat: number; lon: number }) => ({
  lat: (coord1.lat + coord2.lat) / 2,
  lon: (coord1.lon + coord2.lon) / 2,
});

export const DebugLayer: FC<DebugLayerProps> = ({
  debugData,
  visible,
  colorScheme,
  vehicles = [],
}) => {
  if (!visible) return null;

  const {
    vehiclePosition,
    targetStationPosition,
    nextStationPosition,
    vehicleProjection,
    stationProjection,
    nextStationProjection,
    routeShape,
    distanceCalculation,
    nextStationInfo,
  } = debugData;

  // Only validate the most critical data - allow partial debug info to show
  if (!vehiclePosition || !targetStationPosition) {
    return null;
  }

  // Calculate various distances for display
  const directDistance = calculateDistance(vehiclePosition, targetStationPosition);
  const vehicleToProjectionDistance = vehicleProjection?.closestPoint 
    ? calculateDistance(vehiclePosition, vehicleProjection.closestPoint)
    : 0;
  const stationToProjectionDistance = stationProjection?.closestPoint
    ? calculateDistance(targetStationPosition, stationProjection.closestPoint)
    : 0;

  return (
    <>
      {/* 1. Vehicle to station direct distance line (Requirement 4.1) - NOT used in calculation */}
      <Polyline
        positions={[
          [vehiclePosition.lat, vehiclePosition.lon],
          [targetStationPosition.lat, targetStationPosition.lon],
        ]}
        pathOptions={{
          color: '#FF5722', // Bright red - indicates this is NOT used in calculation
          weight: 2,
          opacity: 0.7,
          dashArray: '8, 4',
        }}
      >
        <Popup>
          <div style={{ minWidth: '200px' }}>
            <div style={{ 
              fontWeight: 'bold', 
              fontSize: '14px', 
              marginBottom: '8px',
              color: '#FF5722'
            }}>
              Direct Distance Line (NOT USED)
            </div>
            <div><strong>Distance:</strong> {directDistance.toFixed(0)}m</div>
            <div><strong>Calculation Method:</strong> {distanceCalculation?.method || 'Unknown'}</div>
            <div><strong>Confidence:</strong> {distanceCalculation?.confidence || 'Unknown'}</div>
            <div><strong>Total Distance:</strong> {distanceCalculation?.totalDistance?.toFixed(0) || '0'}m</div>
            <div style={{ 
              fontSize: '11px', 
              color: '#666', 
              marginTop: '6px',
              fontStyle: 'italic'
            }}>
              This straight line is NOT used for arrival calculations - shown for reference only
            </div>
          </div>
        </Popup>
      </Polyline>

      {/* 2. Vehicle projection line (Requirement 4.2) - NOT used in calculation */}
      {vehicleProjection?.closestPoint && vehicleProjection.distanceToShape > 10 && ( // Only show if vehicle is significantly off route
        <Polyline
          positions={[
            [vehiclePosition.lat, vehiclePosition.lon],
            [vehicleProjection.closestPoint.lat, vehicleProjection.closestPoint.lon],
          ]}
          pathOptions={{
            color: '#2196F3', // Bright blue - indicates this is NOT used in calculation
            weight: 2,
            opacity: 0.7,
            lineCap: 'round',
          }}
        >
          <Popup>
            <div style={{ minWidth: '180px' }}>
              <div style={{ 
                fontWeight: 'bold', 
                fontSize: '14px', 
                marginBottom: '8px',
                color: '#2196F3'
              }}>
                Vehicle Projection (NOT USED)
              </div>
              <div><strong>Distance to Route:</strong> {vehicleProjection.distanceToShape.toFixed(1)}m</div>
              <div><strong>Segment Index:</strong> {vehicleProjection.segmentIndex}</div>
              <div><strong>Position on Segment:</strong> {(vehicleProjection.positionAlongSegment * 100).toFixed(1)}%</div>
              <div style={{ 
                fontSize: '11px', 
                color: '#666', 
                marginTop: '6px',
                fontStyle: 'italic'
              }}>
                Shows how vehicle position projects onto the route shape - for debugging only
              </div>
            </div>
          </Popup>
        </Polyline>
      )}

      {/* 3. Station projection line (Requirement 4.3) - NOT used in calculation */}
      {stationProjection?.closestPoint && stationProjection.distanceToShape > 10 && ( // Only show if station is significantly off route
        <Polyline
          positions={[
            [targetStationPosition.lat, targetStationPosition.lon],
            [stationProjection.closestPoint.lat, stationProjection.closestPoint.lon],
          ]}
          pathOptions={{
            color: '#9C27B0', // Bright purple - indicates this is NOT used in calculation
            weight: 2,
            opacity: 0.7,
            lineCap: 'round',
          }}
        >
          <Popup>
            <div style={{ minWidth: '180px' }}>
              <div style={{ 
                fontWeight: 'bold', 
                fontSize: '14px', 
                marginBottom: '8px',
                color: '#9C27B0'
              }}>
                Station Projection (NOT USED)
              </div>
              <div><strong>Distance to Route:</strong> {stationProjection.distanceToShape.toFixed(1)}m</div>
              <div><strong>Segment Index:</strong> {stationProjection.segmentIndex}</div>
              <div><strong>Position on Segment:</strong> {(stationProjection.positionAlongSegment * 100).toFixed(1)}%</div>
              <div style={{ 
                fontSize: '11px', 
                color: '#666', 
                marginTop: '6px',
                fontStyle: 'italic'
              }}>
                Shows how station position projects onto the route shape - for debugging only
              </div>
            </div>
          </Popup>
        </Polyline>
      )}

      {/* Route segment between vehicle and target station */}
      {(() => {
        // Check if projection data is available
        if (vehicleProjection?.segmentIndex === undefined || stationProjection?.segmentIndex === undefined) {
          return null;
        }
        
        // Show the route from vehicle position to target station (or from station to vehicle if passed)
        const vehicleSegmentIndex = vehicleProjection.segmentIndex;
        const stationSegmentIndex = stationProjection.segmentIndex;
        
        // Determine if vehicle has passed the station
        const vehiclePassed = vehicleSegmentIndex > stationSegmentIndex;
        const segmentSpan = Math.abs(stationSegmentIndex - vehicleSegmentIndex);
        
        // Skip if the route would be too long (performance protection)
        if (segmentSpan > 500) {
          return null; // Truly excessive, would be too long to display meaningfully
        }
        
        // Skip if vehicle and station are on the same segment (too close)
        if (segmentSpan === 0) {
          return null;
        }
        
        // Build route points following the actual route shape
        const routePoints: [number, number][] = [];
        
        if (vehiclePassed) {
          // Vehicle has passed the station - show route from station to vehicle
          
          // Start from station's exact projected position
          const stationSegment = routeShape.segments[stationSegmentIndex];
          if (stationSegment && stationProjection.positionAlongSegment <= 1.0) {
            const t = stationProjection.positionAlongSegment;
            const exactStationPoint = {
              lat: stationSegment.start.lat + t * (stationSegment.end.lat - stationSegment.start.lat),
              lon: stationSegment.start.lon + t * (stationSegment.end.lon - stationSegment.start.lon)
            };
            routePoints.push([exactStationPoint.lat, exactStationPoint.lon]);
          }
          
          // Add the end of the station segment (if not already added)
          if (stationSegmentIndex < routeShape.points.length) {
            const stationSegmentEndPoint = routeShape.points[stationSegmentIndex + 1];
            if (stationSegmentEndPoint) {
              routePoints.push([stationSegmentEndPoint.lat, stationSegmentEndPoint.lon]);
            }
          }
          
          // Add all intermediate points from station to vehicle
          for (let i = stationSegmentIndex + 1; i < vehicleSegmentIndex && i < routeShape.points.length; i++) {
            const point = routeShape.points[i];
            routePoints.push([point.lat, point.lon]);
          }
          
          // Add vehicle's projected position as final point
          routePoints.push([vehicleProjection.closestPoint.lat, vehicleProjection.closestPoint.lon]);
          
        } else {
          // Vehicle hasn't reached station yet - show route from vehicle to station
          
          // Start from vehicle's projected position
          routePoints.push([vehicleProjection.closestPoint.lat, vehicleProjection.closestPoint.lon]);
          
          // Add all complete intermediate segments (no sampling)
          for (let i = vehicleSegmentIndex + 1; i < stationSegmentIndex && i < routeShape.points.length; i++) {
            const point = routeShape.points[i];
            routePoints.push([point.lat, point.lon]);
          }
          
          // Add the start of the station segment
          if (stationSegmentIndex < routeShape.points.length) {
            const stationSegmentStartPoint = routeShape.points[stationSegmentIndex];
            routePoints.push([stationSegmentStartPoint.lat, stationSegmentStartPoint.lon]);
          }
          
          // ALWAYS calculate and add the exact station position as the final point
          const stationSegment = routeShape.segments[stationSegmentIndex];
          if (stationSegment && stationProjection.positionAlongSegment <= 1.0) {
            const t = stationProjection.positionAlongSegment;
            const exactStationPoint = {
              lat: stationSegment.start.lat + t * (stationSegment.end.lat - stationSegment.start.lat),
              lon: stationSegment.start.lon + t * (stationSegment.end.lon - stationSegment.start.lon)
            };
            routePoints.push([exactStationPoint.lat, exactStationPoint.lon]);
          }
        }
        
        // Only show if we have a meaningful route
        if (routePoints.length < 2) {
          return null;
        }
        
        return (
          <Polyline
            positions={routePoints}
            pathOptions={{
              color: '#666666',
              weight: 6,
              opacity: 0.8,
              lineCap: 'round',
              lineJoin: 'round',
            }}
          >
            <Popup>
              <div style={{ minWidth: '200px' }}>
                <div style={{ 
                  fontWeight: 'bold', 
                  fontSize: '14px', 
                  marginBottom: '8px',
                  color: '#666666'
                }}>
                  Route Segment (USED IN CALCULATION)
                </div>
                <div><strong>Shape ID:</strong> {routeShape.id}</div>
                <div><strong>Vehicle Segment:</strong> {vehicleSegmentIndex}</div>
                <div><strong>Station Segment:</strong> {stationSegmentIndex}</div>
                <div><strong>Segment Span:</strong> {segmentSpan} segments</div>
                <div><strong>Route Points:</strong> {routePoints.length}</div>
                <div><strong>Direction:</strong> {vehiclePassed ? 'Station → Vehicle (PASSED)' : 'Vehicle → Station (APPROACHING)'}</div>
                <div><strong>Station Position:</strong> t={stationProjection.positionAlongSegment.toFixed(3)}</div>
                <div style={{ 
                  fontSize: '11px', 
                  color: '#666', 
                  marginTop: '6px',
                  fontStyle: 'italic'
                }}>
                  {vehiclePassed 
                    ? 'Shows distance from station to vehicle (for "just left" calculation)'
                    : 'Route follows road geometry and stops at exact station position'
                  }
                </div>
              </div>
            </Popup>
          </Polyline>
        );
      })()}

      {/* Debug markers with distinct shapes (Requirement 4.4) */}
      
      {/* Vehicle projection point */}
      {vehicleProjection?.closestPoint && (
        <Marker
          position={[vehicleProjection.closestPoint.lat, vehicleProjection.closestPoint.lon]}
          icon={createDebugIcon({ color: colorScheme.debug.projectionLine, shape: 'square', size: 14 })}
        >
          <Popup>
            <div>
              <strong>Vehicle Projection Point</strong>
              <br />
              Closest point on route to vehicle
              <br />
              Distance: {vehicleProjection.distanceToShape.toFixed(1)}m
              <br />
              Coordinates: {vehicleProjection.closestPoint.lat.toFixed(6)}, {vehicleProjection.closestPoint.lon.toFixed(6)}
            </div>
          </Popup>
        </Marker>
      )}

      {/* Station projection point */}
      {stationProjection?.closestPoint && (
        <Marker
          position={[stationProjection.closestPoint.lat, stationProjection.closestPoint.lon]}
          icon={createDebugIcon({ color: colorScheme.debug.projectionLine, shape: 'triangle', size: 14 })}
        >
          <Popup>
            <div>
            <strong>Station Projection Point</strong>
            <br />
            Closest point on route to station
            <br />
            Distance: {stationProjection.distanceToShape.toFixed(1)}m
            <br />
            Coordinates: {stationProjection.closestPoint.lat.toFixed(6)}, {stationProjection.closestPoint.lon.toFixed(6)}
          </div>
        </Popup>
      </Marker>
      )}

      {/* Vehicle position marker */}
      <Marker
        position={[vehiclePosition.lat, vehiclePosition.lon]}
        icon={createDebugIcon({ color: '#FF5722', shape: 'circle', size: 16 })}
      >
        <Popup>
          <div>
            <strong>Vehicle Position (Debug)</strong>
            <br />
            Current vehicle location
            <br />
            Coordinates: {vehiclePosition.lat.toFixed(6)}, {vehiclePosition.lon.toFixed(6)}
          </div>
        </Popup>
      </Marker>

      {/* Target station marker */}
      <Marker
        position={[targetStationPosition.lat, targetStationPosition.lon]}
        icon={createDebugIcon({ color: '#9C27B0', shape: 'circle', size: 16 })}
      >
        <Popup>
          <div>
            <strong>Target Station (Debug)</strong>
            <br />
            Destination station location
            <br />
            Coordinates: {targetStationPosition.lat.toFixed(6)}, {targetStationPosition.lon.toFixed(6)}
          </div>
        </Popup>
      </Marker>

      {/* Next station marker and line (NEW) */}
      {nextStationPosition && nextStationInfo && (
        <>
          {/* Line from vehicle to next station - NOT used in calculation */}
          <Polyline
            positions={[
              [vehiclePosition.lat, vehiclePosition.lon],
              [nextStationPosition.lat, nextStationPosition.lon],
            ]}
            pathOptions={{
              color: nextStationInfo.isTargetStation ? '#4CAF50' : '#FF9800', // Bright colors - NOT used in calculation
              weight: 3,
              opacity: 0.9,
              dashArray: nextStationInfo.isTargetStation ? undefined : '12, 6', // Solid if target, dashed if different
            }}
          >
            <Popup>
              <div style={{ minWidth: '200px' }}>
                <div style={{ 
                  fontWeight: 'bold', 
                  fontSize: '14px', 
                  marginBottom: '8px',
                  color: nextStationInfo.isTargetStation ? '#4CAF50' : '#FF9800'
                }}>
                  Vehicle → Next Station (NOT USED)
                </div>
                <div><strong>Next Stop:</strong> {nextStationInfo.stop_name}</div>
                <div><strong>Stop ID:</strong> {nextStationInfo.stop_id}</div>
                <div><strong>Is Target:</strong> {nextStationInfo.isTargetStation ? 'YES' : 'NO'}</div>
                <div><strong>Distance:</strong> {calculateDistance(vehiclePosition, nextStationPosition).toFixed(0)}m</div>
                <div style={{ 
                  fontSize: '11px', 
                  color: '#666', 
                  marginTop: '6px',
                  fontStyle: 'italic'
                }}>
                  {nextStationInfo.isTargetStation 
                    ? 'Vehicle is heading directly to your target station - straight line for reference only'
                    : 'Vehicle must visit this stop before reaching your target station - straight line for reference only'
                  }
                </div>
              </div>
            </Popup>
          </Polyline>

          {/* Next station marker */}
          <Marker
            position={[nextStationPosition.lat, nextStationPosition.lon]}
            icon={createDebugIcon({ 
              color: nextStationInfo.isTargetStation ? '#4CAF50' : '#FF9800', 
              shape: 'triangle', 
              size: 18 
            })}
          >
            <Popup>
              <div>
                <strong>Next Station (GPS-Based)</strong>
                <br />
                <strong>Name:</strong> {nextStationInfo.stop_name}
                <br />
                <strong>Stop ID:</strong> {nextStationInfo.stop_id}
                <br />
                <strong>Status:</strong> {nextStationInfo.isTargetStation ? 'TARGET STATION' : 'INTERMEDIATE STOP'}
                <br />
                <strong>Distance from Vehicle:</strong> {calculateDistance(vehiclePosition, nextStationPosition).toFixed(0)}m
                <br />
                Coordinates: {nextStationPosition.lat.toFixed(6)}, {nextStationPosition.lon.toFixed(6)}
              </div>
            </Popup>
          </Marker>

          {/* Next station projection line (if available) */}
          {nextStationProjection && (
            <Polyline
              positions={[
                [nextStationPosition.lat, nextStationPosition.lon],
                [nextStationProjection.closestPoint.lat, nextStationProjection.closestPoint.lon],
              ]}
              pathOptions={{
                color: '#FF9800',
                weight: 2,
                opacity: 0.7,
                lineCap: 'round',
              }}
            >
              <Popup>
                <div style={{ minWidth: '180px' }}>
                  <div style={{ 
                    fontWeight: 'bold', 
                    fontSize: '14px', 
                    marginBottom: '8px',
                    color: '#FF9800'
                  }}>
                    Next Station Projection
                  </div>
                  <div><strong>Distance to Route:</strong> {nextStationProjection.distanceToShape.toFixed(1)}m</div>
                  <div><strong>Segment Index:</strong> {nextStationProjection.segmentIndex}</div>
                  <div><strong>Position on Segment:</strong> {(nextStationProjection.positionAlongSegment * 100).toFixed(1)}%</div>
                  <div style={{ 
                    fontSize: '11px', 
                    color: '#666', 
                    marginTop: '6px',
                    fontStyle: 'italic'
                  }}>
                    Shows how next station projects onto the route shape
                  </div>
                </div>
              </Popup>
            </Polyline>
          )}
        </>
      )}

      {/* Distance labels with color coding (Requirement 4.5) */}
      
      {/* Direct distance label */}
      <Marker
        position={[
          calculateMidpoint(vehiclePosition, targetStationPosition).lat,
          calculateMidpoint(vehiclePosition, targetStationPosition).lon,
        ]}
        icon={createDistanceLabelIcon(
          `${directDistance.toFixed(0)}m`, 
          'direct', 
          distanceCalculation?.confidence as 'high' | 'medium' | 'low' || 'low'
        )}
      />

      {/* Vehicle projection distance label */}
      {vehicleToProjectionDistance > 10 && ( // Only show if significant distance
        <Marker
          position={[
            calculateMidpoint(vehiclePosition, vehicleProjection.closestPoint).lat,
            calculateMidpoint(vehiclePosition, vehicleProjection.closestPoint).lon,
          ]}
          icon={createDistanceLabelIcon(
            `${vehicleToProjectionDistance.toFixed(0)}m`, 
            'projection'
          )}
        />
      )}

      {/* Station projection distance label */}
      {stationToProjectionDistance > 10 && ( // Only show if significant distance
        <Marker
          position={[
            calculateMidpoint(targetStationPosition, stationProjection.closestPoint).lat,
            calculateMidpoint(targetStationPosition, stationProjection.closestPoint).lon,
          ]}
          icon={createDistanceLabelIcon(
            `${stationToProjectionDistance.toFixed(0)}m`, 
            'projection'
          )}
        />
      )}

      {/* Accuracy circles around key points */}
      {vehicleProjection?.distanceToShape !== undefined && (
        <Circle
          center={[vehiclePosition.lat, vehiclePosition.lon]}
          radius={Math.max(10, vehicleProjection.distanceToShape)}
          pathOptions={{
            color: colorScheme.debug.projectionLine,
            weight: 1,
            opacity: 0.3,
            fillOpacity: 0.1,
          }}
        />
      )}

      {stationProjection?.distanceToShape !== undefined && (
        <Circle
          center={[targetStationPosition.lat, targetStationPosition.lon]}
          radius={Math.max(10, stationProjection.distanceToShape)}
          pathOptions={{
            color: colorScheme.debug.projectionLine,
            weight: 1,
            opacity: 0.3,
            fillOpacity: 0.1,
          }}
        />
      )}

      {/* Vehicle Position Prediction Debug Visualization (Requirements 5.1, 5.2, 5.3, 5.4, 5.5) */}
      {vehicles.map(vehicle => {
        // Only show vehicles with prediction metadata
        if (!vehicle.predictionMetadata) return null;

        const { positionApplied, timestampAge } = vehicle.predictionMetadata;
        
        // Skip vehicles without meaningful prediction data
        if (!positionApplied || timestampAge < 1000) return null; // Less than 1 second age

        const apiPosition = { lat: vehicle.apiLatitude, lon: vehicle.apiLongitude };
        const predictedPosition = { lat: vehicle.latitude, lon: vehicle.longitude };
        
        // Calculate distance between API and predicted positions
        const predictionDistance = calculateDistance(apiPosition, predictedPosition);
        
        // Skip if positions are too close (less than 5 meters apart)
        if (predictionDistance < 5) return null;

        return (
          <div key={`vehicle-prediction-${vehicle.id}`}>
            {/* Line connecting API position to predicted position */}
            <Polyline
              positions={[
                [apiPosition.lat, apiPosition.lon],
                [predictedPosition.lat, predictedPosition.lon],
              ]}
              pathOptions={{
                color: '#FF9800', // Orange for prediction movement
                weight: 3,
                opacity: 0.8,
                dashArray: '8, 4',
                lineCap: 'round',
              }}
            >
              <Popup>
                <div style={{ minWidth: '220px' }}>
                  <div style={{ 
                    fontWeight: 'bold', 
                    fontSize: '14px', 
                    marginBottom: '8px',
                    color: '#FF9800'
                  }}>
                    Position Prediction Movement
                  </div>
                  <div><strong>Vehicle:</strong> {vehicle.label}</div>
                  <div><strong>Timestamp Age:</strong> {Math.round(timestampAge / 1000)}s</div>
                  <div><strong>Predicted Distance:</strong> {Math.round(vehicle.predictionMetadata.predictedDistance)}m</div>
                  <div><strong>Movement Distance:</strong> {Math.round(predictionDistance)}m</div>
                  <div><strong>Stations Encountered:</strong> {vehicle.predictionMetadata.stationsEncountered}</div>
                  <div><strong>Total Dwell Time:</strong> {Math.round(vehicle.predictionMetadata.totalDwellTime / 1000)}s</div>
                  <div><strong>Method:</strong> {vehicle.predictionMetadata.positionMethod}</div>
                  <div style={{ 
                    fontSize: '11px', 
                    color: '#666', 
                    marginTop: '6px',
                    fontStyle: 'italic'
                  }}>
                    Shows vehicle movement from API position (grey) to predicted current position (normal)
                  </div>
                </div>
              </Popup>
            </Polyline>

            {/* API Position Marker (washed/grey styling) */}
            <Marker
              position={[apiPosition.lat, apiPosition.lon]}
              icon={createVehicleIcon({ 
                color: '#9E9E9E', // Grey for historical API position
                size: 20,
                isSelected: false
              })}
            >
              <Popup>
                <div style={{ minWidth: '200px' }}>
                  <div style={{ 
                    fontWeight: 'bold', 
                    fontSize: '14px', 
                    marginBottom: '8px',
                    color: '#9E9E9E'
                  }}>
                    API Position (Historical)
                  </div>
                  <div><strong>Vehicle:</strong> {vehicle.label}</div>
                  <div><strong>Coordinates:</strong> {apiPosition.lat.toFixed(6)}, {apiPosition.lon.toFixed(6)}</div>
                  <div><strong>Timestamp:</strong> {vehicle.timestamp}</div>
                  <div><strong>Age:</strong> {Math.round(timestampAge / 1000)} seconds old</div>
                  <div><strong>Speed:</strong> {vehicle.speed} km/h</div>
                  {vehicle.trip_id && (
                    <div><strong>Trip ID:</strong> {vehicle.trip_id}</div>
                  )}
                  <div style={{ 
                    fontSize: '11px', 
                    color: '#666', 
                    marginTop: '6px',
                    fontStyle: 'italic'
                  }}>
                    This is the original GPS position from the API - shown in grey because it's historical data
                  </div>
                </div>
              </Popup>
            </Marker>

            {/* Predicted Position Marker (normal vehicle styling) */}
            <Marker
              position={[predictedPosition.lat, predictedPosition.lon]}
              icon={createVehicleIcon({ 
                color: '#3182CE', // Station blue for predicted position
                size: 24,
                isSelected: false
              })}
            >
              <Popup>
                <div style={{ minWidth: '200px' }}>
                  <div style={{ 
                    fontWeight: 'bold', 
                    fontSize: '14px', 
                    marginBottom: '8px',
                    color: '#3182CE'
                  }}>
                    Predicted Position (Current)
                  </div>
                  <div><strong>Vehicle:</strong> {vehicle.label}</div>
                  <div><strong>Coordinates:</strong> {predictedPosition.lat.toFixed(6)}, {predictedPosition.lon.toFixed(6)}</div>
                  <div><strong>Prediction Method:</strong> {vehicle.predictionMetadata.positionMethod}</div>
                  <div><strong>Moved Distance:</strong> {Math.round(vehicle.predictionMetadata.predictedDistance)}m</div>
                  <div><strong>Time Elapsed:</strong> {Math.round(timestampAge / 1000)}s</div>
                  <div><strong>Stations Passed:</strong> {vehicle.predictionMetadata.stationsEncountered}</div>
                  <div><strong>Dwell Time Applied:</strong> {Math.round(vehicle.predictionMetadata.totalDwellTime / 1000)}s</div>
                  {vehicle.trip_id && (
                    <div><strong>Trip ID:</strong> {vehicle.trip_id}</div>
                  )}
                  <div style={{ 
                    fontSize: '11px', 
                    color: '#666', 
                    marginTop: '6px',
                    fontStyle: 'italic'
                  }}>
                    This is the calculated current position based on route movement simulation
                  </div>
                </div>
              </Popup>
            </Marker>

            {/* Distance label for prediction movement */}
            <Marker
              position={[
                (apiPosition.lat + predictedPosition.lat) / 2,
                (apiPosition.lon + predictedPosition.lon) / 2,
              ]}
              icon={createDistanceLabelIcon(
                `${Math.round(predictionDistance)}m`, 
                'route',
                'high' // Prediction is considered high confidence
              )}
            />
          </div>
        );
      })}
    </>
  );
};