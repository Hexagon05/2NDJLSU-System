"use client";

import { useEffect, useMemo, useState } from "react";
import { onValue, ref as dbRef } from "firebase/database";
import { collection, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, Timestamp, updateDoc, where } from "firebase/firestore";
import { db, rtdb } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import * as XLSX from "xlsx";
import dynamic from "next/dynamic";
import { getItemClassLookup, resolveSupplyClassLabel, resolveSupplyItemLabel, resolveSupplyQuantityValue } from "@/lib/supply-class-resolver";
import { acquireModalLock, releaseModalLock } from "@/lib/modal-lock";

const DispatchTrackingMiniMap = dynamic<{
    movementPoints: DispatchTrackingPoint[];
    reportEvents: DispatchTrackingPoint[];
    baseCampLocation?: Coordinates;
    currentLocation?: Coordinates;
    deliveryLocation?: Coordinates;
}>(
    () => import("@/components/DispatchTrackingMiniMap"),
    {
        ssr: false,
        loading: () => (
            <div className="h-full w-full bg-slate-100 animate-pulse rounded-2xl flex items-center justify-center text-slate-500 text-xs font-semibold">
                Loading live tracking map...
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
    isParked?: boolean;
    parked?: boolean | string | number | null;
    parkedAt?: Timestamp | null;
    parkedBy?: string | null;
    deliveredAt?: Timestamp | null;
    completedAt?: Timestamp | null;
    successfulDispatchAt?: Timestamp | null;
    supplies: { category: string; item: string; quantity: number }[];
    othersNote?: string;
    proofOfDelivery?: unknown;
    dispatchChat?: unknown[];
    computedDelayMinutes?: number;
    computedStopOverMinutes?: number;
    computedIdleMinutes?: number;
    computedDelayLabel?: string;
    createdAt: Timestamp | null;
}

interface Props {
    dispatch: Dispatch;
    onClose: () => void;
    onSuccess?: () => void;
}

interface DeliveryProofImage {
    id: string;
    imageUrl: string;
    senderName: string;
    timestamp: Timestamp | null;
    caption?: string;
}

interface Coordinates {
    lat: number;
    lng: number;
    label?: string;
}

interface PersonnelReportLocation {
    location: Coordinates;
    timestamp: Timestamp | null;
    reportText: string;
    reportKind: string;
}

interface DispatchTrackingPoint {
    id: string;
    location: Coordinates;
    timestamp: Timestamp | null;
    reportText: string;
    reportKind: string;
}

interface RealtimeLocationPoint extends Coordinates {
    lastUpdated?: number;
}

function formatTime(ts: Timestamp | null): string {
    if (!ts) return "-";
    return ts.toDate().toLocaleString("en-PH", {
        month: "long",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    });
}

const STATUS_STYLES: Record<string, string> = {
    Pending: "bg-amber-100 text-amber-700 border-amber-200",
    Approved: "bg-blue-100 text-blue-700 border-blue-200",
    "En Route": "bg-violet-100 text-violet-700 border-violet-200",
    Ongoing: "bg-orange-100 text-orange-700 border-orange-200",
    "Stop Over": "bg-sky-100 text-sky-700 border-sky-200",
    Delivered: "bg-cyan-100 text-cyan-700 border-cyan-200",
    "Successful Dispatch": "bg-emerald-100 text-emerald-700 border-emerald-200",
    Completed: "bg-emerald-100 text-emerald-700 border-emerald-200",
    Cancelled: "bg-rose-100 text-rose-700 border-rose-200",
};

function toNumber(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
        const parsed = Number(value.trim());
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}

function isTruthyParkedFlag(value: unknown): boolean {
    const normalized = String(value ?? "").trim().toLowerCase();
    return normalized === "true" || normalized === "yes" || normalized === "1";
}

function extractRealtimeLocation(entry: unknown): RealtimeLocationPoint | null {
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
            label: "Live truck location",
            lastUpdated,
        };
    }

    return null;
}

function extractCoordinates(entry: any): Coordinates | null {
    if (!entry || typeof entry !== "object") return null;

    const sourceObjects = [
        entry.currentLocation,
        entry.reportLocation,
        entry.emergencyLocation,
        entry.CurrentLocation,
        entry.location,
        entry.coordinates,
        entry,
    ];

    for (const source of sourceObjects) {
        if (!source || typeof source !== "object") continue;

        const geoPointLat = toNumber(source.latitude);
        const geoPointLng = toNumber(source.longitude);
        if (geoPointLat !== null && geoPointLng !== null) {
            return {
                lat: geoPointLat,
                lng: geoPointLng,
                label: typeof source.label === "string" ? source.label : undefined,
            };
        }

        const lat = toNumber(source.lat ?? source.latitude);
        const lng = toNumber(source.lng ?? source.lon ?? source.longitude);
        if (lat !== null && lng !== null) {
            return {
                lat,
                lng,
                label: typeof source.label === "string" ? source.label : undefined,
            };
        }
    }

    return null;
}

function isStopOverReport(entry: any): boolean {
    const text = String(entry?.text || entry?.message || entry?.statusNote || "").toLowerCase();
    const kind = String(entry?.type || entry?.status || entry?.action || "").toLowerCase();
    const signal = `${text} ${kind}`;

    return signal.includes("stop over")
        || signal.includes("stopover")
        || signal.includes("stop-over");
}

function isDelayReport(entry: any): boolean {
    const text = String(entry?.text || entry?.message || entry?.statusNote || "").toLowerCase();
    const kind = String(entry?.type || entry?.status || entry?.action || "").toLowerCase();
    const signal = `${text} ${kind}`;

    return signal.includes("delay")
        || signal.includes("late")
        || signal.includes("traffic")
        || signal.includes("break")
        || signal.includes("rest");
}

function isEmergencyReport(entry: any): boolean {
    const text = String(entry?.text || entry?.message || entry?.statusNote || "").toLowerCase();
    const kind = String(entry?.type || entry?.status || entry?.action || entry?.event || "").toLowerCase();
    const signal = `${text} ${kind}`;
    return signal.includes("emergency") || signal.includes("sos") || signal.includes("panic");
}

function isConfirmDeliveryReport(entry: any): boolean {
    const text = String(entry?.text || entry?.message || entry?.statusNote || "").toLowerCase();
    const kind = String(entry?.type || entry?.status || entry?.action || entry?.event || "").toLowerCase();
    const signal = `${text} ${kind}`;

    return signal.includes("confirm delivery")
        || signal.includes("delivery confirmed")
        || signal.includes("confirm-delivery")
        || signal.includes("proof of delivery")
        || signal.includes("confirm_delivered");
}

function isDeliveredStatus(status: string | undefined | null): boolean {
    const normalized = String(status || "").toLowerCase();
    return normalized.includes("delivered") || normalized.includes("successful dispatch") || normalized.includes("completed");
}

function getReportKind(entry: any): string {
    if (isEmergencyReport(entry)) {
        return "Emergency";
    }

    if (isConfirmDeliveryReport(entry)) {
        return "Confirm Delivery";
    }

    if (isStopOverReport(entry)) {
        return "Stop Over";
    }

    if (isDelayReport(entry)) {
        return "Delay";
    }

    return "Location Update";
}

function isTrackedReportKind(kind: string): boolean {
    return kind === "Delay" || kind === "Stop Over" || kind === "Emergency" || kind === "Confirm Delivery";
}

function toMillis(ts: Timestamp | { toMillis?: () => number } | null | undefined): number {
    if (ts == null) return 0;

    // Numeric epoch milliseconds
    if (typeof ts === "number" && Number.isFinite(ts)) return ts;

    // Firestore Timestamp or similar with toMillis()
    if (typeof (ts as any)?.toMillis === "function") return (ts as any).toMillis();

    // Date object
    if (ts instanceof Date) return ts.getTime();

    // Firestore-like object with seconds/nanoseconds
    const obj = ts as any;
    if (obj && typeof obj === "object") {
        if (typeof obj.seconds === "number") {
            const nanos = typeof obj.nanoseconds === "number" ? Math.floor(obj.nanoseconds / 1e6) : 0;
            return obj.seconds * 1000 + nanos;
        }
        if (typeof obj._seconds === "number") {
            const nanos = typeof obj._nanoseconds === "number" ? Math.floor(obj._nanoseconds / 1e6) : 0;
            return obj._seconds * 1000 + nanos;
        }
        if (typeof obj.timestamp === "number") return obj.timestamp;
    }

    return 0;
}

function extractStopOverReason(value: string | undefined | null): string | null {
    const text = String(value || "").trim();
    if (!text) return null;

    const reasonMatch = text.match(/reason\s*:\s*([\s\S]+)/i);
    if (reasonMatch?.[1]) {
        return reasonMatch[1].trim();
    }

    const normalized = text.toLowerCase();
    if (normalized === "stop over" || normalized === "stopover") {
        return null;
    }

    return text;
}

function formatDurationMinutes(totalMinutes: number): string {
    if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) return "0m";

    const safeMinutes = Math.max(0, Math.floor(totalMinutes));
    const hours = Math.floor(safeMinutes / 60);
    const minutes = safeMinutes % 60;

    if (hours <= 0) return `${minutes}m`;
    if (minutes <= 0) return `${hours}h`;
    return `${hours}h ${minutes}m`;
}

function parseDurationString(text: string | null | undefined): number | null {
    if (!text) return null;
    const t = String(text).trim().toLowerCase();
    if (!t) return null;

    // Direct number like "90" -> minutes
    if (/^\d+(?:\.\d+)?$/.test(t)) return Number(t);

    // Hours and minutes like "1h 30m", "1h30m", "1h"
    const hourMatch = t.match(/(\d+(?:\.\d+)?)\s*h/);
    const minuteMatch = t.match(/(\d+(?:\.\d+)?)\s*m/);
    let total = 0;
    let matched = false;
    if (hourMatch) {
        total += Number(hourMatch[1]) * 60;
        matched = true;
    }
    if (minuteMatch) {
        total += Number(minuteMatch[1]);
        matched = true;
    }

    // Compact shorthand like "90m" or "1.5h"
    if (!matched) {
        const compact = t.match(/^(\d+(?:\.\d+)?)(h|m)$/);
        if (compact) {
            const v = Number(compact[1]);
            if (compact[2] === 'h') return v * 60;
            return v;
        }
    }

    return matched ? total : null;
}

export default function DispatchDetailModal({ dispatch, onClose, onSuccess }: Props) {
    const { user, loading: authLoading } = useAuth();
    const [liveDispatch, setLiveDispatch] = useState<Dispatch>(dispatch);
    const [completing, setCompleting] = useState(false);
    const [canceling, setCanceling] = useState(false);
    const [confirmingDelivery, setConfirmingDelivery] = useState(false);
    const [markingParked, setMarkingParked] = useState(false);
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const [successTitle, setSuccessTitle] = useState("Delivery Marked as Completed Successfully!");
    const [successMessage, setSuccessMessage] = useState("The dispatch has been updated and will now appear in the history records.");
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [showCancelConfirmModal, setShowCancelConfirmModal] = useState(false);
    const [showProofModal, setShowProofModal] = useState(false);
    const [loadingProofImages, setLoadingProofImages] = useState(false);
    const [proofImages, setProofImages] = useState<DeliveryProofImage[]>([]);
    const [itemClassLookup, setItemClassLookup] = useState<Map<string, string>>(new Map());
    const [personnelReportLocation, setPersonnelReportLocation] = useState<PersonnelReportLocation | null>(null);
    const [loadingReportLocation, setLoadingReportLocation] = useState(false);
    const [trackingEvents, setTrackingEvents] = useState<DispatchTrackingPoint[]>([]);
    const [movementPoints, setMovementPoints] = useState<DispatchTrackingPoint[]>([]);
    const [liveRtdbLocation, setLiveRtdbLocation] = useState<RealtimeLocationPoint | null>(null);
    const [loadingTrackingOverview, setLoadingTrackingOverview] = useState(false);
    const [selectedReportCategory, setSelectedReportCategory] = useState<"all" | "delay" | "stop-over" | "emergency" | "confirm-delivery">("all");
    const [delaySeenAtMs, setDelaySeenAtMs] = useState(0);
    const [tickNow, setTickNow] = useState(() => Date.now());
    const [isCurrentUserAdmin, setIsCurrentUserAdmin] = useState(false);
    const [firestorePermissionError, setFirestorePermissionError] = useState<string | null>(null);

    const delaySeenStorageKey = useMemo(() => `dispatch_delay_seen_at_${dispatch.id}`, [dispatch.id]);
    const sourceDispatch = liveDispatch;

    useEffect(() => {
        setLiveDispatch(dispatch);
    }, [dispatch]);

    useEffect(() => {
        if (!dispatch.id) return;

        const dispatchRef = doc(db, "dispatches", dispatch.id);
        const unsubscribe = onSnapshot(
            dispatchRef,
            (snapshot) => {
                if (!snapshot.exists()) return;
                setLiveDispatch({ id: snapshot.id, ...(snapshot.data() as Omit<Dispatch, "id">) });
            },
            (error) => {
                console.error("Error listening to dispatch in detail:", error);
                const msg = String((error as any)?.message || "");
                if (/permission/i.test(msg) || (error as any)?.code === "permission-denied") {
                    setFirestorePermissionError(msg || "Missing or insufficient permissions.");
                }
            }
        );

        return () => unsubscribe();
    }, [dispatch.id]);

    useEffect(() => {
        if (!dispatch.id) {
            setLiveRtdbLocation(null);
            return;
        }

        const locationKeys = Array.from(new Set([dispatch.id, dispatch.dispatchId].filter(Boolean) as string[]));
        if (locationKeys.length === 0) {
            setLiveRtdbLocation(null);
            return;
        }

        const unsubscribers = locationKeys.map((key) => {
            const locationRef = dbRef(rtdb, `active_locations/${key}`);

            return onValue(
                locationRef,
                (snapshot) => {
                    setLiveRtdbLocation(extractRealtimeLocation(snapshot.val()));
                },
                (error) => {
                    console.error(`Error listening to RTDB active_locations/${key} in dispatch detail:`, error);
                    setLiveRtdbLocation(null);
                }
            );
        });

        return () => {
            unsubscribers.forEach((unsubscribe) => unsubscribe());
        };
    }, [dispatch.id, dispatch.dispatchId]);

    useEffect(() => {
        if (authLoading || !user) {
            return;
        }

        acquireModalLock();
        return () => {
            releaseModalLock();
        };
    }, [authLoading, user]);

    useEffect(() => {
        if (authLoading || !user) return;

        let mounted = true;

        getItemClassLookup()
            .then((lookup) => {
                if (mounted) {
                    setItemClassLookup(lookup);
                }
            })
            .catch((error) => {
                console.error("Error loading supply class lookup:", error);
            });

        return () => {
            mounted = false;
        };
    }, [authLoading, user]);

    // Mark dispatch as delivered/completed
    const handleCompleteDelivery = async () => {
        if (!dispatch.id) {
            return;
        }

        setShowConfirmModal(true);
    };

    const confirmComplete = async () => {
        setShowConfirmModal(false);
        setCompleting(true);
        try {
            const dispatchRef = doc(db, "dispatches", dispatch.id);
            await updateDoc(dispatchRef, {
                status: "Completed",
                deliveredAt: Timestamp.now(),
                completedAt: Timestamp.now(),
            });

            setSuccessTitle("Delivery Marked as Completed Successfully!");
            setSuccessMessage("The dispatch has been updated and will now appear in the history records.");
            setShowSuccessModal(true);
            onSuccess?.(); // Refresh parent data
        } catch (error: any) {
            console.error("Error completing delivery:", error);
            alert(`Failed to complete delivery: ${error?.message || "Unknown error"}`);
        } finally {
            setCompleting(false);
        }
    };

    const loadDeliveryProofImages = async () => {
        if (!dispatch.id) {
            setProofImages([]);
            return;
        }

        setLoadingProofImages(true);
        try {
            let data: any = null;

            // Primary lookup by Firestore document id
            const dispatchRef = doc(db, "dispatches", dispatch.id);
            const dispatchSnap = await getDoc(dispatchRef);
            if (dispatchSnap.exists()) {
                data = dispatchSnap.data();
            }

            // Fallback lookup by business dispatchId value
            if (!data && dispatch.dispatchId) {
                const dispatchQuery = query(
                    collection(db, "dispatches"),
                    where("dispatchId", "==", dispatch.dispatchId),
                    limit(1)
                );
                const dispatchQuerySnap = await getDocs(dispatchQuery);
                if (!dispatchQuerySnap.empty) {
                    data = dispatchQuerySnap.docs[0].data();
                }
            }

            if (!data) {
                setProofImages([]);
                return;
            }

            const proofData = data?.proofOfDelivery ?? dispatch.proofOfDelivery;
            const fallbackTimestamp = (data?.deliveredAt as Timestamp) || (data?.successfulDispatchAt as Timestamp) || (data?.createdAt as Timestamp) || null;
            const fallbackSender = String(data?.receiverName || data?.personnels || dispatch.personnels || "Field Personnel");
            const fallbackCaption = String(data?.deliveryNote || "").trim();
            const aggregated: DeliveryProofImage[] = [];

            const toImageUrl = (entry: any): string => {
                if (typeof entry === "string") return entry.trim();
                if (entry && typeof entry === "object") {
                    return String(entry.proofOfDelivery || entry.imageUrl || entry.url || entry.secure_url || "").trim();
                }
                return "";
            };

            // Handle if proofOfDelivery is a string (single image URL)
            if (typeof proofData === "string" && proofData.trim()) {
                aggregated.push({
                    id: "proof-0",
                    imageUrl: proofData.trim(),
                    senderName: fallbackSender,
                    timestamp: fallbackTimestamp,
                    caption: fallbackCaption,
                });
            }

            // Handle if proofOfDelivery is an array (multiple images)
            if (Array.isArray(proofData) && proofData.length > 0) {
                const images = proofData
                    .map((entry: any, idx: number) => {
                        const imageUrl = toImageUrl(entry);
                        if (!imageUrl) return null;

                        return {
                            id: `proof-${idx}`,
                            imageUrl,
                            senderName: fallbackSender,
                            timestamp: fallbackTimestamp,
                            caption: fallbackCaption,
                        } as DeliveryProofImage;
                    })
                    .filter((entry): entry is DeliveryProofImage => !!entry);

                aggregated.push(...images);
            }

            // Handle if proofOfDelivery is an object
            if (proofData && typeof proofData === "object" && !Array.isArray(proofData)) {
                const imageUrl = toImageUrl(proofData);
                if (imageUrl) {
                    aggregated.push({
                        id: "proof-object",
                        imageUrl,
                        senderName: String(proofData?.uploadedBy || proofData?.senderName || fallbackSender),
                        timestamp: (proofData?.timestamp as Timestamp) || fallbackTimestamp,
                        caption: String(proofData?.description || proofData?.caption || fallbackCaption).trim(),
                    });
                }
            }

            // Fallback: read proofOfDelivery subcollection only when doc-level field has no images.
            if (aggregated.length === 0) {
                try {
                    const proofRef = collection(db, "dispatches", dispatch.id, "proofOfDelivery");
                    const proofSnap = await getDocs(query(proofRef, orderBy("timestamp", "desc")));
                    const subcollectionImages = proofSnap.docs
                        .map((proofDoc) => {
                            const proofEntry = proofDoc.data() as any;
                            const imageUrl = String(proofEntry?.proofOfDelivery || proofEntry?.imageUrl || "").trim();
                            if (!imageUrl) return null;

                            return {
                                id: `sub-${proofDoc.id}`,
                                imageUrl,
                                senderName: String(proofEntry?.uploadedBy || proofEntry?.senderName || fallbackSender),
                                timestamp: (proofEntry?.timestamp as Timestamp) || fallbackTimestamp,
                                caption: String(proofEntry?.description || proofEntry?.caption || fallbackCaption).trim(),
                            } as DeliveryProofImage;
                        })
                        .filter((entry): entry is DeliveryProofImage => !!entry);

                    aggregated.push(...subcollectionImages);
                } catch (subcollectionError) {
                    console.warn("Unable to read proofOfDelivery subcollection, using document-level proof only:", subcollectionError);
                }
            }

            const dedupedImages = Array.from(
                new Map(aggregated.map((image) => [image.imageUrl, image])).values()
            );

            if (dedupedImages.length > 0) {
                setProofImages(dedupedImages);
                return;
            }

            // No proof images found
            setProofImages([]);
        } catch (error) {
            console.error("Error loading delivery proof images:", error);
            const msg = String((error as any)?.message || "");
            if (/permission/i.test(msg) || (error as any)?.code === "permission-denied") {
                setFirestorePermissionError(msg || "Missing or insufficient permissions.");
            }
            setProofImages([]);
        } finally {
            setLoadingProofImages(false);
        }
    };

    const loadPersonnelReportLocation = async () => {
        if (!dispatch.id) {
            setPersonnelReportLocation(null);
            return;
        }

        setLoadingReportLocation(true);
        try {
            const messagesRef = collection(db, "dispatches", dispatch.id, "messages");
            const snap = await getDocs(query(messagesRef, orderBy("timestamp", "desc"), limit(50)));

            if (snap.empty) {
                setPersonnelReportLocation(null);
                return;
            }

            const messages = snap.docs.map((messageDoc) => messageDoc.data() as any);

            const prioritized = messages.find((entry) => {
                const location = extractCoordinates(entry);
                const isPersonnel = entry?.isAdmin !== true;
                const reportKind = getReportKind(entry);
                return Boolean(location) && isPersonnel && isTrackedReportKind(reportKind);
            });

            const fallback = messages.find((entry) => {
                const location = extractCoordinates(entry);
                const isPersonnel = entry?.isAdmin !== true;
                return Boolean(location) && isPersonnel;
            });

            const selected = prioritized || fallback;
            if (!selected) {
                if (!liveRtdbLocation) {
                    setPersonnelReportLocation(null);
                    return;
                }

                setPersonnelReportLocation({
                    location: liveRtdbLocation,
                    timestamp: null,
                    reportText: "Live location from RTDB",
                    reportKind: "Location Update",
                });
                return;
            }

            const location = extractCoordinates(selected);
            if (!location) {
                setPersonnelReportLocation(null);
                return;
            }

            setPersonnelReportLocation({
                location,
                timestamp: (selected?.timestamp as Timestamp) || null,
                reportText: String(selected?.text || selected?.message || selected?.statusNote || "").trim(),
                reportKind: getReportKind(selected),
            });
        } catch (error) {
            console.error("Error loading personnel report location:", error);
            const msg = String((error as any)?.message || "");
            if (/permission/i.test(msg) || (error as any)?.code === "permission-denied") {
                setFirestorePermissionError(msg || "Missing or insufficient permissions.");
            }
            setPersonnelReportLocation(null);
        } finally {
            setLoadingReportLocation(false);
        }
    };

    const loadTrackingOverview = async () => {
        if (!dispatch.id) {
            setTrackingEvents([]);
            setMovementPoints([]);
            return;
        }

        setLoadingTrackingOverview(true);
        try {
            const dispatchFallbackLocation =
                liveRtdbLocation
                || extractCoordinates(sourceDispatch.CurrentLocation)
                || extractCoordinates(sourceDispatch.currentLocation)
                || extractCoordinates(sourceDispatch.location)
                || extractCoordinates(sourceDispatch.startLocation)
                || null;

            const dispatchChatEntries = Array.isArray(sourceDispatch.dispatchChat) ? sourceDispatch.dispatchChat : [];
            const messagesRef = collection(db, "dispatches", dispatch.id, "messages");
            const snap = await getDocs(query(messagesRef, orderBy("timestamp", "asc"), limit(250)));
            const statusReportsRef = collection(db, "dispatches", dispatch.id, "status_reports");
            const statusReportsSnap = await getDocs(query(statusReportsRef, orderBy("timestamp", "asc"), limit(250)));

            const movement: DispatchTrackingPoint[] = [];
            const trackedReports: DispatchTrackingPoint[] = [];

            const appendTrackedReport = (entry: any, id: string) => {
                const reportKind = getReportKind(entry);
                if (!isTrackedReportKind(reportKind)) return;

                const location = extractCoordinates(entry) || dispatchFallbackLocation;
                if (!location) return;

                trackedReports.push({
                    id,
                    location,
                    timestamp: (entry?.timestamp as Timestamp) || null,
                    reportText: String(entry?.reason || entry?.text || entry?.message || entry?.statusNote || entry?.description || reportKind).trim(),
                    reportKind,
                });
            };

            snap.docs.forEach((messageDoc, index) => {
                const entry = messageDoc.data() as any;
                const location = extractCoordinates(entry);
                const isPersonnel = entry?.isAdmin !== true;
                if (!location || !isPersonnel) return;

                const reportKind = getReportKind(entry);
                const reportText = String(entry?.text || entry?.message || entry?.statusNote || "").trim();
                const point: DispatchTrackingPoint = {
                    id: `msg-${messageDoc.id}-${index}`,
                    location,
                    timestamp: (entry?.timestamp as Timestamp) || null,
                    reportText,
                    reportKind,
                };

                movement.push(point);
                if (isTrackedReportKind(reportKind)) {
                    trackedReports.push(point);
                }
            });

            dispatchChatEntries.forEach((entry, index) => {
                const message = entry as any;
                const isPersonnel = message?.isAdmin !== true;
                if (!isPersonnel) return;

                const pointLocation = extractCoordinates(message) || dispatchFallbackLocation;
                const reportKind = getReportKind(message);

                if (pointLocation) {
                    movement.push({
                        id: `chat-${dispatch.id}-${index}`,
                        location: pointLocation,
                        timestamp: (message?.timestamp as Timestamp) || null,
                        reportText: String(message?.text || message?.message || message?.statusNote || "").trim(),
                        reportKind,
                    });
                }

                appendTrackedReport(message, `chat-report-${dispatch.id}-${index}`);
            });

            statusReportsSnap.docs.forEach((reportDoc, index) => {
                const entry = reportDoc.data() as any;
                const reportKind = getReportKind(entry);
                if (!isTrackedReportKind(reportKind)) return;

                const location = extractCoordinates(entry) || dispatchFallbackLocation;
                if (!location) return;

                trackedReports.push({
                    id: `sr-${reportDoc.id}-${index}`,
                    location,
                    timestamp: (entry?.timestamp as Timestamp) || null,
                    reportText: String(entry?.reason || entry?.text || entry?.message || entry?.statusNote || entry?.description || reportKind).trim(),
                    reportKind,
                });
            });

            if ((sourceDispatch.status || "").toLowerCase().includes("delivered") || (sourceDispatch.status || "").toLowerCase().includes("successful dispatch")) {
                const hasConfirmDelivery = trackedReports.some((event) => event.reportKind === "Confirm Delivery");
                if (!hasConfirmDelivery && dispatchFallbackLocation) {
                    trackedReports.push({
                        id: `delivery-confirmation-${dispatch.id}`,
                        location: dispatchFallbackLocation,
                        timestamp: sourceDispatch.updatedAt || sourceDispatch.UpdatedAt || sourceDispatch.createdAt || null,
                        reportText: String(sourceDispatch.status || "Confirm Delivery").trim(),
                        reportKind: "Confirm Delivery",
                    });
                }
            }

            const fallbackCurrentLocation = liveRtdbLocation || null;

            const normalizedStatus = String(dispatch.status || "").toLowerCase();
            const statusKind =
                normalizedStatus.includes("delay") || normalizedStatus.includes("late")
                    ? "Delay"
                    : normalizedStatus.includes("emergency")
                        ? "Emergency"
                        : null;

            if (statusKind && fallbackCurrentLocation) {
                trackedReports.push({
                    id: `status-fallback-${dispatch.id}-${statusKind.toLowerCase().replace(/\s+/g, "-")}`,
                    location: fallbackCurrentLocation,
                    timestamp: dispatch.UpdatedAt || dispatch.updatedAt || dispatch.createdAt || null,
                    reportText: String(dispatch.status || "Mobile status update").trim(),
                    reportKind: statusKind,
                });
            }

            // Keep stop-over visible in dispatch details even if message/status_reports sync is delayed.
            const hasStopOverReport = trackedReports.some((event) => event.reportKind === "Stop Over");
            const isStopOverStatus = normalizedStatus.includes("stop over") || normalizedStatus.includes("stopover");
            if (isStopOverStatus && fallbackCurrentLocation && !hasStopOverReport) {
                trackedReports.push({
                    id: `status-fallback-${dispatch.id}-stop-over`,
                    location: fallbackCurrentLocation,
                    timestamp: dispatch.UpdatedAt || dispatch.updatedAt || dispatch.createdAt || null,
                    reportText: String(dispatch.status || "Stop Over").trim(),
                    reportKind: "Stop Over",
                });
            }

            try {
                const emergencyReportsByDocId = await getDocs(
                    query(collection(db, "EmergencyReports"), where("dispatchId", "==", sourceDispatch.id), limit(100))
                );

                const emergencyReportsByBusinessId = sourceDispatch.dispatchId
                    ? await getDocs(
                                                    query(collection(db, "EmergencyReports"), where("dispatchId", "==", dispatch.dispatchId), limit(100))
                      )
                    : null;

                const mergedEmergencyDocs = [
                    ...emergencyReportsByDocId.docs,
                    ...(emergencyReportsByBusinessId?.docs || []),
                ];

                const seenEmergencyDocIds = new Set<string>();
                mergedEmergencyDocs.forEach((reportDoc, index) => {
                    if (seenEmergencyDocIds.has(reportDoc.id)) return;
                    seenEmergencyDocIds.add(reportDoc.id);

                    const reportData = reportDoc.data() as any;
                    const reportLocation = extractCoordinates(reportData);
                    if (!reportLocation) return;

                    trackedReports.push({
                        id: `er-${reportDoc.id}-${index}`,
                        location: reportLocation,
                        timestamp: (reportData?.timestamp as Timestamp) || null,
                        reportText: String(reportData?.description || reportData?.type || "Emergency report").trim(),
                        reportKind: "Emergency",
                    });
                });
            } catch (emergencyLoadError) {
                console.warn("Unable to load linked emergency reports for dispatch tracking overview:", emergencyLoadError);
            }

            if (movement.length === 0) {
                if (fallbackCurrentLocation) {
                    movement.push({
                        id: "dispatch-fallback-location",
                        location: fallbackCurrentLocation,
                        timestamp: dispatch.updatedAt || dispatch.UpdatedAt || null,
                        reportKind: "Location Update",
                        reportText: "Location from dispatch document",
                    });
                }
            }

            const dedupedTrackedReports = Array.from(
                new Map(
                    trackedReports.map((event) => {
                        const eventKey = `${event.reportKind}|${event.location.lat.toFixed(6)}|${event.location.lng.toFixed(6)}|${toMillis(event.timestamp)}`;
                        return [eventKey, event] as const;
                    })
                ).values()
            );

            setMovementPoints(movement);
            setTrackingEvents(dedupedTrackedReports);
        } catch (error) {
            console.error("Error loading tracking overview:", error);
                const msg = String((error as any)?.message || "");
                if (/permission/i.test(msg) || (error as any)?.code === "permission-denied") {
                    setFirestorePermissionError(msg || "Missing or insufficient permissions.");
                }
                setMovementPoints([]);
                setTrackingEvents([]);
        } finally {
            setLoadingTrackingOverview(false);
        }
    };

    useEffect(() => {
        if (authLoading || !user) return;

        // Full tracking reload is expensive and remounts map content when loading toggles.
        // Only do this when dispatch context changes.
        loadTrackingOverview();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        authLoading,
        user,
        dispatch.id,
    ]);

    useEffect(() => {
        if (authLoading || !user) return;

        // Keep personnel report coordinates current with live RTDB updates.
        loadPersonnelReportLocation();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        authLoading,
        user,
        dispatch.id,
        liveRtdbLocation?.lat,
        liveRtdbLocation?.lng,
        liveRtdbLocation?.lastUpdated,
    ]);

    useEffect(() => {
        if (typeof window === "undefined") return;

        const storedDelaySeenAt = Number(window.sessionStorage.getItem(delaySeenStorageKey) || "0");
        if (Number.isFinite(storedDelaySeenAt) && storedDelaySeenAt > 0) {
            setDelaySeenAtMs(storedDelaySeenAt);
        } else {
            setDelaySeenAtMs(0);
        }
    }, [delaySeenStorageKey]);

    useEffect(() => {
        if (typeof window === "undefined") return;

        if (delaySeenAtMs > 0) {
            window.sessionStorage.setItem(delaySeenStorageKey, String(delaySeenAtMs));
        } else {
            window.sessionStorage.removeItem(delaySeenStorageKey);
        }
    }, [delaySeenAtMs, delaySeenStorageKey]);

    useEffect(() => {
        const intervalId = window.setInterval(() => {
            setTickNow(Date.now());
        }, 60000);

        return () => {
            window.clearInterval(intervalId);
        };
    }, []);

    useEffect(() => {
        const checkAdminRole = async () => {
            if (!user?.uid) {
                setIsCurrentUserAdmin(false);
                return;
            }

            try {
                const userDoc = await getDoc(doc(db, "users", user.uid));
                const role = String(userDoc.data()?.role || "").trim().toLowerCase();
                setIsCurrentUserAdmin(userDoc.exists() && role === "admin");
            } catch {
                setIsCurrentUserAdmin(false);
            }
        };

        checkAdminRole();
    }, [user?.uid]);

    const handleOpenProofModal = async () => {
        setShowProofModal(true);
        await loadDeliveryProofImages();
    };

    const handleConfirmSuccessfulDispatch = async () => {
        if (!dispatch.id) return;

        setConfirmingDelivery(true);
        try {
            const dispatchRef = doc(db, "dispatches", dispatch.id);
            await updateDoc(dispatchRef, {
                status: "Successful Dispatch",
                successfulDispatchAt: Timestamp.now(),
                deliveryProofCount: proofImages.length,
                isParked: false,
                parked: false,
                parkedAt: null,
                parkedBy: null,
            });

            setShowProofModal(false);
            setSuccessTitle("Dispatch Confirmed Successfully");
            setSuccessMessage("The dispatch is now marked as Successful Dispatch.");
            setShowSuccessModal(true);
            onSuccess?.();
        } catch (error: any) {
            console.error("Error confirming successful dispatch:", error);
            alert(`Failed to confirm delivery: ${error?.message || "Unknown error"}`);
        } finally {
            setConfirmingDelivery(false);
        }
    };

    const handleMarkAsParked = async () => {
        if (!dispatch.id) return;

        setMarkingParked(true);
        try {
            const dispatchRef = doc(db, "dispatches", dispatch.id);
            await updateDoc(dispatchRef, {
                isParked: true,
                parked: true,
                parkedAt: Timestamp.now(),
                parkedBy: user?.uid || null,
            });

            setSuccessTitle("Vehicle Marked as Parked");
            setSuccessMessage("Status remains Successful Dispatch, but this vehicle is now inactive for tracking.");
            setShowSuccessModal(true);
            onSuccess?.();
        } catch (error: any) {
            console.error("Error marking dispatch as parked:", error);
            alert(`Failed to mark as parked: ${error?.message || "Unknown error"}`);
        } finally {
            setMarkingParked(false);
        }
    };

    const handleCancelDispatch = async () => {
        if (!dispatch.id) {
            return;
        }

        setShowCancelConfirmModal(true);
    };

    const confirmCancelDispatch = async () => {
        setShowCancelConfirmModal(false);
        setCanceling(true);
        try {
            const dispatchRef = doc(db, "dispatches", dispatch.id);
            await updateDoc(dispatchRef, {
                status: "Cancelled",
                cancelledAt: Timestamp.now(),
            });

            onSuccess?.();
            onClose();
        } catch (error: any) {
            console.error("Error cancelling dispatch:", error);
            alert(`Failed to cancel dispatch: ${error?.message || "Unknown error"}`);
        } finally {
            setCanceling(false);
        }
    };

    const handleSuccessClose = () => {
        setShowSuccessModal(false);
        onClose(); // Close main modal
    };

    const handleOpenDispatchChat = () => {
        if (!dispatch.id) return;
        window.dispatchEvent(
            new CustomEvent("open-dispatch-chat", {
                detail: { dispatchId: dispatch.id },
            })
        );
    };

    const handleExportDispatch = async () => {
        try {
            // Fetch items and supply_classes from database
            const itemsSnap = await getDocs(collection(db, "items"));
            const itemsDatabase: any[] = itemsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            const classesSnap = await getDocs(collection(db, "supply_classes"));
            const supplyClassesMap = new Map<string, string>();
            classesSnap.forEach(doc => {
                const data = doc.data() as any;
                const classCode = data?.categories?.code || doc.id;
                const className = data?.categories?.name || doc.id;
                supplyClassesMap.set(classCode, className);
            });
            
            // Function to find item class by matching supply item name to items collection
            const findItemClassAndCode = (supplyItemName: string): { className: string; itemCode: string } => {
                const normalizedSupplyItem = supplyItemName.trim().toLowerCase();
                
                // Search for matching item in items collection
                for (const item of itemsDatabase) {
                    const itemName = (item?.itemName || "").toLowerCase();
                    const name = (item?.name || "").toLowerCase();
                    const description = (item?.description || "").toLowerCase();
                    
                    if (itemName === normalizedSupplyItem || 
                        name === normalizedSupplyItem ||
                        description === normalizedSupplyItem) {
                        // Found matching item
                        const itemCode = item?.itemCode || item?.code || "";
                        if (itemCode) {
                            // Extract class code from itemCode (e.g., CLASS-I from CLASS-I-001)
                            const classMatch = itemCode.match(/^(CLASS-[IVX]+)/i) || itemCode.match(/^([A-Z]+)/);
                            if (classMatch) {
                                const classCode = classMatch[1];
                                const className = supplyClassesMap.get(classCode) || classCode;
                                return { className, itemCode };
                            }
                        }
                        return { className: "Uncategorized", itemCode };
                    }
                }
                
                // Try partial match
                for (const item of itemsDatabase) {
                    const itemName = (item?.itemName || "").toLowerCase();
                    const name = (item?.name || "").toLowerCase();
                    
                    if ((itemName && itemName.includes(normalizedSupplyItem)) || 
                        (normalizedSupplyItem && itemName && normalizedSupplyItem.includes(itemName)) ||
                        (name && name.includes(normalizedSupplyItem)) || 
                        (normalizedSupplyItem && name && normalizedSupplyItem.includes(name))) {
                        const itemCode = item?.itemCode || item?.code || "";
                        if (itemCode) {
                            const classMatch = itemCode.match(/^(CLASS-[IVX]+)/i) || itemCode.match(/^([A-Z]+)/);
                            if (classMatch) {
                                const classCode = classMatch[1];
                                const className = supplyClassesMap.get(classCode) || classCode;
                                return { className, itemCode };
                            }
                        }
                        return { className: "Uncategorized", itemCode };
                    }
                }
                
                return { className: "Uncategorized", itemCode: "N/A" };
            };
            
            const detailsSheet = [
                {
                    "Dispatch ID": dispatch.dispatchId,
                    "Firestore ID": dispatch.id,
                    "PO/Requisition ID": dispatch.requisitionNumber || dispatch.requisitionId || dispatch.poNumber || "N/A",
                    "Status": effectiveDispatchStatus,
                    "Officer": dispatch.officer,
                    "Personnels": dispatch.personnels || "N/A",
                    "Vehicle": dispatch.truck,
                    "Created At": formatTime(dispatch.createdAt),
                    "Start Landmark": dispatch.startLocation?.label || "N/A",
                    "Start Latitude": dispatch.startLocation?.lat ?? "N/A",
                    "Start Longitude": dispatch.startLocation?.lng ?? "N/A",
                    "Delivery Landmark": deliveryLocation?.label || "N/A",
                    "Delivery Latitude": deliveryLocation?.lat ?? "N/A",
                    "Delivery Longitude": deliveryLocation?.lng ?? "N/A",
                    "Additional Notes": dispatch.othersNote || "N/A",
                },
            ];

            const supplyRows = dispatch.supplies.length
                ? dispatch.supplies
                      .slice()
                      .sort((left, right) => {
                          const leftItemName = resolveSupplyItemLabel(left);
                          const rightItemName = resolveSupplyItemLabel(right);
                          const leftClass = findItemClassAndCode(leftItemName);
                          const rightClass = findItemClassAndCode(rightItemName);
                          const categoryOrder = leftClass.className.localeCompare(rightClass.className);
                          if (categoryOrder !== 0) return categoryOrder;
                          return leftItemName.localeCompare(rightItemName);
                      })
                      .map((supply, index) => {
                          const itemName = resolveSupplyItemLabel(supply);
                          const { className, itemCode } = findItemClassAndCode(itemName);
                          return {
                              "No.": index + 1,
                              "Item Code": itemCode,
                              "Supply Class": className,
                              "Supply Item": itemName,
                              "Quantity": resolveSupplyQuantityValue(supply),
                          };
                      })
                : [{ "No.": 1, "Item Code": "N/A", "Supply Class": "N/A", "Supply Item": "No supplies listed", "Quantity": 0 }];

            const workbook = XLSX.utils.book_new();
            const detailsWorksheet = XLSX.utils.json_to_sheet(detailsSheet);
            const suppliesWorksheet = XLSX.utils.json_to_sheet(supplyRows);

            detailsWorksheet["!cols"] = [
                { wch: 18 },
                { wch: 28 },
                { wch: 14 },
                { wch: 28 },
                { wch: 28 },
                { wch: 18 },
                { wch: 24 },
                { wch: 30 },
                { wch: 14 },
                { wch: 14 },
                { wch: 30 },
                { wch: 16 },
                { wch: 16 },
                { wch: 40 },
            ];

            suppliesWorksheet["!cols"] = [{ wch: 6 }, { wch: 18 }, { wch: 24 }, { wch: 32 }, { wch: 12 }];

            XLSX.utils.book_append_sheet(workbook, detailsWorksheet, "Dispatch Details");
            XLSX.utils.book_append_sheet(workbook, suppliesWorksheet, "Supplies");

            const datePart = new Date().toISOString().split("T")[0];
            const safeDispatchId = dispatch.dispatchId.replace(/[^a-z0-9_-]+/gi, "_");
            XLSX.writeFile(workbook, `Dispatch_${safeDispatchId}_${datePart}.xlsx`);
        } catch (error) {
            console.error("Error exporting dispatch:", error);
            alert("Failed to export dispatch details. Please try again.");
        }
    };

    const sortedTrackingEvents = useMemo(
        () => [...trackingEvents].sort((left, right) => toMillis(left.timestamp) - toMillis(right.timestamp)),
        [trackingEvents]
    );
    const delayEvents = sortedTrackingEvents.filter((event) => event.reportKind === "Delay");
    const stopOverEvents = sortedTrackingEvents.filter((event) => event.reportKind === "Stop Over");

    const latestDelayEvent = delayEvents[delayEvents.length - 1] || null;
    const latestDelayAtMs = toMillis(latestDelayEvent?.timestamp || null);
    const hasUnreadDelayNotifier = latestDelayAtMs > delaySeenAtMs;
    const latestDelayReason = latestDelayEvent ? extractStopOverReason(latestDelayEvent.reportText) : null;

    const latestStopOverEvent = stopOverEvents[stopOverEvents.length - 1] || null;
    const latestStopOverAtMs = toMillis(latestStopOverEvent?.timestamp || null);
    const latestMovementAfterStopMs = latestStopOverAtMs === 0
        ? 0
        : movementPoints.reduce((latestMs, point) => {
              const pointMs = toMillis(point.timestamp);
              if (pointMs <= latestStopOverAtMs) return latestMs;
              return Math.max(latestMs, pointMs);
          }, 0);

    const normalizedDispatchStatus = String(sourceDispatch.status || "").trim().toLowerCase();
    const dispatchStatusUpdatedAtMs = toMillis(
        sourceDispatch.UpdatedAt ||
        sourceDispatch.updatedAt ||
        sourceDispatch.CurrentLocation?.updatedAt ||
        sourceDispatch.currentLocation?.updatedAt ||
        sourceDispatch.createdAt ||
        null
    );
    const isTerminalDispatchState = ["completed", "successful dispatch", "cancelled", "delivered"].includes(normalizedDispatchStatus);
    const statusIsStopOver = normalizedDispatchStatus.includes("stop over") || normalizedDispatchStatus.includes("stopover");
    const isStopOverActive = statusIsStopOver && !isTerminalDispatchState;
    const stopOverStartedAtMs = latestStopOverAtMs > 0
        ? latestStopOverAtMs
        : (isStopOverActive ? dispatchStatusUpdatedAtMs : 0);
    const stopOverEndedAtMs = isStopOverActive
        ? tickNow
        : Math.max(dispatchStatusUpdatedAtMs, latestMovementAfterStopMs);
    const storedDelayMinutes = Number((sourceDispatch as any)?.computedDelayMinutes);
    const storedStopOverMinutes = Number((sourceDispatch as any)?.computedStopOverMinutes);
    const storedIdleMinutes = Number((sourceDispatch as any)?.computedIdleMinutes);
    const hasStoredDelayValues = (Number.isFinite(storedDelayMinutes) && storedDelayMinutes > 0)
        || (Number.isFinite(storedStopOverMinutes) && storedStopOverMinutes > 0)
        || (Number.isFinite(storedIdleMinutes) && storedIdleMinutes > 0);

    const stopOverTrackedMinutes = hasStoredDelayValues && Number.isFinite(storedStopOverMinutes)
        ? Math.max(0, storedStopOverMinutes)
        : stopOverStartedAtMs > 0
        ? Math.max(0, (Math.max(stopOverEndedAtMs, stopOverStartedAtMs) - stopOverStartedAtMs) / 60000)
        : 0;
    const stopOverEndedAtLabel = !isStopOverActive && stopOverStartedAtMs > 0 && stopOverEndedAtMs > stopOverStartedAtMs
        ? formatTime(
            sourceDispatch.UpdatedAt ||
            sourceDispatch.updatedAt ||
            sourceDispatch.CurrentLocation?.updatedAt ||
            sourceDispatch.currentLocation?.updatedAt ||
            sourceDispatch.createdAt ||
            null
        )
        : null;

    const dispatchDeliveredAtTimestamp =
        sourceDispatch.deliveredAt ||
        sourceDispatch.completedAt ||
        sourceDispatch.successfulDispatchAt ||
        sourceDispatch.updatedAt ||
        sourceDispatch.UpdatedAt ||
        null;
    const dispatchDeliveredAtMs = toMillis(dispatchDeliveredAtTimestamp);

    const latestIdleEvent = delayEvents[delayEvents.length - 1] || null;
    const latestIdleAtMs = toMillis(latestIdleEvent?.timestamp || null);
    const idleTrackedMinutes = hasStoredDelayValues && Number.isFinite(storedIdleMinutes)
        ? Math.max(0, storedIdleMinutes)
        : latestIdleAtMs > 0 && dispatchDeliveredAtMs > 0
            ? Math.max(0, (dispatchDeliveredAtMs - latestIdleAtMs) / 60000)
            : 0;

    const totalDelayMinutes = (() => {
        // If both stored stop-over and idle minutes exist, prefer their sum (more granular)
        if (Number.isFinite(storedStopOverMinutes) && Number.isFinite(storedIdleMinutes)) {
            return Math.max(0, storedStopOverMinutes + storedIdleMinutes);
        }

        // If an explicit stored total exists, use it
        if (Number.isFinite(storedDelayMinutes)) {
            return Math.max(0, storedDelayMinutes);
        }

        // Otherwise compute from tracked values
        return stopOverTrackedMinutes + idleTrackedMinutes;
    })();
    const showTotalDelay = isDeliveredStatus(sourceDispatch.status);

    const stopOverReason = latestStopOverEvent
        ? extractStopOverReason(latestStopOverEvent.reportText)
        : extractStopOverReason(sourceDispatch.status);

    const stopOverMonitorEvent = latestStopOverEvent || (isStopOverActive
        ? {
            id: `stop-over-monitor-${sourceDispatch.id}`,
            location: liveRtdbLocation || sourceDispatch.CurrentLocation || sourceDispatch.currentLocation || sourceDispatch.location || { lat: 0, lng: 0 },
            timestamp: sourceDispatch.UpdatedAt || sourceDispatch.updatedAt || sourceDispatch.createdAt || null,
            reportText: stopOverReason ? `Reason: ${stopOverReason}` : String(sourceDispatch.status || "Stop Over").trim(),
            reportKind: "Stop Over",
        }
        : null);

    const effectiveDispatchStatus = isStopOverActive
        ? "Stop Over"
        : (normalizedDispatchStatus.includes("delay") || normalizedDispatchStatus.includes("late"))
            ? "Ongoing"
            : sourceDispatch.status;

    const filteredTrackingEvents = selectedReportCategory === "all"
        ? sortedTrackingEvents
        : sortedTrackingEvents.filter((event) => {
              if (selectedReportCategory === "delay") return event.reportKind === "Delay";
              if (selectedReportCategory === "stop-over") return event.reportKind === "Stop Over";
              if (selectedReportCategory === "emergency") return event.reportKind === "Emergency";
              if (selectedReportCategory === "confirm-delivery") return event.reportKind === "Confirm Delivery";
              return true;
          });

    const selectedCategoryLabel =
        selectedReportCategory === "all"
            ? "All Reports"
            : selectedReportCategory === "delay"
                ? "Delay Reports"
                : selectedReportCategory === "stop-over"
                    ? "Stop Over Reports"
                    : selectedReportCategory === "emergency"
                        ? "Emergency Reports"
                        : "Confirm Delivery Reports";

    // Check if dispatch can be completed (must be in progress or en route)
    const canComplete = ["En Route", "Ongoing", "Approved", "Stop Over"].includes(effectiveDispatchStatus);
    const canConfirmDelivery = sourceDispatch.status === "Delivered";
    const canViewProof = sourceDispatch.status === "Successful Dispatch";
    const isParked = isTruthyParkedFlag(sourceDispatch.isParked) || isTruthyParkedFlag(sourceDispatch.parked);
    const canMarkAsParked = isCurrentUserAdmin && !authLoading && Boolean(sourceDispatch.id) && !isParked;
    const canCancel = ["Pending", "Approved", "En Route", "Ongoing", "Stop Over"].includes(effectiveDispatchStatus);
    const deliveryLocation = sourceDispatch.deliveryLocation || sourceDispatch.location;
    const baseCampLocation = sourceDispatch.startLocation || {
        lat: 9.748194,
        lng: 118.771083,
        label: "Base Camp",
    };
    const dispatchCurrentLocation = sourceDispatch.CurrentLocation || sourceDispatch.currentLocation || null;
    const currentOperationalLocation = isParked
        ? baseCampLocation
        : liveRtdbLocation || dispatchCurrentLocation || null;
    const destinationCoordinates = {
        lat: deliveryLocation?.lat ?? 0,
        lng: deliveryLocation?.lng ?? 0,
    };
    const currentCoordinates = {
        lat: currentOperationalLocation?.lat ?? 0,
        lng: currentOperationalLocation?.lng ?? 0,
    };
    const currentLocationLabel = isParked
        ? "Base Camp"
        : (sourceDispatch.CurrentLocation as { label?: string } | undefined)?.label
            || (sourceDispatch.currentLocation as { label?: string } | undefined)?.label
            || ((currentOperationalLocation && "label" in currentOperationalLocation)
                ? currentOperationalLocation.label
                : undefined)
            || "Coordinate point established";
    const dispatchUpdatedAt =
        sourceDispatch.updatedAt
        || sourceDispatch.UpdatedAt
        || sourceDispatch.CurrentLocation?.updatedAt
        || sourceDispatch.currentLocation?.updatedAt
        || personnelReportLocation?.timestamp
        || null;
    const requisitionId = sourceDispatch.requisitionNumber || sourceDispatch.requisitionId || sourceDispatch.poNumber || "N/A";

    return (
        <>
            {/* Confirmation Modal */}
            {showConfirmModal && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm" onClick={() => setShowConfirmModal(false)} />
                    <div className="relative bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full animate-fade-in">
                        <div className="text-center">
                            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-amber-100 mb-4">
                                <span className="material-symbols-outlined text-amber-600 text-3xl">help</span>
                            </div>
                            <h3 className="text-xl font-bold text-slate-900 mb-2">Mark Delivery as Completed?</h3>
                            <p className="text-sm text-slate-600 mb-6">
                                This will update the dispatch status to 'Completed' and record the completion timestamp.
                            </p>
                            <div className="flex gap-3 justify-center">
                                <button
                                    onClick={() => setShowConfirmModal(false)}
                                    className="px-6 py-2.5 rounded-xl bg-slate-200 text-slate-700 font-bold text-sm hover:bg-slate-300 transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={confirmComplete}
                                    className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 text-white font-bold text-sm hover:from-emerald-600 hover:to-green-700 transition-all flex items-center gap-2"
                                >
                                    <span className="material-symbols-outlined text-sm">check_circle</span>
                                    Confirm
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Success Modal */}
            {showSuccessModal && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm" onClick={handleSuccessClose} />
                    <div className="relative bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full animate-fade-in">
                        <div className="text-center">
                            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-emerald-100 mb-4">
                                <span className="material-symbols-outlined text-emerald-600 text-3xl">check_circle</span>
                            </div>
                            <h3 className="text-xl font-bold text-slate-900 mb-2">{successTitle}</h3>
                            <p className="text-sm text-slate-600 mb-6">
                                {successMessage}
                            </p>
                            <button
                                onClick={handleSuccessClose}
                                className="px-8 py-3 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-700 transition-all"
                            >
                                OK
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Cancel Confirmation Modal */}
            {showCancelConfirmModal && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm" onClick={() => setShowCancelConfirmModal(false)} />
                    <div className="relative bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full animate-fade-in">
                        <div className="text-center">
                            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-rose-100 mb-4">
                                <span className="material-symbols-outlined text-rose-600 text-3xl">warning</span>
                            </div>
                            <h3 className="text-xl font-bold text-slate-900 mb-2">Cancel This Dispatch?</h3>
                            <p className="text-sm text-slate-600 mb-6">
                                This will update the dispatch status to 'Cancelled' and stop this request from being processed.
                            </p>
                            <div className="flex gap-3 justify-center">
                                <button
                                    onClick={() => setShowCancelConfirmModal(false)}
                                    className="px-6 py-2.5 rounded-xl bg-slate-200 text-slate-700 font-bold text-sm hover:bg-slate-300 transition-all"
                                >
                                    Keep Dispatch
                                </button>
                                <button
                                    onClick={confirmCancelDispatch}
                                    className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-rose-500 to-red-600 text-white font-bold text-sm hover:from-rose-600 hover:to-red-700 transition-all flex items-center gap-2"
                                >
                                    <span className="material-symbols-outlined text-sm">cancel</span>
                                    Confirm Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Delivery Proof Modal */}
            {showProofModal && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/75 backdrop-blur-sm" onClick={() => setShowProofModal(false)} />
                    <div className="relative w-full max-w-4xl rounded-2xl bg-white shadow-2xl border border-slate-200 animate-fade-in overflow-hidden">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
                            <div>
                                <h3 className="text-lg font-bold text-slate-900">Proof of Delivery</h3>
                                <p className="text-xs text-slate-500">Images uploaded by personnel for dispatch verification</p>
                            </div>
                            <button onClick={() => setShowProofModal(false)} className="rounded-lg p-2 hover:bg-slate-200 text-slate-500">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        <div className="p-6 max-h-[60vh] overflow-y-auto">
                            {loadingProofImages ? (
                                <div className="py-16 text-center text-sm text-slate-500">Loading proof images...</div>
                            ) : proofImages.length === 0 ? (
                                <div className="py-16 text-center">
                                    <p className="text-sm font-bold text-slate-700">No proof images found.</p>
                                    <p className="text-xs text-slate-500 mt-1">Waiting for personnel to submit delivery proof images.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {proofImages.map((proof) => (
                                        <a
                                            key={proof.id}
                                            href={proof.imageUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="block rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm hover:shadow-md transition-shadow"
                                        >
                                            <img src={proof.imageUrl} alt="Delivery proof" className="w-full h-40 object-cover bg-slate-100" />
                                            <div className="p-3 space-y-1">
                                                <p className="text-xs font-bold text-slate-700 truncate">{proof.senderName}</p>
                                                <p className="text-[11px] text-slate-500">{formatTime(proof.timestamp)}</p>
                                                {proof.caption ? <p className="text-[11px] text-slate-600 line-clamp-2">{proof.caption}</p> : null}
                                            </div>
                                        </a>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                            <button
                                onClick={() => setShowProofModal(false)}
                                className="px-5 py-2.5 rounded-xl bg-slate-200 text-slate-700 font-bold text-sm hover:bg-slate-300 transition-all"
                            >
                                Close
                            </button>
                            <button
                                onClick={handleConfirmSuccessfulDispatch}
                                disabled={!canConfirmDelivery || confirmingDelivery || loadingProofImages || proofImages.length === 0}
                                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 text-white font-bold text-sm hover:from-emerald-600 hover:to-green-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                {!canConfirmDelivery ? (
                                    <>
                                        <span className="material-symbols-outlined text-sm">visibility</span>
                                        Proof Verified
                                    </>
                                ) : confirmingDelivery ? (
                                    <>
                                        <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
                                        Confirming...
                                    </>
                                ) : (
                                    <>
                                        <span className="material-symbols-outlined text-sm">verified</span>
                                        Confirm Delivery
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Main Modal */}
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-5xl rounded-3xl bg-white shadow-2xl animate-fade-in overflow-hidden border border-slate-200 flex flex-col max-h-[92vh]">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 px-6 py-4 flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white shadow-lg">
                            <span className="material-symbols-outlined" style={{ fontSize: "1.25rem" }}>receipt_long</span>
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-900">Dispatch Request Details</h2>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-400">Deployment ID</p>
                            <p className="text-2xl md:text-3xl font-black font-mono tracking-[0.12em] text-slate-900 leading-tight">
                                {dispatch.dispatchId}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="rounded-lg p-2 hover:bg-slate-200 transition-colors text-slate-400 hover:text-slate-600">
                        <span className="material-symbols-outlined" style={{ fontSize: "1.25rem" }}>close</span>
                    </button>
                </div>

                {/* Body */}
                <div className="p-8 space-y-8 overflow-y-auto custom-scrollbar">
                    {firestorePermissionError ? (
                        <div className="mx-auto w-full max-w-3xl">
                            <div className="rounded-lg border border-rose-100 bg-rose-50 px-4 py-3 text-rose-700 text-sm">
                                <strong className="font-bold">Permission error:</strong>&nbsp;Some data could not be loaded ({firestorePermissionError}).
                                This may be due to Firestore rules. Contact an administrator if needed.
                            </div>
                        </div>
                    ) : null}
                    {/* Top Row: Info & Status */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="p-5 rounded-3xl bg-slate-50 border border-slate-100 shadow-sm">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Current Mission Phase</p>
                            <span className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black border uppercase ${STATUS_STYLES[effectiveDispatchStatus] || "bg-slate-100 text-slate-600"}`}>
                                <span className="h-2 w-2 rounded-full bg-current animate-pulse"></span>
                                {effectiveDispatchStatus}
                            </span>
                        </div>
                        <div className="md:col-span-2 p-5 rounded-3xl bg-slate-900 text-white shadow-xl flex items-center justify-between overflow-hidden relative group">
                            <div className="relative z-10">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-1">Deployment Timestamp</p>
                                <p className="text-lg font-bold tracking-tight">{formatTime(dispatch.createdAt)}</p>
                            </div>
                            <span className="material-symbols-outlined text-white/5 text-7xl absolute right-[-10px] bottom-[-10px] group-hover:scale-110 transition-transform">schedule</span>
                        </div>

                        {showTotalDelay ? (
                            <div className="p-5 rounded-3xl bg-amber-50 border border-amber-100 shadow-sm">
                                <p className="text-[10px] font-bold text-amber-500 uppercase tracking-widest mb-2">Delay Breakdown</p>
                                {/* Prefer stored values when available for more accurate historical display */}
                                {(() => {
                                    // Try numeric stored values first
                                    let displayStopOver: number | null = Number.isFinite(storedStopOverMinutes) ? storedStopOverMinutes : null;
                                    let displayIdle: number | null = Number.isFinite(storedIdleMinutes) ? storedIdleMinutes : null;
                                    let displayTotal: number | null = Number.isFinite(storedDelayMinutes) ? storedDelayMinutes : null;

                                    // If numeric stored values are missing, try parsing the computedDelayLabel string (e.g. "8m (0m+8m)")
                                    const labelText = String((sourceDispatch as any)?.computedDelayLabel || "");
                                    const parenthetical = labelText.match(/\(([^)]+)\)/)?.[1] || null;
                                    if (parenthetical) {
                                        const parts = parenthetical.split(/\s*\+\s*/);
                                        if (!displayStopOver && parts[0]) {
                                            const parsed = parseDurationString(parts[0]);
                                            if (Number.isFinite(parsed ?? NaN)) displayStopOver = parsed as number;
                                        }
                                        if (!displayIdle && parts[1]) {
                                            const parsed = parseDurationString(parts[1]);
                                            if (Number.isFinite(parsed ?? NaN)) displayIdle = parsed as number;
                                        }
                                    }

                                    // Fallback: try parsing the leading total from label (before parentheses)
                                    if (displayTotal == null && labelText) {
                                        const leading = labelText.split('(')[0].trim();
                                        const parsed = parseDurationString(leading);
                                        if (Number.isFinite(parsed ?? NaN)) displayTotal = parsed as number;
                                    }

                                    // Final fallbacks to computed/tracked values
                                    const finalStopOver = displayStopOver ?? stopOverTrackedMinutes;
                                    const finalIdle = displayIdle ?? idleTrackedMinutes;
                                    const finalTotal = displayTotal ?? (finalStopOver + finalIdle);

                                    return (
                                        <div>
                                            <p className="text-sm font-semibold text-amber-700">Stop Over: {formatDurationMinutes(finalStopOver)}</p>
                                            <p className="text-sm font-semibold text-amber-700 mt-1">Idle: {formatDurationMinutes(finalIdle)}</p>
                                            <p className="text-2xl font-black text-amber-800 mt-3">Total: {formatDurationMinutes(finalTotal)}</p>
                                        </div>
                                    );
                                })()}

                                {latestIdleEvent && (
                                    <p className="mt-2 text-[11px] text-amber-700/80">
                                        Last idle/break log at {formatTime(latestIdleEvent.timestamp)}
                                    </p>
                                )}
                            </div>
                        ) : null}
                    </div>

                    {/* Middle Row: Operational Location & Destination Info */}
                    <div className="flex flex-col lg:flex-row gap-8">
                        <div className="w-full lg:w-[400px] flex-shrink-0 rounded-3xl border border-slate-200 shadow-lg bg-slate-50 p-5">
                            <div className="flex items-center gap-2 mb-4">
                                <div className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
                                <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">
                                    {personnelReportLocation ? "Personnel Current Point" : "Target Location"}
                                </h3>
                            </div>

                            <div className="rounded-3xl bg-white border border-slate-200 p-5 shadow-sm space-y-4">
                                <div>
                                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-1">Current Coordinates</p>
                                    <p className="text-lg font-black text-slate-900">
                                        {currentCoordinates.lat.toFixed(6)}, {currentCoordinates.lng.toFixed(6)}
                                    </p>
                                </div>

                                <div>
                                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-1">Location Source</p>
                                    <p className="text-sm font-semibold text-slate-700">
                                        {personnelReportLocation ? "Latest personnel report" : "Dispatch target location"}
                                    </p>
                                </div>

                                <div className="rounded-2xl bg-emerald-50/70 border border-emerald-100 p-4">
                                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-600 mb-1">Label</p>
                                    <p className="text-sm font-bold text-slate-800">
                                        {currentLocationLabel}
                                    </p>
                                </div>

                                <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4">
                                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-1">Last Location Update</p>
                                    <p className="text-sm font-bold text-slate-800">
                                        {formatTime(dispatchUpdatedAt)}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Location Details Card */}
                        <div className="flex-1 space-y-6 flex flex-col justify-center">
                            <div className="space-y-4">
                                <div className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-emerald-500" style={{ fontSize: "1.5rem" }}>location_on</span>
                                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Destination Landmarks</h3>
                                </div>
                                <div className="p-6 rounded-3xl bg-emerald-50/50 border border-emerald-100 shadow-sm relative overflow-hidden">
                                    <div className="relative z-10">
                                        <p className="text-2xl font-black text-slate-900 leading-tight">{deliveryLocation?.label || "Coordinate Point Established"}</p>
                                        <p className="text-sm text-emerald-700 font-medium mt-2 flex items-center gap-2">
                                            <span className="material-symbols-outlined" style={{ fontSize: "1rem" }}>explore</span>
                                            {personnelReportLocation ? "Latest Personnel Report Location" : "Verified Strategic Landmark"}
                                        </p>
                                        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                                            <div className="rounded-xl border border-emerald-200 bg-white/90 p-2">
                                                <p className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Destination Coordinates</p>
                                                <p className="font-mono text-slate-700">{destinationCoordinates.lat.toFixed(6)}, {destinationCoordinates.lng.toFixed(6)}</p>
                                            </div>
                                            <div className="rounded-xl border border-blue-200 bg-white/90 p-2">
                                                <p className="text-[10px] font-black uppercase tracking-wider text-blue-700">Current Coordinates</p>
                                                <p className="font-mono text-slate-700">{currentCoordinates.lat.toFixed(6)}, {currentCoordinates.lng.toFixed(6)}</p>
                                            </div>
                                        </div>
                                        {loadingReportLocation ? (
                                            <p className="text-xs text-slate-500 mt-2">Loading personnel report coordinates...</p>
                                        ) : personnelReportLocation ? (
                                            <div className="mt-3 rounded-2xl border border-emerald-200 bg-white/80 p-3 text-xs text-slate-700 space-y-1">
                                                <p className="font-bold text-emerald-700 uppercase tracking-wider">{personnelReportLocation.reportKind}</p>
                                                <p>{personnelReportLocation.location.label || "Location from personnel update"}</p>
                                                <p className="font-mono">{personnelReportLocation.location.lat.toFixed(6)}, {personnelReportLocation.location.lng.toFixed(6)}</p>
                                                <p className="text-slate-500">Reported at: {formatTime(personnelReportLocation.timestamp)}</p>
                                                {personnelReportLocation.reportText ? (
                                                    <p className="italic text-slate-600">"{personnelReportLocation.reportText}"</p>
                                                ) : null}
                                            </div>
                                        ) : (
                                            <p className="text-xs text-slate-500 mt-2">No personnel delay/break location update found yet.</p>
                                        )}
                                    </div>
                                    <span className="material-symbols-outlined text-emerald-500/10 text-9xl absolute right-[-20px] top-[-20px]">map</span>
                                </div>
                            </div>

                            {/* Personnel & Vehicle Grid */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <div className="p-4 rounded-2xl bg-white border border-slate-100 shadow-sm flex items-center gap-4">
                                    <div className="h-12 w-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100 shadow-sm">
                                        <span className="material-symbols-outlined">person</span>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Commanding Officer</p>
                                        <p className="text-sm font-bold text-slate-700">{dispatch.officer}</p>
                                    </div>
                                </div>
                                <div className="p-4 rounded-2xl bg-white border border-slate-100 shadow-sm flex items-center gap-4">
                                    <div className="h-12 w-12 rounded-2xl bg-violet-50 text-violet-600 flex items-center justify-center border border-violet-100 shadow-sm">
                                        <span className="material-symbols-outlined">local_shipping</span>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Assigned Unit</p>
                                        <p className="text-sm font-bold text-slate-700">{dispatch.truck}</p>
                                    </div>
                                </div>
                                <div className="p-4 rounded-2xl bg-white border border-slate-100 shadow-sm flex items-center gap-4">
                                    <div className="h-12 w-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100 shadow-sm">
                                        <span className="material-symbols-outlined">tag</span>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">PO/Requisition ID</p>
                                        <p className="text-sm font-bold text-slate-700">{requisitionId}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Live Tracking Minimap and Report Coordinates */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between gap-3">
                            <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Truck Live Tracking Overview</h3>
                            <p className="text-[11px] font-semibold text-slate-500">
                                {movementPoints.length} movement points • {sortedTrackingEvents.length} tracked reports
                            </p>
                        </div>

                        {hasUnreadDelayNotifier && latestDelayEvent && (
                            <div className="rounded-2xl border border-red-300 bg-gradient-to-r from-red-50 to-rose-50 px-4 py-3 flex items-center justify-between gap-3 shadow-sm">
                                <div className="flex items-start gap-3">
                                    <span className="material-symbols-outlined text-red-600">notifications_active</span>
                                    <div>
                                        <p className="text-xs font-black uppercase tracking-[0.2em] text-red-700">New Delay Reported</p>
                                        <p className="text-sm text-red-800 font-semibold">
                                            Delay coordinate: {latestDelayEvent.location.lat.toFixed(6)}, {latestDelayEvent.location.lng.toFixed(6)}
                                        </p>
                                        <p className="text-xs text-red-700/80">Reported at {formatTime(latestDelayEvent.timestamp)}</p>
                                        {latestDelayReason && (
                                            <p className="text-xs text-red-700/80 font-semibold">
                                                Reason: {latestDelayReason}
                                            </p>
                                        )}
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setDelaySeenAtMs(latestDelayAtMs);
                                        setSelectedReportCategory("delay");
                                    }}
                                    className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-3 py-2 text-[11px] font-bold uppercase text-white hover:bg-red-700"
                                >
                                    <span className="material-symbols-outlined" style={{ fontSize: "0.95rem" }}>visibility</span>
                                    View Delay Logs
                                </button>
                            </div>
                        )}

                        {latestDelayEvent && !hasUnreadDelayNotifier && (
                            <div className="rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 px-4 py-3 flex items-center justify-between gap-3 shadow-sm">
                                <div className="flex items-start gap-3">
                                    <span className="material-symbols-outlined text-amber-600">schedule</span>
                                    <div>
                                        <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-700">Delay Report</p>
                                        <p className="text-sm text-amber-900 font-semibold">
                                            {latestDelayEvent.reportText || "Delay recorded"}
                                        </p>
                                        <p className="text-xs text-amber-700/80">Reported at {formatTime(latestDelayEvent.timestamp)}</p>
                                        {latestDelayReason && (
                                            <p className="text-xs text-amber-700/80 font-semibold">
                                                Reason: {latestDelayReason}
                                            </p>
                                        )}
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setSelectedReportCategory("delay")}
                                    className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-2 text-[11px] font-bold uppercase text-white hover:bg-amber-700"
                                >
                                    <span className="material-symbols-outlined" style={{ fontSize: "0.95rem" }}>visibility</span>
                                    View Delay Logs
                                </button>
                            </div>
                        )}

                        {latestDelayEvent && (
                            <div className="rounded-2xl border border-orange-300 bg-gradient-to-r from-orange-50 via-amber-50 to-amber-100 px-4 py-3 flex items-center justify-between gap-3 shadow-sm">
                                <div className="flex items-start gap-3">
                                    <span className="material-symbols-outlined text-orange-600">warning</span>
                                    <div>
                                        <p className="text-xs font-black uppercase tracking-[0.2em] text-orange-700">Delay Monitor</p>
                                        <p className="text-sm text-orange-900 font-bold">
                                            {latestDelayEvent.reportText || "Delay recorded"}
                                        </p>
                                        <p className="text-xs text-orange-700/80">
                                            Delay coordinate: {latestDelayEvent.location.lat.toFixed(6)}, {latestDelayEvent.location.lng.toFixed(6)}
                                        </p>
                                        <p className="text-xs text-orange-700/80">Reported at {formatTime(latestDelayEvent.timestamp)}</p>
                                        {latestDelayReason && (
                                            <p className="text-xs text-orange-800 font-semibold">
                                                Reason: {latestDelayReason}
                                            </p>
                                        )}
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setSelectedReportCategory("delay")}
                                    className="inline-flex items-center gap-1 rounded-lg bg-orange-600 px-3 py-2 text-[11px] font-bold uppercase text-white hover:bg-orange-700"
                                >
                                    <span className="material-symbols-outlined" style={{ fontSize: "0.95rem" }}>visibility</span>
                                    Open Delay Logs
                                </button>
                            </div>
                        )}

                        {stopOverMonitorEvent && (
                            <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-xs font-black uppercase tracking-[0.2em] text-sky-700">Stop Over Monitor</p>
                                    <p className="text-sm font-bold text-sky-900">
                                        {isStopOverActive ? "Currently on Stop Over" : "Latest Stop Over Session"}
                                    </p>
                                    <p className="text-xs text-sky-700/80">
                                        Duration tracked: {formatDurationMinutes(stopOverTrackedMinutes)} • Start {formatTime(stopOverMonitorEvent.timestamp)}
                                    </p>
                                    {stopOverReason && (
                                        <p className="text-xs text-sky-700/80">
                                            Reason: {stopOverReason}
                                        </p>
                                    )}
                                    {!isStopOverActive && stopOverEndedAtLabel && (
                                        <p className="text-xs text-sky-700/70">
                                            Ended at {stopOverEndedAtLabel}
                                        </p>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setSelectedReportCategory("stop-over")}
                                    className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-3 py-2 text-[11px] font-bold uppercase text-white hover:bg-sky-700"
                                >
                                    <span className="material-symbols-outlined" style={{ fontSize: "0.95rem" }}>schedule</span>
                                    Open Stop Over Logs
                                </button>
                            </div>
                        )}

                        <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-100 bg-slate-50">
                                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">Tracking Map</p>
                                <p className="text-[11px] font-medium text-slate-500">
                                    {movementPoints.length} movement points • {sortedTrackingEvents.length} tracked reports
                                </p>
                            </div>
                            <div className="min-h-[360px] aspect-[16/7] w-full">
                                {loadingTrackingOverview ? (
                                    <div className="h-full w-full bg-slate-100 animate-pulse flex items-center justify-center text-xs font-semibold text-slate-500">
                                        Loading truck movement map...
                                    </div>
                                ) : (
                                    <DispatchTrackingMiniMap
                                        movementPoints={movementPoints}
                                        reportEvents={trackingEvents}
                                        baseCampLocation={baseCampLocation}
                                        currentLocation={currentOperationalLocation || undefined}
                                        deliveryLocation={deliveryLocation}
                                    />
                                )}
                            </div>
                        </div>

                        <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">Report Coordinates Timeline</p>
                                <p className="text-[11px] font-medium text-slate-500">{selectedCategoryLabel}</p>
                            </div>

                            <div className="max-h-64 overflow-y-auto">
                                {filteredTrackingEvents.length === 0 ? (
                                    <p className="px-4 py-6 text-sm text-slate-500">No tracked report coordinates yet for this dispatch.</p>
                                ) : (
                                    <table className="w-full text-xs">
                                        <thead>
                                            <tr className="bg-slate-50 text-slate-500 uppercase tracking-wider">
                                                <th className="px-4 py-2 text-left">Report</th>
                                                <th className="px-4 py-2 text-left">Coordinates</th>
                                                <th className="px-4 py-2 text-left">Timestamp</th>
                                                <th className="px-4 py-2 text-left">Details</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {filteredTrackingEvents.map((event) => (
                                                <tr key={event.id} className="hover:bg-slate-50/70">
                                                    <td className="px-4 py-2 font-bold text-slate-700">{event.reportKind}</td>
                                                    <td className="px-4 py-2 font-mono text-slate-700">
                                                        {event.location.lat.toFixed(6)}, {event.location.lng.toFixed(6)}
                                                    </td>
                                                    <td className="px-4 py-2 text-slate-600">{formatTime(event.timestamp)}</td>
                                                    <td className="px-4 py-2 text-slate-600">{event.reportText || "-"}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Supplies */}
                    <div className="space-y-3">
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest border-l-2 border-amber-500 pl-2">Inventory Loadout</h3>
                        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-left">
                                        <th className="px-4 py-3">Category</th>
                                        <th className="px-4 py-3">Item Name</th>
                                        <th className="px-4 py-3 text-right">Quantity</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {dispatch.supplies?.length > 0 ? dispatch.supplies.map((s, idx) => (
                                        <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                                            <td className="px-4 py-3 font-medium text-slate-500">{resolveSupplyClassLabel(s, itemClassLookup)}</td>
                                            <td className="px-4 py-3 font-bold text-slate-700">{s.item}</td>
                                            <td className="px-4 py-3 text-right">
                                                <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-700 font-bold text-xs ring-1 ring-emerald-200">
                                                    x{s.quantity}
                                                </span>
                                            </td>
                                        </tr>
                                    )) : (
                                        <tr>
                                            <td colSpan={3} className="px-4 py-8 text-center text-slate-400 italic">No specific supplies listed</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                            {dispatch.othersNote && (
                                <div className="px-4 py-4 bg-amber-50/50 border-t border-amber-100">
                                    <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest mb-1">Additional Notes</p>
                                    <p className="text-sm text-slate-600 italic leading-relaxed">"{dispatch.othersNote}"</p>
                                </div>
                            )}
                        </div>
                    </div>

                </div>

                {/* Footer */}
                <div className="border-t border-slate-100 bg-slate-50 px-6 py-4 flex justify-between items-center gap-3 flex-shrink-0">
                    <div className="flex items-center gap-2">
                        {canComplete && (
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-xl">
                                <span className="material-symbols-outlined text-emerald-600 text-sm">check_circle</span>
                                <span className="text-xs font-bold text-emerald-700">Ready to Complete</span>
                            </div>
                        )}
                        {effectiveDispatchStatus === "Completed" && (
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-xl">
                                <span className="material-symbols-outlined text-emerald-600 text-sm">task_alt</span>
                                <span className="text-xs font-bold text-emerald-700">Already Completed</span>
                            </div>
                        )}
                        {effectiveDispatchStatus === "Delivered" && (
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-cyan-50 border border-cyan-200 rounded-xl">
                                <span className="material-symbols-outlined text-cyan-600 text-sm">local_shipping</span>
                                <span className="text-xs font-bold text-cyan-700">Delivered</span>
                            </div>
                        )}
                        {effectiveDispatchStatus === "Successful Dispatch" && (
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-xl">
                                <span className="material-symbols-outlined text-emerald-600 text-sm">verified</span>
                                <span className="text-xs font-bold text-emerald-700">Successful Dispatch</span>
                            </div>
                        )}
                        {isParked && (
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 border border-slate-300 rounded-xl">
                                <span className="material-symbols-outlined text-slate-600 text-sm">local_parking</span>
                                <span className="text-xs font-bold text-slate-700">Parked</span>
                            </div>
                        )}
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={handleExportDispatch}
                            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 text-white font-bold text-sm shadow-lg hover:from-emerald-600 hover:to-green-700 transition-all active:scale-95 flex items-center gap-2"
                        >
                            <span className="material-symbols-outlined text-sm">download</span>
                            Export Dispatch
                        </button>
                        <button
                            onClick={handleOpenDispatchChat}
                            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-bold text-sm shadow-lg hover:from-blue-600 hover:to-indigo-700 transition-all active:scale-95 flex items-center gap-2"
                        >
                            <span className="material-symbols-outlined text-sm">chat</span>
                            Open Chat
                        </button>
                        {canCancel && (
                            <button
                                onClick={handleCancelDispatch}
                                disabled={canceling || completing}
                                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-rose-500 to-red-600 text-white font-bold text-sm shadow-lg hover:from-rose-600 hover:to-red-700 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                {canceling ? (
                                    <>
                                        <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
                                        Cancelling...
                                    </>
                                ) : (
                                    <>
                                        <span className="material-symbols-outlined text-sm">cancel</span>
                                        Cancel Dispatch
                                    </>
                                )}
                            </button>
                        )}
                        {canComplete && (
                            <button
                                onClick={handleCompleteDelivery}
                                disabled={completing}
                                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 text-white font-bold text-sm shadow-lg hover:from-emerald-600 hover:to-green-700 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                {completing ? (
                                    <>
                                        <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
                                        Processing...
                                    </>
                                ) : (
                                    <>
                                        <span className="material-symbols-outlined text-sm">check_circle</span>
                                        Complete Delivery
                                    </>
                                )}
                            </button>
                        )}
                        {canConfirmDelivery && (
                            <button
                                onClick={handleOpenProofModal}
                                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold text-sm shadow-lg hover:from-emerald-600 hover:to-teal-700 transition-all active:scale-95 flex items-center gap-2"
                            >
                                <span className="material-symbols-outlined text-sm">verified</span>
                                Confirm Delivery
                            </button>
                        )}
                        {canViewProof && (
                            <button
                                onClick={handleOpenProofModal}
                                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-600 text-white font-bold text-sm shadow-lg hover:from-teal-600 hover:to-cyan-700 transition-all active:scale-95 flex items-center gap-2"
                            >
                                <span className="material-symbols-outlined text-sm">image</span>
                                View Proof
                            </button>
                        )}
                        {canMarkAsParked && (
                            <button
                                onClick={handleMarkAsParked}
                                disabled={markingParked}
                                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-slate-500 to-slate-700 text-white font-bold text-sm shadow-lg hover:from-slate-600 hover:to-slate-800 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                {markingParked ? (
                                    <>
                                        <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
                                        Marking...
                                    </>
                                ) : (
                                    <>
                                        <span className="material-symbols-outlined text-sm">local_parking</span>
                                        Mark as Parked
                                    </>
                                )}
                            </button>
                        )}
                        <button
                            onClick={onClose}
                            className="px-6 py-2.5 rounded-xl bg-slate-900 text-white font-bold text-sm shadow-lg hover:bg-black transition-all active:scale-95"
                        >
                            Close
                        </button>
                    </div>
                </div>
            </div>

            <style jsx>{`
        @keyframes fade-in {
          from { opacity: 0; transform: scale(0.95) translateY(10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>
        </div>
        </>
    );
}
