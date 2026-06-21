/**
 * ScheduledDepartureRow Component
 * A slim presentational row for a route's next SCHEDULED departure at its start
 * station (distinct from the full GPS vehicle card). Shows a round route badge,
 * the destination headsign, a short ETA chip ("in 8m"), and the "Scheduled" badge.
 */

import type { FC } from 'react';
import { Stack, Box, Avatar, Typography, Chip } from '@mui/material';
import { AccessTime } from '@mui/icons-material';
import { formatMinutesUntil } from '../../../utils/schedule/nextScheduledDepartureUtils';
import { ScheduledDepartureChip } from '../controls/ScheduledDepartureChip';

interface ScheduledDepartureRowProps {
  /** Route short name shown in the round badge (e.g. "24", "1A"). */
  routeShortName: string;
  /** Destination headsign for the departing trip. */
  headsign: string;
  /** Minutes from now until the scheduled departure. */
  minutesUntil: number;
}

/**
 * ScheduledDepartureRow - compact row for a scheduled departure
 */
export const ScheduledDepartureRow: FC<ScheduledDepartureRowProps> = ({
  routeShortName,
  headsign,
  minutesUntil,
}) => {
  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={{ xs: 1.5, sm: 2 }}
      sx={{ py: 1 }}
    >
      {/* Circular route badge - smaller on mobile */}
      <Avatar sx={{
        bgcolor: 'primary.main',
        width: { xs: 40, sm: 48 },
        height: { xs: 40, sm: 48 },
        fontSize: { xs: '1rem', sm: '1.1rem' },
        fontWeight: 'bold',
        flexShrink: 0
      }}>
        {routeShortName}
      </Avatar>

      {/* Destination headsign */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          variant="subtitle1"
          sx={{
            fontWeight: 600,
            fontSize: { xs: '0.95rem', sm: '1.1rem' },
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}
        >
          {headsign}
        </Typography>
      </Box>

      {/* ETA + Scheduled badge */}
      <Box display="flex" alignItems="center" gap={1} sx={{ flexShrink: 0 }}>
        <Chip
          icon={<AccessTime />}
          label={formatMinutesUntil(minutesUntil)}
          color="info"
          variant="filled"
          size="small"
          sx={{
            fontWeight: 'medium',
            fontSize: { xs: '0.7rem', sm: '0.75rem' },
            '& .MuiChip-icon': { color: 'inherit' }
          }}
        />
        <ScheduledDepartureChip />
      </Box>
    </Stack>
  );
};
