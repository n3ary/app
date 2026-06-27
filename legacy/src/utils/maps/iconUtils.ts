/**
 * Map Icon Utilities
 * Centralized icon creation for map components
 * Consolidates duplicate icon creation logic from map layers
 */

import { Icon, DivIcon } from 'leaflet';

// Icon configuration types
export interface IconOptions {
  color: string;
  size?: number;
  isSelected?: boolean;
  strokeWidth?: number;
}

export interface VehicleIconOptions extends IconOptions {
  speed?: number;
  showDirectionalArrow?: boolean;
}

export interface StationIconOptions extends IconOptions {
  symbolType?: 'default' | 'user-location' | 'terminus' | 'nearby';
  customSize?: number;
  isPulsing?: boolean; // Add pulsing animation support
  pulseColor?: string; // Color to pulse to
}

export interface DebugIconOptions extends IconOptions {
  shape?: 'circle' | 'square' | 'triangle';
}

export interface DirectionArrowOptions {
  color: string;
  bearing: number;
}

/**
 * Create vehicle icon with square shape and bus icon
 */
export function createVehicleIcon(options: VehicleIconOptions): Icon {
  const {
    color,
    size = 24,
    isSelected = false,
    speed = 0,
    showDirectionalArrow = true
  } = options;

  const iconSize = isSelected ? size + 4 : size;
  const strokeWidth = isSelected ? 3 : 2;
  const cornerRadius = 3; // Slightly rounded corners for better appearance
  
  // Bus icon SVG path (Material Design bus icon) - always show bus icon
  const busIconPath = `
    <g transform="translate(${iconSize/2 - 6}, ${iconSize/2 - 6}) scale(0.5)">
      <path d="M4 16c0 .88.39 1.67 1 2.22V20c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h8v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4-8-4s-8 .5-8 4v10zm3.5 1c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm1.5-6H6V6h12v5z" 
            fill="#fff" stroke="none"/>
    </g>
  `;
  
  const svgContent = `
    <svg width="${iconSize}" height="${iconSize}" viewBox="0 0 ${iconSize} ${iconSize}" xmlns="http://www.w3.org/2000/svg">
      <rect x="${strokeWidth}" y="${strokeWidth}" width="${iconSize - 2*strokeWidth}" height="${iconSize - 2*strokeWidth}" 
            fill="${color}" stroke="#fff" stroke-width="${strokeWidth}" rx="${cornerRadius}"/>
      ${busIconPath}
    </svg>
  `;

  return new Icon({
    iconUrl: `data:image/svg+xml;base64,${btoa(svgContent)}`,
    iconSize: [iconSize, iconSize],
    iconAnchor: [iconSize/2, iconSize/2],
    popupAnchor: [0, -iconSize/2],
  });
}

/**
 * Create station icon with different symbol types
 */
export function createStationIcon(options: StationIconOptions): Icon {
  const {
    color,
    size = 16,
    isSelected = false,
    symbolType = 'default',
    customSize,
    isPulsing = false,
    pulseColor = '#FFD700'
  } = options;

  const baseSize = customSize || size;
  const iconSize = isSelected ? baseSize + 6 : baseSize;
  const strokeWidth = isSelected ? 3 : 2;
  const innerRadius = Math.max(2, iconSize / 4);
  
  let symbolSvg = '';
  
  // Create the main shape with animation if pulsing
  const mainFillColor = isPulsing ? `
    <animate attributeName="fill" values="${color};${pulseColor};${color}" 
             dur="2s" repeatCount="indefinite"/>
  ` : '';
  
  switch (symbolType) {
    case 'user-location':
      // User location: filled circle with crosshairs
      symbolSvg = `
        <circle cx="${iconSize/2}" cy="${iconSize/2}" r="${iconSize/2 - strokeWidth}" fill="${color}" stroke="#fff" stroke-width="${strokeWidth}">
          ${mainFillColor}
        </circle>
        <circle cx="${iconSize/2}" cy="${iconSize/2}" r="${innerRadius}" fill="#fff"/>
        <line x1="${iconSize/2 - innerRadius/2}" y1="${iconSize/2}" x2="${iconSize/2 + innerRadius/2}" y2="${iconSize/2}" stroke="${color}" stroke-width="1"/>
        <line x1="${iconSize/2}" y1="${iconSize/2 - innerRadius/2}" x2="${iconSize/2}" y2="${iconSize/2 + innerRadius/2}" stroke="${color}" stroke-width="1"/>
      `;
      break;
      
    case 'terminus':
      // Terminus: square with inner square
      symbolSvg = `
        <rect x="${strokeWidth}" y="${strokeWidth}" width="${iconSize - 2*strokeWidth}" height="${iconSize - 2*strokeWidth}" 
              fill="${color}" stroke="#fff" stroke-width="${strokeWidth}" rx="2">
          ${mainFillColor}
        </rect>
        <rect x="${iconSize/2 - innerRadius/2}" y="${iconSize/2 - innerRadius/2}" width="${innerRadius}" height="${innerRadius}" 
              fill="#fff" rx="1"/>
      `;
      break;
      
    case 'nearby':
      // Nearby: diamond shape with inner circle
      const halfSize = iconSize / 2;
      symbolSvg = `
        <polygon points="${halfSize},${strokeWidth} ${iconSize-strokeWidth},${halfSize} ${halfSize},${iconSize-strokeWidth} ${strokeWidth},${halfSize}" 
                 fill="${color}" stroke="#fff" stroke-width="${strokeWidth}">
          ${mainFillColor}
        </polygon>
        <circle cx="${halfSize}" cy="${halfSize}" r="${innerRadius/2}" fill="#fff"/>
      `;
      break;
      
    case 'default':
    default:
      // Default: simple circle
      symbolSvg = `
        <circle cx="${iconSize/2}" cy="${iconSize/2}" r="${iconSize/2 - strokeWidth}" fill="${color}" stroke="#fff" stroke-width="${strokeWidth}">
          ${mainFillColor}
        </circle>
        <circle cx="${iconSize/2}" cy="${iconSize/2}" r="${innerRadius/2}" fill="#fff"/>
      `;
  }

  const svgContent = `
    <svg width="${iconSize}" height="${iconSize}" viewBox="0 0 ${iconSize} ${iconSize}" xmlns="http://www.w3.org/2000/svg">
      ${symbolSvg}
    </svg>
  `;

  return new Icon({
    iconUrl: `data:image/svg+xml;base64,${btoa(svgContent)}`,
    iconSize: [iconSize, iconSize],
    iconAnchor: [iconSize/2, iconSize/2],
    popupAnchor: [0, -iconSize/2],
  });
}

/**
 * Create debug marker icon with distinct shapes
 */
export function createDebugIcon(options: DebugIconOptions): Icon {
  const {
    color,
    size = 12,
    shape = 'circle'
  } = options;

  let shapeElement: string;
  
  switch (shape) {
    case 'square':
      shapeElement = `<rect x="2" y="2" width="8" height="8" fill="${color}" stroke="#fff" stroke-width="1"/>`;
      break;
    case 'triangle':
      shapeElement = `<polygon points="6,2 10,10 2,10" fill="${color}" stroke="#fff" stroke-width="1"/>`;
      break;
    case 'circle':
    default:
      shapeElement = `<circle cx="6" cy="6" r="4" fill="${color}" stroke="#fff" stroke-width="1"/>`;
      break;
  }

  const svgContent = `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
      ${shapeElement}
    </svg>
  `;

  return new Icon({
    iconUrl: `data:image/svg+xml;base64,${btoa(svgContent)}`,
    iconSize: [size, size],
    iconAnchor: [size/2, size/2],
    popupAnchor: [0, -size/2],
  });
}

/**
 * Create user location icon using Material Design location pin
 */
export function createUserLocationIcon(options: IconOptions): Icon {
  const { color, size = 20 } = options;
  
  // Material Design location_on icon path
  const locationIconPath = `
    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" 
          fill="${color}"/>
  `;
  
  const svgContent = `
    <svg width="${size}" height="${size}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      ${locationIconPath}
    </svg>
  `;

  return new Icon({
    iconUrl: `data:image/svg+xml;base64,${btoa(svgContent)}`,
    iconSize: [size, size],
    iconAnchor: [size/2, size], // Anchor at the bottom point of the pin
    popupAnchor: [0, -size], // Popup appears above the pin
  });
}

/**
 * Create direction arrow icon for route shapes
 */
export function createDirectionArrow(options: DirectionArrowOptions): DivIcon {
  const { color, bearing } = options;
  
  // Create SVG arrow with blue fill and black stroke, white middle
  const svgContent = `
    <svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
      <polygon points="8,2 13,12 8,10 3,12" 
               fill="#3182CE" 
               stroke="#000000" 
               stroke-width="1.5" 
               stroke-linejoin="round"/>
      <polygon points="8,3 11.5,10.5 8,9 4.5,10.5" 
               fill="white" 
               stroke="none"/>
    </svg>
  `;
  
  return new DivIcon({
    html: `
      <div style="
        width: 16px; 
        height: 16px; 
        transform: rotate(${bearing}deg);
        filter: drop-shadow(0 1px 2px rgba(0,0,0,0.3));
      ">
        ${svgContent}
      </div>
    `,
    className: 'direction-arrow',
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

/**
 * Create cluster icon for grouped markers
 */
export function createClusterIcon(options: { count: number; color: string; size?: number }): DivIcon {
  const { count, color, size = 40 } = options;
  
  // Scale text size based on cluster size
  const fontSize = size * 0.4;
  const displayCount = count > 99 ? '99+' : count.toString();
  
  return new DivIcon({
    html: `
      <div style="
        width: ${size}px;
        height: ${size}px;
        background-color: ${color};
        border: 3px solid #FFFFFF;
        border-radius: 50%;
        box-shadow: 0 3px 6px rgba(0,0,0,0.4);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: ${fontSize}px;
        font-weight: bold;
        color: white;
        text-shadow: 1px 1px 1px rgba(0,0,0,0.7);
        position: relative;
      ">
        ${displayCount}
        <div style="
          position: absolute;
          bottom: -2px;
          right: -2px;
          width: ${size * 0.3}px;
          height: ${size * 0.3}px;
          background-color: #FF5722;
          border: 1px solid white;
          border-radius: 50%;
          font-size: ${size * 0.2}px;
          display: flex;
          align-items: center;
          justify-content: center;
        ">
          +
        </div>
      </div>
    `,
    className: 'cluster-marker',
    iconSize: [size + 6, size + 6],
    iconAnchor: [(size + 6) / 2, (size + 6) / 2],
  });
}

/**
 * Create distance label icon with enhanced styling
 */
export function createDistanceLabelIcon(
  distance: string, 
  type: 'direct' | 'route' | 'projection' = 'direct',
  confidence?: 'high' | 'medium' | 'low'
): DivIcon {
  let backgroundColor: string;
  const textColor = 'white';
  
  // Color code based on confidence level
  switch (confidence) {
    case 'high':
      backgroundColor = 'rgba(76, 175, 80, 0.9)'; // Green
      break;
    case 'medium':
      backgroundColor = 'rgba(255, 152, 0, 0.9)'; // Orange
      break;
    case 'low':
      backgroundColor = 'rgba(244, 67, 54, 0.9)'; // Red
      break;
    default:
      backgroundColor = 'rgba(0, 0, 0, 0.8)'; // Default black
      break;
  }

  // Add type indicator
  const typeIndicator = type === 'direct' ? '↔' : type === 'route' ? '↗' : '⊥';
  
  return new DivIcon({
    html: `
      <div style="
        background: ${backgroundColor}; 
        color: ${textColor}; 
        padding: 4px 8px; 
        border-radius: 6px; 
        font-size: 11px; 
        font-weight: bold;
        white-space: nowrap;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        border: 1px solid rgba(255,255,255,0.3);
      ">
        ${typeIndicator} ${distance}
      </div>
    `,
    className: 'debug-distance-label',
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}