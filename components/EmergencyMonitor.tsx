"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { collection, query, onSnapshot, orderBy, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import TICEmergencyModal from "./TICEmergencyModal";

interface EmergencyReport {
  id: string;
  senderId?: string;
  senderName?: string;
  reportedBy?: string;
  location: { lat: number; lng: number; label?: string };
  description: string;
  imageUrl?: string;
  timestamp: any;
  status?: string;
  type?: string;
  dispatchId?: string;
}

export default function EmergencyMonitor() {
  const { user } = useAuth();
  const pathname = usePathname();
  const [emergencyReport, setEmergencyReport] = useState<EmergencyReport | null>(null);
  const [dismissedEmergencies, setDismissedEmergencies] = useState<Set<string>>(new Set());

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
        id: doc.id,
        ...(doc.data() as Omit<EmergencyReport, "id">),
      }));

      // Find the first emergency report that hasn't been dismissed
      const activeEmergency = allReports.find(
        (report) => !dismissedEmergencies.has(report.id)
      );

      if (activeEmergency) {
        setEmergencyReport(activeEmergency);
      } else {
        setEmergencyReport(null);
      }
    });

    return () => unsubscribe();
  }, [user, pathname, dismissedEmergencies]);

  const handleClose = () => {
    if (emergencyReport) {
      // Add to dismissed list so it doesn't pop up again until page refresh
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
      location={emergencyReport.location}
      description={emergencyReport.description}
      imageUrl={emergencyReport.imageUrl}
    />
  );
}
