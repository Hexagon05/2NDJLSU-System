"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import dynamic from "next/dynamic";
import { useTheme } from "@/lib/theme-context";
import DispatchModal from "@/components/DispatchModal";
import DispatchDetailModal from "@/components/DispatchDetailModal";
import NotificationsDropdown from "@/components/NotificationsDropdown";
import DispatchChatHub from "@/components/DispatchChatHub";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  Timestamp,
  where,
  getDocs,
  doc,
  updateDoc,
  limit,
} from "firebase/firestore";
import { onValue, ref as dbRef } from "firebase/database";
import { db, rtdb } from "@/lib/firebase";
import { logActivity } from "@/lib/activity-logger";

const FleetMap = dynamic(
  () => import("@/components/FleetMap"),
  {
    ssr: false,
    loading: () => (
      <div className="h-full w-full bg-slate-100 animate-pulse flex items-center justify-center text-xs font-semibold text-slate-500">
        Loading fleet map...
      </div>
    ),
  }
);

interface Dispatch {
  id: string;
  dispatchId: string;
  requisitionNumber?: string;
  requisitionId?: string;
  poNumber?: string;
  officer: string;
  personnels: string;
  truck: string;
  status: string;
  CurrentLocation?: { lat: number; lng: number; updatedAt?: Timestamp | null };
  currentLocation?: { lat: number; lng: number; updatedAt?: Timestamp | null };
  UpdatedAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
  location?: { lat: number; lng: number; label: string };
  startLocation?: { lat: number; lng: number; label: string };
  deliveryLocation?: { lat: number; lng: number; label: string };
  supplies: { category: string; item: string; quantity: number }[];
  createdAt: Timestamp | null;
}

interface Vehicle {
  id: string;
  codename: string;
  status: string;
  truckType: string;
  plate: string;
  personnelName?: string;
  lat?: number;
  lng?: number;
  isIdle?: boolean;
  hasActiveDispatch?: boolean;
}

interface RoutePoint {
  lat: number;
  lng: number;
}

interface RealtimeLocationPoint extends RoutePoint {
  lastUpdated?: number;
}

interface ActiveRoutePlan {
  id: string;
  currentLocation: RoutePoint;
  destinationLocation: RoutePoint;
  baseCampLocation?: RoutePoint;
}

type MapViewMode = "truck" | "destination" | "show-all";

function formatTime(ts: Timestamp | null): string {
  if (!ts) return "-";
  return ts.toDate().toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STATUS_STYLES: Record<string, string> = {
  Pending:
    "bg-amber-100 text-amber-700 border border-amber-300",
  Approved:
    "bg-blue-100 text-blue-700 border border-blue-300",
  "En Route":
    "bg-violet-100 text-violet-700 border border-violet-300",
  Ongoing:
    "bg-orange-100 text-orange-700 border border-orange-300",
  Delivered:
    "bg-cyan-100 text-cyan-700 border border-cyan-300",
  Completed:
    "bg-emerald-100 text-emerald-700 border border-emerald-300",
  Cancelled:
    "bg-rose-100 text-rose-700 border border-rose-300",
};

export default function Dashboard() {
  const { user, loading, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showDispatchModal, setShowDispatchModal] = useState(false);
  const [dispatches, setDispatches] = useState<Dispatch[]>([]);
  const [selectedDispatch, setSelectedDispatch] = useState<Dispatch | null>(null);
  const [dispatchRefresh, setDispatchRefresh] = useState(0);
  const [metrics, setMetrics] = useState({
    totalActiveVehicles: 0,
    ongoingDeliveries: 0,
    completedDispatches: 0,
    totalPersonnel: 0,
  });

  // Vehicle tracking state
  const [selectedVehicle, setSelectedVehicle] = useState<string | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleSearch, setVehicleSearch] = useState("");
  const [vehicleFilter, setVehicleFilter] = useState<"all" | "serviceable" | "active-dispatch">("all");
  const [selectedVehicleDispatch, setSelectedVehicleDispatch] = useState<Dispatch | null>(null);
  const [showVehicleDispatchPanel, setShowVehicleDispatchPanel] = useState(false);
  const [vehicleHint, setVehicleHint] = useState("");
  const [selectedVehicleRoutePoints, setSelectedVehicleRoutePoints] = useState<RoutePoint[]>([]);
  const [mapViewMode, setMapViewMode] = useState<MapViewMode>("truck");
  const [liveLocationsByDispatchId, setLiveLocationsByDispatchId] = useState<Record<string, RealtimeLocationPoint>>({});
  const [dispatchDelayIndicators, setDispatchDelayIndicators] = useState<Record<string, string>>({});
  const [idleVehicles, setIdleVehicles] = useState<Set<string>>(new Set());
  const idleTrackingRef = useRef<Record<string, { anchorLat: number; anchorLng: number; lastLat: number; lastLng: number; stationarySince: number; lastSeen: number }>>({});

  // Base camp coordinate: 9°44'53.5"N 118°46'15.9"E
  const BASE_CAMP_COORDINATES = {
    lat: 9.748194,
    lng: 118.771083,
  };

  const IDLE_AREA_THRESHOLD_SQ_METERS = 350;
  const IDLE_DISTANCE_THRESHOLD_METERS = Math.sqrt(IDLE_AREA_THRESHOLD_SQ_METERS / Math.PI);
  const IDLE_TIME_THRESHOLD_MS = 30000;

  const TERMINAL_STATUS_KEYWORDS = [
    "delivered",
    "completed",
    "successful dispatch",
    "cancelled",
    "canceled",
    "finish",
  ];

  const normalize = (value: string | undefined | null): string =>
    String(value || "").trim().toLowerCase();

  const compactNormalize = (value: string | undefined | null): string =>
    normalize(value).replace(/[^a-z0-9]+/g, "");

  const isActiveDispatch = (status: string | undefined): boolean => {
    const normalizedStatus = normalize(status).replace(/[_-]+/g, " ");
    if (!normalizedStatus) return false;

    return !TERMINAL_STATUS_KEYWORDS.some((keyword) => normalizedStatus.includes(keyword));
  };

  // Normalize dispatch status for display - convert delay-related statuses to "Ongoing"
  const getNormalizedDisplayStatus = (status: string | undefined): string => {
    const normalized = normalize(status);
    if (normalized.includes("delay") || normalized.includes("late") || normalized.includes("stop over") || normalized.includes("stopover")) {
      return "Ongoing";
    }
    return status || "Unknown";
  };

  // Calculate distance between two coordinates in square meters
  const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
    const R = 6371000; // Earth's radius in meters
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in meters
  };

  const toNumber = (value: unknown): number | null => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number(value.trim());
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  };

  const extractRoutePoint = (entry: any): RoutePoint | null => {
    if (!entry || typeof entry !== "object") return null;

    const sourceObjects = [
      entry.CurrentLocation,
      entry.currentLocation,
      entry.location,
      entry.startLocation,
      entry.deliveryLocation,
      entry.coordinates,
      entry,
    ];

    for (const source of sourceObjects) {
      if (!source || typeof source !== "object") continue;

      const geoPointLat = toNumber(source.latitude);
      const geoPointLng = toNumber(source.longitude);
      if (geoPointLat !== null && geoPointLng !== null) {
        return { lat: geoPointLat, lng: geoPointLng };
      }

      const lat = toNumber(source.lat ?? source.latitude);
      const lng = toNumber(source.lng ?? source.lon ?? source.longitude);
      if (lat !== null && lng !== null) {
        return { lat, lng };
      }
    }

    return null;
  };

  const extractRealtimeLocation = (entry: unknown): RealtimeLocationPoint | null => {
    if (!entry || typeof entry !== "object") return null;

    const source = entry as {
      lat?: unknown;
      lng?: unknown;
      latitude?: unknown;
      longitude?: unknown;
      lon?: unknown;
      currentLocation?: unknown;
      location?: unknown;
      coordinates?: unknown;
      lastUpdated?: unknown;
      updatedAt?: unknown;
      timestamp?: unknown;
    };

    const sourceObjects = [
      source.currentLocation,
      source.location,
      source.coordinates,
      source,
    ];

    for (const candidate of sourceObjects) {
      if (!candidate || typeof candidate !== "object") continue;

      const point = candidate as {
        lat?: unknown;
        lng?: unknown;
        latitude?: unknown;
        longitude?: unknown;
        lon?: unknown;
      };

      const lat = toNumber(point.lat ?? point.latitude);
      const lng = toNumber(point.lng ?? point.lon ?? point.longitude);
      if (lat === null || lng === null) continue;

      const lastUpdated =
        toNumber(source.lastUpdated)
        ?? toNumber(source.updatedAt)
        ?? toNumber(source.timestamp)
        ?? undefined;

      return {
        lat,
        lng,
        lastUpdated,
      };
    }

    return null;
  };

  const uniqRoutePoints = (points: RoutePoint[]): RoutePoint[] => {
    const seen = new Set<string>();

    return points.filter((point) => {
      const key = `${point.lat.toFixed(6)},${point.lng.toFixed(6)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const getDispatchCurrentLocation = (dispatch: Dispatch | null): { lat: number; lng: number } | null => {
    if (!dispatch) return null;

    const liveLocation =
      liveLocationsByDispatchId[dispatch.id]
      || (dispatch.dispatchId ? liveLocationsByDispatchId[dispatch.dispatchId] : undefined);
    if (liveLocation) {
      return {
        lat: liveLocation.lat,
        lng: liveLocation.lng,
      };
    }

    return null;
  };

  const getDispatchRoutePoints = async (dispatch: Dispatch): Promise<RoutePoint[]> => {
    if (!dispatch.id) return [];

    const realtimeCurrent = getDispatchCurrentLocation(dispatch);

    try {
      const messagesRef = collection(db, "dispatches", dispatch.id, "messages");
      const snap = await getDocs(query(messagesRef, orderBy("timestamp", "asc")));

      const trail = snap.docs
        .map((messageDoc) => {
          const entry = messageDoc.data() as any;
          if (entry?.isAdmin === true) return null;
          return extractRoutePoint(entry);
        })
        .filter((point): point is RoutePoint => !!point);

      const fallbackTrail = [
        dispatch.startLocation,
        realtimeCurrent,
        dispatch.location,
      ]
        .map((entry) => {
          if (!entry) return null;
          const lat = toNumber(entry.lat);
          const lng = toNumber(entry.lng);
          if (lat === null || lng === null) return null;
          return { lat, lng };
        })
        .filter((point): point is RoutePoint => !!point);

      return uniqRoutePoints(trail.length >= 2 ? trail : [...trail, ...fallbackTrail]);
    } catch (error) {
      console.error("Error loading dispatch route points:", error);
      return uniqRoutePoints(
        [
          dispatch.startLocation,
          realtimeCurrent,
          dispatch.location,
        ]
          .map((entry) => {
            if (!entry) return null;
            const lat = toNumber(entry.lat);
            const lng = toNumber(entry.lng);
            if (lat === null || lng === null) return null;
            return { lat, lng };
          })
          .filter((point): point is RoutePoint => !!point)
      );
    }
  };

  useEffect(() => {
    if (!user) return;

    const activeDispatches = dispatches.filter((entry) => isActiveDispatch(entry.status));
    if (activeDispatches.length === 0) {
      setLiveLocationsByDispatchId({});
      setIdleVehicles(new Set());
      idleTrackingRef.current = {};
      return;
    }

    const activeIds = new Set<string>();
    activeDispatches.forEach((entry) => {
      if (entry.id) activeIds.add(entry.id);
      if (entry.dispatchId) activeIds.add(entry.dispatchId);
    });

    const activeLocationsRef = dbRef(rtdb, "active_locations");
    const unsubscribe = onValue(
      activeLocationsRef,
      (snapshot) => {
        const payload = snapshot.val() as Record<string, unknown> | null;
        const nextLocations: Record<string, RealtimeLocationPoint> = {};
        const currentTime = Date.now();
        const newIdleVehicles = new Set<string>();
        const nextIdleTracking = { ...idleTrackingRef.current };

        if (payload && typeof payload === "object") {
          Object.entries(payload).forEach(([dispatchId, entry]) => {
            if (!activeIds.has(dispatchId)) return;

            const parsed = extractRealtimeLocation(entry);
            if (!parsed) return;

            nextLocations[dispatchId] = parsed;

            const tracked = nextIdleTracking[dispatchId];
            if (!tracked) {
              nextIdleTracking[dispatchId] = {
                anchorLat: parsed.lat,
                anchorLng: parsed.lng,
                lastLat: parsed.lat,
                lastLng: parsed.lng,
                stationarySince: currentTime,
                lastSeen: currentTime,
              };
              return;
            }

            const anchorDistance = calculateDistance(
              tracked.anchorLat,
              tracked.anchorLng,
              parsed.lat,
              parsed.lng
            );

            const stepDistance = calculateDistance(
              tracked.lastLat,
              tracked.lastLng,
              parsed.lat,
              parsed.lng
            );

            if (anchorDistance > IDLE_DISTANCE_THRESHOLD_METERS) {
              nextIdleTracking[dispatchId] = {
                anchorLat: parsed.lat,
                anchorLng: parsed.lng,
                lastLat: parsed.lat,
                lastLng: parsed.lng,
                stationarySince: currentTime,
                lastSeen: currentTime,
              };
              return;
            }

            // Any meaningful movement outside the idle radius clears idle tracking baseline.
            if (stepDistance > IDLE_DISTANCE_THRESHOLD_METERS) {
              nextIdleTracking[dispatchId] = {
                anchorLat: parsed.lat,
                anchorLng: parsed.lng,
                lastLat: parsed.lat,
                lastLng: parsed.lng,
                stationarySince: currentTime,
                lastSeen: currentTime,
              };
              return;
            }

            tracked.lastLat = parsed.lat;
            tracked.lastLng = parsed.lng;
            tracked.lastSeen = currentTime;
            const stationaryDuration = currentTime - tracked.stationarySince;
            if (stationaryDuration >= IDLE_TIME_THRESHOLD_MS) {
              newIdleVehicles.add(dispatchId);
            }
          });
        }

        Object.keys(nextIdleTracking).forEach((trackedDispatchId) => {
          if (!(trackedDispatchId in nextLocations)) {
            delete nextIdleTracking[trackedDispatchId];
          }
        });

        idleTrackingRef.current = nextIdleTracking;
        setLiveLocationsByDispatchId(nextLocations);
        setIdleVehicles(newIdleVehicles);
      },
      (error) => {
        console.error("Error listening to RTDB active_locations:", error);
      }
    );

    return () => unsubscribe();
  }, [user, dispatches]);

  useEffect(() => {
    if (!user) return;

    const intervalId = window.setInterval(() => {
      const now = Date.now();
      const activeDispatches = dispatches.filter((entry) => isActiveDispatch(entry.status));
      const activeIds = new Set<string>();

      activeDispatches.forEach((entry) => {
        if (entry.id) activeIds.add(entry.id);
        if (entry.dispatchId) activeIds.add(entry.dispatchId);
      });

      const nextIdleVehicles = new Set<string>();
      Object.entries(idleTrackingRef.current).forEach(([dispatchId, tracked]) => {
        if (!activeIds.has(dispatchId)) return;

        const stationaryDuration = now - tracked.stationarySince;
        if (stationaryDuration >= IDLE_TIME_THRESHOLD_MS) {
          nextIdleVehicles.add(dispatchId);
        }
      });

      setIdleVehicles(nextIdleVehicles);
    }, 5000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [user, dispatches]);

  const getDispatchSortTime = (dispatch: Dispatch): number => {
    const directUpdated = dispatch.UpdatedAt || dispatch.updatedAt;
    const nestedUpdated = dispatch.CurrentLocation?.updatedAt || dispatch.currentLocation?.updatedAt;
    const candidate = directUpdated || nestedUpdated || dispatch.createdAt;
    return candidate instanceof Timestamp ? candidate.toMillis() : 0;
  };

  const scoreDispatchVehicleMatch = (dispatch: Dispatch, vehicle: Vehicle): number => {
    const vehicleCodename = normalize(vehicle.codename);
    const vehiclePlate = normalize(vehicle.plate);
    const vehiclePersonnel = normalize(vehicle.personnelName);
    const vehicleCodenameCompact = compactNormalize(vehicle.codename);
    const vehiclePlateCompact = compactNormalize(vehicle.plate);
    const vehiclePersonnelCompact = compactNormalize(vehicle.personnelName);

    const truckValue = normalize(dispatch.truck);
    const truckCompact = compactNormalize(dispatch.truck);
    const personnelValue = normalize(dispatch.personnels);
    const personnelCompact = compactNormalize(dispatch.personnels);

    // Prefer explicit truck assignment first.
    if (truckValue.length > 0) {
      if (truckCompact === vehicleCodenameCompact && vehicleCodenameCompact.length > 0) return 120;
      if (truckValue === vehicleCodename && vehicleCodename.length > 0) return 115;
      if (truckCompact.includes(vehicleCodenameCompact) && vehicleCodenameCompact.length > 0) return 100;
      if (truckValue.includes(vehicleCodename) && vehicleCodename.length > 0) return 95;

      if (truckCompact === vehiclePlateCompact && vehiclePlateCompact.length > 0) return 90;
      if (truckValue === vehiclePlate && vehiclePlate.length > 0) return 85;
      if (truckCompact.includes(vehiclePlateCompact) && vehiclePlateCompact.length > 0) return 75;
      if (truckValue.includes(vehiclePlate) && vehiclePlate.length > 0) return 70;
    }

    // Fallback to personnel only when dispatch has no truck value.
    if (truckValue.length === 0 && personnelValue.length > 0 && vehiclePersonnel.length > 0) {
      if (personnelCompact === vehiclePersonnelCompact && vehiclePersonnelCompact.length > 0) return 55;
      if (personnelValue === vehiclePersonnel) return 50;
      if (personnelCompact.includes(vehiclePersonnelCompact) && vehiclePersonnelCompact.length > 0) return 45;
      if (vehiclePersonnelCompact.includes(personnelCompact) && personnelCompact.length > 0) return 40;
      if (personnelValue.includes(vehiclePersonnel) || vehiclePersonnel.includes(personnelValue)) return 35;
    }

    return -1;
  };

  const vehicleDispatchByVehicleId = (() => {
    const mapping = new Map<string, Dispatch>();
    const assignedVehicleIds = new Set<string>();

    const activeDispatches = dispatches
      .filter((dispatch) => isActiveDispatch(dispatch.status))
      .sort((a, b) => getDispatchSortTime(b) - getDispatchSortTime(a));

    activeDispatches.forEach((dispatch) => {
      let bestVehicleId: string | null = null;
      let bestScore = -1;

      vehicles.forEach((vehicle) => {
        if (assignedVehicleIds.has(vehicle.id)) return;

        const score = scoreDispatchVehicleMatch(dispatch, vehicle);
        if (score > bestScore) {
          bestScore = score;
          bestVehicleId = vehicle.id;
        }
      });

      if (bestVehicleId && bestScore >= 0) {
        mapping.set(bestVehicleId, dispatch);
        assignedVehicleIds.add(bestVehicleId);
      }
    });

    return mapping;
  })();

  const findActiveDispatchForVehicle = (vehicle: Vehicle): Dispatch | null => {
    return vehicleDispatchByVehicleId.get(vehicle.id) || null;
  };

  const filteredVehicles = vehicles.filter((vehicle) => {
    const queryMatch =
      normalize(vehicle.codename).includes(normalize(vehicleSearch))
      || normalize(vehicle.plate).includes(normalize(vehicleSearch))
      || normalize(vehicle.personnelName).includes(normalize(vehicleSearch));

    if (!queryMatch) return false;

    if (vehicleFilter === "serviceable") {
      return vehicle.status === "Serviceable";
    }

    if (vehicleFilter === "active-dispatch") {
      return findActiveDispatchForVehicle(vehicle) !== null;
    }

    return true;
  });

  const vehiclesForMap = vehicles.map((vehicle) => {
    const activeDispatch = findActiveDispatchForVehicle(vehicle);
    const liveLocation = getDispatchCurrentLocation(activeDispatch);
    const isIdle = !!(
      activeDispatch
      && (
        idleVehicles.has(activeDispatch.id)
        || (activeDispatch.dispatchId ? idleVehicles.has(activeDispatch.dispatchId) : false)
      )
    );

    return {
      ...vehicle,
      // Vehicles with no active dispatch (including unserviceable) stay at base camp.
      lat: liveLocation?.lat ?? BASE_CAMP_COORDINATES.lat,
      lng: liveLocation?.lng ?? BASE_CAMP_COORDINATES.lng,
      isIdle,
      hasActiveDispatch: !!activeDispatch,
    };
  });

  const selectedVehicleData = vehiclesForMap.find((vehicle) => vehicle.id === selectedVehicle) || null;
  const activeDispatchCount = dispatches.filter((dispatch) => isActiveDispatch(dispatch.status)).length;
  const selectedCurrentLocation = getDispatchCurrentLocation(selectedVehicleDispatch);
  const selectedDestinationLocation = (() => {
    const point = selectedVehicleDispatch?.deliveryLocation || selectedVehicleDispatch?.location;
    if (!point) return null;

    const lat = toNumber(point.lat);
    const lng = toNumber(point.lng);
    if (lat === null || lng === null) return null;

    return { lat, lng };
  })();
  const allActiveRoutePlans: ActiveRoutePlan[] = vehiclesForMap
    .map((vehicle) => {
      const activeDispatch = findActiveDispatchForVehicle(vehicle);
      if (!activeDispatch || !isActiveDispatch(activeDispatch.status)) return null;

      const currentLocation = getDispatchCurrentLocation(activeDispatch)
        || (Number.isFinite(vehicle.lat) && Number.isFinite(vehicle.lng)
          ? { lat: vehicle.lat as number, lng: vehicle.lng as number }
          : null);
      if (!currentLocation) return null;

      const destinationSource = activeDispatch.deliveryLocation || activeDispatch.location;
      const destinationLat = toNumber(destinationSource?.lat);
      const destinationLng = toNumber(destinationSource?.lng);
      if (destinationLat === null || destinationLng === null) return null;

      const startSource = activeDispatch.startLocation;
      const startLat = toNumber(startSource?.lat) ?? BASE_CAMP_COORDINATES.lat;
      const startLng = toNumber(startSource?.lng) ?? BASE_CAMP_COORDINATES.lng;

      return {
        id: activeDispatch.id || vehicle.id,
        currentLocation,
        destinationLocation: {
          lat: destinationLat,
          lng: destinationLng,
        },
        baseCampLocation: {
          lat: startLat,
          lng: startLng,
        },
      } as ActiveRoutePlan;
    })
    .filter((route): route is ActiveRoutePlan => !!route);

  const showDispatchPreview = (vehicle: Vehicle) => {
    setSelectedVehicle(vehicle.id);

    const activeDispatch = findActiveDispatchForVehicle(vehicle);
    if (activeDispatch) {
      setSelectedVehicleDispatch(activeDispatch);
      setShowVehicleDispatchPanel(true);
      setVehicleHint("");
    } else {
      setSelectedVehicleDispatch(null);
      setShowVehicleDispatchPanel(false);
      setVehicleHint(`${vehicle.codename} has no active dispatch at the moment.`);
    }
  };

  const handleVehicleClick = (vehicle: Vehicle) => {
    setMapViewMode("truck");
    showDispatchPreview(vehicle);
  };

  useEffect(() => {
    let cancelled = false;

    if (!selectedVehicle || !showVehicleDispatchPanel || !selectedVehicleDispatch?.id) {
      setSelectedVehicleRoutePoints([]);
      return () => {
        cancelled = true;
      };
    }

    setSelectedVehicleRoutePoints([]);

    void getDispatchRoutePoints(selectedVehicleDispatch).then((points) => {
      if (cancelled) return;
      setSelectedVehicleRoutePoints(points);
    });

    return () => {
      cancelled = true;
    };
  }, [selectedVehicle, selectedVehicleDispatch?.id, showVehicleDispatchPanel, dispatches]);

  useEffect(() => {
    if (!selectedVehicleDispatch?.id) return;

    const latestSelectedVehicleDispatch = dispatches.find((dispatch) => dispatch.id === selectedVehicleDispatch.id);
    if (latestSelectedVehicleDispatch) {
      setSelectedVehicleDispatch(latestSelectedVehicleDispatch);
    }
  }, [dispatches, selectedVehicleDispatch?.id]);

  // Live vehicles listener
  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, "vehicles"), orderBy("dateAdded", "asc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const vehiclesData = snap.docs.map((vehicleDoc) => {
          const data = vehicleDoc.data();

          return {
            id: vehicleDoc.id,
            codename: data.codename,
            status: data.status,
            truckType: data.truckType,
            plate: data.plate,
            personnelName: data.personnelName,
            lat: BASE_CAMP_COORDINATES.lat,
            lng: BASE_CAMP_COORDINATES.lng,
          };
        }) as Vehicle[];

        setVehicles(vehiclesData);
      },
      (error) => {
        console.error("Error listening to vehicles:", error);
      }
    );

    return () => unsub();
  }, [user]);

  // Live dispatches listener
  useEffect(() => {
    if (loading || !user) return;

    const q = query(
      collection(db, "dispatches"),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(q, (snap) => {
      setDispatches(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Dispatch, "id">) }))
      );
    });
    return () => unsub();
  }, [dispatchRefresh, loading, user]);

  // Keep modal dispatch details synced with live Firestore updates (e.g., UpdatedAt).
  useEffect(() => {
    if (!selectedDispatch?.id) return;

    const latestSelectedDispatch = dispatches.find((dispatch) => dispatch.id === selectedDispatch.id);
    if (latestSelectedDispatch) {
      setSelectedDispatch(latestSelectedDispatch);
    }
  }, [dispatches, selectedDispatch?.id]);

  // Fetch metrics data
  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        // Count serviceable vehicles
        const vehiclesSnap = await getDocs(
          query(collection(db, "vehicles"), where("status", "==", "Serviceable"))
        );
        const totalActiveVehicles = vehiclesSnap.size;

        // Count total personnel
        const personnelSnap = await getDocs(collection(db, "personnelAccount"));
        const totalPersonnel = personnelSnap.size;

        // Count dispatches by status
        const allDispatchesSnap = await getDocs(collection(db, "dispatches"));
        let ongoingDeliveries = 0;
        let completedDispatches = 0;

        allDispatchesSnap.forEach((doc) => {
          const data = doc.data();
          const status = data.status;
          
          if (status === "Pending" || status === "Approved" || status === "En Route" || status === "Ongoing") {
            ongoingDeliveries++;
          } else if (status === "Delivered" || status === "Completed") {
            completedDispatches++;
          }
        });

        setMetrics({
          totalActiveVehicles,
          ongoingDeliveries,
          completedDispatches,
          totalPersonnel,
        });
      } catch (error) {
        console.error("Error fetching metrics:", error);
      }
    };

    if (user) {
      fetchMetrics();
      // Refresh metrics every 30 seconds
      const interval = setInterval(fetchMetrics, 30000);
      return () => clearInterval(interval);
    }
  }, [user, dispatchRefresh]);

  const recentDispatches = dispatches.slice(0, 10);

  // Check if a report entry is a delay report
  const isDelayReport = (entry: any): boolean => {
    const text = String(entry?.text || entry?.message || entry?.statusNote || "").toLowerCase();
    const kind = String(entry?.type || entry?.status || entry?.action || "").toLowerCase();
    const signal = `${text} ${kind}`;
    return signal.includes("delay") || signal.includes("late") || signal.includes("traffic") || signal.includes("break") || signal.includes("rest");
  };

  // Fetch and update delay indicators for recent dispatches
  const updateDelayIndicators = async () => {
    const delayMap: Record<string, string> = {};

    for (const dispatch of recentDispatches) {
      try {
        const messagesRef = collection(db, "dispatches", dispatch.id, "messages");
        const snap = await getDocs(query(messagesRef, orderBy("timestamp", "desc"), limit(100)));

        // Find the first (most recent) delay report
        const delayReport = snap.docs.find((doc) => isDelayReport(doc.data()));

        if (delayReport) {
          const reportData = delayReport.data() as any;
          const durationText = reportData?.duration || reportData?.text || reportData?.message || "";

          // Extract duration from text if available, otherwise use a generic label
          let delayLabel = "Delay";
          if (durationText) {
            // Try to extract duration pattern like "20 mins", "1h 30m", etc.
            const durationMatch = durationText.match(/(\d+)\s*(h|hour|min|minute|m)/i);
            if (durationMatch) {
              delayLabel = `Delay ${durationMatch[0]}`;
            } else if (durationText.length < 30) {
              delayLabel = `Delay ${durationText}`;
            }
          }

          delayMap[dispatch.id] = delayLabel;
        }
      } catch (error) {
        // Silently continue if error fetching delay info
        console.error(`Error fetching delay for dispatch ${dispatch.id}:`, error);
      }
    }

    setDispatchDelayIndicators(delayMap);
  };

  // Update delay indicators when recent dispatches change
  useEffect(() => {
    if (recentDispatches.length > 0) {
      updateDelayIndicators();
    }
  }, [recentDispatches.length, dispatches]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
        <div className="text-center">
          <span className="material-symbols-outlined animate-spin text-blue-400" style={{ fontSize: "3rem" }}>
            progress_activity
          </span>
          <p className="mt-4 text-slate-300 font-medium tracking-wide">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    router.push("/login");
    return null;
  }

  const handleLogout = async () => {
    await signOut();
    router.push("/login");
  };

  const navigationItems = [
    { name: "Dashboard", icon: "dashboard", href: "/dashboard", active: true },
    { name: "Personnels", icon: "groups", href: "/personnels", active: false },
    { name: "Vehicle", icon: "local_shipping", href: "/vehicle", active: false },
    { name: "Emergency Alerts", icon: "emergency", href: "/emergency-alerts", active: false },
    { name: "History", icon: "history", href: "/history", active: false },
  ];

  const metricCards = [
    { title: "Total Serviceable Vehicle", value: metrics.totalActiveVehicles.toString(), icon: "local_shipping", color: "from-violet-600 to-violet-800", glow: "shadow-violet-500/30" },
    { title: "Ongoing Deliveries", value: metrics.ongoingDeliveries.toString(), icon: "deployed_code", color: "from-amber-500 to-orange-700", glow: "shadow-amber-500/30" },
    { title: "Completed Dispatches", value: metrics.completedDispatches.toString(), icon: "task_alt", color: "from-emerald-500 to-green-700", glow: "shadow-emerald-500/30" },
    { title: "Total Personnel", value: metrics.totalPersonnel.toString(), icon: "badge", color: "from-blue-500 to-blue-700", glow: "shadow-blue-500/30" },
  ];

  // Generate activities from dispatches
  const getStatusIcon = (status: string): { icon: string; iconColor: string } => {
    switch (status) {
      case "Pending":
        return { icon: "schedule", iconColor: "text-amber-500" };
      case "Approved":
        return { icon: "check_circle", iconColor: "text-blue-500" };
      case "En Route":
        return { icon: "local_shipping", iconColor: "text-violet-500" };
      case "Ongoing":
        return { icon: "deployed_code", iconColor: "text-orange-500" };
      case "Delivered":
        return { icon: "inventory_2", iconColor: "text-cyan-500" };
      case "Completed":
        return { icon: "task_alt", iconColor: "text-emerald-500" };
      default:
        return { icon: "info", iconColor: "text-slate-500" };
    }
  };

  const getRelativeTime = (timestamp: Timestamp | null): string => {
    if (!timestamp) return "-";
    const now = new Date();
    const date = timestamp.toDate();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString("en-PH", { month: "short", day: "numeric" });
  };

  const activities = dispatches.map((d) => {
    const statusInfo = getStatusIcon(d.status);
    return {
      type: `${d.dispatchId} - ${d.status}`,
      icon: statusInfo.icon,
      iconColor: statusInfo.iconColor,
      time: getRelativeTime(d.createdAt),
    };
  });

  const canCancelDispatch = (status: string) => {
    return ["Pending", "Approved", "En Route", "Ongoing"].includes(status);
  };

  const handleCancelDispatch = async (dispatch: Dispatch, e: React.MouseEvent) => {
    e.stopPropagation();

    if (!dispatch.id || !canCancelDispatch(dispatch.status)) {
      return;
    }

    const confirmed = confirm(`Cancel dispatch ${dispatch.dispatchId}?`);
    if (!confirmed) return;

    try {
      const dispatchRef = doc(db, "dispatches", dispatch.id);
      await updateDoc(dispatchRef, {
        status: "Cancelled",
        cancelledAt: Timestamp.now(),
      });

      if (user?.email) {
        await logActivity(
          "DISPATCH_UPDATED",
          `Cancelled dispatch ${dispatch.dispatchId}`,
          user.email,
          { dispatchId: dispatch.dispatchId }
        );
      }

      setDispatchRefresh((n) => n + 1);
    } catch (error) {
      console.error("Error cancelling dispatch:", error);
      alert("Failed to cancel dispatch. Please try again.");
    }
  };

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-100 to-slate-200">
      {/* Dispatch Modal */}
      {showDispatchModal && (
        <DispatchModal
          onClose={() => setShowDispatchModal(false)}
          onSuccess={() => setDispatchRefresh((n) => n + 1)}
        />
      )}

      {/* Dispatch Detail Modal */}
      {selectedDispatch && (
        <DispatchDetailModal
          dispatch={selectedDispatch}
          onClose={() => setSelectedDispatch(null)}
          onSuccess={() => setDispatchRefresh((n) => n + 1)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`${sidebarOpen ? "w-64" : "w-20"
          } bg-gradient-to-b from-slate-900 to-slate-800 shadow-2xl transition-all duration-300 ease-in-out flex flex-col border-r border-slate-700/50`}
      >
        {/* Logo */}
        <div className={`flex h-16 items-center border-b border-slate-700/50 px-3 ${sidebarOpen ? 'justify-between' : 'justify-center'}`}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white shadow-lg flex-shrink-0 overflow-hidden">
              <Image
                src="/logo.png"
                alt="2nd JLSU Logo"
                width={44}
                height={44}
                className="object-contain"
              />
            </div>
            {sidebarOpen && (
              <div className="animate-fade-in overflow-hidden">
                <p className="font-bold text-white tracking-wide text-lg">2nd JLSU</p>
                <p className="text-xs text-slate-400">Log Truck System</p>
              </div>
            )}
          </div>
          {sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="rounded-lg p-1.5 hover:bg-slate-700 transition-colors text-slate-400 hover:text-white flex-shrink-0"
            >
              <span className="material-symbols-outlined" style={{ fontSize: "1.25rem" }}>menu_open</span>
            </button>
          )}
        </div>
        {!sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="flex items-center justify-center w-full py-2 hover:bg-slate-700 transition-colors text-slate-400 hover:text-white border-b border-slate-700/50"
          >
            <span className="material-symbols-outlined" style={{ fontSize: "1.25rem" }}>menu</span>
          </button>
        )}

        {/* Nav */}
        <nav className="space-y-1 px-3 py-4 flex-1">
          {navigationItems.map((item) => (
            <a
              key={item.name}
              href={item.href}
              className={`flex items-center rounded-xl transition-all duration-200 ${sidebarOpen ? "gap-3 px-4 py-4" : "justify-center px-2 py-4"
                } ${item.active
                  ? "bg-gradient-to-r from-emerald-500/20 to-emerald-500/5 text-emerald-400 border border-emerald-500/30 shadow-md"
                  : "text-slate-400 hover:bg-slate-700/50 hover:text-white"
                }`}
            >
              <span className="material-symbols-outlined flex-shrink-0" style={{ fontSize: "1.5rem" }}>{item.icon}</span>
              {sidebarOpen && <span className="truncate text-sm font-semibold">{item.name}</span>}
            </a>
          ))}
        </nav>

        {/* Logout */}
        <div className="border-t border-slate-700/50 p-3">
          <button
            onClick={handleLogout}
            className={`flex w-full items-center rounded-xl py-4 text-slate-400 hover:bg-rose-500/10 hover:text-rose-400 transition-all duration-200 border border-transparent hover:border-rose-500/20 ${sidebarOpen ? 'gap-3 px-4' : 'justify-center px-2'
              }`}
          >
            <span className="material-symbols-outlined flex-shrink-0" style={{ fontSize: "1.5rem" }}>logout</span>
            {sidebarOpen && <span className="text-sm font-semibold">Logout</span>}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="border-b border-slate-200 bg-white/80 backdrop-blur-sm px-6 py-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-slate-600" style={{ fontSize: "1.75rem" }}>dashboard</span>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Dashboard</h1>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={toggleTheme}
                aria-pressed={theme === "dark"}
                className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold transition-all duration-200 ${theme === "dark"
                  ? "border-slate-600 bg-slate-800 text-slate-100 hover:bg-slate-700 shadow-lg shadow-slate-900/20"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 shadow-sm"
                  }`}
                title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              >
                <span className="material-symbols-outlined" style={{ fontSize: "1.1rem" }}>
                  {theme === "dark" ? "light_mode" : "dark_mode"}
                </span>
                <span className="hidden sm:inline">{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
              </button>

              {/* â”€â”€ Create Dispatch Button â”€â”€ */}
              <button
                onClick={() => setShowDispatchModal(true)}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-emerald-500/30 hover:shadow-xl hover:from-emerald-400 hover:to-green-500 hover:scale-[1.03] active:scale-95 transition-all duration-200"
              >
                <span className="material-symbols-outlined" style={{ fontSize: "1.1rem" }}>add_circle</span>
                Create Dispatch
              </button>

              <NotificationsDropdown userEmail={user?.email} />
              <DispatchChatHub />
              <div className="flex items-center gap-3 pl-4 border-l border-slate-200">
                <div className="text-right">
                  <p className="text-sm font-semibold text-slate-900">{user?.email}</p>
                  <p className="text-xs text-slate-500">System Administrator</p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-md shadow-blue-500/30">
                  <span className="material-symbols-outlined" style={{ fontSize: "1.25rem" }}>person</span>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto p-6 flex flex-col gap-6 min-h-0">
          {/* Metrics Grid */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            {metricCards.map((metric, index) => (
              <div
                key={metric.title}
                className={`bg-gradient-to-br ${metric.color} rounded-2xl p-6 shadow-xl ${metric.glow} transition-all duration-300 hover:shadow-2xl hover:scale-105 animate-fade-in text-white`}
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-white/70 tracking-wide">{metric.title}</p>
                    <p className="mt-2 text-4xl font-bold tracking-tight">{metric.value}</p>
                  </div>
                  <div className="rounded-2xl bg-white/10 p-3 backdrop-blur-sm">
                    <span className="material-symbols-outlined text-white/80" style={{ fontSize: "2rem" }}>{metric.icon}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Main Grid - Map and Activity */}
          <div className="grid gap-6 lg:grid-cols-4 flex-1 min-h-0">
            {/* Map Section - Cockpit Layout */}
            <div className="lg:col-span-3 rounded-2xl bg-gradient-to-br from-white to-slate-50/50 p-5 shadow-xl hover:shadow-2xl transition-all duration-300 border-2 border-slate-200/60 flex flex-col min-h-[500px]">
              <div className="mb-4 grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-3 items-center">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg shadow-blue-500/30">
                    <span className="material-symbols-outlined text-white" style={{ fontSize: "1.45rem" }}>map</span>
                  </div>
                  <div>
                    <h2 className="text-lg font-black text-slate-900 tracking-tight">Vehicle Operations Map</h2>
                    <p className="text-xs text-slate-500 font-semibold">Aligned dispatch and vehicle monitoring center</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap justify-start lg:justify-end">
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-[10px] font-bold text-emerald-700 uppercase">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    {vehicles.filter((vehicle) => vehicle.status === "Serviceable").length} Serviceable
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 border border-blue-200 px-2.5 py-1 text-[10px] font-bold text-blue-700 uppercase">
                    <span className="h-2 w-2 rounded-full bg-blue-500"></span>
                    {activeDispatchCount} Active Dispatch
                  </span>
                  <button
                    onClick={() => setDispatchRefresh((value) => value + 1)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-[10px] font-bold uppercase text-white hover:bg-slate-700"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: "0.9rem" }}>refresh</span>
                    Refresh
                  </button>
                  <button
                    onClick={() => {
                      setMapViewMode("show-all");
                      setShowVehicleDispatchPanel(false);
                      setSelectedVehicle(null);
                      setSelectedVehicleDispatch(null);
                      setSelectedVehicleRoutePoints([]);
                      setVehicleHint("");
                    }}
                    disabled={allActiveRoutePlans.length === 0}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[10px] font-bold uppercase border ${mapViewMode === "show-all"
                      ? "bg-emerald-600 border-emerald-600 text-white"
                      : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50"
                      } ${allActiveRoutePlans.length === 0 ? "cursor-not-allowed opacity-60" : ""}`}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: "0.9rem" }}>route</span>
                    Show All Routes
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-[280px_1fr] gap-4 flex-1 min-h-0">
                {/* Left Vehicle Panel */}
                <div className="rounded-2xl border border-blue-200/60 bg-gradient-to-b from-blue-600 to-blue-700 p-3 text-white shadow-lg min-h-0 flex flex-col">
                  <div className="flex items-center justify-between mb-2 px-1">
                    <p className="text-xs font-black uppercase tracking-wider">Vehicle Queue</p>
                    <span className="text-[10px] font-bold bg-white/20 px-2 py-0.5 rounded-full">{filteredVehicles.length}</span>
                  </div>

                  <div className="relative mb-2">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-white/70" style={{ fontSize: "0.95rem" }}>search</span>
                    <input
                      value={vehicleSearch}
                      onChange={(e) => setVehicleSearch(e.target.value)}
                      placeholder="Track vehicle"
                      className="w-full rounded-lg border border-white/20 bg-white/15 px-9 py-2 text-xs font-semibold text-white placeholder:text-white/70 focus:outline-none focus:ring-2 focus:ring-white/40"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-1.5 mb-3">
                    <button
                      onClick={() => setVehicleFilter("all")}
                      className={`rounded-md py-1.5 text-[10px] font-black uppercase transition-colors ${vehicleFilter === "all" ? "bg-white text-blue-700" : "bg-white/15 text-white hover:bg-white/25"}`}
                    >
                      All
                    </button>
                    <button
                      onClick={() => setVehicleFilter("serviceable")}
                      className={`rounded-md py-1.5 text-[10px] font-black uppercase transition-colors ${vehicleFilter === "serviceable" ? "bg-emerald-100 text-emerald-700" : "bg-white/15 text-white hover:bg-white/25"}`}
                    >
                      Ready
                    </button>
                    <button
                      onClick={() => setVehicleFilter("active-dispatch")}
                      className={`rounded-md py-1.5 text-[10px] font-black uppercase transition-colors ${vehicleFilter === "active-dispatch" ? "bg-amber-100 text-amber-700" : "bg-white/15 text-white hover:bg-white/25"}`}
                    >
                      Active
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto pr-1 space-y-2 custom-scrollbar">
                    {filteredVehicles.map((vehicle) => {
                      const hasActiveDispatch = findActiveDispatchForVehicle(vehicle) !== null;

                      return (
                        <button
                          key={vehicle.id}
                          onClick={() => handleVehicleClick(vehicle)}
                          disabled={vehicle.status !== "Serviceable"}
                          className={`w-full rounded-xl p-2.5 text-left transition-all border ${selectedVehicle === vehicle.id
                            ? "bg-white text-blue-800 border-white shadow-lg"
                            : vehicle.status === "Serviceable"
                              ? "bg-white/10 text-white border-white/20 hover:bg-white/20"
                              : "bg-black/20 text-white/40 border-white/10 cursor-not-allowed"
                            }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <p className="text-xs font-black tracking-wide">{vehicle.codename}</p>
                              <p className="text-[10px] opacity-80">{vehicle.plate || "No plate"}</p>
                            </div>
                            {hasActiveDispatch && (
                              <span className="rounded-full bg-amber-400 px-1.5 py-0.5 text-[9px] font-black uppercase text-amber-900">Live</span>
                            )}
                          </div>
                        </button>
                      );
                    })}

                    {filteredVehicles.length === 0 && (
                      <div className="rounded-lg border border-white/20 bg-white/10 px-3 py-3 text-center text-xs font-semibold text-white/80">
                        No vehicles found.
                      </div>
                    )}
                  </div>
                </div>

                {/* Map Stage */}
                <div className="rounded-2xl border border-slate-200 bg-slate-100/60 p-2 shadow-inner min-h-0 relative">
                  <div className="h-full min-h-[360px] rounded-xl overflow-hidden border-2 border-slate-200 shadow-xl shadow-slate-300/40 relative">
                    {selectedDispatch ? (
                      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 px-6 text-center">
                        <div className="max-w-sm rounded-2xl border border-slate-200 bg-white/90 px-5 py-4 shadow-lg">
                          <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Dispatch Details Open</p>
                          <p className="mt-2 text-sm font-semibold text-slate-700">
                            The dashboard map is hidden while the dispatch detail modal is open.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <FleetMap
                        vehicles={vehiclesForMap}
                        selectedVehicleId={selectedVehicle}
                        routePoints={selectedVehicleRoutePoints}
                        mapViewMode={mapViewMode}
                        baseCampLocation={BASE_CAMP_COORDINATES}
                        currentLocation={selectedCurrentLocation}
                        destinationLocation={selectedDestinationLocation}
                        allActiveRoutes={allActiveRoutePlans}
                      />
                    )}

                    {!selectedDispatch && (
                      <>
                        <div className="absolute left-3 top-3 z-10 rounded-xl border border-slate-200 bg-white/90 px-3 py-2 shadow-lg backdrop-blur-sm">
                          <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Focused Vehicle</p>
                          <p className="text-xs font-bold text-slate-800">{selectedVehicleData?.codename || "Select a vehicle"}</p>
                        </div>

                        <div className="absolute left-3 top-[76px] z-10 flex flex-col gap-2">
                          <button
                            onClick={() => setMapViewMode("truck")}
                            disabled={!selectedVehicle}
                            className={`rounded-lg border px-3 py-2 text-[10px] font-black uppercase tracking-wide shadow-lg backdrop-blur-sm transition-colors ${mapViewMode === "truck"
                              ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                              : "border-slate-200 bg-white/90 text-slate-700 hover:bg-slate-50"
                              } ${!selectedVehicle ? "cursor-not-allowed opacity-60" : ""}`}
                          >
                            Truck: Zoom Current Location
                          </button>
                          <button
                            onClick={() => setMapViewMode("destination")}
                            disabled={!selectedVehicleDispatch}
                            className={`rounded-lg border px-3 py-2 text-[10px] font-black uppercase tracking-wide shadow-lg backdrop-blur-sm transition-colors ${mapViewMode === "destination"
                              ? "border-blue-300 bg-blue-50 text-blue-800"
                              : "border-slate-200 bg-white/90 text-slate-700 hover:bg-slate-50"
                              } ${!selectedVehicleDispatch ? "cursor-not-allowed opacity-60" : ""}`}
                          >
                            Destination: Show Current, Destination, Base Camp
                          </button>
                          <button
                            onClick={() => {
                              setMapViewMode("show-all");
                              setShowVehicleDispatchPanel(false);
                              setSelectedVehicle(null);
                              setSelectedVehicleDispatch(null);
                              setSelectedVehicleRoutePoints([]);
                              setVehicleHint("");
                            }}
                            disabled={allActiveRoutePlans.length === 0}
                            className={`rounded-lg border px-3 py-2 text-[10px] font-black uppercase tracking-wide shadow-lg backdrop-blur-sm transition-colors ${mapViewMode === "show-all"
                              ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                              : "border-slate-200 bg-white/90 text-slate-700 hover:bg-slate-50"
                              } ${allActiveRoutePlans.length === 0 ? "cursor-not-allowed opacity-60" : ""}`}
                          >
                            Show All: Active Routes
                          </button>
                        </div>
                      </>
                    )}

                    {!selectedDispatch && selectedVehicle && selectedVehicleRoutePoints.length > 1 && (
                      <div className="absolute right-3 top-3 z-10 rounded-xl border border-blue-200 bg-blue-50/95 px-3 py-2 shadow-lg backdrop-blur-sm">
                        <p className="text-[10px] font-black uppercase tracking-wider text-blue-600">Cruise Trail</p>
                        <p className="text-xs font-semibold text-blue-900">Highlighted route for the selected truck</p>
                      </div>
                    )}

                    {!selectedDispatch && vehicleHint && (
                      <div className="absolute left-3 bottom-3 z-10 rounded-lg border border-amber-200 bg-amber-50/95 px-3 py-2 text-xs font-semibold text-amber-700 shadow-lg">
                        {vehicleHint}
                      </div>
                    )}

                    {!selectedDispatch && showVehicleDispatchPanel && selectedVehicleDispatch && (
                      <div className="absolute top-3 right-3 z-[1200] w-[290px] max-w-[82%] rounded-2xl border border-slate-200 bg-white/95 backdrop-blur-md shadow-2xl overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-3 bg-slate-900 text-white">
                          <div>
                            <p className="text-xs font-bold uppercase tracking-wider text-slate-300">Active Dispatch</p>
                            <p className="text-sm font-black">{selectedVehicleDispatch.dispatchId}</p>
                          </div>
                          <button
                            onClick={() => {
                              setShowVehicleDispatchPanel(false);
                              setSelectedVehicle(null);
                              setSelectedVehicleDispatch(null);
                              setSelectedVehicleRoutePoints([]);
                              setVehicleHint("");
                            }}
                            className="rounded p-1.5 hover:bg-white/15"
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: "1.1rem" }}>close</span>
                          </button>
                        </div>

                        <div className="p-4 space-y-3 text-sm">
                          <div className="flex items-start justify-between gap-3">
                            <span className="text-slate-500 font-semibold">Truck</span>
                            <span className="text-slate-800 font-bold text-right">{selectedVehicleDispatch.truck || "N/A"}</span>
                          </div>
                          <div className="flex items-start justify-between gap-3">
                            <span className="text-slate-500 font-semibold">Personnel</span>
                            <span className="text-slate-800 font-bold text-right">{selectedVehicleDispatch.personnels || "N/A"}</span>
                          </div>

                          <button
                            onClick={() => {
                              setShowVehicleDispatchPanel(false);
                              setSelectedVehicle(null);
                              setSelectedVehicleDispatch(null);
                              setSelectedVehicleRoutePoints([]);
                              setSelectedDispatch(selectedVehicleDispatch);
                            }}
                            className="w-full mt-2 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2.5 text-xs font-black uppercase tracking-wide text-white hover:from-blue-700 hover:to-indigo-700 transition-colors"
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: "1rem" }}>open_in_new</span>
                            Open Full Dispatch Details
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column Stack: Activity + Dispatches */}
            <div className="lg:col-span-1 flex flex-col gap-6 min-h-0">
              {/* Activity Section */}
              <div className="rounded-2xl bg-white p-6 shadow-lg hover:shadow-xl transition-shadow duration-300 border border-slate-100 flex flex-col h-[300px]">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-amber-500" style={{ fontSize: "1.5rem" }}>bolt</span>
                    <h2 className="text-lg font-bold text-slate-900">Live Activity</h2>
                  </div>
                  <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100 uppercase">
                    <span className="h-1 w-1 rounded-full bg-emerald-500 animate-pulse"></span>
                    Live
                  </span>
                </div>
                <div className="space-y-2 flex-1 overflow-y-auto pr-1 min-h-0 custom-scrollbar">
                  {activities.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-400">
                      <span className="material-symbols-outlined mb-2" style={{ fontSize: "2.5rem" }}>hourglass_empty</span>
                      <p className="text-xs font-semibold">No activity yet</p>
                    </div>
                  ) : (
                    activities.map((activity, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between rounded-xl bg-slate-50 hover:bg-slate-100 p-3 transition-all duration-200 animate-slide-up group"
                        style={{ animationDelay: `${index * 0.05}s` }}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white shadow-sm flex-shrink-0">
                            <span className={`material-symbols-outlined ${activity.iconColor}`} style={{ fontSize: "1.1rem" }}>{activity.icon}</span>
                          </div>
                          <p className="text-xs font-semibold text-slate-700 truncate">{activity.type}</p>
                        </div>
                        <p className="text-[10px] font-medium text-slate-400 whitespace-nowrap ml-2">{activity.time}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Recent Dispatches Column Section */}
              <div className="rounded-2xl bg-white shadow-lg border border-slate-100 flex flex-col flex-1 min-h-0 overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-emerald-600" style={{ fontSize: "1.25rem" }}>receipt_long</span>
                    <h2 className="text-base font-bold text-slate-900">Recent Dispatches</h2>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar">
                  {recentDispatches.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                      <span className="material-symbols-outlined mb-2" style={{ fontSize: "2.5rem" }}>local_shipping</span>
                      <p className="text-xs font-semibold">No dispatches yet</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-50">
                      {recentDispatches.map((d) => (
                        <div
                          key={d.id}
                          onClick={() => setSelectedDispatch(d)}
                          className="w-full text-left p-4 hover:bg-slate-50 transition-all active:bg-slate-100 group border-none outline-none cursor-pointer"
                        >
                          <div className="flex items-start justify-between mb-2">
                            <span className="font-mono text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded uppercase group-hover:bg-slate-200 transition-colors">
                              #{d.dispatchId.split('-').pop()}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase transition-all ${STATUS_STYLES[getNormalizedDisplayStatus(d.status)] ?? "bg-slate-100 text-slate-600"}`}>
                                {getNormalizedDisplayStatus(d.status)}
                              </span>
                              {dispatchDelayIndicators[d.id] && (
                                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase bg-amber-100 text-amber-700 border border-amber-300">
                                  {dispatchDelayIndicators[d.id]}
                                </span>
                              )}
                              {canCancelDispatch(d.status) && (
                                <button
                                  onClick={(e) => handleCancelDispatch(d, e)}
                                  className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-bold uppercase text-rose-700 hover:bg-rose-100"
                                >
                                  <span className="material-symbols-outlined" style={{ fontSize: "0.8rem" }}>cancel</span>
                                  Cancel
                                </button>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 mb-2">
                            <div className="h-6 w-6 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-all">
                              <span className="material-symbols-outlined" style={{ fontSize: "0.85rem" }}>military_tech</span>
                            </div>
                            <span className="text-xs font-bold text-slate-800 truncate group-hover:text-blue-600 transition-colors">{d.officer}</span>
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-slate-500 font-medium">
                            <div className="flex items-center gap-1 truncate max-w-[70%]">
                              <span className="material-symbols-outlined text-emerald-500" style={{ fontSize: "0.85rem" }}>location_on</span>
                              <span className="truncate">{d.deliveryLocation?.label || d.location?.label || "Location unknown"}</span>
                            </div>
                            <span className="whitespace-nowrap opacity-60 font-mono italic">{formatTime(d.createdAt).split(',')[0]}</span>
                          </div>
                          {dispatchDelayIndicators[d.id] && (
                            <div className="mt-2 text-[10px] text-amber-600 font-semibold flex items-center gap-1">
                              <span className="material-symbols-outlined" style={{ fontSize: "0.85rem" }}>schedule</span>
                              {dispatchDelayIndicators[d.id]}
                            </div>
                          )}
                          <div className="mt-2 text-[10px] text-slate-500 font-semibold">
                            PO/Requisition: <span className="font-mono text-slate-700">{d.requisitionNumber || d.requisitionId || d.poNumber || "N/A"}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="p-4 bg-slate-50 border-t border-slate-100">
                  <button
                    onClick={() => setShowDispatchModal(true)}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-white border border-slate-200 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100 hover:border-slate-300 transition-all shadow-sm"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: "1rem" }}>add_box</span>
                    New Dispatch
                  </button>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>

      <style jsx>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes slide-up {
          from { opacity: 0; transform: translateX(-8px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes pulse-subtle {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.85; }
        }
        .animate-fade-in {
          animation: fade-in 0.4s ease-out forwards;
          opacity: 0;
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out forwards;
          opacity: 0;
        }
        .animate-pulse-subtle {
          animation: pulse-subtle 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
