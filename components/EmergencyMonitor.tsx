"use client";

import { useState, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { collection, query, onSnapshot, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import TICEmergencyModal from "./TICEmergencyModal";
import { dismissEmergencyId, getDismissedEmergencyIds } from "@/lib/emergency-dismissal";

interface EmergencyReport {
  id: string;
  senderId?: string;
  senderName?: string;
  reportedBy?: string;
  location?: { lat: number; lng: number; label?: string };
  currentLocation?: { lat: number; lng: number; label?: string };
  reportLocation?: { lat: number; lng: number; label?: string };
  emergencyLocation?: { lat: number; lng: number; label?: string };
  description: string;
  imageUrl?: string;
  timestamp: any;
  status?: string;
  isResolved?: boolean;
  type?: string;
  dispatchId?: string;
}

export default function EmergencyMonitor() {
  const { user } = useAuth();
  const pathname = usePathname();
  const [emergencyReport, setEmergencyReport] = useState<EmergencyReport | null>(null);
  const [dismissedEmergencies, setDismissedEmergencies] = useState<Set<string>>(() => getDismissedEmergencyIds());
  const emergencyReportRef = useRef<EmergencyReport | null>(null);

  const isEmergencyResolved = (report?: Pick<EmergencyReport, "isResolved" | "status"> | null) =>
    report?.isResolved === true || (report?.status || "").trim().toLowerCase() === "resolved";

  const toNumber = (value: unknown): number | null => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number(value.trim());
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  };

  const extractEmergencyLocation = (entry: any): EmergencyReport["location"] | undefined => {
    if (!entry || typeof entry !== "object") return undefined;

    const sourceObjects = [
      entry.currentLocation,
      entry.reportLocation,
      entry.emergencyLocation,
      entry.CurrentLocation,
      entry.coordinates,
      entry.location,
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

    return undefined;
  };

  useEffect(() => {
    emergencyReportRef.current = emergencyReport;
  }, [emergencyReport]);

  useEffect(() => {
    // Don't show emergency on login page or if user not authenticated
    if (!user || pathname === "/login") return;

    // Listen to all emergency reports in real-time
    const q = query(
      collection(db, "EmergencyReports"),
      orderBy("timestamp", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allReports = snapshot.docs.map((doc) => ({
        ...(doc.data() as Omit<EmergencyReport, "id">),
        // Keep the actual Firestore document ID as source of truth.
        id: doc.id,
        location: extractEmergencyLocation(doc.data()) || (doc.data() as any).location,
      }));

      const currentReport = emergencyReport
        ? allReports.find((report) => report.id === emergencyReportRef.current?.id) || emergencyReportRef.current
        : null;

      // Filter to only active (non-resolved) emergencies that have not already been dismissed.
      const activeReports = allReports.filter(
        (report) => !isEmergencyResolved(report) && !dismissedEmergencies.has(report.id)
      );

      // Find the first active emergency report that hasn't been dismissed
      const activeEmergency = activeReports.find(
        (report) => !dismissedEmergencies.has(report.id)
      );

      if (currentReport && !dismissedEmergencies.has(currentReport.id)) {
        setEmergencyReport(currentReport);
      } else if (activeEmergency) {
        setEmergencyReport(activeEmergency);
      } else {
        setEmergencyReport(null);
      }
    });

    return () => unsubscribe();
  }, [user, pathname, dismissedEmergencies]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem("dismissedEmergencyReportIds", JSON.stringify(Array.from(dismissedEmergencies)));
  }, [dismissedEmergencies]);

  const handleClose = () => {
    if (emergencyReport) {
      dismissEmergencyId(emergencyReport.id);
      setDismissedEmergencies((prev) => new Set(prev).add(emergencyReport.id));
    }
    setEmergencyReport(null);
  };

  // Don't render anything if no emergency, user not logged in, or on login page
  if (!user || !emergencyReport || pathname === "/login") {
    return null;
  }

  return (
    <TICEmergencyModal
      onClose={handleClose}
      truckCodename={emergencyReport.type || "EMERGENCY"}
      personnelName={emergencyReport.senderName || emergencyReport.reportedBy || "Field Personnel"}
      emergencyReportId={emergencyReport.id}
      dispatchId={emergencyReport.dispatchId}
      location={emergencyReport.location}
      description={emergencyReport.description}
      imageUrl={emergencyReport.imageUrl}
      isResolved={isEmergencyResolved(emergencyReport)}
    />
  );
}
