"use client";

import { useEffect, useRef } from "react";

const GOOGLE_MAP_STYLE = [
    {
        "featureType": "all",
        "elementType": "geometry",
        "stylers": [
            {
                "color": "#202c3e"
            }
        ]
    },
    {
        "featureType": "all",
        "elementType": "labels.text.fill",
        "stylers": [
            {
                "gamma": 0.01
            },
            {
                "lightness": 20
            },
            {
                "weight": "1.39"
            },
            {
                "color": "#ffffff"
            }
        ]
    },
    {
        "featureType": "all",
        "elementType": "labels.text.stroke",
        "stylers": [
            {
                "weight": "0.96"
            },
            {
                "saturation": "9"
            },
            {
                "visibility": "on"
            },
            {
                "color": "#000000"
            }
        ]
    },
    {
        "featureType": "all",
        "elementType": "labels.icon",
        "stylers": [
            {
                "visibility": "off"
            }
        ]
    },
    {
        "featureType": "administrative.country",
        "elementType": "labels.icon",
        "stylers": [
            {
                "visibility": "on"
            },
            {
                "color": "#b91212"
            }
        ]
    },
    {
        "featureType": "landscape",
        "elementType": "geometry",
        "stylers": [
            {
                "lightness": 30
            },
            {
                "saturation": "9"
            },
            {
                "color": "#2a3859"
            }
        ]
    },
    {
        "featureType": "landscape.natural.landcover",
        "elementType": "all",
        "stylers": [
            {
                "saturation": "0"
            },
            {
                "lightness": "7"
            }
        ]
    },
    {
        "featureType": "poi",
        "elementType": "geometry",
        "stylers": [
            {
                "saturation": 20
            }
        ]
    },
    {
        "featureType": "poi.park",
        "elementType": "geometry",
        "stylers": [
            {
                "lightness": 20
            },
            {
                "saturation": -20
            }
        ]
    },
    {
        "featureType": "road",
        "elementType": "geometry",
        "stylers": [
            {
                "lightness": 10
            },
            {
                "saturation": -30
            }
        ]
    },
    {
        "featureType": "road",
        "elementType": "geometry.fill",
        "stylers": [
            {
                "color": "#193a55"
            }
        ]
    },
    {
        "featureType": "road",
        "elementType": "geometry.stroke",
        "stylers": [
            {
                "saturation": 25
            },
            {
                "lightness": 25
            },
            {
                "weight": "0.01"
            }
        ]
    },
    {
        "featureType": "water",
        "elementType": "all",
        "stylers": [
            {
                "lightness": "-44"
            },
            {
                "color": "#0f172a"
            }
        ]
    }
];

interface VehicleMarker {
    id: string;
    lat: number;
    lng: number;
    title?: string;
}

interface Props {
    lat?: number;
    lng?: number;
    zoom?: number;
    vehicles?: VehicleMarker[];
}

function loadGoogleMaps(apiKey: string) {
    return new Promise<void>((resolve, reject) => {
        if (typeof window === "undefined") return reject(new Error("No window"));
        if ((window as any).google && (window as any).google.maps) return resolve();
        const existing = document.querySelector(`script[data-google-maps]`);
        if (existing) {
            existing.addEventListener("load", () => resolve());
            existing.addEventListener("error", () => reject(new Error("Failed to load Google Maps")));
            return;
        }
        const script = document.createElement("script");
        script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}`;
        script.async = true;
        script.defer = true;
        script.setAttribute("data-google-maps", "1");
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Failed to load Google Maps script"));
        document.head.appendChild(script);
    });
}

export default function GoogleStyledMap({ lat = 9.748257, lng = 118.771556, zoom = 13, vehicles = [] }: Props) {
    const ref = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<any | null>(null);
    const markersRef = useRef<Record<string, any>>({});

    useEffect(() => {
        const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
        if (!apiKey) return;

        let mounted = true;

        loadGoogleMaps(apiKey)
            .then(() => {
                if (!mounted || !ref.current) return;
                const g = (window as any).google;
                mapRef.current = new g.maps.Map(ref.current, {
                    center: { lat, lng },
                    zoom,
                    styles: GOOGLE_MAP_STYLE as any,
                    disableDefaultUI: true,
                    zoomControl: true,
                });

                // initial marker for center
                new g.maps.Marker({ position: { lat, lng }, map: mapRef.current });
            })
            .catch((err) => {
                console.error("Failed to initialize Google Maps:", err);
            });

        return () => {
            mounted = false;
            if (ref.current) ref.current.innerHTML = "";
            mapRef.current = null;
            markersRef.current = {};
        };
    }, []); // init once

    // keep center in sync
    useEffect(() => {
        if (mapRef.current && typeof lat === 'number' && typeof lng === 'number') {
            mapRef.current.setCenter({ lat, lng });
        }
        if (mapRef.current && typeof zoom === 'number') {
            mapRef.current.setZoom(zoom);
        }
    }, [lat, lng, zoom]);

    // sync vehicle markers
    useEffect(() => {
        const g = (window as any).google;
        if (!g || !mapRef.current) return;

        // Add/update markers
        vehicles.forEach((v) => {
            if (!v || typeof v.lat !== 'number' || typeof v.lng !== 'number') return;
            if (markersRef.current[v.id]) {
                markersRef.current[v.id].setPosition({ lat: v.lat, lng: v.lng });
            } else {
                markersRef.current[v.id] = new g.maps.Marker({
                    position: { lat: v.lat, lng: v.lng },
                    map: mapRef.current,
                    title: v.title || v.id,
                });
            }
        });

        // Remove markers not in vehicles
        Object.keys(markersRef.current).forEach((id) => {
            if (!vehicles.find((v) => v.id === id)) {
                markersRef.current[id].setMap(null);
                delete markersRef.current[id];
            }
        });
    }, [vehicles]);

    return <div ref={ref} className="h-full w-full" />;
}
