"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface VehicleMarker {
  id: string;
  lat: number;
  lng: number;
  title?: string;
}

interface Props {
  centerLat?: number;
  centerLng?: number;
  zoom?: number;
  vehicles?: VehicleMarker[];
}

export default function LeafletRealtimeMap({ centerLat = 9.748257, centerLng = 118.771556, zoom = 13, vehicles = [] }: Props) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const markersRef = useRef<Record<string, L.Marker>>({});

  useEffect(() => {
    if (!containerRef.current) return;
    if (!mapRef.current) {
      mapRef.current = L.map(containerRef.current).setView([centerLat, centerLng], zoom);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(mapRef.current);
    }

    return () => {
      // Do not fully remove map to avoid React/Leaflet re-init issues on HMR; just clear markers
      Object.values(markersRef.current).forEach(m => m.remove());
      markersRef.current = {};
    };
  }, []);

  // keep center/zoom in sync
  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.setView([centerLat, centerLng], zoom);
    }
  }, [centerLat, centerLng, zoom]);

  // sync vehicles
  useEffect(() => {
    if (!mapRef.current) return;

    // add or update markers
    vehicles.forEach((v) => {
      if (!v || typeof v.lat !== 'number' || typeof v.lng !== 'number') return;
      if (markersRef.current[v.id]) {
        markersRef.current[v.id].setLatLng([v.lat, v.lng]);
      } else {
        const icon = L.divIcon({
          html: `<span class="material-symbols-outlined text-rose-600 drop-shadow-lg" style="font-size: 28px; transform: translate(-14px, -28px);">location_on</span>`,
          className: 'custom-div-icon',
          iconSize: [0, 0],
        });
        markersRef.current[v.id] = L.marker([v.lat, v.lng], { icon }).addTo(mapRef.current!);
        if (v.title) markersRef.current[v.id].bindTooltip(v.title, { direction: 'top' });
      }
    });

    // remove missing markers
    Object.keys(markersRef.current).forEach((id) => {
      if (!vehicles.find((v) => v.id === id)) {
        markersRef.current[id].remove();
        delete markersRef.current[id];
      }
    });
  }, [vehicles]);

  return <div ref={containerRef} className="h-full w-full" />;
}
