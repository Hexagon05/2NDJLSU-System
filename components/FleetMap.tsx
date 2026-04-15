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

type RoutePoint = {
  lat: number;
  lng: number;
};

interface FleetMapProps {
  vehicles: FleetVehicle[];
  selectedVehicleId?: string | null;
  onVehicleHover?: (vehicleId: string | null) => void;
  onVehicleSelect?: (vehicleId: string) => void;
  routePoints?: RoutePoint[];
}

const DEFAULT_CENTER: [number, number] = [9.748257, 118.771556];
const DEFAULT_ZOOM = 9;
const SELECTED_VEHICLE_ZOOM = 14;

export default function FleetMap({ vehicles, selectedVehicleId, onVehicleHover, onVehicleSelect, routePoints }: FleetMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const hasAutoFittedRef = useRef(false);
  const lastFocusedVehicleIdRef = useRef<string | null>(null);
  const routeSignatureRef = useRef<string>("");

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
    routeLayerRef.current = L.layerGroup().addTo(mapRef.current);

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
      routeLayerRef.current = null;
      markersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !routeLayerRef.current) return;

    const route = (routePoints || []).filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
    const routeSignature = route.map((point) => `${point.lat.toFixed(6)},${point.lng.toFixed(6)}`).join("|");

    if (routeSignatureRef.current === routeSignature) return;
    routeSignatureRef.current = routeSignature;

    routeLayerRef.current.clearLayers();

    if (route.length < 2) return;

    const routeLatLngs = route.map((point) => [point.lat, point.lng] as [number, number]);
    const routeShadow = L.polyline(routeLatLngs, {
      color: "#1d4ed8",
      weight: 10,
      opacity: 0.16,
      lineCap: "round",
      lineJoin: "round",
    }).addTo(routeLayerRef.current);

    L.polyline(routeLatLngs, {
      color: "#2563eb",
      weight: 5,
      opacity: 0.92,
      lineCap: "round",
      lineJoin: "round",
    }).addTo(routeLayerRef.current);

    L.circleMarker(routeLatLngs[0], {
      radius: 6,
      color: "#ffffff",
      weight: 2,
      fillColor: "#10b981",
      fillOpacity: 1,
    }).bindTooltip("Route start", { permanent: false }).addTo(routeLayerRef.current);

    L.circleMarker(routeLatLngs[routeLatLngs.length - 1], {
      radius: 7,
      color: "#ffffff",
      weight: 2,
      fillColor: "#2563eb",
      fillOpacity: 1,
    }).bindTooltip("Latest truck position", { permanent: false }).addTo(routeLayerRef.current);

    const routeBounds = L.latLngBounds(routeLatLngs);
    mapRef.current.fitBounds(routeBounds, {
      padding: [50, 50],
      maxZoom: 15,
      animate: true,
    });

    routeShadow.bringToBack();
  }, [routePoints]);

  useEffect(() => {
    if (!mapRef.current || !layerRef.current) return;

    const markerByVehicleId = markersRef.current;
    const visibleVehicleIds = new Set(visibleVehicles.map((vehicle) => vehicle.id));

    // Remove markers for vehicles no longer visible.
    markerByVehicleId.forEach((marker, vehicleId) => {
      if (!visibleVehicleIds.has(vehicleId)) {
        marker.remove();
        markerByVehicleId.delete(vehicleId);
      }
    });

    visibleVehicles.forEach((vehicle) => {
      const isSelected = vehicle.id === selectedVehicleId;
      const markerTone = vehicle.status === "Serviceable" ? "ready" : "unavailable";
      const icon = L.divIcon({
        className: "fleet-marker-wrapper",
        iconSize: [110, 56],
        iconAnchor: [55, 52],
        html: `
          <div class="fleet-marker ${markerTone} ${isSelected ? "selected" : ""}">
            <div class="fleet-label">${vehicle.codename}</div>
            <div class="fleet-truck">
              <span class="material-symbols-outlined">local_shipping</span>
            </div>
          </div>
        `,
      });

      const existingMarker = markerByVehicleId.get(vehicle.id);
      if (existingMarker) {
        existingMarker.setLatLng([vehicle.lat as number, vehicle.lng as number]);
        existingMarker.setIcon(icon);
        return;
      }

      const marker = L.marker([vehicle.lat as number, vehicle.lng as number], { icon }).addTo(layerRef.current as L.LayerGroup);
      marker.on("mouseover", () => onVehicleHover?.(vehicle.id));
      marker.on("mousemove", () => onVehicleHover?.(vehicle.id));
      marker.on("mouseout", () => onVehicleHover?.(null));
      marker.on("click", () => onVehicleSelect?.(vehicle.id));
      marker.on("touchstart", () => onVehicleSelect?.(vehicle.id));
      markerByVehicleId.set(vehicle.id, marker);
    });

    if (visibleVehicles.length === 0) {
      mapRef.current.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
      hasAutoFittedRef.current = false;
    }
  }, [visibleVehicles, selectedVehicleId, onVehicleHover, onVehicleSelect]);

  useEffect(() => {
    if (!mapRef.current) return;

    if (visibleVehicles.length === 0) {
      mapRef.current.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
      hasAutoFittedRef.current = false;
      return;
    }

    if (hasAutoFittedRef.current) return;

    const bounds = L.latLngBounds(
      visibleVehicles.map((vehicle) => [vehicle.lat as number, vehicle.lng as number] as [number, number])
    );

    // Fit all vehicles only on initial load/refresh to avoid overriding user zoom.
    mapRef.current.fitBounds(bounds, {
      padding: [60, 60],
      maxZoom: 11,
      animate: true,
    });
    hasAutoFittedRef.current = true;
  }, [visibleVehicles]);

  useEffect(() => {
    if (!mapRef.current || !selectedVehicleId) {
      lastFocusedVehicleIdRef.current = null;
      return;
    }

    const selectedVehicle = visibleVehicles.find((vehicle) => vehicle.id === selectedVehicleId);
    if (!selectedVehicle || !Number.isFinite(selectedVehicle.lat) || !Number.isFinite(selectedVehicle.lng)) return;

    const currentZoom = mapRef.current.getZoom();
    const targetZoom = Math.max(currentZoom, SELECTED_VEHICLE_ZOOM);

    // Prevent repeated flyTo when the same selected vehicle does not change.
    if (lastFocusedVehicleIdRef.current === selectedVehicleId) {
      mapRef.current.panTo([selectedVehicle.lat as number, selectedVehicle.lng as number], { animate: true });
      return;
    }

    mapRef.current.flyTo([selectedVehicle.lat as number, selectedVehicle.lng as number], targetZoom, {
      animate: true,
      duration: 0.8,
    });

    lastFocusedVehicleIdRef.current = selectedVehicleId;
  }, [selectedVehicleId, visibleVehicles]);

  return (
    <>
      <div ref={mapContainerRef} className="h-full w-full" />
      <style jsx global>{`
        .fleet-marker-wrapper {
          background: transparent;
          border: 0;
        }

        .fleet-marker {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          width: 110px;
          pointer-events: auto;
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
