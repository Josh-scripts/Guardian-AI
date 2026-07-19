import React, { useEffect, useRef, useState } from 'react';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import maplibregl from 'maplibre-gl';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://gwrftduiylxjsapdfsbh.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

// Target reference point: 28.498023, 77.404564
const DEFAULT_LAT = 28.498023;
const DEFAULT_LNG = 77.404564;

const normaliseTelemetry = (t: any) => {
  return {
    _id: t.id,
    helmetId: t.helmet_id || t.helmetId,
    workerId: t.worker_id || t.workerId,
    timestamp: t.timestamp,
    temperature: t.temperature ?? 0,
    humidity: t.humidity ?? 0,
    pressure: t.pressure ?? 0,
    altitude: t.altitude ?? 0,
    heartRate: t.heart_rate ?? t.heartRate ?? 0,
    spo2: t.spo2 ?? 0,
    gas: t.gas || { ch4: 0, co: 0, h2s: 0, o2: 0 },
    motion: t.motion || { ax: 0, ay: 0, az: 0, gx: 0, gy: 0, gz: 0 },
    battery: t.battery ?? 0,
    gps: t.gps || { lat: DEFAULT_LAT, lng: DEFAULT_LNG, fix: true },
    helmetRemoved: t.helmet_removed ?? t.helmetRemoved ?? false,
    sos: t.sos ?? false,
    edgeInference: t.edge_inference || t.edgeInference || { riskScore: 0, flags: [], latencyMs: 0 },
    cloudInference: t.cloud_inference || t.cloudInference,
    status: t.workerStatus || t.worker_status || t.status || 'safe',
    createdAt: t.created_at || t.createdAt
  };
};
import {
  MapPin,
  Shield,
  Activity,
  Heart,
  Wind,
  Navigation,
  Compass
} from 'lucide-react';
interface GeofenceZone {
  id: string;
  name: string;
  type: 'safe' | 'danger';
  coordinates: [number, number][];
}

// Zones defined as [lat, lng] pairs; converted to [lng, lat] when drawn on the map.
// Safe zone is a square centered on 28.498023, 77.404564.
// Danger zones are placed nearby (east and southeast of the safe zone).
const defaultZones: GeofenceZone[] = [
  {
    id: 'ZONE-A-SAFE',
    name: 'Main Processing Yard (Safe)',
    type: 'safe',
    coordinates: [
      [28.495523, 77.402064],
      [28.500523, 77.402064],
      [28.500523, 77.407064],
      [28.495523, 77.407064]
    ]
  },
  {
    id: 'ZONE-B-DANGER',
    name: 'Chemical Storage Tank B (Danger)',
    type: 'danger',
    coordinates: [
      [28.497500, 77.409000],
      [28.500500, 77.409000],
      [28.500500, 77.412000],
      [28.497500, 77.412000]
    ]
  },
  {
    id: 'ZONE-C-DANGER',
    name: 'Restricted Yard South (Danger)',
    type: 'danger',
    coordinates: [
      [28.492500, 77.404564],
      [28.495000, 77.404564],
      [28.495000, 77.408000],
      [28.492500, 77.408000]
    ]
  }
];

export const LiveMap: React.FC = () => {
  const { socket } = useSocket();
  const { token } = useAuth();

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<Record<string, { marker: maplibregl.Marker; el: HTMLDivElement }>>({});
  const trailsRef = useRef<Record<string, [number, number][]>>({});
  const pinpointMarkerRef = useRef<maplibregl.Marker | null>(null);

  const [workers, setWorkers] = useState<any[]>([]);
  const [selectedMapWorker, setSelectedMapWorker] = useState<any>(null);

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
  const authToken = localStorage.getItem('guardian_token');

  // Load initial workers coordinates
  useEffect(() => {
    const loadData = async () => {
      try {
        const res = await fetch(`${API_URL}/api/workers`, {
          headers: { Authorization: `Bearer ${authToken}` }
        });
        if (res.ok) {
          const list = await res.json();
          setWorkers(list.filter((w: any) => w.role === 'worker'));
        }
      } catch (err) {
        console.error('Error loading workers on map', err);
      }
    };
    loadData();
  }, []);

  // Initialize MapLibre Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    console.log('[Map] Initializing MapLibre GL map...');
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: import.meta.env.VITE_MAP_STYLE_URL || 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
      center: [DEFAULT_LNG, DEFAULT_LAT], // [lng, lat] for MapLibre
      zoom: 16,
      attributionControl: false
    });

    mapRef.current = map;

    map.on('load', () => {
      console.log('[Map] Map loaded. Overlaying geofence polygons...');

      // Draw Geofences
      defaultZones.forEach((zone: GeofenceZone) => {
        const sourceId = `source-${zone.id}`;
        const fillLayerId = `layer-fill-${zone.id}`;
        const borderLayerId = `layer-border-${zone.id}`;

        // MapLibre uses coordinates in [lng, lat] format
        const formattedCoordinates = [
          ...zone.coordinates.map((coord: number[]) => [coord[1], coord[0]]),
          [zone.coordinates[0][1], zone.coordinates[0][0]] // close the polygon
        ];

        map.addSource(sourceId, {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: { name: zone.name },
            geometry: {
              type: 'Polygon',
              coordinates: [formattedCoordinates]
            }
          }
        });

        // Semi-transparent Fill
        map.addLayer({
          id: fillLayerId,
          type: 'fill',
          source: sourceId,
          paint: {
            'fill-color': zone.type === 'safe' ? '#22C55E' : '#EF4444',
            'fill-opacity': 0.08
          }
        });

        // Border Outline
        map.addLayer({
          id: borderLayerId,
          type: 'line',
          source: sourceId,
          paint: {
            'line-color': zone.type === 'safe' ? '#22C55E' : '#EF4444',
            'line-width': 1.5,
            'line-dasharray': zone.type === 'danger' ? [2, 2] : [1, 0]
          }
        });
      });

      // Drop a fixed pinpoint marker exactly on the target coordinates
      const pinEl = document.createElement('div');
      pinEl.className = 'relative flex items-center justify-center w-6 h-6';
      pinEl.innerHTML = `
        <div class="absolute w-6 h-6 rounded-full bg-cyber-yellow/30 animate-ping"></div>
        <div class="relative w-3.5 h-3.5 rounded-full bg-cyber-yellow border-2 border-white shadow-lg"></div>
      `;

      pinpointMarkerRef.current = new maplibregl.Marker({ element: pinEl })
        .setLngLat([DEFAULT_LNG, DEFAULT_LAT])
        .setPopup(
          new maplibregl.Popup({ offset: 16 }).setText(
            `Reference Point: ${DEFAULT_LAT}, ${DEFAULT_LNG}`
          )
        )
        .addTo(map);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update/draw worker markers dynamically
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    workers.forEach(w => {
      // Set baseline default coordinates on the target reference point if offline/not fixed yet
      const lat = w.vitals?.gps?.lat || DEFAULT_LAT;
      const lng = w.vitals?.gps?.lng || DEFAULT_LNG;
      const isOffline = w.status === 'offline';

      if (!markersRef.current[w.workerId]) {
        // Create marker HTML element
        const el = document.createElement('div');
        el.className = 'relative flex items-center justify-center w-8 h-8 cursor-pointer';

        // Status indicator inner dot
        const dot = document.createElement('div');
        dot.className = `w-4 h-4 rounded-full border-2 border-white shadow-lg transition-colors duration-300`;

        // Ripple pulse outline
        const pulse = document.createElement('div');
        pulse.className = 'absolute inset-0 rounded-full opacity-0 pointer-events-none transition-all';

        el.appendChild(pulse);
        el.appendChild(dot);

        // Click handler to open inspection popup drawer
        el.addEventListener('click', () => {
          setSelectedMapWorker(w);
        });

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([lng, lat])
          .addTo(map);

        markersRef.current[w.workerId] = { marker, el };
      }

      // Update marker coordinates and styles dynamically
      const { marker, el } = markersRef.current[w.workerId];
      marker.setLngLat([lng, lat]);

      const dot = el.querySelector('div:last-child') as HTMLDivElement;
      const pulse = el.querySelector('div:first-child') as HTMLDivElement;

      if (dot && pulse) {
        // Clear classes
        dot.className = 'w-4 h-4 rounded-full border-2 border-white shadow-lg transition-colors duration-300';
        pulse.className = 'absolute inset-0 rounded-full pointer-events-none';

        if (isOffline) {
          dot.classList.add('bg-slate-500');
        } else if (w.status === 'danger') {
          dot.classList.add('bg-red-500');
          pulse.classList.add('marker-pulse-danger');
        } else if (w.status === 'warning') {
          dot.classList.add('bg-amber-500');
          pulse.classList.add('marker-pulse-warning');
        } else {
          dot.classList.add('bg-green-500');
        }
      }
    });
  }, [workers]);

  // Handle live WebSockets and Supabase Realtime telemetry updates
  useEffect(() => {
    const handleTelemetry = (packet: any) => {
      const normalised = normaliseTelemetry(packet);

      // Update workers list coordinates and vitals
      setWorkers(prev => prev.map(w => {
        if (w.workerId === normalised.workerId) {
          return {
            ...w,
            status: packet.workerStatus || normalised.status || 'safe',
            lastSeen: new Date(),
            vitals: {
              heartRate: normalised.heartRate,
              spo2: normalised.spo2,
              ch4: normalised.gas.ch4,
              temp: normalised.temperature,
              gps: normalised.gps,
              helmetRemoved: normalised.helmetRemoved,
              sos: normalised.sos,
              edgeInference: normalised.edgeInference
            }
          };
        }
        return w;
      }));

      // Update selected worker in state if they matched
      setSelectedMapWorker((current: any) => {
        if (current && current.workerId === normalised.workerId) {
          return {
            ...current,
            status: packet.workerStatus || normalised.status || 'safe',
            lastSeen: new Date(),
            vitals: {
              heartRate: normalised.heartRate,
              spo2: normalised.spo2,
              ch4: normalised.gas.ch4,
              temp: normalised.temperature,
              gps: normalised.gps,
              helmetRemoved: normalised.helmetRemoved,
              sos: normalised.sos,
              edgeInference: normalised.edgeInference
            }
          };
        }
        return current;
      });

      // Maintain location trails (breadcrumb)
      const lat = normalised.gps.lat;
      const lng = normalised.gps.lng;
      if (normalised.gps.fix && lat && lng) {
        if (!trailsRef.current[normalised.workerId]) {
          trailsRef.current[normalised.workerId] = [];
        }
        const trail = trailsRef.current[normalised.workerId];
        trail.push([lng, lat]);
        if (trail.length > 20) trail.shift(); // limit history length

        // Draw LineString layer for breadcrumbs
        const map = mapRef.current;
        if (map && map.isStyleLoaded()) {
          const lineSourceId = `trail-source-${normalised.workerId}`;
          const lineLayerId = `trail-layer-${normalised.workerId}`;
          if (map.getSource(lineSourceId)) {
            const src = map.getSource(lineSourceId) as maplibregl.GeoJSONSource;
            src.setData({
              type: 'Feature',
              geometry: {
                type: 'LineString',
                coordinates: trail
              },
              properties: {}
            });
          } else {
            map.addSource(lineSourceId, {
              type: 'geojson',
              data: {
                type: 'Feature',
                geometry: {
                  type: 'LineString',
                  coordinates: trail
                },
                properties: {}
              }
            });

            map.addLayer({
              id: lineLayerId,
              type: 'line',
              source: lineSourceId,
              layout: {
                'line-join': 'round',
                'line-cap': 'round'
              },
              paint: {
                'line-color': '#FFD400',
                'line-width': 2,
                'line-opacity': 0.5
              }
            });
          }
        }
      }
    };

    if (socket) {
      socket.on('telemetry_update', handleTelemetry);
    }

    // Subscribe to Supabase Realtime for all telemetry
    const channel = supabaseClient
      .channel('telemetry_live_map')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'telemetry'
        },
        (payload) => {
          handleTelemetry(payload.new);
        }
      )
      .subscribe();

    return () => {
      if (socket) {
        socket.off('telemetry_update', handleTelemetry);
      }
      supabaseClient.removeChannel(channel);
    };
  }, [socket]);

  return (
    <div className="h-full flex flex-col space-y-4 font-inter relative">
      {/* Map Container */}
      <div className="flex-1 w-full bg-cyber-darker rounded-2xl border border-cyber-border overflow-hidden relative min-h-[500px]">
        <div ref={mapContainerRef} className="w-full h-full absolute inset-0" />

        {/* Map overlay legend */}
        <div className="absolute top-4 left-4 z-10 bg-cyber-card/90 backdrop-blur border border-cyber-border rounded-xl p-4 shadow-xl space-y-2 text-xs font-medium max-w-xs">
          <div className="flex items-center space-x-1.5 text-white font-semibold font-outfit border-b border-cyber-border pb-1.5 mb-2">
            <Shield className="w-4 h-4 text-cyber-yellow" />
            <span>Map Boundaries & Status</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3.5 h-3.5 rounded bg-green-500/20 border border-green-500"></div>
            <span className="text-slate-300">Operations Yard (Safe Zone)</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3.5 h-3.5 rounded bg-red-500/20 border border-red-500"></div>
            <span className="text-slate-300">Chemical Storage (Danger Zone)</span>
          </div>
          <div className="border-t border-cyber-border pt-1.5 mt-1 grid grid-cols-3 gap-1 text-[10px] text-center text-slate-400 font-mono">
            <div><span className="inline-block w-2 h-2 rounded-full bg-green-400 mr-1 animate-pulse"></span>Safe</div>
            <div><span className="inline-block w-2 h-2 rounded-full bg-amber-400 mr-1 animate-pulse"></span>Warning</div>
            <div><span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1 animate-ping"></span>Danger</div>
          </div>
        </div>

        {/* Selected Map Worker Info Panel */}
        {selectedMapWorker && (
          <div className="absolute bottom-6 left-6 z-10 bg-cyber-card/95 backdrop-blur border border-cyber-yellow/40 rounded-2xl p-5 shadow-2xl space-y-4 max-w-sm w-80 animate-fade-in">
            <div className="flex justify-between items-start border-b border-cyber-border/40 pb-2.5">
              <div>
                <h4 className="font-outfit font-extrabold text-sm text-slate-100">{selectedMapWorker.name}</h4>
                <span className="text-[10px] text-slate-400 font-mono">ID: {selectedMapWorker.workerId}</span>
              </div>
              <button
                onClick={() => setSelectedMapWorker(null)}
                className="text-slate-400 hover:text-white text-xs font-semibold"
              >
                Dismiss
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center text-xs font-semibold text-slate-300">
              <div className="bg-cyber-darker p-2 rounded border border-cyber-border/20">
                <Heart className="w-3.5 h-3.5 text-red-500 mx-auto mb-0.5" />
                <span className="block text-[8px] text-slate-500 font-mono">HR</span>
                <span>{selectedMapWorker.vitals?.heartRate ?? 0}</span>
              </div>
              <div className="bg-cyber-darker p-2 rounded border border-cyber-border/20">
                <Activity className="w-3.5 h-3.5 text-cyan-400 mx-auto mb-0.5" />
                <span className="block text-[8px] text-slate-500 font-mono">SpO2</span>
                <span>{selectedMapWorker.vitals?.spo2 ?? 0}%</span>
              </div>
              <div className="bg-cyber-darker p-2 rounded border border-cyber-border/20">
                <Wind className="w-3.5 h-3.5 text-amber-400 mx-auto mb-0.5" />
                <span className="block text-[8px] text-slate-500 font-mono">Gas CH4</span>
                <span>{selectedMapWorker.vitals?.ch4 ?? 0}%</span>
              </div>
            </div>

            {selectedMapWorker.vitals?.edgeInference && (
              <div className="bg-cyber-yellow/5 border border-cyber-yellow/20 p-2.5 rounded text-[10px] text-slate-300">
                <span className="font-bold text-cyber-yellow">Edge Risk Score:</span>{' '}
                <span className="font-mono">{selectedMapWorker.vitals.edgeInference.riskScore?.toFixed(3) ?? '--'}</span>
                {selectedMapWorker.vitals.edgeInference.flags?.length > 0 && (
                  <span className="ml-2 text-red-400 font-mono">
                    [{selectedMapWorker.vitals.edgeInference.flags.join(', ').replace(/_/g, ' ')}]
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};