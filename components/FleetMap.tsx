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
  isIdle?: boolean;
  hasActiveDispatch?: boolean;
  isReturningToCamp?: boolean;
  isStopOver?: boolean;
};

type RoutePoint = {
  lat: number;
  lng: number;
};

type ActiveRoutePlan = {
  id: string;
  currentLocation: RoutePoint;
  destinationLocation: RoutePoint;
  baseCampLocation?: RoutePoint;
};

type MapViewMode = "truck" | "destination" | "show-all";

interface FleetMapProps {
  vehicles: FleetVehicle[];
  selectedVehicleId?: string | null;
  routePoints?: RoutePoint[];
  mapViewMode?: MapViewMode;
  baseCampLocation?: RoutePoint;
  currentLocation?: RoutePoint | null;
  destinationLocation?: RoutePoint | null;
  allActiveRoutes?: ActiveRoutePlan[];
}

const DEFAULT_CENTER: [number, number] = [9.748257, 118.771556];
const DEFAULT_ZOOM = 9;
const TRUCK_FOCUS_ZOOM = 16;
const AUTO_RELOCK_MS = 30000;

function isValidPoint(point?: RoutePoint | null): point is RoutePoint {
  return !!point && Number.isFinite(point.lat) && Number.isFinite(point.lng);
}

function uniqWaypoints(points: Array<RoutePoint | null | undefined>): RoutePoint[] {
  const seen = new Set<string>();

  return points.filter((point): point is RoutePoint => {
    if (!isValidPoint(point)) return false;

    const key = `${point.lat.toFixed(6)},${point.lng.toFixed(6)}`;
    if (seen.has(key)) return false;

    seen.add(key);
    return true;
  });
}

function toRouteKey(point: RoutePoint): string {
  // Keep route signatures stable against minor GPS drift.
  return `${point.lat.toFixed(4)},${point.lng.toFixed(4)}`;
}

function createDestinationIcon(): L.DivIcon {
  return L.divIcon({
    className: "fleet-destination-marker-wrapper",
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    html: `
      <div class="fleet-destination-marker" title="Destination">
        <span class="material-symbols-outlined">place</span>
      </div>
    `,
  });
}

export default function FleetMap({
  vehicles,
  selectedVehicleId,
  routePoints,
  mapViewMode = "truck",
  baseCampLocation,
  currentLocation,
  destinationLocation,
  allActiveRoutes = [],
}: FleetMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const trailLayerRef = useRef<L.LayerGroup | null>(null);
  const planningLayerRef = useRef<L.LayerGroup | null>(null);
  const allRoutesLayerRef = useRef<L.LayerGroup | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const hasAutoFittedRef = useRef(false);
  const lastFocusedVehicleIdRef = useRef<string | null>(null);
  const trailSignatureRef = useRef<string>("");
  const planningSignatureRef = useRef<string>("");
  const allRoutesSignatureRef = useRef<string>("");
  const routingRequestRef = useRef(0);
  const allRoutesRequestRef = useRef(0);
  const truckRelockTimeoutRef = useRef<number | null>(null);
  const latestTruckPointRef = useRef<RoutePoint | null>(null);

  const clearTruckRelockTimeout = () => {
    if (truckRelockTimeoutRef.current !== null) {
      window.clearTimeout(truckRelockTimeoutRef.current);
      truckRelockTimeoutRef.current = null;
    }
  };

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
    trailLayerRef.current = L.layerGroup().addTo(mapRef.current);
    planningLayerRef.current = L.layerGroup().addTo(mapRef.current);
    allRoutesLayerRef.current = L.layerGroup().addTo(mapRef.current);

    return () => {
      clearTruckRelockTimeout();
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
      trailLayerRef.current = null;
      planningLayerRef.current = null;
      allRoutesLayerRef.current = null;
      markersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const allRoutesLayer = allRoutesLayerRef.current;

    if (!map || !allRoutesLayer) return;

    const allRoutesSignature = mapViewMode === "show-all"
      ? allActiveRoutes
          .map((routePlan) => {
            const current = toRouteKey(routePlan.currentLocation);
            const destination = toRouteKey(routePlan.destinationLocation);
            return `${routePlan.id}:${current}->${destination}`;
          })
          .sort()
          .join("|")
      : `mode:${mapViewMode}`;

    if (allRoutesSignatureRef.current === allRoutesSignature) {
      return;
    }
    allRoutesSignatureRef.current = allRoutesSignature;

    allRoutesLayer.clearLayers();

    if (mapViewMode !== "show-all") return;

    if (allActiveRoutes.length === 0) {
      if (visibleVehicles.length > 0) {
        const bounds = L.latLngBounds(
          visibleVehicles.map((vehicle) => [vehicle.lat as number, vehicle.lng as number] as [number, number])
        );

        map.fitBounds(bounds, {
          padding: [60, 60],
          maxZoom: 11,
          animate: true,
        });
      }
      return;
    }

    allRoutesRequestRef.current += 1;
    const activeSignature = allRoutesSignature;
    const boundsPoints: [number, number][] = [];

    allActiveRoutes.forEach((routePlan, index) => {
      const waypoints = uniqWaypoints([
        routePlan.currentLocation,
        routePlan.destinationLocation,
      ]);

      if (waypoints.length < 2) return;

      waypoints.forEach((point) => {
        boundsPoints.push([point.lat, point.lng]);
      });

      L.circleMarker([routePlan.currentLocation.lat, routePlan.currentLocation.lng], {
        radius: 6,
        color: "#ffffff",
        weight: 2,
        fillColor: "#16a34a",
        fillOpacity: 0.95,
      })
        .bindTooltip(`Active Dispatch ${index + 1}: Current`, { permanent: false })
        .addTo(allRoutesLayer);

      L.circleMarker([routePlan.destinationLocation.lat, routePlan.destinationLocation.lng], {
        radius: 7,
        color: "#ffffff",
        weight: 2,
        fillColor: "#2563eb",
        fillOpacity: 0.95,
      })
        .bindTooltip(`Active Dispatch ${index + 1}: Destination`, { permanent: false })
        .addTo(allRoutesLayer);

      const coords = waypoints.map((point) => `${point.lng},${point.lat}`).join(";");
      const routeUrl = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&alternatives=false&steps=false`;

      void fetch(routeUrl)
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(`Routing request failed with ${response.status}`);
          }

          const payload = await response.json();
          const geometry = payload?.routes?.[0]?.geometry?.coordinates;
          if (!Array.isArray(geometry) || geometry.length < 2) {
            throw new Error("No street route geometry returned");
          }

          if (allRoutesSignatureRef.current !== activeSignature) return;

          const routeLatLngs = geometry
            .map((point: unknown) => {
              if (!Array.isArray(point) || point.length < 2) return null;

              const lng = Number(point[0]);
              const lat = Number(point[1]);
              if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

              return [lat, lng] as [number, number];
            })
            .filter((point: [number, number] | null): point is [number, number] => !!point);

          if (routeLatLngs.length < 2) return;

          L.polyline(routeLatLngs, {
            color: "#14532d",
            weight: 8,
            opacity: 0.16,
            lineCap: "round",
            lineJoin: "round",
          }).addTo(allRoutesLayer);

          L.polyline(routeLatLngs, {
            color: "#16a34a",
            weight: 4,
            opacity: 0.95,
            lineCap: "round",
            lineJoin: "round",
          }).addTo(allRoutesLayer);
        })
        .catch(() => {
          if (allRoutesSignatureRef.current !== activeSignature) return;

          const fallbackLatLngs = waypoints.map((point) => [point.lat, point.lng] as [number, number]);
          if (fallbackLatLngs.length < 2) return;

          L.polyline(fallbackLatLngs, {
            color: "#14532d",
            weight: 8,
            opacity: 0.16,
            lineCap: "round",
            lineJoin: "round",
            dashArray: "7 7",
          }).addTo(allRoutesLayer);

          L.polyline(fallbackLatLngs, {
            color: "#16a34a",
            weight: 4,
            opacity: 0.85,
            lineCap: "round",
            lineJoin: "round",
            dashArray: "7 7",
          }).addTo(allRoutesLayer);
        });
    });

    if (boundsPoints.length > 0) {
      map.fitBounds(L.latLngBounds(boundsPoints), {
        padding: [70, 70],
        maxZoom: 12,
        animate: true,
      });
    }
  }, [mapViewMode, allActiveRoutes, visibleVehicles]);

  useEffect(() => {
    if (!trailLayerRef.current) return;

    const route = (routePoints || []).filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
    const routeSignature = route.map((point) => `${point.lat.toFixed(6)},${point.lng.toFixed(6)}`).join("|");

    if (trailSignatureRef.current === routeSignature) return;
    trailSignatureRef.current = routeSignature;

    // Historical trail is intentionally hidden on dashboard map;
    // only the green suggested street routing line is shown.
    trailLayerRef.current.clearLayers();
  }, [routePoints]);

  useEffect(() => {
    const map = mapRef.current;
    const planningLayer = planningLayerRef.current;

    if (!map || !planningLayer) return;

    planningLayer.clearLayers();

    if (mapViewMode === "show-all") {
      planningSignatureRef.current = "";
      return;
    }

    if (!selectedVehicleId) {
      planningSignatureRef.current = "";
      lastFocusedVehicleIdRef.current = null;
      return;
    }

    const selectedVehicle = visibleVehicles.find((vehicle) => vehicle.id === selectedVehicleId);
    if (!selectedVehicle) return;

    const liveTruckPoint: RoutePoint = isValidPoint(currentLocation)
      ? currentLocation
      : { lat: selectedVehicle.lat as number, lng: selectedVehicle.lng as number };
    latestTruckPointRef.current = liveTruckPoint;

    const navWaypoints = mapViewMode === "destination"
      ? uniqWaypoints([baseCampLocation, liveTruckPoint, destinationLocation])
      : uniqWaypoints([liveTruckPoint, destinationLocation]);

    const signature = `${mapViewMode}|${selectedVehicleId}|${navWaypoints.map((point) => toRouteKey(point)).join(";")}`;
    const signatureChanged = planningSignatureRef.current !== signature;
    planningSignatureRef.current = signature;

    const pointMarkers: Array<{ point: RoutePoint; label: string; color: string }> = [
      { point: liveTruckPoint, label: "Current Location", color: "#16a34a" },
    ];

    if (isValidPoint(destinationLocation)) {
      pointMarkers.push({ point: destinationLocation, label: "Destination", color: "#2563eb" });
    }

    if (mapViewMode === "destination" && isValidPoint(baseCampLocation)) {
      pointMarkers.push({ point: baseCampLocation, label: "Base Camp", color: "#7c3aed" });
    }

    pointMarkers.forEach(({ point, label, color }) => {
      if (label === "Destination") {
        L.marker([point.lat, point.lng], {
          icon: createDestinationIcon(),
        })
          .bindTooltip(label, { permanent: false })
          .addTo(planningLayer);
        return;
      }

      L.circleMarker([point.lat, point.lng], {
        radius: label === "Current Location" ? 8 : 6,
        color: "#ffffff",
        weight: 2,
        fillColor: color,
        fillOpacity: 0.95,
      })
        .bindTooltip(label, { permanent: false })
        .addTo(planningLayer);
    });

    if (mapViewMode === "truck") {
      const existingZoom = map.getZoom();
      const targetZoom = Math.max(existingZoom, TRUCK_FOCUS_ZOOM);
      const isSameSelectedVehicle = lastFocusedVehicleIdRef.current === selectedVehicleId;

      if (isSameSelectedVehicle && existingZoom < TRUCK_FOCUS_ZOOM) {
        if (truckRelockTimeoutRef.current === null) {
          const relockVehicleId = selectedVehicleId;
          truckRelockTimeoutRef.current = window.setTimeout(() => {
            truckRelockTimeoutRef.current = null;

            const liveMap = mapRef.current;
            if (!liveMap) return;
            if (mapViewMode !== "truck") return;
            if (lastFocusedVehicleIdRef.current !== relockVehicleId) return;

            const point = latestTruckPointRef.current;
            if (!point) return;

            liveMap.flyTo([point.lat, point.lng], TRUCK_FOCUS_ZOOM, {
              animate: true,
              duration: 0.9,
            });
          }, AUTO_RELOCK_MS);
        }
      } else {
        clearTruckRelockTimeout();
      }

      if (!isSameSelectedVehicle || existingZoom >= TRUCK_FOCUS_ZOOM) {
        map.flyTo([liveTruckPoint.lat, liveTruckPoint.lng], targetZoom, {
          animate: true,
          duration: isSameSelectedVehicle ? 0.5 : 0.9,
        });
      }
    } else {
      clearTruckRelockTimeout();
      const boundsPoints = uniqWaypoints([baseCampLocation, liveTruckPoint, destinationLocation]);
      if (boundsPoints.length >= 2 && signatureChanged) {
        map.fitBounds(
          L.latLngBounds(boundsPoints.map((point) => [point.lat, point.lng] as [number, number])),
          {
            padding: [60, 60],
            maxZoom: 15,
            animate: true,
          }
        );
      }
    }

    lastFocusedVehicleIdRef.current = selectedVehicleId;

    if (navWaypoints.length < 2) return;

    const requestId = ++routingRequestRef.current;
    const coords = navWaypoints.map((point) => `${point.lng},${point.lat}`).join(";");
    const routeUrl = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&alternatives=false&steps=false`;

    void fetch(routeUrl)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Routing request failed with ${response.status}`);
        }

        const payload = await response.json();
        const geometry = payload?.routes?.[0]?.geometry?.coordinates;
        if (!Array.isArray(geometry) || geometry.length < 2) {
          throw new Error("No street route geometry returned");
        }

        if (routingRequestRef.current !== requestId) return;

        const routeLatLngs = geometry
          .map((point: unknown) => {
            if (!Array.isArray(point) || point.length < 2) return null;

            const lng = Number(point[0]);
            const lat = Number(point[1]);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

            return [lat, lng] as [number, number];
          })
          .filter((point: [number, number] | null): point is [number, number] => !!point);

        if (routeLatLngs.length < 2) return;

        L.polyline(routeLatLngs, {
          color: "#14532d",
          weight: 10,
          opacity: 0.18,
          lineCap: "round",
          lineJoin: "round",
        }).addTo(planningLayer);

        L.polyline(routeLatLngs, {
          color: "#16a34a",
          weight: 5,
          opacity: 0.98,
          lineCap: "round",
          lineJoin: "round",
        }).addTo(planningLayer);

        if (mapViewMode === "destination" && signatureChanged) {
          map.fitBounds(L.latLngBounds(routeLatLngs), {
            padding: [60, 60],
            maxZoom: 15,
            animate: true,
          });
        }
      })
      .catch(() => {
        if (routingRequestRef.current !== requestId) return;

        const fallbackLatLngs = navWaypoints.map((point) => [point.lat, point.lng] as [number, number]);
        if (fallbackLatLngs.length < 2) return;

        L.polyline(fallbackLatLngs, {
          color: "#14532d",
          weight: 10,
          opacity: 0.16,
          lineCap: "round",
          lineJoin: "round",
          dashArray: "8 8",
        }).addTo(planningLayer);

        L.polyline(fallbackLatLngs, {
          color: "#16a34a",
          weight: 5,
          opacity: 0.85,
          lineCap: "round",
          lineJoin: "round",
          dashArray: "8 8",
        }).addTo(planningLayer);
      });
  }, [selectedVehicleId, visibleVehicles, mapViewMode, baseCampLocation, currentLocation, destinationLocation]);

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
      const markerTone = vehicle.isStopOver
        ? "stopover"
        : vehicle.isReturningToCamp
        ? "returning"
        : vehicle.isIdle
          ? "idle"
          : (vehicle.hasActiveDispatch || vehicle.status === "Serviceable" ? "ready" : "unavailable");
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
      markerByVehicleId.set(vehicle.id, marker);
    });

    if (visibleVehicles.length === 0) {
      mapRef.current.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
      hasAutoFittedRef.current = false;
    }
  }, [visibleVehicles, selectedVehicleId]);

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

        .fleet-marker.stopover .fleet-truck {
          background: linear-gradient(135deg, #f97316, #fb923c);
          border-color: rgba(255, 255, 255, 0.85);
        }

        .fleet-marker.stopover .material-symbols-outlined {
          color: #ffffff;
        }

        .fleet-marker.stopover .fleet-label {
          color: #9a3412;
          background: rgba(255, 247, 237, 0.98);
          border-color: rgba(249, 115, 22, 0.32);
        }

        .fleet-marker.unavailable .fleet-truck {
          background: linear-gradient(135deg, #475569, #334155);
          border-color: rgba(255, 255, 255, 0.65);
          opacity: 0.9;
        }

        .fleet-marker.idle .fleet-truck {
          background: linear-gradient(135deg, #eab308, #facc15);
          border-color: rgba(255, 255, 255, 0.75);
        }

        .fleet-marker.idle .material-symbols-outlined {
          color: #333333;
        }

        .fleet-marker.returning .fleet-truck {
          background: linear-gradient(135deg, #f8fafc, #ffffff);
          border-color: rgba(148, 163, 184, 0.65);
        }

        .fleet-marker.returning .material-symbols-outlined {
          color: #475569;
        }

        .fleet-marker.selected .fleet-truck {
          transform: scale(1.08);
          box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.28), 0 8px 18px rgba(30, 64, 175, 0.35);
        }

        .fleet-destination-marker-wrapper {
          background: transparent;
          border: 0;
        }

        .fleet-destination-marker {
          height: 30px;
          width: 30px;
          border-radius: 999px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #2563eb, #1d4ed8);
          border: 2px solid rgba(255, 255, 255, 0.95);
          box-shadow: 0 6px 14px rgba(30, 64, 175, 0.35);
        }

        .fleet-destination-marker .material-symbols-outlined {
          font-size: 18px;
          color: #ffffff;
          font-variation-settings: "FILL" 1, "wght" 700, "GRAD" 0, "opsz" 20;
          line-height: 1;
        }
      `}</style>
    </>
  );
}
