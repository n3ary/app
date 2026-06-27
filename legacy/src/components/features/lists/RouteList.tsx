// RouteList - Card-based display component for enhanced routes
// Uses Material-UI Cards for consistent design with vehicle list

import type { FC } from 'react';
import { 
  Card,
  CardContent,
  Typography, 
  Chip, 
  Box,
  Stack,
  Avatar,
  Divider
} from '@mui/material';
import type { EnhancedRoute } from '../../../types/routeFilter';
import { getRouteTypeLabel } from '../../../types/rawTranzyApi';
import { getTransportTypeMuiColor } from '../../../utils/route/routeColorUtils';
import { HeartToggle } from '../controls/HeartToggle';
import { useFavoritesStore } from '../../../stores/favoritesStore';

interface RouteListProps {
  routes: EnhancedRoute[];
}

export const RouteList: FC<RouteListProps> = ({ routes }) => {
  const { toggleFavorite } = useFavoritesStore();

  if (routes.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ p: 2, fontStyle: 'italic' }}>
        No routes found
      </Typography>
    );
  }

  // Group routes into favorites and non-favorites
  const favoriteRoutes = routes.filter(route => route.isFavorite);
  const nonFavoriteRoutes = routes.filter(route => !route.isFavorite);
  const hasBothTypes = favoriteRoutes.length > 0 && nonFavoriteRoutes.length > 0;

  return (
    <Stack spacing={2} sx={{ p: 2 }}>
      {/* Render favorite routes first */}
      {favoriteRoutes.map((route) => (
        <RouteCard 
          key={route.route_id}
          route={route}
          onToggleFavorite={toggleFavorite}
        />
      ))}
      
      {/* Add subtle separator if we have both favorites and non-favorites */}
      {hasBothTypes && (
        <Divider 
          sx={{ 
            my: 1,
            opacity: 0.3,
            '&::before, &::after': {
              borderColor: 'text.disabled'
            }
          }} 
        />
      )}
      
      {/* Render non-favorite routes */}
      {nonFavoriteRoutes.map((route) => (
        <RouteCard 
          key={route.route_id}
          route={route}
          onToggleFavorite={toggleFavorite}
        />
      ))}
    </Stack>
  );
};

// Individual Route Card Component
interface RouteCardProps {
  route: EnhancedRoute;
  onToggleFavorite: (routeId: string) => void;
}

const RouteCard: FC<RouteCardProps> = ({ route, onToggleFavorite }) => {
  return (
    <Card sx={{ 
      backgroundColor: 'background.paper',
      borderRadius: 2,
      boxShadow: 1
    }}>
      <CardContent sx={{ 
        p: { xs: 1.5, sm: 2 }, 
        '&:last-child': { pb: { xs: 1.5, sm: 2 } } 
      }}>
        {/* Header with route badge, name, and favorite toggle */}
        <Stack direction="row" alignItems="center" spacing={{ xs: 1.5, sm: 2 }} sx={{ mb: 1.5 }}>
          {/* Circular route badge with transportation type color */}
          <Avatar sx={{ 
            bgcolor: 'primary.main',
            color: 'white',
            width: { xs: 40, sm: 48 }, 
            height: { xs: 40, sm: 48 },
            fontSize: { xs: '1rem', sm: '1.1rem' },
            fontWeight: 'bold',
            flexShrink: 0,
            border: '1px solid rgba(0,0,0,0.1)'
          }}>
            {route.route_short_name}
          </Avatar>
          
          {/* Route name and description */}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography 
              variant="subtitle1" 
              sx={{ 
                fontWeight: 600,
                fontSize: { xs: '0.95rem', sm: '1.1rem' },
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                mb: 0.5
              }}
            >
              {route.route_long_name}
            </Typography>
            
            {route.route_desc && (
              <Typography 
                variant="body2" 
                color="text.secondary"
                sx={{ 
                  fontSize: { xs: '0.8rem', sm: '0.875rem' },
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}
              >
                {route.route_desc}
              </Typography>
            )}
          </Box>
          
          {/* Favorite toggle */}
          <HeartToggle
            routeId={route.route_id.toString()}
            isFavorite={route.isFavorite}
            onToggle={onToggleFavorite}
            size="small"
          />
        </Stack>

        {/* Route details row */}
        <Stack 
          direction="row" 
          alignItems="center" 
          spacing={{ xs: 1.5, sm: 2 }} 
          sx={{ flexWrap: 'wrap' }}
        >
          {/* Route type chip */}
          <Chip 
            label={getRouteTypeLabel(route.route_type)} 
            size="small" 
            color={getTransportTypeMuiColor(route.route_type)}
            sx={{ 
              fontSize: '0.7rem',
              height: { xs: 20, sm: 24 },
              flexShrink: 0
            }}
          />
        </Stack>
      </CardContent>
    </Card>
  );
};