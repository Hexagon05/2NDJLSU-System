"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useState, useEffect } from "react";
import Image from "next/image";
import DispatchDetailModal from "@/components/DispatchDetailModal";
import { db } from "@/lib/firebase";
import { logActivity } from "@/lib/activity-logger";
import NotificationsDropdown from "@/components/NotificationsDropdown";
import DispatchChatHub from "@/components/DispatchChatHub";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  Timestamp,
} from "firebase/firestore";
import * as XLSX from "xlsx";

interface HistoryRecord {
  id: string;
  dispatchId: string;
  requisitionNumber?: string;
  requisitionId?: string;
  personnels: string;
  vehicle: string;
  event: string;
  location: {
    lat: number;
    lng: number;
    label: string;
  };
  supplies: { category: string; item: string; quantity: number }[];
  othersNote?: string;
  timestamp: string;
  officer: string;
  status: string;
  proofOfDelivery?: unknown;
  createdAt: Timestamp | null;
}

const normalizeHistoryStatus = (status: unknown): "Successful Dispatch" | "Cancelled" | null => {
  const normalized = String(status ?? "").trim().toLowerCase().replace(/[_-]+/g, " ");

  if (
    normalized === "successful dispatch" ||
    normalized === "sucessful dispatch" ||
    normalized === "success dispatch"
  ) {
    return "Successful Dispatch";
  }

  if (normalized === "cancelled" || normalized === "canceled") {
    return "Cancelled";
  }

  return null;
};

export default function HistoryPage() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [historyData, setHistoryData] = useState<HistoryRecord[]>([]);
  const [fetchLoading, setFetchLoading] = useState(true);
  const [selectedDispatch, setSelectedDispatch] = useState<HistoryRecord | null>(null);

  // Real-time listener for dispatches
  useEffect(() => {
    const q = query(
      collection(db, "dispatches"),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(q, (snap) => {
      const mappedRecords: Array<HistoryRecord | null> = snap.docs.map((d): HistoryRecord | null => {
        const data = d.data();
        const createdAt = data.createdAt as Timestamp | null;
        const normalizedStatus = normalizeHistoryStatus(data.status);
        if (!normalizedStatus) return null;

        return {
          id: d.id,
          dispatchId: data.dispatchId || "N/A",
          requisitionNumber: data.requisitionNumber || data.requisitionId || data.poNumber || "N/A",
          requisitionId: data.requisitionId || data.requisitionNumber || data.poNumber || "N/A",
          personnels: data.personnels || "",
          vehicle: data.truck || "Unknown",
          event: normalizedStatus,
          location: {
            lat: data.location?.lat || 0,
            lng: data.location?.lng || 0,
            label: data.location?.label || "Location unknown",
          },
          supplies: Array.isArray(data.supplies) ? data.supplies : [],
          othersNote: data.othersNote || "",
          timestamp: createdAt ? createdAt.toDate().toLocaleString("en-PH", {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }) : "â€”",
          officer: data.officer || "Unassigned",
          status: normalizedStatus,
          proofOfDelivery: data.proofOfDelivery,
          createdAt,
        };
      });

      const records: HistoryRecord[] = mappedRecords.filter((record): record is HistoryRecord => record !== null);
      setHistoryData(records);
      setFetchLoading(false);
    });
    return () => unsub();
  }, []);

  const handleLogout = async () => {
    await signOut();
    router.push("/login");
  };

  const navigationItems = [
    { name: "Dashboard", icon: "dashboard", href: "/dashboard", active: false },
    { name: "Personnels", icon: "groups", href: "/personnels", active: false },
    { name: "Vehicle", icon: "local_shipping", href: "/vehicle", active: false },
    { name: "Emergency Alerts", icon: "emergency", href: "/emergency-alerts", active: false },
    { name: "History", icon: "history", href: "/history", active: true },
  ];

  const getEventBadge = (event: string) => {
    switch (event) {
      case "Successful Dispatch": return "bg-emerald-100 text-emerald-800 border border-emerald-200";
      case "Cancelled": return "bg-rose-100 text-rose-800 border border-rose-200";
      default: return "bg-slate-100 text-slate-800 border border-slate-200";
    }
  };

  const handleExportExcel = () => {
    try {
      const supplyColumns = Array.from(
        new Set(
          filteredData.flatMap((record) =>
            record.supplies.map((supply) => `${supply.category} - ${supply.item}`)
          )
        )
      ).sort((left, right) => left.localeCompare(right));

      // Prepare data for export
      const exportData = filteredData.map((record, index) => {
        const supplyData = Object.fromEntries(
          supplyColumns.map((column) => [column, 0])
        );

        for (const supply of record.supplies) {
          const columnName = `${supply.category} - ${supply.item}`;
          supplyData[columnName] = supply.quantity;
        }

        return {
          "No.": index + 1,
          "Dispatch ID": record.dispatchId,
          "Vehicle": record.vehicle,
          "Officer": record.officer,
          "Personnels": record.personnels || "N/A",
          "Status": record.status,
          "Landmark": record.location.label,
          "Latitude": record.location.lat,
          "Longitude": record.location.lng,
          ...supplyData,
          "Additional Notes": record.othersNote || "N/A",
          "Timestamp": record.timestamp,
        };
      });

      // Create a new workbook and worksheet
      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "History Records");

      // Set column widths for better readability
      const columnWidths = [
        { wch: 5 },  // No.
        { wch: 15 }, // Dispatch ID
        { wch: 20 }, // Vehicle
        { wch: 30 }, // Officer
        { wch: 30 }, // Personnels
        { wch: 12 }, // Status
        { wch: 35 }, // Landmark
        { wch: 14 }, // Latitude
        { wch: 14 }, // Longitude
        ...supplyColumns.map(() => ({ wch: 18 })), // Supply items
        { wch: 40 }, // Additional Notes
        { wch: 20 }, // Timestamp
      ];
      worksheet['!cols'] = columnWidths;

      // Generate filename with current date
      const date = new Date();
      const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD format
      const filename = `History_Records_${dateStr}.xlsx`;

      // Write and download the file
      XLSX.writeFile(workbook, filename);
      
      // Log activity
      if (user?.email) {
        logActivity(
          "EXPORT_EXCEL",
          `Exported ${filteredData.length} dispatch records to Excel`,
          user.email,
          {
            recordsCount: filteredData.length,
            filename: filename,
            timestamp: new Date().toISOString(),
          }
        );
      }
    } catch (error) {
      console.error("Error exporting to Excel:", error);
      alert("Failed to export to Excel. Please try again.");
    }
  };

  const filteredData = historyData.filter((r) => {
    const term = searchTerm.trim().toLowerCase();
    const hasTextMatch =
      !term ||
      r.vehicle.toLowerCase().includes(term) ||
      r.event.toLowerCase().includes(term) ||
      r.location.label.toLowerCase().includes(term) ||
      r.officer.toLowerCase().includes(term) ||
      r.dispatchId.toLowerCase().includes(term);

    if (!r.createdAt) return hasTextMatch && !monthFilter && !yearFilter && !dateFilter;

    const createdAtDate = r.createdAt.toDate();
    const monthNumber = createdAtDate.getMonth() + 1;
    const yearNumber = createdAtDate.getFullYear();
    const createdAtDateString = `${yearNumber}-${String(monthNumber).padStart(2, "0")}-${String(createdAtDate.getDate()).padStart(2, "0")}`;

    const hasMonthMatch = !monthFilter || monthNumber === Number(monthFilter);
    const hasYearMatch = !yearFilter || yearNumber === Number(yearFilter);
    const hasDateMatch = !dateFilter || createdAtDateString === dateFilter;

    return hasTextMatch && hasMonthMatch && hasYearMatch && hasDateMatch;
  });

  const RECORDS_PER_PAGE = 10;
  const totalPages = Math.max(1, Math.ceil(filteredData.length / RECORDS_PER_PAGE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * RECORDS_PER_PAGE;
  const paginatedData = filteredData.slice(startIndex, startIndex + RECORDS_PER_PAGE);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, monthFilter, yearFilter, dateFilter]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [loading, user, router]);

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
    return null;
  }

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-100 to-slate-200">
      {selectedDispatch && (
        <DispatchDetailModal
          dispatch={{
            id: selectedDispatch.id,
            dispatchId: selectedDispatch.dispatchId,
            requisitionNumber: selectedDispatch.requisitionNumber,
            requisitionId: selectedDispatch.requisitionId,
            officer: selectedDispatch.officer,
            personnels: selectedDispatch.personnels,
            truck: selectedDispatch.vehicle,
            status: selectedDispatch.status,
            location: selectedDispatch.location,
            supplies: selectedDispatch.supplies,
            othersNote: selectedDispatch.othersNote,
            proofOfDelivery: selectedDispatch.proofOfDelivery,
            createdAt: selectedDispatch.createdAt,
          }}
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
              <span className="material-symbols-outlined text-slate-600" style={{ fontSize: "1.75rem" }}>history</span>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">History Records</h1>
            </div>
            <div className="flex items-center gap-4">
              <NotificationsDropdown userEmail={user?.email ?? undefined} />
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

        {/* Content */}
        <div className="flex-1 overflow-auto">
          <div className="p-6 space-y-6">
            {/* Search, Filters, Export */}
            <div className="flex gap-3 flex-wrap items-center">
              <div className="flex-1 min-w-64 relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-slate-400" style={{ fontSize: "1.25rem" }}>search</span>
                <input
                  type="text"
                  placeholder="Search history..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-slate-900 placeholder-slate-400 shadow-sm transition-all focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>
              <input
                type="number"
                min={1}
                max={12}
                placeholder="Month (1-12)"
                value={monthFilter}
                onChange={(e) => setMonthFilter(e.target.value)}
                className="w-40 px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-sm font-medium"
              />
              <input
                type="number"
                min={2000}
                max={2100}
                placeholder="Year"
                value={yearFilter}
                onChange={(e) => setYearFilter(e.target.value)}
                className="w-36 px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-sm font-medium"
              />
              <input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-sm font-medium"
              />
              <button
                onClick={handleExportExcel}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 px-5 py-3 text-white text-sm font-semibold shadow-lg shadow-emerald-500/30 transition-all hover:shadow-xl hover:shadow-emerald-500/40 active:scale-95"
              >
                <span className="material-symbols-outlined" style={{ fontSize: "1.1rem" }}>download</span>
                Export Excel
              </button>
            </div>

            {/* Table */}
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
              <table className="w-full">
                <thead className="bg-gradient-to-r from-slate-800 to-slate-900 text-white">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider">Dispatch ID</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider">PO/Requisition</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider">Vehicle</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider">Officer</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider">Event</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider">Location</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider">Timestamp</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {fetchLoading ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-12 text-center">
                        <span className="material-symbols-outlined animate-spin text-emerald-400 inline-block" style={{ fontSize: "2rem" }}>
                          progress_activity
                        </span>
                        <p className="mt-3 text-slate-500">Loading dispatch history...</p>
                      </td>
                    </tr>
                  ) : filteredData.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-12 text-center text-slate-400">
                        <span className="material-symbols-outlined block text-4xl mb-2">history</span>
                        <p>No dispatch history records found</p>
                      </td>
                    </tr>
                  ) : (
                    paginatedData.map((record, index) => (
                      <tr
                        key={record.id}
                        className="hover:bg-slate-50 transition-colors duration-200 animate-fade-in"
                        style={{ animationDelay: `${index * 0.07}s` }}
                      >
                        <td className="px-6 py-4 text-sm font-mono font-bold text-slate-900">{record.dispatchId}</td>
                        <td className="px-6 py-4 text-sm font-mono text-slate-700">{record.requisitionNumber || "N/A"}</td>
                        <td className="px-6 py-4 text-sm font-bold text-slate-900">{record.vehicle}</td>
                        <td className="px-6 py-4 text-sm text-slate-600 flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-slate-400" style={{ fontSize: "0.9rem" }}>person</span>
                          {record.officer}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${getEventBadge(record.event)}`}>
                            {record.event}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600 flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-slate-400" style={{ fontSize: "0.9rem" }}>location_on</span>
                          {record.location.label}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600">
                          <span className="flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-slate-400" style={{ fontSize: "0.9rem" }}>schedule</span>
                            {record.timestamp}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm">
                          <button
                            onClick={() => setSelectedDispatch(record)}
                            className="flex items-center gap-1 text-blue-600 hover:text-blue-700 font-semibold transition-colors"
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: "1rem" }}>open_in_new</span>
                            Details
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500 font-medium">
                {filteredData.length === 0
                  ? "Showing 0-0 of 0 records"
                  : `Showing ${startIndex + 1}-${Math.min(startIndex + RECORDS_PER_PAGE, filteredData.length)} of ${filteredData.length} records`}
              </p>
              <div className="flex gap-1.5">
                <button
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={safeCurrentPage === 1}
                  className="flex items-center gap-1 px-3 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: "1.1rem" }}>chevron_left</span>
                </button>

                {Array.from({ length: totalPages }, (_, idx) => idx + 1).map((page) => (
                  <button
                    key={page}
                    className={`px-3.5 py-2 rounded-xl text-sm font-semibold transition-all ${safeCurrentPage === page
                      ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/30"
                      : "border border-slate-200 text-slate-600 hover:bg-slate-100"
                      }`}
                    onClick={() => setCurrentPage(page)}
                  >
                    {page}
                  </button>
                ))}

                <button
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={safeCurrentPage === totalPages}
                  className="flex items-center gap-1 px-3 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: "1.1rem" }}>chevron_right</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.35s ease-out forwards;
          opacity: 0;
        }
      `}</style>
    </div>
  );
}
