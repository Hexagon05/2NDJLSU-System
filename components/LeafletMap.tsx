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
            const customIcon = L.divIcon({
                html: `<span class="material-symbols-outlined text-rose-600 drop-shadow-lg" style="font-size: 32px; transform: translate(-16px, -32px);">location_on</span>`,
                className: 'custom-div-icon',
                iconSize: [32, 32],
                iconAnchor: [16, 32],
            });
            markerRef.current = L.marker([lat, lng], { icon: customIcon }).addTo(mapRef.current);
        }

        // Pan map to new marker position
        if (mapRef.current) {
            mapRef.current.panTo([lat, lng]);
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
