/**
 * ScheduledDepartureChip Component
 * Distinguishing badge for a route's next SCHEDULED departure at its start station.
 * Always renders a small outlined "Scheduled" chip; shows an info toast on click.
 *
 * Mirrors VehicleDropOffChip in structure, but uses MUI `info` (blue) colors and
 * has no render guard — it is the badge that marks a scheduled (non-GPS) row.
 */

import type { FC } from 'react';
import { useState } from 'react';
import { Chip, Snackbar, Alert } from '@mui/material';

interface ScheduledDepartureChipProps {
  /** Optional callback when info is clicked */
  onInfoClick?: () => void;
}

/**
 * ScheduledDepartureChip - Badge for scheduled (non-GPS) departure rows
 *
 * @param onInfoClick - Optional callback for click events
 */
export const ScheduledDepartureChip: FC<ScheduledDepartureChipProps> = ({
  onInfoClick,
}) => {
  const [toastOpen, setToastOpen] = useState(false);

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
        label="Scheduled"
        size="small"
        variant="outlined"
        onClick={handleClick}
        sx={{
          borderColor: 'info.main',
          color: 'info.main',
          bgcolor: 'transparent',
          cursor: 'pointer',
          fontSize: { xs: '0.7rem', sm: '0.75rem' },
          '&:hover': {
            bgcolor: 'info.main',
            color: 'info.contrastText',
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
          severity="info"
          variant="filled"
          sx={{ width: '100%' }}
        >
          Next scheduled departure from this start station. No live GPS yet.
        </Alert>
      </Snackbar>
    </>
  );
};
