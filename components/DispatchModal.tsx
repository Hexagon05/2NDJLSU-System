"use client";

import { useState, useEffect } from "react";
import {
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    orderBy,
    runTransaction,
    serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import dynamic from "next/dynamic";

// Dynamic import for Leaflet (avoids SSR errors)
const LeafletMap = dynamic<{ lat: number; lng: number; onChange: (lat: number, lng: number) => void }>(
    () => import("@/components/LeafletMap"),
    {
        ssr: false,
        loading: () => <div className="h-44 w-full bg-slate-100 animate-pulse rounded-lg flex items-center justify-center text-slate-400 text-xs font-medium">Loading Map...</div>
    }
);

// ── Supply catalogue ─────────────────────────────────────────────────────────
const SUPPLY_CATALOGUE: { category: string; items: string[] }[] = [
    {
        category: "Medic",
        items: ["Biogesic", "Syringe", "Mefenamic", "Bandages"],
    },
    {
        category: "Ammunition",
        items: ["7.62", "5.56", "9mm", ".45"],
    },
    {
        category: "Beverages",
        items: ["Energy Drink", "Water"],
    },
    {
        category: "Food",
        items: ["Can Foods", "Noodles", "Rice"],
    },
];

interface SupplyQty {
    [key: string]: number; // "Medic|Biogesic" => 3
}

interface Props {
    onClose: () => void;
    onSuccess: () => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function supplyKey(category: string, item: string) {
    return `${category}|${item}`;
}

export default function DispatchModal({ onClose, onSuccess }: Props) {
    // Core form state
    const [dispatchId, setDispatchId] = useState("");
    const [lat, setLat] = useState("9.748257");
    const [lng, setLng] = useState("118.771556");
    const [locationLabel, setLocationLabel] = useState("");
    const [personnels, setPersonnels] = useState("");
    const [truck, setTruck] = useState("");
    const [supplyQty, setSupplyQty] = useState<SupplyQty>({});
    const [othersNote, setOthersNote] = useState("");
    const [activeCategory, setActiveCategory] = useState("Medic");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [step, setStep] = useState<"form" | "summary">("form");

    // DB Data
    const [dbVehicles, setDbVehicles] = useState<{ id: string; codename: string; plate: string }[]>([]);
    const [dbPersonnels, setDbPersonnels] = useState<{ id: string; name: string }[]>([]);

    // Generate dispatch ID and fetch data
    useEffect(() => {
        const loadInitialData = async () => {
            try {
                // 1. Generate ID
                const counterRef = doc(db, "meta", "dispatchCounter");
                const snap = await getDoc(counterRef);
                const count = snap.exists() ? (snap.data().count as number) : 0;
                const year = new Date().getFullYear();
                setDispatchId(`${year}${String(count + 1).padStart(8, "0")}`);

                // 2. Fetch Vehicles
                const vSnap = await getDocs(query(collection(db, "vehicles"), orderBy("codename", "asc")));
                const vData = vSnap.docs.map(d => ({
                    id: d.id,
                    codename: d.data().codename,
                    plate: d.data().plate
                }));
                setDbVehicles(vData);
                if (vData.length > 0) setTruck(vData[0].codename);

                // 3. Fetch Officers
                const oSnap = await getDocs(query(collection(db, "personnelAccount"), orderBy("lastName", "asc")));
                setDbPersonnels(oSnap.docs.map(d => {
                    const data = d.data();
                    return {
                        id: d.id,
                        name: `[${data.rank}] ${data.lastName}, ${data.firstName}`
                    };
                }));
            } catch (err) {
                console.error("Error loading data:", err);
            }
        };
        loadInitialData();
    }, []);

    // Supply qty helpers
    const setQty = (category: string, item: string, qty: number) => {
        setSupplyQty((prev) => ({
            ...prev,
            [supplyKey(category, item)]: Math.max(0, qty),
        }));
    };

    const getQty = (category: string, item: string) =>
        supplyQty[supplyKey(category, item)] ?? 0;

    const activeSupplies = Object.entries(supplyQty).filter(([, v]) => v > 0);

    // Submit
    const handleSubmit = async () => {
        if (!personnels.trim()) { setError("Personnel assignment is required."); return; }
        if (!truck) { setError("Truck selection is required."); return; }
        setError("");
        setSubmitting(true);

        try {
            const counterRef = doc(db, "meta", "dispatchCounter");
            const dispatchRef = doc(collection(db, "dispatches"));

            await runTransaction(db, async (tx) => {
                const counterSnap = await tx.get(counterRef);
                const prevCount = counterSnap.exists() ? counterSnap.data().count : 0;
                const newCount = prevCount + 1;
                const year = new Date().getFullYear();
                const padded = String(newCount).padStart(8, "0");
                const finalId = `${year}${padded}`;

                tx.set(counterRef, { count: newCount }, { merge: true });
                tx.set(dispatchRef, {
                    dispatchId: finalId,
                    location: {
                        lat: parseFloat(lat),
                        lng: parseFloat(lng),
                        label: locationLabel || `${lat}, ${lng}`,
                    },
                    officer: personnels.trim(),
                    personnels: personnels.trim(),
                    truck,
                    supplies: activeSupplies.map(([key, qty]) => {
                        const [cat, itm] = key.split("|");
                        return { category: cat, item: itm, quantity: qty };
                    }),
                    othersNote: othersNote.trim(),
                    status: "Pending",
                    createdAt: serverTimestamp(),
                });
            });

            onSuccess();
            onClose();
        } catch (err: any) {
            setError(err.message || "Failed to save dispatch. Try again.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
            <div className="absolute inset-0 bg-gradient-to-br from-slate-900/90 via-slate-800/90 to-emerald-900/80 backdrop-blur-xl" onClick={onClose} />
            <div className="relative z-10 flex flex-col w-full max-w-6xl max-h-[92vh] rounded-3xl bg-gradient-to-br from-white via-slate-50 to-emerald-50/30 shadow-2xl shadow-emerald-500/10 overflow-hidden border border-white/60 animate-scale-in">
                {/* Header */}
                <div className="flex items-center justify-between bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-900 px-8 py-6 flex-shrink-0 relative overflow-hidden">
                    {/* Decorative background pattern */}
                    <div className="absolute inset-0 opacity-10">
                        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-emerald-400 to-transparent rounded-full blur-3xl"></div>
                        <div className="absolute bottom-0 left-0 w-80 h-80 bg-gradient-to-tr from-blue-400 to-transparent rounded-full blur-3xl"></div>
                    </div>
                    <div className="flex items-center gap-4 relative z-10">
                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 via-emerald-500 to-green-600 shadow-xl shadow-emerald-500/50 ring-4 ring-white/20">
                            <span className="material-symbols-outlined text-white" style={{ fontSize: "1.75rem" }}>local_shipping</span>
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-white tracking-tight bg-gradient-to-r from-white to-emerald-100 bg-clip-text text-transparent">Create Dispatch</h2>
                            {dispatchId && (
                                <div className="flex items-center gap-2 mt-1">
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                                    <p className="text-xs text-emerald-300 font-mono tracking-wider">ID: {dispatchId}</p>
                                </div>
                            )}
                        </div>
                    </div>
                    <button 
                        onClick={onClose} 
                        className="relative z-10 rounded-xl p-2.5 hover:bg-white/20 transition-all duration-300 text-slate-300 hover:text-white group backdrop-blur-sm border border-white/10 hover:border-white/30"
                    >
                        <span className="material-symbols-outlined transition-transform group-hover:rotate-90 duration-300" style={{ fontSize: "1.5rem" }}>close</span>
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {step === "form" ? (
                        <div className="p-8 space-y-8">
                            {/* Map */}
                            <div className="rounded-3xl border border-emerald-200/50 overflow-hidden shadow-xl bg-gradient-to-br from-white to-emerald-50/30 hover:shadow-2xl transition-shadow duration-500">
                                <div className="flex items-center gap-3 bg-gradient-to-r from-emerald-600 via-emerald-500 to-green-600 px-6 py-4 relative overflow-hidden">
                                    <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 animate-shimmer"></div>
                                    <div className="h-10 w-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/30 shadow-lg">
                                        <span className="material-symbols-outlined text-white" style={{ fontSize: "1.4rem" }}>add_location_alt</span>
                                    </div>
                                    <span className="text-base font-black text-white tracking-wide uppercase">Select Target Location</span>
                                    <div className="ml-auto">
                                        <span className="px-3 py-1 bg-white/20 rounded-full text-[10px] font-bold text-white uppercase tracking-wider backdrop-blur-sm border border-white/30">Required</span>
                                    </div>
                                </div>
                                <div className="p-6 space-y-5">
                                    <div className="flex items-center gap-3 px-5 py-3 bg-gradient-to-r from-slate-900 to-slate-800 rounded-2xl border border-slate-700 font-mono text-sm text-slate-300 shadow-lg">
                                        <span className="text-emerald-400 font-bold uppercase tracking-wider text-xs">Coordinates:</span>
                                        <span className="font-black text-emerald-300 text-base">{lat}, {lng}</span>
                                        <div className="ml-auto h-2 w-2 rounded-full bg-emerald-400 animate-pulse shadow-lg shadow-emerald-400/50"></div>
                                    </div>
                                    <div className="rounded-2xl overflow-hidden border-4 border-white shadow-2xl h-72 relative group">
                                        <LeafletMap
                                            lat={parseFloat(lat)}
                                            lng={parseFloat(lng)}
                                            onChange={(newLat, newLng) => {
                                                setLat(newLat.toFixed(6));
                                                setLng(newLng.toFixed(6));
                                            }}
                                        />
                                        <div className="absolute top-4 right-4 z-[1000] bg-white/95 backdrop-blur-md px-4 py-2 rounded-xl shadow-xl font-black text-[11px] text-emerald-700 border-2 border-emerald-200 uppercase tracking-widest hover:scale-105 transition-transform">
                                            📍 Click to Pinpoint
                                        </div>
                                    </div>
                                    <div>
                                        <label className="flex items-center gap-2 text-sm font-bold text-slate-700 mb-3 uppercase tracking-wide">
                                            <span className="h-1 w-1 rounded-full bg-emerald-500"></span>
                                            Location Label
                                        </label>
                                        <input
                                            type="text"
                                            value={locationLabel}
                                            onChange={(e) => setLocationLabel(e.target.value)}
                                            className="w-full rounded-xl border-2 border-slate-200 px-5 py-3.5 text-sm font-medium focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/20 focus:outline-none transition-all bg-white shadow-sm hover:shadow-md"
                                            placeholder="e.g. Puerto Princesa Main Camp"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Details */}
                            <div className="rounded-3xl border border-blue-200/50 overflow-hidden shadow-xl bg-gradient-to-br from-white to-blue-50/30 hover:shadow-2xl transition-shadow duration-500">
                                <div className="flex items-center gap-3 bg-gradient-to-r from-blue-600 via-blue-500 to-indigo-600 px-6 py-4 relative overflow-hidden">
                                    <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 animate-shimmer"></div>
                                    <div className="h-10 w-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/30 shadow-lg">
                                        <span className="material-symbols-outlined text-white" style={{ fontSize: "1.4rem" }}>badge</span>
                                    </div>
                                    <span className="text-base font-black text-white tracking-wide uppercase">Assignment Details</span>
                                    <div className="ml-auto">
                                        <span className="px-3 py-1 bg-white/20 rounded-full text-[10px] font-bold text-white uppercase tracking-wider backdrop-blur-sm border border-white/30">Critical</span>
                                    </div>
                                </div>
                                <div className="p-6 grid gap-6 sm:grid-cols-2">
                                    <div className="space-y-3">
                                        <label className="flex items-center gap-2 text-sm font-bold text-slate-700 uppercase tracking-wide">
                                            <span className="h-1 w-1 rounded-full bg-blue-500"></span>
                                            Truck Assigned
                                        </label>
                                        <div className="relative group">
                                            <select
                                                value={truck}
                                                onChange={(e) => setTruck(e.target.value)}
                                                className="w-full rounded-xl border-2 border-slate-200 bg-white px-5 py-3.5 text-sm font-semibold focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 focus:outline-none transition-all shadow-sm hover:shadow-md appearance-none cursor-pointer"
                                            >
                                                <option value="">Select Truck</option>
                                                {dbVehicles.map(v => <option key={v.id} value={v.codename}>{v.codename} ({v.plate})</option>)}
                                            </select>
                                            <span className="absolute right-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-slate-400 pointer-events-none">expand_more</span>
                                        </div>
                                    </div>
                                    <div className="space-y-3">
                                        <label className="flex items-center gap-2 text-sm font-bold text-slate-700 uppercase tracking-wide">
                                            <span className="h-1 w-1 rounded-full bg-blue-500"></span>
                                            Personnel In-Charge
                                        </label>
                                        <div className="relative group">
                                            <select
                                                value={personnels}
                                                onChange={(e) => setPersonnels(e.target.value)}
                                                className="w-full rounded-xl border-2 border-slate-200 bg-white px-5 py-3.5 text-sm font-semibold focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 focus:outline-none transition-all shadow-sm hover:shadow-md appearance-none cursor-pointer"
                                            >
                                                <option value="">Select Personnel</option>
                                                {dbPersonnels.map(o => <option key={o.id} value={o.name}>{o.name}</option>)}
                                            </select>
                                            <span className="absolute right-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-slate-400 pointer-events-none">expand_more</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Supplies */}
                            <div className="rounded-3xl border border-amber-200/50 overflow-hidden bg-gradient-to-br from-white to-amber-50/30 shadow-xl hover:shadow-2xl transition-shadow duration-500">
                                <div className="flex items-center gap-3 bg-gradient-to-r from-amber-600 via-amber-500 to-orange-600 px-6 py-4 relative overflow-hidden">
                                    <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 animate-shimmer"></div>
                                    <div className="h-10 w-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/30 shadow-lg">
                                        <span className="material-symbols-outlined text-white" style={{ fontSize: "1.4rem" }}>inventory_2</span>
                                    </div>
                                    <span className="text-base font-black text-white tracking-wide uppercase">Supply LoadOut</span>
                                    <div className="ml-auto">
                                        <span className="px-3 py-1 bg-white/20 rounded-full text-[10px] font-bold text-white uppercase tracking-wider backdrop-blur-sm border border-white/30">Optional</span>
                                    </div>
                                </div>
                                <div className="flex border-b border-amber-100 bg-gradient-to-r from-amber-50/50 to-orange-50/50">
                                    {SUPPLY_CATALOGUE.map(cat => (
                                        <button
                                            key={cat.category}
                                            onClick={() => setActiveCategory(cat.category)}
                                            className={`flex-1 px-5 py-4 text-sm font-black transition-all border-b-4 hover:bg-white/50 ${activeCategory === cat.category ? "border-amber-500 text-amber-700 bg-white shadow-lg" : "border-transparent text-slate-500 hover:text-amber-600"}`}
                                        >
                                            {cat.category}
                                        </button>
                                    ))}
                                    <button
                                        onClick={() => setActiveCategory("Others")}
                                        className={`flex-1 px-5 py-4 text-sm font-black transition-all border-b-4 hover:bg-white/50 ${activeCategory === "Others" ? "border-amber-500 text-amber-700 bg-white shadow-lg" : "border-transparent text-slate-500 hover:text-amber-600"}`}
                                    >
                                        Others
                                    </button>
                                </div>
                                <div className="p-6">
                                    {activeCategory === "Others" ? (
                                        <div className="space-y-3">
                                            <label className="flex items-center gap-2 text-sm font-bold text-slate-700 uppercase tracking-wide">
                                                <span className="h-1 w-1 rounded-full bg-amber-500"></span>
                                                Special Notes
                                            </label>
                                            <textarea
                                                value={othersNote}
                                                onChange={(e) => setOthersNote(e.target.value)}
                                                rows={3}
                                                    className="w-full rounded-xl border-2 border-slate-200 px-5 py-4 text-sm font-medium focus:border-amber-500 focus:ring-4 focus:ring-amber-500/20 focus:outline-none resize-none transition-all bg-white shadow-sm hover:shadow-md"
                                                placeholder="Special notes or other supplies..."
                                            />
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-2 gap-4">
                                            {SUPPLY_CATALOGUE.find(c => c.category === activeCategory)?.items.map(item => (
                                                <div key={item} className="group relative">
                                                    <div className="flex items-center justify-between p-4 rounded-2xl border-2 border-slate-200 bg-gradient-to-br from-white to-slate-50 hover:border-amber-300 hover:shadow-lg transition-all duration-300">
                                                        <span className="text-sm font-bold text-slate-700 group-hover:text-amber-600 transition-colors">{item}</span>
                                                        <input
                                                            type="text"
                                                            value={getQty(activeCategory, item) || ""}
                                                            onChange={(e) => setQty(activeCategory, item, parseInt(e.target.value) || 0)}
                                                            className="w-16 h-10 text-center text-sm font-black border-2 border-slate-200 rounded-xl bg-white focus:border-amber-500 focus:ring-4 focus:ring-amber-500/20 focus:outline-none transition-all shadow-sm"
                                                            placeholder="0"
                                                        />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="p-6 space-y-8">
                            {/* Top Section: Map and Core Info */}
                            <div className="flex flex-col lg:flex-row gap-8">
                                {/* Map Square */}
                                <div className="w-full lg:w-[400px] h-[400px] flex-shrink-0 relative rounded-3xl overflow-hidden border border-slate-200 shadow-xl bg-slate-50">
                                    <LeafletMap
                                        lat={parseFloat(lat)}
                                        lng={parseFloat(lng)}
                                        onChange={() => { }} // Read-only in summary
                                    />
                                    <div className="absolute top-4 left-4 z-[1000] bg-white/90 backdrop-blur-md px-4 py-2 rounded-2xl shadow-lg border border-slate-200 flex items-center gap-2">
                                        <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                                        <span className="text-[10px] font-bold text-slate-800 uppercase tracking-widest">Target Pinned</span>
                                    </div>
                                    <div className="absolute bottom-4 left-4 z-[1000] bg-slate-900/80 backdrop-blur-md px-3 py-1.5 rounded-xl text-[9px] font-mono text-white border border-white/20">
                                        {lat}, {lng}
                                    </div>
                                </div>

                                {/* Info Grid */}
                                <div className="flex-1 flex flex-col justify-between py-2">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        {/* Dispatch Header / ID */}
                                        <div className="sm:col-span-2 p-5 rounded-3xl bg-slate-900 text-white shadow-xl relative overflow-hidden group">
                                            <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
                                                <span className="material-symbols-outlined shrink-0" style={{ fontSize: "5rem" }}>receipt_long</span>
                                            </div>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-1">Dispatch Protocol ID</p>
                                            <h3 className="text-2xl font-black tracking-tight">{dispatchId}</h3>
                                            <div className="mt-4 flex items-center gap-2">
                                                <span className="h-2 w-full bg-emerald-500/20 rounded-full overflow-hidden">
                                                    <span className="block h-full w-1/3 bg-emerald-500" />
                                                </span>
                                                <span className="text-[10px] font-bold text-emerald-400 uppercase">Ready</span>
                                            </div>
                                        </div>

                                        {/* Target Location */}
                                        <div className="p-5 rounded-3xl bg-white border border-slate-200 shadow-sm hover:border-emerald-200 transition-colors">
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Target Destination</p>
                                            <div className="flex items-start gap-3">
                                                <div className="h-10 w-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
                                                    <span className="material-symbols-outlined">location_on</span>
                                                </div>
                                                <div>
                                                    <p className="font-bold text-slate-900 leading-snug">{locationLabel || "Unlabeled Marker"}</p>
                                                    <p className="text-xs text-slate-500 mt-0.5">Primary Target Zone</p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Personnel */}
                                        <div className="p-5 rounded-3xl bg-white border border-slate-200 shadow-sm">
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Officer-in-Charge</p>
                                            <div className="flex items-center gap-3">
                                                <div className="h-10 w-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
                                                    <span className="material-symbols-outlined">person</span>
                                                </div>
                                                <div>
                                                    <p className="font-bold text-slate-900">{personnels}</p>
                                                    <p className="text-xs text-slate-500 mt-0.5">Command Personnel</p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Truck */}
                                        <div className="p-5 rounded-3xl bg-white border border-slate-200 shadow-sm">
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Deployment Vehicle</p>
                                            <div className="flex items-center gap-3">
                                                <div className="h-10 w-10 rounded-2xl bg-violet-50 text-violet-600 flex items-center justify-center border border-violet-100">
                                                    <span className="material-symbols-outlined">local_shipping</span>
                                                </div>
                                                <div>
                                                    <p className="font-bold text-slate-900">{truck}</p>
                                                    <p className="text-xs text-slate-500 mt-0.5">Active Unit</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Bottom Section: Supplies */}
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="material-symbols-outlined text-amber-500" style={{ fontSize: "1.25rem" }}>inventory_2</span>
                                        <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">Inventory Loadout</h3>
                                    </div>
                                    <div className="h-px flex-1 bg-slate-100 mx-6" />
                                    <span className="text-[10px] font-bold text-slate-400 uppercase">{activeSupplies.length} Items Selected</span>
                                </div>

                                <div className="max-h-96 overflow-y-auto pr-2 custom-scrollbar">
                                    {activeSupplies.length > 0 ? (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
                                            {activeSupplies.map(([key, qty]) => {
                                                const [, itm] = key.split("|");
                                                return (
                                                    <div key={key} className="flex items-center justify-between text-sm p-3 bg-white rounded-2xl border border-slate-100 hover:border-emerald-200 hover:shadow-md transition-all group">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-slate-300 group-hover:bg-emerald-500 transition-colors" />
                                                            <span className="text-slate-700 font-semibold">{itm}</span>
                                                        </div>
                                                        <span className="font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-xl border border-emerald-100/50">
                                                            x{qty}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div className="text-center py-12 bg-slate-50 rounded-3xl border border-dashed border-slate-200">
                                            <p className="text-sm text-slate-400 italic font-medium">No logistical assets assigned to this dispatch</p>
                                        </div>
                                    )}

                                    {othersNote && (
                                        <div className="mt-4 p-5 rounded-3xl bg-amber-50/50 border border-amber-100 flex gap-4">
                                            <span className="material-symbols-outlined text-amber-500 mt-1">description</span>
                                            <div>
                                                <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest mb-1">Mission Directives / Additional Notes</p>
                                                <p className="text-sm text-slate-700 italic leading-relaxed">"{othersNote}"</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between border-t-2 border-slate-200 bg-gradient-to-r from-slate-50 via-white to-slate-50 px-8 py-6 flex-shrink-0 relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 via-transparent to-blue-500/5"></div>
                    <div className="relative z-10">
                        {error && (
                            <div className="flex items-center gap-3 text-rose-600 bg-rose-50 px-5 py-3 rounded-xl border-2 border-rose-200 shadow-lg animate-shake">
                                <div className="h-10 w-10 rounded-xl bg-rose-100 flex items-center justify-center">
                                    <span className="material-symbols-outlined" style={{ fontSize: "1.3rem" }}>error</span>
                                </div>
                                <p className="text-sm font-bold uppercase tracking-tight">{error}</p>
                            </div>
                        )}
                    </div>
                    <div className="flex gap-4 relative z-10">
                        {step === "summary" && (
                            <button
                                type="button"
                                onClick={() => setStep("form")}
                                className="group px-6 py-3.5 rounded-xl border-2 border-slate-300 bg-white text-sm font-bold text-slate-700 hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-all duration-300 flex items-center gap-2 shadow-lg hover:shadow-xl"
                            >
                                <span className="material-symbols-outlined transition-transform group-hover:-translate-x-1" style={{ fontSize: "1.2rem" }}>arrow_back</span>
                                Edit Details
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => step === "form" ? setStep("summary") : handleSubmit()}
                            disabled={submitting}
                            className="group relative bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-900 text-white px-10 py-3.5 rounded-xl font-black text-sm shadow-2xl shadow-emerald-500/30 hover:shadow-emerald-500/50 hover:scale-105 transition-all duration-300 flex items-center gap-3 disabled:opacity-50 disabled:hover:scale-100 overflow-hidden"
                        >
                            <div className="absolute inset-0 bg-gradient-to-r from-emerald-400/20 via-blue-400/20 to-emerald-400/20 animate-shimmer"></div>
                            {submitting ? (
                                <><span className="material-symbols-outlined animate-spin relative z-10" style={{ fontSize: "1.2rem" }}>progress_activity</span> <span className="relative z-10">Processing...</span></>
                            ) : (
                                step === "form" ? (
                                    <>
                                        <span className="relative z-10">Next: Review Summary</span>
                                        <span className="material-symbols-outlined transition-transform group-hover:translate-x-1 relative z-10" style={{ fontSize: "1.2rem" }}>arrow_forward</span>
                                    </>
                                ) : (
                                    <>
                                        <span className="material-symbols-outlined relative z-10" style={{ fontSize: "1.3rem" }}>verified</span> 
                                        <span className="relative z-10">Submit & Dispatch</span>
                                    </>
                                )
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
