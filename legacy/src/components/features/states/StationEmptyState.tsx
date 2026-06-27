// StationEmptyState - Empty state messages for station filtering
// Handles empty state when no nearby stations found

import type { FC } from 'react';
import { 
  Typography
} from '@mui/material';

interface StationEmptyStateProps {
  filteredCount: number;
  processing?: boolean; // Don't show empty state while processing
  hasStops?: boolean; // Don't show empty state if we have stops but haven't filtered yet
}

export const StationEmptyState: FC<StationEmptyStateProps> = ({
  filteredCount,
  processing = false,
  hasStops = false
}) => {
  // Don't show empty state while processing or if we have stops but haven't filtered yet
  if (processing || (hasStops && filteredCount === 0)) {
    return null;
  }
  
  // No nearby stations found
  if (filteredCount === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>
        No nearby stations with active service found
      </Typography>
    );
  }
  
  // Has stations - no empty state needed
  return null;
};