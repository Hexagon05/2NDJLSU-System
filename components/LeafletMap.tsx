"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface LeafletMapProps {
    lat: number;
    lng: number;
    onChange: (lat: number, lng: number) => void;
}

export default function LeafletMap({ lat, lng, onChange }: LeafletMapProps) {
    const mapRef = useRef<L.Map | null>(null);
    const markerRef = useRef<L.Marker | null>(null);
    const mapContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!mapContainerRef.current) return;

        // Initialize map if not already done
        if (!mapRef.current) {
            mapRef.current = L.map(mapContainerRef.current).setView([lat, lng], 13);
            L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            }).addTo(mapRef.current);

            // Add click handler
            mapRef.current.on("click", (e: L.LeafletMouseEvent) => {
                const { lat, lng } = e.latlng;
                onChange(lat, lng);
            });
        }

        // Update or create marker
        if (markerRef.current) {
            markerRef.current.setLatLng([lat, lng]);
        } else if (mapRef.current) {
            const customIcon = L.divIcon({
                html: `<span class="material-symbols-outlined text-rose-600 drop-shadow-lg" style="font-size: 32px; transform: translate(-16px, -32px);">location_on</span>`,
                className: 'custom-div-icon',
                iconSize: [0, 0],
            });
            markerRef.current = L.marker([lat, lng], { icon: customIcon }).addTo(mapRef.current);
        }

        // Pan map to new marker position
        if (mapRef.current) {
            mapRef.current.panTo([lat, lng]);
        }

    }, [lat, lng, onChange]);

    return <div ref={mapContainerRef} className="h-full w-full" id="dispatch-map" />;
}
