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
    startLocation?: Coordinates;
    deliveryLocation?: Coordinates;
}

const DEFAULT_CENTER: [number, number] = [9.748257, 118.771556];
const DEFAULT_ZOOM = 11;

const REPORT_COLORS: Record<string, string> = {
    Delay: "#f59e0b",
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
    startLocation,
    deliveryLocation,
}: DispatchTrackingMiniMapProps) {
    const mapRef = useRef<L.Map | null>(null);
    const layerRef = useRef<L.LayerGroup | null>(null);
    const mapContainerRef = useRef<HTMLDivElement | null>(null);

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

        return () => {
            mapRef.current?.remove();
            mapRef.current = null;
            layerRef.current = null;
        };
    }, []);

    useEffect(() => {
        if (!mapRef.current || !layerRef.current) return;

        layerRef.current.clearLayers();

        const boundsPoints: [number, number][] = [];

        if (startLocation) {
            boundsPoints.push([startLocation.lat, startLocation.lng]);
            L.marker([startLocation.lat, startLocation.lng], {
                icon: buildPin("#3b82f6", "S"),
            })
                .bindPopup(`<b>Start Location</b><br/>${startLocation.label || "Dispatch start"}`)
                .addTo(layerRef.current);
        }

        if (deliveryLocation) {
            boundsPoints.push([deliveryLocation.lat, deliveryLocation.lng]);
            L.marker([deliveryLocation.lat, deliveryLocation.lng], {
                icon: buildPin("#16a34a", "D"),
            })
                .bindPopup(`<b>Delivery Location</b><br/>${deliveryLocation.label || "Dispatch target"}`)
                .addTo(layerRef.current);
        }

        const pathPoints: [number, number][] = sortedMovement.map((point) => [point.location.lat, point.location.lng]);
        pathPoints.forEach((coord) => boundsPoints.push(coord));

        if (pathPoints.length > 1) {
            L.polyline(pathPoints, {
                color: "#0f172a",
                weight: 3,
                opacity: 0.7,
                dashArray: "6 5",
            }).addTo(layerRef.current);
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
                .addTo(layerRef.current);
        });

        if (boundsPoints.length === 0) {
            mapRef.current.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
            return;
        }

        const bounds = L.latLngBounds(boundsPoints);
        mapRef.current.fitBounds(bounds, {
            padding: [26, 26],
            maxZoom: 16,
            animate: true,
        });
    }, [sortedMovement, reportEvents, startLocation, deliveryLocation]);

    return <div ref={mapContainerRef} className="h-full w-full" />;
}
