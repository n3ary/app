import type { FC } from 'react';
import { IconButton, Tooltip } from '@mui/material';
import type { PermissionState, LocationAccuracyLevel } from '../../../types/location';
import { getGpsIcon, getGpsColor, getGpsTooltip } from '../../../utils/status/gpsStatusHelpers';
import { formatExactTime } from '../../../utils/vehicle/vehicleFormatUtils';

interface GpsStatusIconProps {
  status: 'available' | 'unavailable' | 'disabled';
  accuracy: LocationAccuracyLevel | null;
  permissionState: PermissionState | null;
  lastUpdated: number | null;
  onClick?: () => void;
}

export const GpsStatusIcon: FC<GpsStatusIconProps> = ({
  status,
  accuracy,
  permissionState,
  lastUpdated,
  onClick
}) => {
  const IconComponent = getGpsIcon(status, accuracy, permissionState);
  const color = getGpsColor(status, accuracy, permissionState);
  const tooltip = getGpsTooltip(status, accuracy, permissionState);
  
  const tooltipText = lastUpdated 
    ? `${tooltip} (Updated at ${formatExactTime(lastUpdated)})`
    : tooltip;

  return (
    <Tooltip title={tooltipText} arrow>
      <IconButton
        color={color}
        onClick={onClick}
        aria-label="GPS status"
        size="small"
        sx={{
          transition: 'all 0.3s ease-in-out',
          '& .MuiSvgIcon-root': {
            transition: 'all 0.3s ease-in-out'
          }
        }}
      >
        <IconComponent />
      </IconButton>
    </Tooltip>
  );
};