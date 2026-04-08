"use client";

import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

type FleetVehicle = {
  id: string;
  codename: string;
  status: string;
  lat?: number;
  lng?: number;
};

interface FleetMapProps {
  vehicles: FleetVehicle[];
  selectedVehicleId?: string | null;
  onVehicleSelect?: (vehicleId: string) => void;
}

const DEFAULT_CENTER: [number, number] = [9.748257, 118.771556];
const DEFAULT_ZOOM = 9;

export default function FleetMap({ vehicles, selectedVehicleId, onVehicleSelect }: FleetMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);

  const visibleVehicles = useMemo(
    () => vehicles.filter((vehicle) => Number.isFinite(vehicle.lat) && Number.isFinite(vehicle.lng)),
    [vehicles]
  );

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    mapRef.current = L.map(mapContainerRef.current, {
      zoomControl: true,
      attributionControl: true,
    }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(mapRef.current);

    layerRef.current = L.layerGroup().addTo(mapRef.current);

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !layerRef.current) return;

    layerRef.current.clearLayers();

    visibleVehicles.forEach((vehicle) => {
      const isSelected = vehicle.id === selectedVehicleId;
      const markerTone = vehicle.status === "Serviceable" ? "ready" : "unavailable";
      const icon = L.divIcon({
        className: "fleet-marker-wrapper",
        iconSize: [0, 0],
        html: `
          <div class="fleet-marker ${markerTone} ${isSelected ? "selected" : ""}">
            <div class="fleet-label">${vehicle.codename}</div>
            <div class="fleet-truck">
              <span class="material-symbols-outlined">local_shipping</span>
            </div>
          </div>
        `,
      });

      const marker = L.marker([vehicle.lat as number, vehicle.lng as number], { icon }).addTo(layerRef.current as L.LayerGroup);
      marker.on("click", () => onVehicleSelect?.(vehicle.id));
    });

    if (visibleVehicles.length === 0) {
      mapRef.current.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
      return;
    }

    const bounds = L.latLngBounds(
      visibleVehicles.map((vehicle) => [vehicle.lat as number, vehicle.lng as number] as [number, number])
    );

    // Fit all vehicles while preventing over-zoom on first load.
    mapRef.current.fitBounds(bounds, {
      padding: [60, 60],
      maxZoom: 11,
      animate: true,
    });
  }, [visibleVehicles, selectedVehicleId, onVehicleSelect]);

  return (
    <>
      <div ref={mapContainerRef} className="h-full w-full" />
      <style jsx global>{`
        .fleet-marker {
          transform: translate(-28px, -52px);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
        }

        .fleet-label {
          border-radius: 999px;
          padding: 2px 8px;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.04em;
          color: #0f172a;
          background: rgba(255, 255, 255, 0.95);
          border: 1px solid rgba(148, 163, 184, 0.6);
          box-shadow: 0 2px 8px rgba(15, 23, 42, 0.18);
          white-space: nowrap;
        }

        .fleet-truck {
          height: 30px;
          width: 30px;
          border-radius: 999px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 2px solid transparent;
          box-shadow: 0 6px 14px rgba(15, 23, 42, 0.3);
        }

        .fleet-truck .material-symbols-outlined {
          font-size: 18px;
          color: white;
        }

        .fleet-marker.ready .fleet-truck {
          background: linear-gradient(135deg, #059669, #10b981);
          border-color: rgba(255, 255, 255, 0.75);
        }

        .fleet-marker.unavailable .fleet-truck {
          background: linear-gradient(135deg, #475569, #334155);
          border-color: rgba(255, 255, 255, 0.65);
          opacity: 0.9;
        }

        .fleet-marker.selected .fleet-truck {
          transform: scale(1.08);
          box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.28), 0 8px 18px rgba(30, 64, 175, 0.35);
        }
      `}</style>
    </>
  );
}
