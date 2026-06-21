/**
 * ScheduleBoardDialog - full-screen Today / Tomorrow scheduled departure board
 * for a single route + direction at a station, opened from the "Today schedule"
 * / "Tomorrow schedule" buttons on a scheduled departure card.
 *
 *  - Today    : upcoming scheduled departures from this station (>= now).
 *  - Tomorrow : all of tomorrow's scheduled departures.
 *
 * The route is shown as a badge in the title and the destination as a subtitle,
 * so the rows are just a compact two-column grid of departure times.
 * Schedule-only (GTFS); no live GPS. Degrades gracefully when no schedule data.
 */

import type { FC } from 'react';
import { useMemo, useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, IconButton, Typography, Box, Avatar,
  ToggleButtonGroup, ToggleButton, Button,
} from '@mui/material';
import { Close as CloseIcon, ExpandMore as ExpandMoreIcon } from '@mui/icons-material';
import { useScheduleStore } from '../../../stores/scheduleStore';
import { useTripStore } from '../../../stores/tripStore';
import { useRouteStore } from '../../../stores/routeStore';
import { buildTripRouteMap } from '../../../utils/schedule/scheduleVehicleIntegration';
import { buildStationDepartureBoard, formatBoardTime } from '../../../utils/schedule/stationScheduleBoard';
import { minutesSinceMidnight } from '../../../utils/schedule/activeServiceUtils';
import { generateStatusMessage } from '../../../utils/arrival/statusUtils';

type BoardMode = 'today' | 'tomorrow';

interface ScheduleBoardDialogProps {
  open: boolean;
  initialMode: BoardMode;
  station: { stop_id: number; stop_name: string } | null;
  /** Route + direction this board is scoped to (from the scheduled card). */
  routeId: number | null;
  routeShortName: string;
  headsign: string;
  directionId: number | null;
  onClose: () => void;
}

export const ScheduleBoardDialog: FC<ScheduleBoardDialogProps> = ({
  open, initialMode, station, routeId, routeShortName, headsign, directionId, onClose,
}) => {
  const [mode, setMode] = useState<BoardMode>(initialMode);
  // Tomorrow defaults to the morning (until noon) with a "See more" expander.
  const [tomorrowExpanded, setTomorrowExpanded] = useState(false);
  const { scheduleData } = useScheduleStore();
  const { trips } = useTripStore();
  const { routes } = useRouteStore();

  useEffect(() => {
    if (open) setMode(initialMode);
  }, [open, initialMode]);

  // Collapse the tomorrow expander whenever the dialog opens or the tab changes.
  useEffect(() => {
    setTomorrowExpanded(false);
  }, [open, mode]);

  const board = useMemo(() => {
    if (!open || !station) return [];
    const now = new Date();
    const tripRouteMap = buildTripRouteMap(trips);
    const common = { scheduleData, tripRouteMap, stopId: station.stop_id, routes, routeId, directionId };
    if (mode === 'today') {
      return buildStationDepartureBoard({ ...common, date: now, fromMinutes: minutesSinceMidnight(now) });
    }
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12, 0, 0);
    return buildStationDepartureBoard({ ...common, date: tomorrow, fromMinutes: null });
  }, [open, station, mode, scheduleData, trips, routes, routeId, directionId]);

  // Tomorrow defaults to morning (before noon); "See more" reveals the rest.
  const NOON_MINUTES = 12 * 60;
  const visibleBoard =
    mode === 'tomorrow' && !tomorrowExpanded
      ? board.filter((d) => d.departureMinutes < NOON_MINUTES)
      : board;
  const hasMore = mode === 'tomorrow' && !tomorrowExpanded && board.length > visibleBoard.length;

  return (
    <Dialog open={open} onClose={onClose} fullScreen>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 1, px: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
          <Avatar sx={{ bgcolor: 'primary.main', width: 40, height: 40, fontSize: '1rem', fontWeight: 'bold', flexShrink: 0 }}>
            {routeShortName}
          </Avatar>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h6" component="div" noWrap>{station?.stop_name ?? 'Schedule'}</Typography>
            <Typography variant="caption" color="text.secondary" noWrap component="div">
              {headsign ? `→ ${headsign}` : 'Scheduled departures'}
            </Typography>
          </Box>
        </Box>
        <IconButton edge="end" color="inherit" onClick={onClose} aria-label="close">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ p: 2 }}>
        <ToggleButtonGroup
          exclusive
          size="small"
          color="primary"
          value={mode}
          onChange={(_, v) => v && setMode(v)}
          sx={{ mb: 2 }}
        >
          <ToggleButton value="today">Today</ToggleButton>
          <ToggleButton value="tomorrow">Tomorrow</ToggleButton>
        </ToggleButtonGroup>

        {board.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', mt: 2 }}>
            {scheduleData
              ? mode === 'today'
                ? 'No more scheduled departures today.'
                : 'No scheduled departures tomorrow.'
              : 'Schedule data is not available.'}
          </Typography>
        ) : (
          <>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)' },
                gap: 1,
              }}
            >
              {visibleBoard.map((d, i) => {
                // For the soonest TODAY departure, show "(In X minutes)" using the
                // same wording as the arrival bubble.
                const minutesUntil = d.departureMinutes - minutesSinceMidnight(new Date());
                const showEta = mode === 'today' && i === 0 && minutesUntil >= 0;
                const etaLabel =
                  minutesUntil < 1 ? 'Departing now' : generateStatusMessage('in_minutes', minutesUntil);
                return (
                  <Box
                    key={`${d.tripId}-${i}`}
                    sx={{
                      py: 1,
                      px: 0.5,
                      textAlign: 'center',
                      borderRadius: 1,
                      bgcolor: showEta ? 'info.main' : 'action.hover',
                      color: showEta ? 'info.contrastText' : 'text.primary',
                      fontVariantNumeric: 'tabular-nums',
                      fontWeight: 600,
                    }}
                  >
                    {formatBoardTime(d.departureMinutes)}
                    {showEta && (
                      <Typography variant="caption" component="div" sx={{ fontWeight: 400 }}>
                        ({etaLabel})
                      </Typography>
                    )}
                  </Box>
                );
              })}
            </Box>
            {hasMore && (
              <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
                <Button
                  size="small"
                  variant="outlined"
                  color="primary"
                  startIcon={<ExpandMoreIcon />}
                  onClick={() => setTomorrowExpanded(true)}
                >
                  See more
                </Button>
              </Box>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
