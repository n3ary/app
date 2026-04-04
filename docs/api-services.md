# API Services

## Overview

Simple API services for Neary using Tranzy API. All services use raw API field names with no transformations for consistency and simplicity.

## Available Services

### Core Services
- **vehicleService** - Get vehicle positions and tracking data
- **stationService** - Get stop information and locations  
- **routeService** - Get route definitions and metadata
- **tripService** - Get trip schedules and stop times
- **agencyService** - Get transit agency information
- **shapesService** - Get route geometry (polylines)

### Specialized Services
- **arrivalService** - Calculate real-time arrival estimates
- **locationService** - GPS location with error handling and retry logic

## Usage Example

```typescript
import { vehicleService, stationService } from '@/services';

// Get vehicles for an agency
const vehicles = await vehicleService.getVehicles('agency_id');

// Get stops for an agency  
const stops = await stationService.getStops('agency_id');
```

## Error Handling

All services include integrated error handling with status tracking. Location service includes retry logic with exponential backoff for GPS operations.
