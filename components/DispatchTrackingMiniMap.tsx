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
    const mapContainerRef = useRef<HTMLDivElement | null>(null);
    const resizeObserverRef = useRef<ResizeObserver | null>(null);

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
        };
    }, []);

    useEffect(() => {
        const map = mapRef.current;
        const layer = layerRef.current;

        if (!map || !layer) return;

        layer.clearLayers();

        const boundsPoints: [number, number][] = [];

        if (baseCampLocation) {
            boundsPoints.push([baseCampLocation.lat, baseCampLocation.lng]);
            L.marker([baseCampLocation.lat, baseCampLocation.lng], {
                icon: buildPin("#2563eb", "B"),
            })
                .bindPopup(`<b>Base Camp</b><br/>${baseCampLocation.label || "Base camp"}<br/>${baseCampLocation.lat.toFixed(6)}, ${baseCampLocation.lng.toFixed(6)}`)
                .addTo(layer);
        }

        if (currentLocation) {
            boundsPoints.push([currentLocation.lat, currentLocation.lng]);
            L.marker([currentLocation.lat, currentLocation.lng], {
                icon: buildPin("#f97316", "C"),
            })
                .bindPopup(`<b>Current Location</b><br/>${currentLocation.label || "Live truck location"}<br/>${currentLocation.lat.toFixed(6)}, ${currentLocation.lng.toFixed(6)}`)
                .addTo(layer);
        }

        if (deliveryLocation) {
            boundsPoints.push([deliveryLocation.lat, deliveryLocation.lng]);
            L.marker([deliveryLocation.lat, deliveryLocation.lng], {
                icon: buildPin("#16a34a", "D"),
            })
                .bindPopup(`<b>Destination</b><br/>${deliveryLocation.label || "Dispatch target"}<br/>${deliveryLocation.lat.toFixed(6)}, ${deliveryLocation.lng.toFixed(6)}`)
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

    return (
        <div className="flex h-full min-h-0 w-full">
            <div ref={mapContainerRef} className="min-h-0 flex-1 w-full" />
        </div>
    );
}
