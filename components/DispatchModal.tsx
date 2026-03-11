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
    const [personnelIncluded, setPersonnelIncluded] = useState("");
    const [truck, setTruck] = useState("");
    const [supplyQty, setSupplyQty] = useState<SupplyQty>({});
    const [othersNote, setOthersNote] = useState("");
    const [activeCategory, setActiveCategory] = useState("Medic");
    
    // Blowbagets Checklist Items
    const [blowbagetsChecklist, setBlowbagetsChecklist] = useState({
        battery: false,
        lights: false,
        oil: false,
        water: false,
        brakes: false,
        air: false,
        gas: false,
        engine: false,
        tires: false,
        self: false,
    });
    
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [step, setStep] = useState<"form" | "summary">("form");

    // DB Data
    const [dbVehicles, setDbVehicles] = useState<{ id: string; codename: string; plate: string }[]>([]);
    const [dbPersonnels, setDbPersonnels] = useState<{ id: string; name: string }[]>([]);

    // Computed: All blowbagets checked
    const hasBlowbagets = Object.values(blowbagetsChecklist).every(checked => checked);

    // Toggle individual checklist item
    const toggleBlowbagetsItem = (item: keyof typeof blowbagetsChecklist) => {
        setBlowbagetsChecklist(prev => ({ ...prev, [item]: !prev[item] }));
    };

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

    // Export blowbagets safety checklist as printable PDF
    const exportBlowbagets = () => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            alert('Please allow pop-ups to export the checklist');
            return;
        }
        
        const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>BLOWBAGETS Safety Checklist - ${dispatchId || 'DRAFT'}</title>
    <style>
        @page {
            size: A4;
            margin: 20mm;
        }
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Times New Roman', Times, serif;
            line-height: 1.6;
            color: #000;
            background: white;
            padding: 20px;
            max-width: 210mm;
            margin: 0 auto;
        }
        
        .header {
            text-align: center;
            border: 3px solid #000;
            padding: 20px;
            margin-bottom: 25px;
        }
        
        .header h1 {
            font-size: 28px;
            font-weight: bold;
            letter-spacing: 3px;
            margin-bottom: 10px;
            text-transform: uppercase;
        }
        
        .header .subtitle {
            font-size: 14px;
            font-weight: bold;
            letter-spacing: 2px;
            text-transform: uppercase;
        }
        
        .meta-info {
            border: 2px solid #000;
            padding: 15px;
            margin-bottom: 25px;
        }
        
        .meta-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 8px;
            font-size: 12px;
        }
        
        .meta-row:last-child {
            margin-bottom: 0;
        }
        
        .meta-label {
            font-weight: bold;
            display: inline-block;
            min-width: 150px;
        }
        
        .meta-value {
            font-weight: normal;
            text-decoration: underline;
        }
        
        .section {
            margin-bottom: 25px;
            page-break-inside: avoid;
        }
        
        .section-title {
            font-size: 16px;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: 1.5px;
            border-bottom: 3px solid #000;
            padding-bottom: 8px;
            margin-bottom: 15px;
        }
        
        .info-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
        }
        
        .info-table td {
            border: 1px solid #000;
            padding: 10px;
            font-size: 12px;
        }
        
        .info-table .label-cell {
            font-weight: bold;
            width: 35%;
            background: #f0f0f0;
        }
        
        .checklist-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
        }
        
        .checklist-table th {
            border: 2px solid #000;
            padding: 10px;
            background: #e0e0e0;
            font-weight: bold;
            text-align: left;
            font-size: 12px;
        }
        
        .checklist-table td {
            border: 1px solid #000;
            padding: 10px;
            font-size: 12px;
            vertical-align: top;
        }
        
        .checklist-table .checkbox-cell {
            width: 60px;
            text-align: center;
            vertical-align: middle;
        }
        
        .checkbox {
            width: 20px;
            height: 20px;
            border: 2px solid #000;
            display: inline-block;
            vertical-align: middle;
        }
        
        .item-title {
            font-weight: bold;
            margin-bottom: 5px;
            font-size: 13px;
        }
        
        .item-desc {
            font-size: 11px;
            color: #333;
            line-height: 1.5;
        }
        
        .summary-box {
            border: 3px solid #000;
            padding: 20px;
            margin-bottom: 25px;
            text-align: center;
        }
        
        .summary-title {
            font-size: 14px;
            font-weight: bold;
            text-transform: uppercase;
            margin-bottom: 15px;
            letter-spacing: 1px;
        }
        
        .summary-text {
            font-size: 12px;
            line-height: 1.8;
        }
        
        .signature-section {
            margin-top: 30px;
            page-break-inside: avoid;
        }
        
        .signature-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 15px;
        }
        
        .signature-table td {
            border: 1px solid #000;
            padding: 15px;
            width: 33.33%;
            vertical-align: top;
        }
        
        .signature-label {
            font-size: 11px;
            font-weight: bold;
            text-transform: uppercase;
            margin-bottom: 40px;
            display: block;
        }
        
        .signature-line {
            border-bottom: 2px solid #000;
            height: 50px;
            margin-bottom: 8px;
        }
        
        .signature-date {
            font-size: 10px;
            margin-top: 5px;
        }
        
        .footer {
            margin-top: 30px;
            padding: 15px;
            border: 2px solid #000;
            background: #f5f5f5;
        }
        
        .footer-title {
            font-size: 13px;
            font-weight: bold;
            margin-bottom: 10px;
            text-transform: uppercase;
        }
        
        .footer-text {
            font-size: 11px;
            line-height: 1.7;
        }
        
        .organization {
            text-align: center;
            margin-top: 25px;
            padding-top: 20px;
            border-top: 2px solid #000;
            font-size: 12px;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: 1.5px;
        }
        
        .timestamp {
            text-align: center;
            font-size: 10px;
            margin-top: 10px;
            font-style: italic;
        }
        
        .print-instructions {
            background: #fffbea;
            border: 2px solid #f59e0b;
            padding: 15px;
            margin-bottom: 20px;
            border-radius: 8px;
            text-align: center;
        }
        
        .print-instructions strong {
            color: #d97706;
            font-size: 14px;
        }
        
        @media print {
            body {
                padding: 0;
            }
            .print-instructions {
                display: none;
            }
        }
    </style>
</head>
<body>
    <div class="print-instructions">
        <strong>📄 PDF Export Instructions:</strong><br>
        <span style="font-size: 12px;">Use Ctrl+P (Windows) or Cmd+P (Mac) to print. Select "Save as PDF" as your printer destination.</span>
    </div>

    <div class="header">
        <h1>BLOWBAGETS</h1>
        <div class="subtitle">PRE-DEPARTURE SAFETY CHECKLIST</div>
    </div>
    
    <div class="meta-info">
        <div class="meta-row">
            <span><span class="meta-label">Dispatch ID:</span> <span class="meta-value">${dispatchId || 'DRAFT'}</span></span>
            <span><span class="meta-label">Date:</span> <span class="meta-value">${new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}</span></span>
        </div>
        <div class="meta-row">
            <span><span class="meta-label">Time:</span> <span class="meta-value">${new Date().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}</span></span>
            <span><span class="meta-label">Status:</span> <span class="meta-value">FOR COMPLETION</span></span>
        </div>
    </div>
    
    <div class="section">
        <div class="section-title">DISPATCH INFORMATION</div>
        <table class="info-table">
            <tr>
                <td class="label-cell">Vehicle Assigned:</td>
                <td>${truck || 'N/A'}</td>
                <td class="label-cell">Officer-in-Charge:</td>
                <td>${personnels || 'N/A'}</td>
            </tr>
            <tr>
                <td class="label-cell">Personnel Included:</td>
                <td>${personnelIncluded || 'N/A'}</td>
                <td class="label-cell">Target Location:</td>
                <td>${locationLabel || `${lat}, ${lng}`}</td>
            </tr>
        </table>
    </div>
    
    <div class="section">
        <div class="section-title">VEHICLE SAFETY INSPECTION CHECKLIST</div>
        <table class="checklist-table">
            <thead>
                <tr>
                    <th style="width: 60px;">CHECK</th>
                    <th>ITEM</th>
                    <th>DESCRIPTION</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td class="checkbox-cell"><span class="checkbox"></span></td>
                    <td><div class="item-title">B - BATTERY</div></td>
                    <td><div class="item-desc">Check battery connections for corrosion and tightness</div></td>
                </tr>
                <tr>
                    <td class="checkbox-cell"><span class="checkbox"></span></td>
                    <td><div class="item-title">L - LIGHTS</div></td>
                    <td><div class="item-desc">Ensure all lights (headlights, tail lights, signals) are working</div></td>
                </tr>
                <tr>
                    <td class="checkbox-cell"><span class="checkbox"></span></td>
                    <td><div class="item-title">O - OIL</div></td>
                    <td><div class="item-desc">Check engine oil level and quality</div></td>
                </tr>
                <tr>
                    <td class="checkbox-cell"><span class="checkbox"></span></td>
                    <td><div class="item-title">W - WATER</div></td>
                    <td><div class="item-desc">Check radiator water/coolant level</div></td>
                </tr>
                <tr>
                    <td class="checkbox-cell"><span class="checkbox"></span></td>
                    <td><div class="item-title">B - BRAKES</div></td>
                    <td><div class="item-desc">Test brake responsiveness and check brake fluid level</div></td>
                </tr>
                <tr>
                    <td class="checkbox-cell"><span class="checkbox"></span></td>
                    <td><div class="item-title">A - AIR</div></td>
                    <td><div class="item-desc">Check air pressure in all tires (including spare)</div></td>
                </tr>
                <tr>
                    <td class="checkbox-cell"><span class="checkbox"></span></td>
                    <td><div class="item-title">G - GAS</div></td>
                    <td><div class="item-desc">Verify fuel level is adequate for the mission</div></td>
                </tr>
                <tr>
                    <td class="checkbox-cell"><span class="checkbox"></span></td>
                    <td><div class="item-title">E - ENGINE</div></td>
                    <td><div class="item-desc">Check engine for unusual sounds, leaks, or vibrations</div></td>
                </tr>
                <tr>
                    <td class="checkbox-cell"><span class="checkbox"></span></td>
                    <td><div class="item-title">T - TIRES</div></td>
                    <td><div class="item-desc">Inspect tire condition, tread depth, and look for damage</div></td>
                </tr>
                <tr>
                    <td class="checkbox-cell"><span class="checkbox"></span></td>
                    <td><div class="item-title">S - SELF</div></td>
                    <td><div class="item-desc">Driver personal safety check and readiness assessment</div></td>
                </tr>
            </tbody>
        </table>
    </div>
    
    <div class="summary-box">
        <div class="summary-title">VERIFICATION SUMMARY</div>
        <div class="summary-text">
            Total Checklist Items: <strong>10</strong><br>
            Items Completed: <strong>________</strong><br><br>
            <strong>ALL ITEMS MUST BE VERIFIED BEFORE DISPATCH</strong>
        </div>
    </div>
    
    <div class="signature-section">
        <div class="section-title">AUTHORIZATION SIGNATURES</div>
        <table class="signature-table">
            <tr>
                <td>
                    <div class="signature-label">Vehicle Driver</div>
                    <div class="signature-line"></div>
                    <div class="signature-date">Signature Over Printed Name</div>
                    <div class="signature-date">Date: __________</div>
                </td>
                <td>
                    <div class="signature-label">Officer-in-Charge</div>
                    <div class="signature-line"></div>
                    <div class="signature-date">Signature Over Printed Name</div>
                    <div class="signature-date">Date: __________</div>
                </td>
                <td>
                    <div class="signature-label">Safety Officer / Approving Authority</div>
                    <div class="signature-line"></div>
                    <div class="signature-date">Signature Over Printed Name</div>
                    <div class="signature-date">Date: __________</div>
                </td>
            </tr>
        </table>
    </div>
    
    <div class="footer">
        <div class="footer-title">IMPORTANT SAFETY REMINDER</div>
        <div class="footer-text">
            ALL items in the BLOWBAGETS checklist MUST be verified and checked before vehicle dispatch. 
            This is a mandatory safety requirement to ensure the safety of personnel and successful mission completion. 
            Any unchecked items must be addressed immediately before departure. The driver and officer-in-charge 
            are responsible for ensuring 100% compliance with this safety protocol.
        </div>
    </div>
    
    <div class="organization">
        AFP LOGISTICS SUPPORT CENTER - SAFETY PROTOCOL
    </div>
    
    <div class="timestamp">
        Document Generated: ${new Date().toLocaleString('en-PH')}
    </div>
    
    <script>
        // Auto-trigger print dialog after page loads
        window.onload = function() {
            setTimeout(() => {
                window.print();
            }, 500);
        };
        
        // Optional: Close window after printing (user can cancel)
        window.onafterprint = function() {
            // Uncomment the line below if you want the window to close after printing
            // window.close();
        };
    </script>
</body>
</html>
        `;
        
        printWindow.document.write(htmlContent);
        printWindow.document.close();
    };

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
                    personnelIncluded: personnelIncluded.trim(),
                    truck,
                    supplies: activeSupplies.map(([key, qty]) => {
                        const [cat, itm] = key.split("|");
                        return { category: cat, item: itm, quantity: qty };
                    }),
                    othersNote: othersNote.trim(),
                    blowbagetsChecklist,
                    hasBlowbagets,
                    status: "Pending",
                    createdAt: serverTimestamp(),
                });
            });

            onSuccess();
            onClose();
        } catch (err: any) {
            const errorMessage = err.message || "Failed to save dispatch.";
            
            // Check for permission errors
            if (errorMessage.includes("PERMISSION") || errorMessage.includes("permission")) {
                setError("⚠️ Permission denied. You need admin access. Please visit the Admin Setup page to configure your account.");
            } else {
                setError(errorMessage);
            }
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
                        <div className="p-8 space-y-6">
                            {/* Map + Assignment Details - Side by Side */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {/* Map - Square */}
                                <div className="rounded-3xl border border-emerald-200/50 overflow-hidden shadow-xl bg-gradient-to-br from-white to-emerald-50/30 hover:shadow-2xl transition-shadow duration-500">
                                    <div className="flex items-center gap-3 bg-gradient-to-r from-emerald-600 via-emerald-500 to-green-600 px-5 py-3.5 relative overflow-hidden">
                                        <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 animate-shimmer"></div>
                                        <div className="h-9 w-9 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/30 shadow-lg">
                                            <span className="material-symbols-outlined text-white" style={{ fontSize: "1.3rem" }}>add_location_alt</span>
                                        </div>
                                        <span className="text-sm font-black text-white tracking-wide uppercase">Target Location</span>
                                        <div className="ml-auto">
                                            <span className="px-2.5 py-0.5 bg-white/20 rounded-full text-[9px] font-bold text-white uppercase tracking-wider backdrop-blur-sm border border-white/30">Required</span>
                                        </div>
                                    </div>
                                    <div className="p-5 space-y-4">
                                        <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-gradient-to-r from-slate-900 to-slate-800 rounded-xl border border-slate-700 font-mono text-xs text-slate-300 shadow-lg">
                                            <span className="text-emerald-400 font-bold uppercase tracking-wider text-[10px]">Coords:</span>
                                            <span className="font-black text-emerald-300 text-xs">{lat}, {lng}</span>
                                            <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse shadow-lg shadow-emerald-400/50"></div>
                                        </div>
                                        <div className="rounded-2xl overflow-hidden border-4 border-white shadow-2xl aspect-square relative group">
                                            <LeafletMap
                                                lat={parseFloat(lat)}
                                                lng={parseFloat(lng)}
                                                onChange={(newLat, newLng) => {
                                                    setLat(newLat.toFixed(6));
                                                    setLng(newLng.toFixed(6));
                                                }}
                                            />
                                            <div className="absolute top-3 right-3 z-[1000] bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-lg shadow-xl font-black text-[10px] text-emerald-700 border-2 border-emerald-200 uppercase tracking-widest hover:scale-105 transition-transform">
                                                📍 Click to Set
                                            </div>
                                        </div>
                                        <div>
                                            <label className="flex items-center gap-2 text-xs font-bold text-slate-700 mb-2 uppercase tracking-wide">
                                                <span className="h-1 w-1 rounded-full bg-emerald-500"></span>
                                                Location Label
                                            </label>
                                            <input
                                                type="text"
                                                value={locationLabel}
                                                onChange={(e) => setLocationLabel(e.target.value)}
                                                className="w-full rounded-xl border-2 border-slate-200 px-4 py-2.5 text-sm font-medium focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/20 focus:outline-none transition-all bg-white shadow-sm hover:shadow-md"
                                                placeholder="e.g. Puerto Princesa Main Camp"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Assignment Details */}
                                <div className="rounded-3xl border border-blue-200/50 overflow-hidden shadow-xl bg-gradient-to-br from-white to-blue-50/30 hover:shadow-2xl transition-shadow duration-500">
                                    <div className="flex items-center gap-3 bg-gradient-to-r from-blue-600 via-blue-500 to-indigo-600 px-5 py-3.5 relative overflow-hidden">
                                        <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 animate-shimmer"></div>
                                        <div className="h-9 w-9 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/30 shadow-lg">
                                            <span className="material-symbols-outlined text-white" style={{ fontSize: "1.3rem" }}>badge</span>
                                        </div>
                                        <span className="text-sm font-black text-white tracking-wide uppercase">Assignment Details</span>
                                        <div className="ml-auto">
                                            <span className="px-2.5 py-0.5 bg-white/20 rounded-full text-[9px] font-bold text-white uppercase tracking-wider backdrop-blur-sm border border-white/30">Critical</span>
                                        </div>
                                    </div>
                                    <div className="p-5 space-y-5">
                                        <div className="space-y-3">
                                            <label className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wide">
                                                <span className="h-1 w-1 rounded-full bg-blue-500"></span>
                                                Truck Assigned
                                            </label>
                                            <div className="relative group">
                                                <select
                                                    value={truck}
                                                    onChange={(e) => setTruck(e.target.value)}
                                                    className="w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-sm font-semibold focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 focus:outline-none transition-all shadow-sm hover:shadow-md appearance-none cursor-pointer"
                                                >
                                                    <option value="">Select Truck</option>
                                                    {dbVehicles.map(v => <option key={v.id} value={v.codename}>{v.codename} ({v.plate})</option>)}
                                                </select>
                                                <span className="absolute right-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-slate-400 pointer-events-none">expand_more</span>
                                            </div>
                                        </div>
                                        <div className="space-y-3">
                                            <label className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wide">
                                                <span className="h-1 w-1 rounded-full bg-blue-500"></span>
                                                Personnel In-Charge
                                            </label>
                                            <div className="relative group">
                                                <select
                                                    value={personnels}
                                                    onChange={(e) => setPersonnels(e.target.value)}
                                                    className="w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-sm font-semibold focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 focus:outline-none transition-all shadow-sm hover:shadow-md appearance-none cursor-pointer"
                                                >
                                                    <option value="">Select Personnel</option>
                                                    {dbPersonnels.map(o => <option key={o.id} value={o.name}>{o.name}</option>)}
                                                </select>
                                                <span className="absolute right-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-slate-400 pointer-events-none">expand_more</span>
                                            </div>
                                        </div>
                                        <div className="space-y-3">
                                            <label className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wide">
                                                <span className="h-1 w-1 rounded-full bg-blue-500"></span>
                                                Personnel Included (Optional)
                                            </label>
                                            <input
                                                type="text"
                                                value={personnelIncluded}
                                                onChange={(e) => setPersonnelIncluded(e.target.value)}
                                                className="w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-sm font-semibold focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 focus:outline-none transition-all shadow-sm hover:shadow-md"
                                                placeholder="e.g. John Doe, Jane Smith"
                                            />
                                        </div>
                                        
                                        {/* BLOWBAGETS Checklist */}
                                        <div className="space-y-3">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-emerald-500 to-green-600 text-white flex items-center justify-center shadow-md">
                                                        <span className="material-symbols-outlined" style={{ fontSize: "1.1rem" }}>verified</span>
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">BLOWBAGETS Checklist</p>
                                                        <p className="text-[10px] text-slate-500">All items must be verified before dispatch</p>
                                                    </div>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={exportBlowbagets}
                                                    className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-all shadow-sm hover:shadow-md flex items-center gap-1"
                                                >
                                                    <span className="material-symbols-outlined" style={{ fontSize: "0.9rem" }}>print</span>
                                                    Print
                                                </button>
                                            </div>
                                            
                                            {/* Checklist Items Grid */}
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                {/* Battery */}
                                                <label className="flex items-start gap-2 p-3 rounded-lg border-2 border-slate-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/30 cursor-pointer transition-all">
                                                    <input
                                                        type="checkbox"
                                                        checked={blowbagetsChecklist.battery}
                                                        onChange={() => toggleBlowbagetsItem('battery')}
                                                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                                                    />
                                                    <div className="flex-1">
                                                        <p className="text-xs font-bold text-slate-700">B - Battery</p>
                                                        <p className="text-[10px] text-slate-500">Check battery connections</p>
                                                    </div>
                                                </label>
                                                
                                                {/* Lights */}
                                                <label className="flex items-start gap-2 p-3 rounded-lg border-2 border-slate-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/30 cursor-pointer transition-all">
                                                    <input
                                                        type="checkbox"
                                                        checked={blowbagetsChecklist.lights}
                                                        onChange={() => toggleBlowbagetsItem('lights')}
                                                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                                                    />
                                                    <div className="flex-1">
                                                        <p className="text-xs font-bold text-slate-700">L - Lights</p>
                                                        <p className="text-[10px] text-slate-500">All lights working properly</p>
                                                    </div>
                                                </label>
                                                
                                                {/* Oil */}
                                                <label className="flex items-start gap-2 p-3 rounded-lg border-2 border-slate-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/30 cursor-pointer transition-all">
                                                    <input
                                                        type="checkbox"
                                                        checked={blowbagetsChecklist.oil}
                                                        onChange={() => toggleBlowbagetsItem('oil')}
                                                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                                                    />
                                                    <div className="flex-1">
                                                        <p className="text-xs font-bold text-slate-700">O - Oil</p>
                                                        <p className="text-[10px] text-slate-500">Check oil level and quality</p>
                                                    </div>
                                                </label>
                                                
                                                {/* Water */}
                                                <label className="flex items-start gap-2 p-3 rounded-lg border-2 border-slate-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/30 cursor-pointer transition-all">
                                                    <input
                                                        type="checkbox"
                                                        checked={blowbagetsChecklist.water}
                                                        onChange={() => toggleBlowbagetsItem('water')}
                                                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                                                    />
                                                    <div className="flex-1">
                                                        <p className="text-xs font-bold text-slate-700">W - Water</p>
                                                        <p className="text-[10px] text-slate-500">Check water/coolant level</p>
                                                    </div>
                                                </label>
                                                
                                                {/* Brakes */}
                                                <label className="flex items-start gap-2 p-3 rounded-lg border-2 border-slate-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/30 cursor-pointer transition-all">
                                                    <input
                                                        type="checkbox"
                                                        checked={blowbagetsChecklist.brakes}
                                                        onChange={() => toggleBlowbagetsItem('brakes')}
                                                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                                                    />
                                                    <div className="flex-1">
                                                        <p className="text-xs font-bold text-slate-700">B - Brakes</p>
                                                        <p className="text-[10px] text-slate-500">Test brake responsiveness</p>
                                                    </div>
                                                </label>
                                                
                                                {/* Air */}
                                                <label className="flex items-start gap-2 p-3 rounded-lg border-2 border-slate-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/30 cursor-pointer transition-all">
                                                    <input
                                                        type="checkbox"
                                                        checked={blowbagetsChecklist.air}
                                                        onChange={() => toggleBlowbagetsItem('air')}
                                                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                                                    />
                                                    <div className="flex-1">
                                                        <p className="text-xs font-bold text-slate-700">A - Air</p>
                                                        <p className="text-[10px] text-slate-500">Check air pressure in tires</p>
                                                    </div>
                                                </label>
                                                
                                                {/* Gas */}
                                                <label className="flex items-start gap-2 p-3 rounded-lg border-2 border-slate-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/30 cursor-pointer transition-all">
                                                    <input
                                                        type="checkbox"
                                                        checked={blowbagetsChecklist.gas}
                                                        onChange={() => toggleBlowbagetsItem('gas')}
                                                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                                                    />
                                                    <div className="flex-1">
                                                        <p className="text-xs font-bold text-slate-700">G - Gas</p>
                                                        <p className="text-[10px] text-slate-500">Verify fuel level is adequate</p>
                                                    </div>
                                                </label>
                                                
                                                {/* Engine */}
                                                <label className="flex items-start gap-2 p-3 rounded-lg border-2 border-slate-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/30 cursor-pointer transition-all">
                                                    <input
                                                        type="checkbox"
                                                        checked={blowbagetsChecklist.engine}
                                                        onChange={() => toggleBlowbagetsItem('engine')}
                                                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                                                    />
                                                    <div className="flex-1">
                                                        <p className="text-xs font-bold text-slate-700">E - Engine</p>
                                                        <p className="text-[10px] text-slate-500">Check for unusual sounds/leaks</p>
                                                    </div>
                                                </label>
                                                
                                                {/* Tires */}
                                                <label className="flex items-start gap-2 p-3 rounded-lg border-2 border-slate-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/30 cursor-pointer transition-all">
                                                    <input
                                                        type="checkbox"
                                                        checked={blowbagetsChecklist.tires}
                                                        onChange={() => toggleBlowbagetsItem('tires')}
                                                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                                                    />
                                                    <div className="flex-1">
                                                        <p className="text-xs font-bold text-slate-700">T - Tires</p>
                                                        <p className="text-[10px] text-slate-500">Inspect tire condition and tread</p>
                                                    </div>
                                                </label>
                                                
                                                {/* Self */}
                                                <label className="flex items-start gap-2 p-3 rounded-lg border-2 border-slate-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/30 cursor-pointer transition-all">
                                                    <input
                                                        type="checkbox"
                                                        checked={blowbagetsChecklist.self}
                                                        onChange={() => toggleBlowbagetsItem('self')}
                                                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                                                    />
                                                    <div className="flex-1">
                                                        <p className="text-xs font-bold text-slate-700">S - Self</p>
                                                        <p className="text-[10px] text-slate-500">Personal safety check completed</p>
                                                    </div>
                                                </label>
                                            </div>
                                            
                                            {/* Safety Equipment Status - Only enabled when all checked */}
                                            <div className={`p-4 rounded-xl border-2 transition-all ${
                                                hasBlowbagets 
                                                ? 'border-emerald-300 bg-gradient-to-br from-emerald-50 to-green-50' 
                                                : 'border-slate-200 bg-gradient-to-br from-slate-50 to-slate-100 opacity-60'
                                            }`}>
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`h-9 w-9 rounded-lg flex items-center justify-center border ${
                                                            hasBlowbagets
                                                            ? 'bg-emerald-600 text-white border-emerald-700'
                                                            : 'bg-slate-200 text-slate-400 border-slate-300'
                                                        }`}>
                                                            <span className="material-symbols-outlined" style={{ fontSize: "1.1rem" }}>shield</span>
                                                        </div>
                                                        <div>
                                                            <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">Safety Equipment Status</p>
                                                            <p className="text-[10px] text-slate-500">
                                                                {hasBlowbagets 
                                                                    ? '✓ All checklist items verified' 
                                                                    : `⚠ ${Object.values(blowbagetsChecklist).filter(v => !v).length} items remaining`
                                                                }
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className={`px-4 py-2 rounded-lg border-2 font-bold text-xs ${
                                                        hasBlowbagets
                                                        ? 'bg-emerald-600 text-white border-emerald-700'
                                                        : 'bg-slate-200 text-slate-500 border-slate-300'
                                                    }`}>
                                                        {hasBlowbagets ? 'VERIFIED' : 'INCOMPLETE'}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Supplies - Full Width Below */}
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
                                        <div className="space-y-3 max-w-2xl">
                                            <label className="flex items-center gap-2 text-sm font-bold text-slate-700 uppercase tracking-wide">
                                                <span className="h-1 w-1 rounded-full bg-amber-500"></span>
                                                Special Notes
                                            </label>
                                            <textarea
                                                value={othersNote}
                                                onChange={(e) => setOthersNote(e.target.value)}
                                                rows={4}
                                                className="w-full rounded-xl border-2 border-slate-200 px-5 py-4 text-sm font-medium focus:border-amber-500 focus:ring-4 focus:ring-amber-500/20 focus:outline-none resize-none transition-all bg-white shadow-sm hover:shadow-md"
                                                placeholder="Special notes or other supplies..."
                                            />
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                                            {SUPPLY_CATALOGUE.find(c => c.category === activeCategory)?.items.map(item => (
                                                <div key={item} className="group relative">
                                                    <div className="flex flex-col items-center justify-center gap-3 p-4 rounded-2xl border-2 border-slate-200 bg-gradient-to-br from-white to-slate-50 hover:border-amber-300 hover:shadow-lg transition-all duration-300 aspect-square">
                                                        <span className="text-xs font-bold text-slate-700 group-hover:text-amber-600 transition-colors text-center leading-tight">{item}</span>
                                                        <input
                                                            type="text"
                                                            value={getQty(activeCategory, item) || ""}
                                                            onChange={(e) => setQty(activeCategory, item, parseInt(e.target.value) || 0)}
                                                            className="w-14 h-10 text-center text-sm font-black border-2 border-slate-200 rounded-lg bg-white focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 focus:outline-none transition-all shadow-sm"
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

                                        {/* Personnel Included */}
                                        {personnelIncluded && (
                                            <div className="p-5 rounded-3xl bg-white border border-slate-200 shadow-sm">
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Personnel Included</p>
                                                <div className="flex items-center gap-3">
                                                    <div className="h-10 w-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100">
                                                        <span className="material-symbols-outlined">group</span>
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-slate-900">{personnelIncluded}</p>
                                                        <p className="text-xs text-slate-500 mt-0.5">Supporting Team</p>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* Blowbagets Checklist Status */}
                                        <div className="col-span-full p-5 rounded-3xl bg-white border border-slate-200 shadow-sm">
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">BLOWBAGETS Safety Checklist</p>
                                            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
                                                {Object.entries(blowbagetsChecklist).map(([key, checked]) => {
                                                    const labels: Record<string, string> = {
                                                        battery: 'Battery',
                                                        lights: 'Lights',
                                                        oil: 'Oil',
                                                        water: 'Water',
                                                        brakes: 'Brakes',
                                                        air: 'Air',
                                                        gas: 'Gas',
                                                        engine: 'Engine',
                                                        tires: 'Tires',
                                                        self: 'Self'
                                                    };
                                                    return (
                                                        <div key={key} className={`flex items-center gap-2 p-2 rounded-lg border ${checked ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
                                                            <div className={`h-5 w-5 rounded flex items-center justify-center ${checked ? 'bg-emerald-600 text-white' : 'bg-slate-300 text-slate-500'}`}>
                                                                {checked && <span className="material-symbols-outlined" style={{ fontSize: "0.8rem" }}>check</span>}
                                                            </div>
                                                            <span className={`text-[10px] font-bold ${checked ? 'text-emerald-700' : 'text-slate-400'}`}>
                                                                {labels[key]}
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                            <div className={`flex items-center gap-3 p-3 rounded-xl border-2 ${hasBlowbagets ? 'bg-emerald-50 border-emerald-300' : 'bg-amber-50 border-amber-300'}`}>
                                                <div className={`h-10 w-10 rounded-xl flex items-center justify-center border ${hasBlowbagets ? 'bg-emerald-600 text-white border-emerald-700' : 'bg-amber-500 text-white border-amber-600'}`}>
                                                    <span className="material-symbols-outlined">{hasBlowbagets ? 'verified' : 'warning'}</span>
                                                </div>
                                                <div className="flex-1">
                                                    <p className={`font-bold ${hasBlowbagets ? 'text-emerald-900' : 'text-amber-900'}`}>
                                                        {hasBlowbagets ? 'All Safety Checks Verified' : `${Object.values(blowbagetsChecklist).filter(v => !v).length} Items Not Checked`}
                                                    </p>
                                                    <p className={`text-xs mt-0.5 ${hasBlowbagets ? 'text-emerald-600' : 'text-amber-600'}`}>
                                                        {hasBlowbagets ? 'Vehicle ready for dispatch' : 'Safety verification incomplete'}
                                                    </p>
                                                </div>
                                                <div className={`px-4 py-2 rounded-lg font-bold text-xs ${hasBlowbagets ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-white'}`}>
                                                    {Object.values(blowbagetsChecklist).filter(v => v).length}/10
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
                            <div className="flex flex-col gap-2">
                                <div className="flex items-center gap-3 text-rose-600 bg-rose-50 px-5 py-3 rounded-xl border-2 border-rose-200 shadow-lg animate-shake">
                                    <div className="h-10 w-10 rounded-xl bg-rose-100 flex items-center justify-center flex-shrink-0">
                                        <span className="material-symbols-outlined" style={{ fontSize: "1.3rem" }}>error</span>
                                    </div>
                                    <p className="text-sm font-bold tracking-tight">{error}</p>
                                </div>
                                {(error.includes("PERMISSION") || error.includes("permission")) && (
                                    <a
                                        href="/setup-admin"
                                        className="flex items-center justify-center gap-2 text-xs font-bold text-blue-600 bg-blue-50 px-4 py-2 rounded-lg border border-blue-200 hover:bg-blue-100 transition-colors"
                                    >
                                        <span className="material-symbols-outlined" style={{ fontSize: "1rem" }}>settings</span>
                                        Go to Admin Setup
                                    </a>
                                )}
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
                        {step === "summary" && (
                            <button
                                type="button"
                                onClick={exportBlowbagets}
                                className="group px-6 py-3.5 rounded-xl border-2 border-blue-300 bg-gradient-to-r from-blue-50 to-blue-100 text-sm font-bold text-blue-700 hover:from-blue-600 hover:to-blue-700 hover:text-white hover:border-blue-700 transition-all duration-300 flex items-center gap-2 shadow-lg hover:shadow-xl"
                            >
                                <span className="material-symbols-outlined" style={{ fontSize: "1.2rem" }}>print</span>
                                Print
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
