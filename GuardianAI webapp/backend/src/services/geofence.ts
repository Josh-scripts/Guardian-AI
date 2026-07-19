export interface GeofenceZone {
  id: string;
  name: string;
  type: 'safe' | 'danger';
  coordinates: [number, number][]; // Array of [lat, lng] representing polygon vertices
}

// Pre-seeded zones in Chennai center
export const defaultZones: GeofenceZone[] = [
  {
    id: 'ZONE-A-SAFE',
    name: 'Main Processing Yard (Safe)',
    type: 'safe',
    coordinates: [
      [13.0810, 80.2680],
      [13.0850, 80.2680],
      [13.0850, 80.2730],
      [13.0810, 80.2730]
    ]
  },
  {
    id: 'ZONE-B-DANGER',
    name: 'Chemical Storage Tank B (Danger)',
    type: 'danger',
    coordinates: [
      [13.0855, 80.2740],
      [13.0875, 80.2740],
      [13.0875, 80.2760],
      [13.0855, 80.2760]
    ]
  }
];

export function isPointInPolygon(point: [number, number], polygon: [number, number][]): boolean {
  const x = point[0]; // lat
  const y = point[1]; // lng
  
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];
    
    const intersect = ((yi > y) !== (yj > y))
        && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  
  return inside;
}

export interface GeofenceResult {
  inSafeZone: boolean;
  inDangerZone: boolean;
  violatedZoneName: string | null;
  message: string | null;
}

export function checkGeofence(lat: number, lng: number, zones: GeofenceZone[] = defaultZones): GeofenceResult {
  let insideAnySafeZone = false;
  let insideAnyDangerZone = false;
  let violatedZoneName: string | null = null;
  
  const point: [number, number] = [lat, lng];

  for (const zone of zones) {
    const isInside = isPointInPolygon(point, zone.coordinates);
    if (isInside) {
      if (zone.type === 'safe') {
        insideAnySafeZone = true;
      } else if (zone.type === 'danger') {
        insideAnyDangerZone = true;
        violatedZoneName = zone.name;
      }
    }
  }

  // If there are no safe zones configured, we assume the worker is in a safe space by default unless in a danger zone.
  const safeZonesExist = zones.some(z => z.type === 'safe');
  const safeViolation = safeZonesExist && !insideAnySafeZone;

  if (insideAnyDangerZone) {
    return {
      inSafeZone: !safeViolation,
      inDangerZone: true,
      violatedZoneName,
      message: `Worker entered danger zone: ${violatedZoneName}`
    };
  }

  if (safeViolation) {
    const safeZoneNames = zones.filter(z => z.type === 'safe').map(z => z.name).join(', ');
    return {
      inSafeZone: false,
      inDangerZone: false,
      violatedZoneName: 'Outside Safe Boundaries',
      message: `Worker exited safe zones (Allowed: ${safeZoneNames})`
    };
  }

  return {
    inSafeZone: true,
    inDangerZone: false,
    violatedZoneName: null,
    message: null
  };
}
