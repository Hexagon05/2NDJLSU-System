"use client";

import dynamic from "next/dynamic";

// Dynamic import for Leaflet
const LeafletMap = dynamic<{ lat: number; lng: number; onChange?: (lat: number, lng: number) => void }>(
    () => import("@/components/LeafletMap"),
    {
        ssr: false,
        loading: () => <div className="h-44 w-full bg-slate-100 animate-pulse rounded-2xl flex items-center justify-center text-slate-400 text-xs font-medium">Loading Map...</div>
    }
);

interface Dispatch {
    id: string;
    dispatchId: string;
    officer: string;
    personnels: string;
    truck: string;
    status: string;
    location: { lat: number; lng: number; label: string };
    supplies: { category: string; item: string; quantity: number }[];
    othersNote?: string;
    createdAt: Timestamp | null;
}

interface Props {
    dispatch: Dispatch;
    onClose: () => void;
}

function formatTime(ts: Timestamp | null): string {
    if (!ts) return "—";
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
    "In Transit": "bg-blue-100 text-blue-700 border-blue-200",
    Completed: "bg-emerald-100 text-emerald-700 border-emerald-200",
    Cancelled: "bg-rose-100 text-rose-700 border-rose-200",
};

export default function DispatchDetailModal({ dispatch, onClose }: Props) {
    return (
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
                            <p className="text-[10px] font-mono text-slate-500 uppercase tracking-[0.2em]">Deployment ID: {dispatch.dispatchId}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="rounded-lg p-2 hover:bg-slate-200 transition-colors text-slate-400 hover:text-slate-600">
                        <span className="material-symbols-outlined" style={{ fontSize: "1.25rem" }}>close</span>
                    </button>
                </div>

                {/* Body */}
                <div className="p-8 space-y-8 overflow-y-auto custom-scrollbar">
                    {/* Top Row: Info & Status */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="p-5 rounded-3xl bg-slate-50 border border-slate-100 shadow-sm">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Current Mission Phase</p>
                            <span className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black border uppercase ${STATUS_STYLES[dispatch.status] || "bg-slate-100 text-slate-600"}`}>
                                <span className="h-2 w-2 rounded-full bg-current animate-pulse"></span>
                                {dispatch.status}
                            </span>
                        </div>
                        <div className="md:col-span-2 p-5 rounded-3xl bg-slate-900 text-white shadow-xl flex items-center justify-between overflow-hidden relative group">
                            <div className="relative z-10">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-1">Deployment Timestamp</p>
                                <p className="text-lg font-bold tracking-tight">{formatTime(dispatch.createdAt)}</p>
                            </div>
                            <span className="material-symbols-outlined text-white/5 text-7xl absolute right-[-10px] bottom-[-10px] group-hover:scale-110 transition-transform">schedule</span>
                        </div>
                    </div>

                    {/* Middle Row: Map & Destination Info */}
                    <div className="flex flex-col lg:flex-row gap-8">
                        {/* Interactive Map Box */}
                        <div className="w-full lg:w-[400px] h-[300px] flex-shrink-0 relative rounded-3xl overflow-hidden border border-slate-200 shadow-lg bg-slate-50 group">
                            <LeafletMap
                                lat={dispatch.location?.lat || 0}
                                lng={dispatch.location?.lng || 0}
                            />
                            <div className="absolute top-4 left-4 z-[1000] bg-white/90 backdrop-blur-md px-4 py-2 rounded-2xl shadow-lg border border-slate-200 flex items-center gap-2">
                                <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse-slow" />
                                <span className="text-[10px] font-bold text-slate-800 uppercase tracking-widest">Target Location</span>
                            </div>
                            <div className="absolute bottom-4 left-4 z-[1000] bg-slate-900/80 backdrop-blur-md px-3 py-1.5 rounded-xl text-[9px] font-mono text-white border border-white/20">
                                {dispatch.location?.lat.toFixed(6)}, {dispatch.location?.lng.toFixed(6)}
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
                                        <p className="text-2xl font-black text-slate-900 leading-tight">{dispatch.location?.label || "Coordinate Point Established"}</p>
                                        <p className="text-sm text-emerald-700 font-medium mt-2 flex items-center gap-2">
                                            <span className="material-symbols-outlined" style={{ fontSize: "1rem" }}>explore</span>
                                            Verified Strategic Landmark
                                        </p>
                                    </div>
                                    <span className="material-symbols-outlined text-emerald-500/10 text-9xl absolute right-[-20px] top-[-20px]">map</span>
                                </div>
                            </div>

                            {/* Personnel & Vehicle Grid */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                                            <td className="px-4 py-3 font-medium text-slate-500">{s.category}</td>
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
                <div className="border-t border-slate-100 bg-slate-50 px-6 py-4 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-6 py-2.5 rounded-xl bg-slate-900 text-white font-bold text-sm shadow-lg hover:bg-black transition-all active:scale-95"
                    >
                        Close Information
                    </button>
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
    );
}
