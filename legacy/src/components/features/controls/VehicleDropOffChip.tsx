/**
 * VehicleDropOffChip Component
 * Displays a warning badge for vehicles terminating at the current station
 * Shows "Drop off only" indicator with toast message on click
 */

import type { FC } from 'react';
import { useState } from 'react';
import { Chip, Snackbar, Alert } from '@mui/material';

interface VehicleDropOffChipProps {
  /** Whether this vehicle is drop-off only at current station */
  isDropOffOnly: boolean;
  /** Optional callback when info is clicked */
  onInfoClick?: () => void;
}

/**
 * VehicleDropOffChip - Warning badge for drop-off only vehicles
 * 
 * Requirements:
 * - 3.2: Display "Drop off only" badge next to arrival time
 * - 3.4: Show toast message on click
 * 
 * @param isDropOffOnly - Whether to show the chip
 * @param onInfoClick - Optional callback for click events
 */
export const VehicleDropOffChip: FC<VehicleDropOffChipProps> = ({ 
  isDropOffOnly, 
  onInfoClick 
}) => {
  const [toastOpen, setToastOpen] = useState(false);

  // Don't render if not drop-off only
  if (!isDropOffOnly) {
    return null;
  }

  const handleClick = () => {
    setToastOpen(true);
    onInfoClick?.();
  };

  const handleToastClose = () => {
    setToastOpen(false);
  };

  return (
    <>
      <Chip
        label="Drop off only"
        size="small"
        variant="outlined"
        onClick={handleClick}
        sx={{
          borderColor: 'error.main',
          color: 'error.main',
          bgcolor: 'transparent',
          cursor: 'pointer',
          fontSize: { xs: '0.7rem', sm: '0.75rem' },
          '&:hover': {
            bgcolor: 'error.main',
            color: 'error.contrastText',
          }
        }}
      />
      
      <Snackbar
        open={toastOpen}
        onClose={handleToastClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert 
          onClose={handleToastClose} 
          severity="warning" 
          variant="filled"
          sx={{ width: '100%' }}
        >
          This vehicle terminates here. Do not board.
        </Alert>
      </Snackbar>
    </>
  );
};
