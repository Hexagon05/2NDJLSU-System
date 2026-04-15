"use client";

import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface Coordinates {
    lat: number;
    lng: number;
    label?: string;
}

interface DispatchTrackingPoint {
    id: string;
    location: Coordinates;
    timestamp: { toMillis?: () => number } | null;
    reportText: string;
    reportKind: string;
}

interface DispatchTrackingMiniMapProps {
    movementPoints: DispatchTrackingPoint[];
    reportEvents: DispatchTrackingPoint[];
    baseCampLocation?: Coordinates;
    currentLocation?: Coordinates;
    deliveryLocation?: Coordinates;
}

const DEFAULT_CENTER: [number, number] = [9.748257, 118.771556];
const DEFAULT_ZOOM = 11;

const REPORT_COLORS: Record<string, string> = {
    Delay: "#f59e0b",
    "Stop Over": "#0ea5e9",
    Emergency: "#ef4444",
    "Confirm Delivery": "#10b981",
    "Location Update": "#3b82f6",
};

function toMillis(ts: { toMillis?: () => number } | null): number {
    return ts?.toMillis?.() ?? 0;
}

function toFiniteNumber(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
        const parsed = Number(value.trim());
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}

function normalizePoint(point?: Coordinates): Coordinates | null {
    if (!point) return null;

    const lat = toFiniteNumber((point as { lat?: unknown }).lat);
    const lng = toFiniteNumber((point as { lng?: unknown }).lng);
    if (lat === null || lng === null) return null;

    return {
        ...point,
        lat,
        lng,
    };
}

function uniqWaypoints(points: Array<Coordinates | undefined>): Coordinates[] {
    const seen = new Set<string>();

    return points
        .map((point) => normalizePoint(point))
        .filter((point): point is Coordinates => {
            if (!point) return false;

            const key = `${point.lat.toFixed(6)},${point.lng.toFixed(6)}`;
            if (seen.has(key)) return false;

            seen.add(key);
            return true;
        });
}

function buildPin(color: string, label: string): L.DivIcon {
    return L.divIcon({
        className: "dispatch-tracking-marker",
        iconSize: [28, 28],
        iconAnchor: [14, 14],
        html: `
            <div style="
                height: 28px;
                width: 28px;
                border-radius: 999px;
                border: 2px solid #fff;
                box-shadow: 0 4px 10px rgba(15, 23, 42, 0.35);
                background: ${color};
                display: flex;
                align-items: center;
                justify-content: center;
                color: #fff;
                font-size: 10px;
                font-weight: 800;
            ">${label}</div>
        `,
    });
}

export default function DispatchTrackingMiniMap({
    movementPoints,
    reportEvents,
    baseCampLocation,
    currentLocation,
    deliveryLocation,
}: DispatchTrackingMiniMapProps) {
    const mapRef = useRef<L.Map | null>(null);
    const layerRef = useRef<L.LayerGroup | null>(null);
    const routingLayerRef = useRef<L.LayerGroup | null>(null);
    const mapContainerRef = useRef<HTMLDivElement | null>(null);
    const resizeObserverRef = useRef<ResizeObserver | null>(null);
    const routingRequestRef = useRef(0);
    const routingSignatureRef = useRef("");

    const sortedMovement = useMemo(
        () => [...movementPoints].sort((a, b) => toMillis(a.timestamp) - toMillis(b.timestamp)),
        [movementPoints]
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
        routingLayerRef.current = L.layerGroup().addTo(mapRef.current);

        requestAnimationFrame(() => mapRef.current?.invalidateSize());
        setTimeout(() => mapRef.current?.invalidateSize(), 120);

        if (typeof ResizeObserver !== "undefined" && mapContainerRef.current) {
            resizeObserverRef.current = new ResizeObserver(() => {
                mapRef.current?.invalidateSize();
            });
            resizeObserverRef.current.observe(mapContainerRef.current);
        }

        return () => {
            resizeObserverRef.current?.disconnect();
            resizeObserverRef.current = null;
            mapRef.current?.remove();
            mapRef.current = null;
            layerRef.current = null;
            routingLayerRef.current = null;
        };
    }, []);

    useEffect(() => {
        const map = mapRef.current;
        const layer = layerRef.current;

        if (!map || !layer) return;

        layer.clearLayers();

        const normalizedBaseCamp = normalizePoint(baseCampLocation);
        const normalizedCurrent = normalizePoint(currentLocation);
        const normalizedDelivery = normalizePoint(deliveryLocation);

        const boundsPoints: [number, number][] = [];

        if (normalizedBaseCamp) {
            boundsPoints.push([normalizedBaseCamp.lat, normalizedBaseCamp.lng]);
            L.marker([normalizedBaseCamp.lat, normalizedBaseCamp.lng], {
                icon: buildPin("#2563eb", "B"),
            })
                .bindPopup(`<b>Base Camp</b><br/>${normalizedBaseCamp.label || "Base camp"}<br/>${normalizedBaseCamp.lat.toFixed(6)}, ${normalizedBaseCamp.lng.toFixed(6)}`)
                .addTo(layer);
        }

        if (normalizedCurrent) {
            boundsPoints.push([normalizedCurrent.lat, normalizedCurrent.lng]);
            L.marker([normalizedCurrent.lat, normalizedCurrent.lng], {
                icon: buildPin("#f97316", "C"),
            })
                .bindPopup(`<b>Current Location</b><br/>${normalizedCurrent.label || "Live truck location"}<br/>${normalizedCurrent.lat.toFixed(6)}, ${normalizedCurrent.lng.toFixed(6)}`)
                .addTo(layer);
        }

        if (normalizedDelivery) {
            boundsPoints.push([normalizedDelivery.lat, normalizedDelivery.lng]);
            L.marker([normalizedDelivery.lat, normalizedDelivery.lng], {
                icon: buildPin("#16a34a", "D"),
            })
                .bindPopup(`<b>Destination</b><br/>${normalizedDelivery.label || "Dispatch target"}<br/>${normalizedDelivery.lat.toFixed(6)}, ${normalizedDelivery.lng.toFixed(6)}`)
                .addTo(layer);
        }

        const pathPoints: [number, number][] = sortedMovement.map((point) => [point.location.lat, point.location.lng]);
        pathPoints.forEach((coord) => boundsPoints.push(coord));

        if (pathPoints.length > 1) {
            L.polyline(pathPoints, {
                color: "#0f172a",
                weight: 3,
                opacity: 0.7,
                dashArray: "6 5",
            }).addTo(layer);
        }

        reportEvents.forEach((event, index) => {
            const markerColor = REPORT_COLORS[event.reportKind] || REPORT_COLORS["Location Update"];
            const eventLabel = String(index + 1);
            const popupLines = [
                `<b>${event.reportKind}</b>`,
                `Coordinates: ${event.location.lat.toFixed(6)}, ${event.location.lng.toFixed(6)}`,
            ];
            if (event.reportText) {
                popupLines.push(`Details: ${event.reportText}`);
            }

            L.marker([event.location.lat, event.location.lng], {
                icon: buildPin(markerColor, eventLabel),
            })
                .bindPopup(popupLines.join("<br/>"))
                .addTo(layer);
        });

        if (boundsPoints.length === 0) {
            map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
            return;
        }

        const bounds = L.latLngBounds(boundsPoints);
        map.fitBounds(bounds, {
            padding: [26, 26],
            maxZoom: 16,
            animate: true,
        });
    }, [sortedMovement, reportEvents, baseCampLocation, currentLocation, deliveryLocation]);

    useEffect(() => {
        if (!mapRef.current) return;

        // The modal content can change size after render; force map reflow so tiles fill the container.
        requestAnimationFrame(() => mapRef.current?.invalidateSize());
        const timeoutId = window.setTimeout(() => mapRef.current?.invalidateSize(), 180);

        return () => {
            window.clearTimeout(timeoutId);
        };
    }, [sortedMovement, reportEvents, baseCampLocation, currentLocation, deliveryLocation]);

    useEffect(() => {
        const map = mapRef.current;
        const routingLayer = routingLayerRef.current;
        if (!map || !routingLayer) return;

        const waypoints = uniqWaypoints([baseCampLocation, currentLocation, deliveryLocation]);
        const signature = waypoints.map((point) => `${point.lat.toFixed(6)},${point.lng.toFixed(6)}`).join(";");

        if (routingSignatureRef.current === signature) return;
        routingSignatureRef.current = signature;

        routingLayer.clearLayers();

        if (waypoints.length < 2) return;

        const drawConnectorRoute = () => {
            const connectorLatLngs = waypoints.map((point) => [point.lat, point.lng] as [number, number]);
            if (connectorLatLngs.length < 2) return;

            L.polyline(connectorLatLngs, {
                color: "#16a34a",
                weight: 4,
                opacity: 0.82,
                lineCap: "round",
                lineJoin: "round",
            })
                .bindTooltip("Suggested route", { permanent: false })
                .addTo(routingLayer);
        };

        // Always show a visible route cue immediately while street routing is being resolved.
        drawConnectorRoute();

        const requestId = ++routingRequestRef.current;
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

                routingLayer.clearLayers();

                L.polyline(routeLatLngs, {
                    color: "#14532d",
                    weight: 10,
                    opacity: 0.16,
                    lineCap: "round",
                    lineJoin: "round",
                }).addTo(routingLayer);

                L.polyline(routeLatLngs, {
                    color: "#16a34a",
                    weight: 5,
                    opacity: 0.95,
                    lineCap: "round",
                    lineJoin: "round",
                })
                    .bindTooltip("Suggested street route", { permanent: false })
                    .addTo(routingLayer);

                const routeBounds = L.latLngBounds(routeLatLngs);
                map.fitBounds(routeBounds, {
                    padding: [26, 26],
                    maxZoom: 16,
                    animate: true,
                });
            })
            .catch(() => {
                if (routingRequestRef.current !== requestId) return;
                routingLayer.clearLayers();
                drawConnectorRoute();
            });
    }, [baseCampLocation, currentLocation, deliveryLocation]);

    return (
        <div className="h-full min-h-0 w-full">
            <div ref={mapContainerRef} className="h-full min-h-0 w-full" />
        </div>
    );
}
