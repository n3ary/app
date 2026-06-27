import type { FC } from 'react';
import { IconButton, Tooltip } from '@mui/material';
import { getApiIcon, getApiColor, getApiTooltip } from '../../../utils/status/apiStatusHelpers';
import { formatAbsoluteTime } from '../../../utils/time/timestampFormatUtils';

interface ApiStatusIconProps {
  status: 'online' | 'offline' | 'error';
  networkOnline: boolean;
  lastCheck: number | null;
  responseTime: number | null;
  onClick?: () => void;
}

export const ApiStatusIcon: FC<ApiStatusIconProps> = ({
  status,
  networkOnline,
  lastCheck,
  responseTime,
  onClick
}) => {
  const IconComponent = getApiIcon(status, networkOnline);
  const color = getApiColor(status, networkOnline, responseTime);
  const tooltip = getApiTooltip(status, networkOnline, responseTime);
  
  // Build detailed tooltip with timing and response info
  let tooltipText = tooltip;
  
  if (lastCheck) {
    const lastCheckTime = formatAbsoluteTime(new Date(lastCheck).getTime()).replace('at ', '');
    tooltipText += ` (Last check: ${lastCheckTime})`;
  }
  
  if (responseTime && status === 'online') {
    tooltipText += ` - ${responseTime}ms`;
  }

  return (
    <Tooltip title={tooltipText} arrow>
      <IconButton
        color={color}
        onClick={onClick}
        aria-label="API connectivity status"
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