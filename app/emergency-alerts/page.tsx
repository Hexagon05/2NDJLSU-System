"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useState, useEffect } from "react";
import Image from "next/image";
import TICEmergencyModal from "@/components/TICEmergencyModal";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  where,
  Timestamp,
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

  // Fetch all emergency reports from Firebase
  useEffect(() => {
    if (!user) return;

    // Query all EmergencyReports (no status filter since mobile app may not set it)
    const q = query(
      collection(db, "EmergencyReports"),
      orderBy("timestamp", "desc")
    );

    const unsub = onSnapshot(q, (snap) => {
      const reports = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<EmergencyReport, "id">),
      }));
      
      setEmergencyReports(reports);
    });

    return () => unsub();
  }, [user]);

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
    activeEmergencies: emergencyReports.length, // All emergency reports are considered active
  };

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-100 to-slate-200">
      {/* Emergency Detail Modal - Show when emergency report is clicked */}
      {selectedReport && (
        <TICEmergencyModal
          onClose={() => setSelectedReport(null)}
          truckCodename={selectedReport.type || "EMERGENCY"}
          personnelName={selectedReport.senderName || selectedReport.reportedBy || "Field Personnel"}
          emergencyReportId={selectedReport.id}
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
                <span className="absolute top-1.5 right-1.5 h-2.5 w-2.5 bg-rose-500 rounded-full animate-pulse ring-2 ring-white"></span>
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
          {/* Stats Grid */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
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
                  <p className="text-sm font-medium text-white/70">Reporting Personnel</p>
                  <p className="mt-2 text-4xl font-bold">{new Set(emergencyReports.map(r => r.senderId)).size}</p>
                </div>
                <div className="rounded-2xl bg-white/10 p-3 backdrop-blur-sm">
                  <span className="material-symbols-outlined text-white/80" style={{ fontSize: "2rem" }}>groups</span>
                </div>
              </div>
            </div>
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
                  {emergencyReports.length === 0 ? (
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
                    emergencyReports.map((report) => (
                      <tr key={report.id} className="hover:bg-red-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="font-mono text-xs font-bold text-slate-500">
                              #{report.id.slice(-6).toUpperCase()}
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
                          <span className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold uppercase bg-red-100 text-red-700 border-red-300 animate-pulse">
                            <span className="mr-1.5 h-2 w-2 rounded-full bg-red-500"></span>
                            {report.status || "ACTIVE"}
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
                          <button
                            onClick={() => setSelectedReport(report)}
                            className="flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-100 transition-colors border border-red-200 hover:border-red-300"
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: "1rem" }}>chat</span>
                            Respond
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
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
