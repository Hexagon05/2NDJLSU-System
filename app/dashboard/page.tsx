"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useState, useEffect } from "react";
import { OpenStreetMap } from "@/components/OpenStreetMap";
import DispatchModal from "@/components/DispatchModal";
import DispatchDetailModal from "@/components/DispatchDetailModal";
import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  Timestamp,
  where,
  getDocs,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

interface Dispatch {
  id: string;
  dispatchId: string;
  officer: string;
  personnels: string;
  truck: string;
  status: string;
  location: { lat: number; lng: number; label: string };
  supplies: { category: string; item: string; quantity: number }[];
  createdAt: Timestamp | null;
}

function formatTime(ts: Timestamp | null): string {
  if (!ts) return "—";
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
  "In Transit":
    "bg-blue-100 text-blue-700 border border-blue-300",
  Completed:
    "bg-emerald-100 text-emerald-700 border border-emerald-300",
  Cancelled:
    "bg-rose-100 text-rose-700 border border-rose-300",
};

export default function Dashboard() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showDispatchModal, setShowDispatchModal] = useState(false);
  const [dispatches, setDispatches] = useState<Dispatch[]>([]);
  const [selectedDispatch, setSelectedDispatch] = useState<Dispatch | null>(null);
  const [dispatchRefresh, setDispatchRefresh] = useState(0);
  const [metrics, setMetrics] = useState({
    totalActiveVehicles: 0,
    ongoingDeliveries: 0,
    completedSupplies: 0,
    emergencyAlerts: 0,
  });

  // Live dispatches listener
  useEffect(() => {
    const q = query(
      collection(db, "dispatches"),
      orderBy("createdAt", "desc"),
      limit(10)
    );
    const unsub = onSnapshot(q, (snap) => {
      setDispatches(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Dispatch, "id">) }))
      );
    });
    return () => unsub();
  }, [dispatchRefresh]);

  // Fetch metrics data
  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        // Count serviceable vehicles
        const vehiclesSnap = await getDocs(
          query(collection(db, "vehicles"), where("status", "==", "Serviceable"))
        );
        const totalActiveVehicles = vehiclesSnap.size;

        // Count dispatches by status
        const allDispatchesSnap = await getDocs(collection(db, "dispatches"));
        let ongoingDeliveries = 0;
        let completedSupplies = 0;
        let emergencyAlerts = 0;

        allDispatchesSnap.forEach((doc) => {
          const data = doc.data();
          const status = data.status;
          
          if (status === "Pending" || status === "In Transit") {
            ongoingDeliveries++;
          } else if (status === "Completed") {
            completedSupplies++;
          } else if (status === "Cancelled") {
            emergencyAlerts++;
          }
        });

        setMetrics({
          totalActiveVehicles,
          ongoingDeliveries,
          completedSupplies,
          emergencyAlerts,
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
    { name: "History", icon: "history", href: "/history", active: false },
  ];

  const metricCards = [
    { title: "Total Serviceable Vehicle", value: metrics.totalActiveVehicles.toString(), icon: "local_shipping", color: "from-violet-600 to-violet-800", glow: "shadow-violet-500/30" },
    { title: "Ongoing Deliveries", value: metrics.ongoingDeliveries.toString(), icon: "deployed_code", color: "from-amber-500 to-orange-700", glow: "shadow-amber-500/30" },
    { title: "Completed Supplies", value: metrics.completedSupplies.toString(), icon: "task_alt", color: "from-emerald-500 to-green-700", glow: "shadow-emerald-500/30" },
    { title: "Emergency Alerts", value: metrics.emergencyAlerts.toString(), icon: "warning_amber", color: "from-rose-500 to-red-700", glow: "shadow-rose-500/30" },
  ];

  const activities: { type: string; icon: string; iconColor: string; time: string }[] = [];

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
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-green-600 text-white shadow-lg shadow-emerald-500/30 flex-shrink-0">
              <span className="material-symbols-outlined" style={{ fontSize: "1.4rem" }}>local_shipping</span>
            </div>
            {sidebarOpen && (
              <div className="animate-fade-in overflow-hidden">
                <p className="font-bold text-white tracking-wide">Log Truck</p>
                <p className="text-xs text-slate-400">v2.0</p>
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
              {/* ── Create Dispatch Button ── */}
              <button
                onClick={() => setShowDispatchModal(true)}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-emerald-500/30 hover:shadow-xl hover:from-emerald-400 hover:to-green-500 hover:scale-[1.03] active:scale-95 transition-all duration-200"
              >
                <span className="material-symbols-outlined" style={{ fontSize: "1.1rem" }}>add_circle</span>
                Create Dispatch
              </button>

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
            {/* Map Section - Now 3/4 width and taller */}
            <div className="lg:col-span-3 rounded-2xl bg-white p-6 shadow-lg hover:shadow-xl transition-shadow duration-300 border border-slate-100 flex flex-col min-h-[500px]">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-slate-600" style={{ fontSize: "1.5rem" }}>map</span>
                  <div className="flex flex-col">
                    <h2 className="text-lg font-bold text-slate-900 leading-tight">Real-Time Vehicle Tracking</h2>
                    <p className="text-xs text-slate-500 font-medium flex items-center gap-1 mt-0.5">
                      <span className="material-symbols-outlined text-slate-400" style={{ fontSize: "0.875rem" }}>location_on</span>
                      GPS Monitoring — Palawan Area
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-bold text-emerald-700 uppercase tracking-tight">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span> Active
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-[10px] font-bold text-amber-700 uppercase tracking-tight">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span> Idle
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-3 py-1 text-[10px] font-bold text-rose-700 uppercase tracking-tight">
                    <span className="h-1.5 w-1.5 rounded-full bg-rose-500"></span> Emergency
                  </span>
                  <button className="flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-700 transition-colors ml-2 bg-blue-50 px-2 py-1.5 rounded-lg border border-blue-100">
                    <span className="material-symbols-outlined" style={{ fontSize: "0.9rem" }}>refresh</span>
                    Refresh
                  </button>
                </div>
              </div>
              <div className="flex-1 min-h-0 rounded-xl overflow-hidden border border-slate-200">
                <OpenStreetMap
                  latitude={9.748257}
                  longitude={118.771556}
                  zoom={15}
                  height="h-full"
                />
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
                  {activities.map((activity, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between rounded-xl bg-slate-50 hover:bg-slate-100 p-3 transition-all duration-200 animate-slide-up group"
                      style={{ animationDelay: `${index * 0.05}s` }}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white shadow-sm flex-shrink-0">
                          <span className={`material-symbols-outlined ${activity.iconColor}`} style={{ fontSize: "1.1rem" }}>{activity.icon}</span>
                        </div>
                        <p className="text-xs font-semibold text-slate-700 truncate">{activity.type}</p>
                      </div>
                      <p className="text-[10px] font-medium text-slate-400 whitespace-nowrap ml-2">{activity.time}</p>
                    </div>
                  ))}
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
                  {dispatches.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                      <span className="material-symbols-outlined mb-2" style={{ fontSize: "2.5rem" }}>local_shipping</span>
                      <p className="text-xs font-semibold">No dispatches yet</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-50">
                      {dispatches.map((d) => (
                        <button
                          key={d.id}
                          onClick={() => setSelectedDispatch(d)}
                          className="w-full text-left p-4 hover:bg-slate-50 transition-all active:bg-slate-100 group border-none outline-none"
                        >
                          <div className="flex items-start justify-between mb-2">
                            <span className="font-mono text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded uppercase group-hover:bg-slate-200 transition-colors">
                              #{d.dispatchId.split('-').pop()}
                            </span>
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase transition-all ${STATUS_STYLES[d.status] ?? "bg-slate-100 text-slate-600"}`}>
                              {d.status}
                            </span>
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
                              <span className="truncate">{d.location?.label || "Location unknown"}</span>
                            </div>
                            <span className="whitespace-nowrap opacity-60 font-mono italic">{formatTime(d.createdAt).split(',')[0]}</span>
                          </div>
                        </button>
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
        .animate-fade-in {
          animation: fade-in 0.4s ease-out forwards;
          opacity: 0;
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out forwards;
          opacity: 0;
        }
      `}</style>
    </div>
  );
}
