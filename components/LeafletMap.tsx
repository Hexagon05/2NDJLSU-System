"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface LeafletMapProps {
    lat: number;
    lng: number;
    onChange?: (lat: number, lng: number) => void;
}

export default function LeafletMap({ lat, lng, onChange }: LeafletMapProps) {
    const mapRef = useRef<L.Map | null>(null);
    const markerRef = useRef<L.Marker | null>(null);
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const resizeObserverRef = useRef<ResizeObserver | null>(null);

    const buildPinIcon = () => L.divIcon({
        className: "custom-div-icon",
        iconSize: [28, 40],
        iconAnchor: [14, 40],
        popupAnchor: [0, -36],
        html: `
            <div style="
                position: relative;
                width: 28px;
                height: 40px;
                display: flex;
                align-items: flex-start;
                justify-content: center;
                filter: drop-shadow(0 6px 8px rgba(15, 23, 42, 0.25));
            ">
                <svg width="28" height="40" viewBox="0 0 28 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M14 1.5C8.201 1.5 3.5 6.201 3.5 12C3.5 20.25 14 38.5 14 38.5C14 38.5 24.5 20.25 24.5 12C24.5 6.201 19.799 1.5 14 1.5Z" fill="#ffffff" stroke="#e11d48" stroke-width="2"/>
                    <circle cx="14" cy="12" r="5" fill="#e11d48"/>
                </svg>
            </div>
        `,
    });

    useEffect(() => {
        const container = mapContainerRef.current;
        if (!container) return;

        // Initialize map if not already done
        if (!mapRef.current) {
            mapRef.current = L.map(container).setView([lat, lng], 13);
            L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            }).addTo(mapRef.current);

            // Add click handler
            mapRef.current.on("click", (e: L.LeafletMouseEvent) => {
                const { lat, lng } = e.latlng;
                onChange?.(lat, lng);
            });

            // Fix tile/layout glitches when map appears inside animated/modaled containers.
            requestAnimationFrame(() => mapRef.current?.invalidateSize());
            setTimeout(() => mapRef.current?.invalidateSize(), 120);

            if (typeof ResizeObserver !== "undefined") {
                resizeObserverRef.current = new ResizeObserver(() => {
                    mapRef.current?.invalidateSize();
                });
                resizeObserverRef.current.observe(container);
            }
        }

        // Update or create marker
        if (markerRef.current) {
            markerRef.current.setLatLng([lat, lng]);
        } else if (mapRef.current) {
            markerRef.current = L.marker([lat, lng], { icon: buildPinIcon() }).addTo(mapRef.current);
        }

        // Pan/fly map to new marker position so the selected point stays centered.
        if (mapRef.current) {
            mapRef.current.flyTo([lat, lng], Math.max(mapRef.current.getZoom(), 13), {
                animate: true,
                duration: 0.6,
            });
        }

    }, [lat, lng, onChange]);

    useEffect(() => {
        return () => {
            resizeObserverRef.current?.disconnect();
            resizeObserverRef.current = null;
            mapRef.current?.remove();
            mapRef.current = null;
            markerRef.current = null;
        };
    }, []);

    return <div ref={mapContainerRef} className="h-full w-full" />;
}
