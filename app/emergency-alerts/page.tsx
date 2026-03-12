"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import TICEmergencyModal from "@/components/TICEmergencyModal";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  Timestamp,
  doc,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

interface EmergencyReport {
  id: string;
  senderId?: string;
  senderName?: string;
  reportedBy?: string; // Alternative field name from mobile app
  location: { lat: number; lng: number; label?: string };
  description: string;
  imageUrl?: string;
  timestamp: Timestamp | null;
  status?: string;
  type?: string;
  dispatchId?: string;
}

export default function EmergencyAlerts() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selectedReport, setSelectedReport] = useState<EmergencyReport | null>(null);
  const [emergencyReports, setEmergencyReports] = useState<EmergencyReport[]>([]);
  const [seenReportIds, setSeenReportIds] = useState<Set<string>>(new Set());
  const prevReportsCount = useRef(0);

  // Fetch all emergency reports from Firebase
  useEffect(() => {
    if (!user) return;

    // Query all EmergencyReports (no status filter since mobile app may not set it)
    const q = query(
      collection(db, "EmergencyReports"),
      orderBy("timestamp", "desc")
    );

    const unsub = onSnapshot(q, (snap) => {
      console.log("📚 Raw Firestore snapshot - docs count:", snap.docs.length);
      
      const reports = snap.docs.map((d) => {
        const data = d.data();
        const reportId = d.id;
        console.log("📝 Processing doc - ID:", reportId, "Exists:", d.exists());
        
        return {
          ...data as Omit<EmergencyReport, "id">,
          id: reportId, // Must be AFTER spread to prevent overwriting
        };
      });
      
      // Check for duplicate IDs (debugging)
      const ids = reports.map(r => r.id);
      const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
      if (duplicates.length > 0) {
        console.warn("⚠️ Duplicate emergency report IDs found:", duplicates);
      }
      
      // Log all report IDs for debugging
      console.log("📋 Loaded emergency reports:", reports.length);
      reports.forEach((r, idx) => {
        console.log(`  [${idx}] ID: "${r.id}", Type: ${typeof r.id}, Valid: ${!!r.id}, Length: ${r.id?.length}`);
      });
      
      setEmergencyReports(reports);
    });

    return () => unsub();
  }, [user]);

  // Auto-open modal for new emergency reports
  useEffect(() => {
    if (emergencyReports.length === 0) return;
    
    // Don't auto-open if modal is already open
    if (selectedReport !== null) {
      console.log("🚫 Skipping auto-open - modal already open");
      return;
    }
    
    // Check if there's a new report (not in seen list and not resolved)
    const unseenReports = emergencyReports.filter(report => 
      report.id && !seenReportIds.has(report.id) && report.status !== 'resolved'
    );
    
    if (unseenReports.length > 0 && emergencyReports.length > prevReportsCount.current) {
      // New emergency report detected! Auto-open the modal
      const newestReport = unseenReports[0]; // Already sorted by timestamp desc
      
      if (!newestReport.id) {
        console.error("❌ Cannot auto-open report without ID:", newestReport);
        return;
      }
      
      console.log("🚨 NEW EMERGENCY REPORT DETECTED:", newestReport.id);
      console.log("📋 Report details:", {
        type: newestReport.type,
        sender: newestReport.senderName || newestReport.reportedBy,
        dispatchId: newestReport.dispatchId,
        location: newestReport.location?.label
      });
      
      setSelectedReport(newestReport);
      setSeenReportIds(prev => new Set([...prev, newestReport.id]));
      
      // Optional: Play notification sound
      try {
        const audio = new Audio('/notification.mp3');
        audio.play().catch(e => console.log("Could not play sound:", e));
      } catch (e) {
        console.log("Audio not available");
      }
    }
    
    prevReportsCount.current = emergencyReports.length;
  }, [emergencyReports, seenReportIds, selectedReport]);

  // Mark report as seen when manually opened
  const handleReportClick = (report: EmergencyReport) => {
    console.log("👆 Report clicked manually - ID:", report.id, "Current modal state:", selectedReport?.id);
    
    if (!report.id) {
      console.error("❌ Cannot open report without ID:", report);
      alert("Error: This report has no ID. Please refresh the page.");
      return;
    }
    
    // Prevent opening if this report is already open
    if (selectedReport?.id === report.id) {
      console.log("🚫 Report already open, skipping");
      return;
    }
    
    setSelectedReport(report);
    setSeenReportIds(prev => new Set([...prev, report.id]));
  };

  // Resolve an emergency report
  const handleResolveReport = async (reportId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    console.log("🔍 handleResolveReport called with:", { 
      reportId, 
      type: typeof reportId, 
      length: reportId?.length,
      isEmpty: reportId === '',
      isUndefined: reportId === undefined,
      isNull: reportId === null
    });
    
    if (!reportId || typeof reportId !== 'string' || reportId.trim() === '') {
      console.error("❌ Invalid report ID:", reportId);
      alert("Cannot resolve: Invalid report ID. Please refresh the page and try again.");
      return;
    }
    
    const confirmed = confirm(
      "Are you sure you want to mark this emergency as RESOLVED? This will update the status."
    );

    if (!confirmed) return;

    try {
      console.log("✅ Resolving emergency report:", reportId);
      console.log("📍 Document path:", `EmergencyReports/${reportId}`);
      
      const reportRef = doc(db, "EmergencyReports", reportId);
      await updateDoc(reportRef, {
        status: "resolved",
        resolvedAt: Timestamp.now(),
        resolvedBy: user?.uid,
      });
      
      console.log("✅ Emergency resolved successfully");
    } catch (error: any) {
      console.error("❌ Error resolving emergency:", error);
      console.error("❌ Error code:", error?.code);
      console.error("❌ Report ID was:", reportId);
      alert(`Failed to resolve emergency: ${error?.message || "Unknown error"}`);
    }
  };

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
    { name: "Dashboard", icon: "dashboard", href: "/dashboard", active: false },
    { name: "Personnels", icon: "groups", href: "/personnels", active: false },
    { name: "Vehicle", icon: "local_shipping", href: "/vehicle", active: false },
    { name: "Emergency Alerts", icon: "emergency", href: "/emergency-alerts", active: true },
    { name: "History", icon: "history", href: "/history", active: false },
  ];

  const formatTimestamp = (ts: Timestamp | null): string => {
    if (!ts) return "—";
    return ts.toDate().toLocaleString("en-PH", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getTimeElapsed = (timestamp: Timestamp | null): string => {
    if (!timestamp) return "—";
    const now = new Date();
    const date = timestamp.toDate();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ${diffHours % 24}h ago`;
  };

  // Calculate stats
  const stats = {
    totalEmergencies: emergencyReports.length,
    activeEmergencies: emergencyReports.filter(r => r.status !== 'resolved').length,
    resolvedEmergencies: emergencyReports.filter(r => r.status === 'resolved').length,
  };
  
  // Count unseen reports
  const unseenCount = emergencyReports.filter(report => report.id && !seenReportIds.has(report.id) && report.status !== 'resolved').length;

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-100 to-slate-200">
      {/* Emergency Detail Modal - Show when emergency report is clicked */}
      {selectedReport && (
        <TICEmergencyModal
          onClose={() => setSelectedReport(null)}
          truckCodename={selectedReport.type || "EMERGENCY"}
          personnelName={selectedReport.senderName || selectedReport.reportedBy || "Field Personnel"}
          emergencyReportId={selectedReport.id}
          dispatchId={selectedReport.dispatchId}
          location={selectedReport.location}
          description={selectedReport.description}
          imageUrl={selectedReport.imageUrl}
        />
      )}

      {/* Sidebar */}
      <div
        className={`${
          sidebarOpen ? "w-64" : "w-20"
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
              onClick={() => setSidebarOpen((prev: boolean) => !prev)}
              className="rounded-lg p-1.5 hover:bg-slate-700 transition-colors text-slate-400 hover:text-white flex-shrink-0"
            >
              <span className="material-symbols-outlined" style={{ fontSize: "1.25rem" }}>menu_open</span>
            </button>
          )}
        </div>
        {!sidebarOpen && (
          <button
            onClick={() => setSidebarOpen((prev: boolean) => !prev)}
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
              className={`flex items-center rounded-xl transition-all duration-200 ${
                sidebarOpen ? "gap-3 px-4 py-4" : "justify-center px-2 py-4"
              } ${
                item.active
                  ? "bg-gradient-to-r from-rose-500/20 to-rose-500/5 text-rose-400 border border-rose-500/30 shadow-md"
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
            className={`flex w-full items-center rounded-xl py-4 text-slate-400 hover:bg-rose-500/10 hover:text-rose-400 transition-all duration-200 border border-transparent hover:border-rose-500/20 ${
              sidebarOpen ? 'gap-3 px-4' : 'justify-center px-2'
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
              <span className="material-symbols-outlined text-rose-600" style={{ fontSize: "1.75rem" }}>emergency</span>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Emergency Alerts</h1>
            </div>
            <div className="flex items-center gap-3">
              <button className="relative p-2.5 hover:bg-slate-100 rounded-xl transition-colors group">
                <span className="material-symbols-outlined text-slate-500 group-hover:text-slate-700" style={{ fontSize: "1.5rem" }}>notifications</span>
                {unseenCount > 0 && (
                  <>
                    <span className="absolute top-1.5 right-1.5 h-2.5 w-2.5 bg-rose-500 rounded-full animate-pulse ring-2 ring-white"></span>
                    <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold ring-2 ring-white">
                      {unseenCount}
                    </span>
                  </>
                )}
              </button>
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
        <main className="flex-1 overflow-auto p-6 flex flex-col gap-6">
          {/* New Emergency Alert Banner */}
          {unseenCount > 0 && (
            <div className="bg-gradient-to-r from-yellow-500 to-orange-500 rounded-2xl p-4 shadow-xl text-white border-4 border-yellow-300 animate-pulse">
              <div className="flex items-center gap-4">
                <div className="flex-shrink-0">
                  <span className="material-symbols-outlined text-white text-5xl animate-bounce">priority_high</span>
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-black uppercase tracking-wide">⚠️ New Emergency Alert!</h3>
                  <p className="text-sm font-semibold text-white/90 mt-1">
                    {unseenCount} {unseenCount === 1 ? 'new emergency report' : 'new emergency reports'} requiring immediate attention
                  </p>
                </div>
                <div className="flex-shrink-0">
                  <button 
                    onClick={() => unseenCount > 0 && handleReportClick(emergencyReports.find(r => !seenReportIds.has(r.id))!)}
                    className="px-6 py-3 bg-white text-orange-600 font-bold rounded-xl hover:bg-yellow-50 transition-all shadow-lg"
                  >
                    View Now
                  </button>
                </div>
              </div>
            </div>
          )}
          
          {/* Stats Grid */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="bg-gradient-to-br from-red-600 to-rose-700 rounded-2xl p-6 shadow-xl shadow-red-500/30 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white/70">Active Emergencies</p>
                  <p className="mt-2 text-4xl font-bold">{stats.activeEmergencies}</p>
                </div>
                <div className="rounded-2xl bg-white/10 p-3 backdrop-blur-sm">
                  <span className="material-symbols-outlined text-white/80" style={{ fontSize: "2rem" }}>crisis_alert</span>
                </div>
              </div>
            </div>
            <div className="bg-gradient-to-br from-orange-600 to-red-700 rounded-2xl p-6 shadow-xl shadow-orange-500/30 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white/70">Total Emergency Reports</p>
                  <p className="mt-2 text-4xl font-bold">{stats.totalEmergencies}</p>
                </div>
                <div className="rounded-2xl bg-white/10 p-3 backdrop-blur-sm">
                  <span className="material-symbols-outlined text-white/80" style={{ fontSize: "2rem" }}>emergency</span>
                </div>
              </div>
            </div>
            <div className="bg-gradient-to-br from-violet-600 to-purple-700 rounded-2xl p-6 shadow-xl shadow-violet-500/30 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white/70">Unique Personnel</p>
                  <p className="mt-2 text-4xl font-bold">{new Set(emergencyReports.map(r => r.senderId)).size}</p>
                </div>
                <div className="rounded-2xl bg-white/10 p-3 backdrop-blur-sm">
                  <span className="material-symbols-outlined text-white/80" style={{ fontSize: "2rem" }}>group</span>
                </div>
              </div>
            </div>
            <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl p-6 shadow-xl shadow-green-500/30 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white/70">Resolved Emergencies</p>
                  <p className="mt-2 text-4xl font-bold">{stats.resolvedEmergencies}</p>
                </div>
                <div className="rounded-2xl bg-white/10 p-3 backdrop-blur-sm">
                  <span className="material-symbols-outlined text-white/80" style={{ fontSize: "2rem" }}>task_alt</span>
                </div>
              </div>
            </div>
            {unseenCount > 0 && (
              <div className="bg-gradient-to-br from-yellow-500 to-amber-600 rounded-2xl p-6 shadow-xl shadow-yellow-500/30 text-white animate-pulse">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-white/70">New/Unseen Reports</p>
                    <p className="mt-2 text-4xl font-bold">{unseenCount}</p>
                  </div>
                  <div className="rounded-2xl bg-white/10 p-3 backdrop-blur-sm">
                    <span className="material-symbols-outlined text-white/80" style={{ fontSize: "2rem" }}>notification_important</span>
                  </div>
                </div>
              </div>
            )}

          </div>

          {/* Emergency Reports Table */}
          <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-red-50 to-rose-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-red-600" style={{ fontSize: "1.5rem" }}>emergency</span>
                  <h2 className="text-lg font-bold text-slate-900">Emergency Reports</h2>
                </div>
                <div className="text-xs text-slate-500 font-medium">
                  {emergencyReports.length} {emergencyReports.length === 1 ? 'report' : 'reports'}
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gradient-to-r from-slate-50 to-slate-100 border-b-2 border-slate-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Report ID</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Personnel</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Type</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Description</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Location</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Time</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {emergencyReports.filter(r => r.status !== 'resolved').length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-12 text-center">
                        <div className="flex flex-col items-center justify-center text-slate-400">
                          <span className="material-symbols-outlined mb-2" style={{ fontSize: "3rem" }}>emergency_share</span>
                          <p className="text-sm font-semibold">No active emergency reports</p>
                          <p className="text-xs mt-1">Emergency reports from field personnel will appear here</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    emergencyReports.filter(r => r.status !== 'resolved').map((report, index) => {
                      const isNew = !seenReportIds.has(report.id);
                      return (
                        <tr 
                          key={report.id || `report-${index}`} 
                          className={`hover:bg-red-50/50 transition-colors ${isNew ? 'bg-yellow-50/50 border-l-4 border-yellow-500' : ''}`}
                        >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            {isNew && (
                              <span className="flex items-center gap-1 px-2 py-0.5 bg-yellow-500 text-white text-xs font-black rounded-full animate-pulse">
                                NEW
                              </span>
                            )}
                            <div className="flex flex-col">
                              <span className="font-mono text-xs font-bold text-slate-500">
                                #{report.id ? report.id.slice(-6).toUpperCase() : 'N/A'}
                              </span>
                              <span className="text-xs text-slate-400 mt-1">
                                {formatTimestamp(report.timestamp)}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-blue-600" style={{ fontSize: "1.25rem" }}>
                              person
                            </span>
                            <span className="text-sm font-semibold text-slate-900">{report.senderName || report.reportedBy || "Unknown"}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold uppercase bg-rose-100 text-rose-700 border-rose-300">
                            {report.type || "EMERGENCY"}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold uppercase ${
                            report.status === 'resolved' 
                              ? 'bg-green-100 text-green-700 border-green-300'
                              : 'bg-red-100 text-red-700 border-red-300 animate-pulse'
                          }`}>
                            {report.status !== 'resolved' && <span className="mr-1.5 h-2 w-2 rounded-full bg-red-500"></span>}
                            {report.status === 'resolved' ? 'RESOLVED' : (report.status || "ACTIVE").toUpperCase()}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="max-w-xs">
                            <span className="text-xs text-slate-600 line-clamp-2">{report.description || "No description provided"}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-start gap-1.5 max-w-xs">
                            <span className="material-symbols-outlined text-red-500 flex-shrink-0" style={{ fontSize: "1rem" }}>
                              location_on
                            </span>
                            <div className="flex flex-col">
                              <span className="text-xs text-slate-600 line-clamp-2">{report.location?.label || "Unknown location"}</span>
                              <span className="text-xs text-slate-400 mt-0.5">
                                {report.location?.lat.toFixed(4)}°, {report.location?.lng.toFixed(4)}°
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-xs font-medium text-slate-700">
                            {getTimeElapsed(report.timestamp)}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleReportClick(report)}
                              className="flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-100 transition-colors border border-red-200 hover:border-red-300"
                            >
                              <span className="material-symbols-outlined" style={{ fontSize: "1rem" }}>chat</span>
                              Respond
                            </button>
                            {report.status !== 'resolved' && report.id && (
                              <button
                                onClick={(e) => {
                                  console.log("🔘 Resolve button clicked for report:", report.id, "Type:", typeof report.id);
                                  if (!report.id) {
                                    alert("Error: Report has no ID. Please refresh the page.");
                                    return;
                                  }
                                  handleResolveReport(report.id, e);
                                }}
                                className="flex items-center gap-1.5 rounded-lg bg-green-50 px-3 py-2 text-xs font-bold text-green-700 hover:bg-green-100 transition-colors border border-green-200 hover:border-green-300"
                              >
                                <span className="material-symbols-outlined" style={{ fontSize: "1rem" }}>check_circle</span>
                                Resolve
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Resolved Emergency Reports Table */}
          {stats.resolvedEmergencies > 0 && (
            <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-green-50 to-emerald-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-green-600" style={{ fontSize: "1.5rem" }}>task_alt</span>
                    <h2 className="text-lg font-bold text-slate-900">Resolved Emergencies</h2>
                  </div>
                  <div className="text-xs text-slate-500 font-medium">
                    {stats.resolvedEmergencies} {stats.resolvedEmergencies === 1 ? 'report' : 'reports'}
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gradient-to-r from-slate-50 to-slate-100 border-b-2 border-slate-200">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Report ID</th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Personnel</th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Type</th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Description</th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Location</th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Time</th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {emergencyReports.filter(r => r.status === 'resolved').map((report, index) => (
                      <tr 
                        key={report.id || `resolved-report-${index}`} 
                        className="hover:bg-green-50/50 transition-colors"
                      >
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="font-mono text-xs font-bold text-slate-500">
                              #{report.id ? report.id.slice(-6).toUpperCase() : 'N/A'}
                            </span>
                            <span className="text-xs text-slate-400 mt-1">
                              {formatTimestamp(report.timestamp)}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-blue-600" style={{ fontSize: "1.25rem" }}>
                              person
                            </span>
                            <span className="text-sm font-semibold text-slate-900">{report.senderName || report.reportedBy || "Unknown"}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold uppercase bg-rose-100 text-rose-700 border-rose-300">
                            {report.type || "EMERGENCY"}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold uppercase bg-green-100 text-green-700 border-green-300">
                            <span className="mr-1.5 h-2 w-2 rounded-full bg-green-500"></span>
                            RESOLVED
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="max-w-xs">
                            <span className="text-xs text-slate-600 line-clamp-2">{report.description || "No description provided"}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-start gap-1.5 max-w-xs">
                            <span className="material-symbols-outlined text-green-500 flex-shrink-0" style={{ fontSize: "1rem" }}>
                              location_on
                            </span>
                            <div className="flex flex-col">
                              <span className="text-xs text-slate-600 line-clamp-2">{report.location?.label || "Unknown location"}</span>
                              <span className="text-xs text-slate-400 mt-0.5">
                                {report.location?.lat.toFixed(4)}°, {report.location?.lng.toFixed(4)}°
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-xs font-medium text-slate-700">
                            {getTimeElapsed(report.timestamp)}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <button
                            onClick={() => handleReportClick(report)}
                            className="flex items-center gap-1.5 rounded-lg bg-green-50 px-3 py-2 text-xs font-bold text-green-700 hover:bg-green-100 transition-colors border border-green-200 hover:border-green-300"
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: "1rem" }}>visibility</span>
                            View Details
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>

      <style jsx>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.4s ease-out forwards;
          opacity: 0;
        }
      `}</style>
    </div>
  );
}
