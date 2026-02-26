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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative z-10 flex flex-col w-full max-w-6xl max-h-[92vh] rounded-2xl bg-white shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-slate-900 to-slate-800 px-6 py-4 flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-green-600 shadow-lg">
                            <span className="material-symbols-outlined text-white" style={{ fontSize: "1.25rem" }}>local_shipping</span>
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-white tracking-tight">Create Dispatch</h2>
                            {dispatchId && <p className="text-xs text-slate-400 font-mono">ID: {dispatchId}</p>}
                        </div>
                    </div>
                    <button onClick={onClose} className="rounded-lg p-2 hover:bg-white/10 transition-colors text-slate-400 hover:text-white">
                        <span className="material-symbols-outlined" style={{ fontSize: "1.25rem" }}>close</span>
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto">
                    {step === "form" ? (
                        <div className="p-6 space-y-6">
                            {/* Map */}
                            <div className="rounded-xl border border-slate-200 overflow-hidden shadow-sm bg-white">
                                <div className="flex items-center gap-2 bg-slate-900 px-4 py-3">
                                    <span className="material-symbols-outlined text-emerald-400" style={{ fontSize: "1.25rem" }}>add_location_alt</span>
                                    <span className="text-sm font-bold text-white tracking-wide uppercase">Select Target Location</span>
                                </div>
                                <div className="p-4 space-y-4">
                                    <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg border border-slate-100 font-mono text-xs text-slate-600">
                                        <span>COORDINATES:</span>
                                        <span className="font-bold text-emerald-700">{lat}, {lng}</span>
                                    </div>
                                    <div className="rounded-xl overflow-hidden border border-slate-200 h-64 relative">
                                        <LeafletMap
                                            lat={parseFloat(lat)}
                                            lng={parseFloat(lng)}
                                            onChange={(newLat, newLng) => {
                                                setLat(newLat.toFixed(6));
                                                setLng(newLng.toFixed(6));
                                            }}
                                        />
                                        <div className="absolute top-3 right-3 z-[1000] bg-white/90 px-3 py-1.5 rounded-lg shadow-sm font-bold text-[10px] text-slate-700 border border-slate-200 uppercase">
                                            Click map to Pinpoint
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wide">Location Label</label>
                                        <input
                                            type="text"
                                            value={locationLabel}
                                            onChange={(e) => setLocationLabel(e.target.value)}
                                            className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 focus:outline-none transition-all"
                                            placeholder="e.g. Puerto Princesa Main Camp"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Details */}
                            <div className="rounded-xl border border-slate-200 overflow-hidden shadow-sm bg-white">
                                <div className="flex items-center gap-2 bg-slate-900 px-4 py-3">
                                    <span className="material-symbols-outlined text-blue-400" style={{ fontSize: "1.25rem" }}>badge</span>
                                    <span className="text-sm font-bold text-white tracking-wide uppercase">Assignment Details</span>
                                </div>
                                <div className="p-4 grid gap-5 sm:grid-cols-2">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wide">Truck Assigned</label>
                                        <select
                                            value={truck}
                                            onChange={(e) => setTruck(e.target.value)}
                                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 focus:outline-none transition-all"
                                        >
                                            <option value="">Select Truck</option>
                                            {dbVehicles.map(v => <option key={v.id} value={v.codename}>{v.codename} ({v.plate})</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wide">Personnel In-Charge</label>
                                        <select
                                            value={personnels}
                                            onChange={(e) => setPersonnels(e.target.value)}
                                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 focus:outline-none transition-all"
                                        >
                                            <option value="">Select Personnel</option>
                                            {dbPersonnels.map(o => <option key={o.id} value={o.name}>{o.name}</option>)}
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {/* Supplies */}
                            <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm">
                                <div className="flex items-center gap-2 bg-slate-900 px-4 py-3">
                                    <span className="material-symbols-outlined text-amber-400" style={{ fontSize: "1.25rem" }}>inventory_2</span>
                                    <span className="text-sm font-bold text-white tracking-wide uppercase">Supplies</span>
                                </div>
                                <div className="flex border-b border-slate-100 bg-slate-50/50">
                                    {SUPPLY_CATALOGUE.map(cat => (
                                        <button
                                            key={cat.category}
                                            onClick={() => setActiveCategory(cat.category)}
                                            className={`px-4 py-2.5 text-xs font-bold transition-all border-b-2 ${activeCategory === cat.category ? "border-emerald-500 text-emerald-700 bg-white" : "border-transparent text-slate-500"}`}
                                        >
                                            {cat.category}
                                        </button>
                                    ))}
                                    <button
                                        onClick={() => setActiveCategory("Others")}
                                        className={`px-4 py-2.5 text-xs font-bold transition-all border-b-2 ${activeCategory === "Others" ? "border-emerald-500 text-emerald-700 bg-white" : "border-transparent text-slate-500"}`}
                                    >
                                        Others
                                    </button>
                                </div>
                                <div className="p-4">
                                    {activeCategory === "Others" ? (
                                        <textarea
                                            value={othersNote}
                                            onChange={(e) => setOthersNote(e.target.value)}
                                            rows={2}
                                            className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none resize-none"
                                            placeholder="Special notes or other supplies..."
                                        />
                                    ) : (
                                        <div className="grid grid-cols-2 gap-3">
                                            {SUPPLY_CATALOGUE.find(c => c.category === activeCategory)?.items.map(item => (
                                                <div key={item} className="flex items-center justify-between p-2 rounded-lg border border-slate-100 bg-slate-50/30">
                                                    <span className="text-xs font-medium text-slate-700">{item}</span>
                                                    <input
                                                        type="text"
                                                        value={getQty(activeCategory, item) || ""}
                                                        onChange={(e) => setQty(activeCategory, item, parseInt(e.target.value) || 0)}
                                                        className="w-14 h-8 text-center text-xs font-bold border border-slate-200 rounded bg-white"
                                                        placeholder="0"
                                                    />
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
                <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-4 flex-shrink-0">
                    <div>
                        {error && (
                            <div className="flex items-center gap-2 text-rose-600">
                                <span className="material-symbols-outlined" style={{ fontSize: "1rem" }}>error</span>
                                <p className="text-xs font-bold uppercase tracking-tight">{error}</p>
                            </div>
                        )}
                    </div>
                    <div className="flex gap-3">
                        {step === "summary" && (
                            <button
                                type="button"
                                onClick={() => setStep("form")}
                                className="px-5 py-2.5 rounded-xl border border-slate-300 bg-white text-sm font-bold text-slate-700 hover:bg-slate-100 transition-all flex items-center gap-2"
                            >
                                <span className="material-symbols-outlined" style={{ fontSize: "1.1rem" }}>arrow_back</span>
                                Edit Details
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => step === "form" ? setStep("summary") : handleSubmit()}
                            disabled={submitting}
                            className="bg-slate-900 text-white px-8 py-2.5 rounded-xl font-bold text-sm shadow-xl hover:bg-black transition-all flex items-center gap-2 disabled:opacity-50"
                        >
                            {submitting ? (
                                <><span className="material-symbols-outlined animate-spin" style={{ fontSize: "1rem" }}>progress_activity</span> Processing...</>
                            ) : (
                                step === "form" ? (
                                    <><span className="material-symbols-outlined" style={{ fontSize: "1rem" }}>summarize</span> Next: Review Summary</>
                                ) : (
                                    <><span className="material-symbols-outlined" style={{ fontSize: "1.1rem" }}>verified</span> Submit & Dispatch</>
                                )
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
