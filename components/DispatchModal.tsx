"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
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
import { logActivity } from "@/lib/activity-logger";
import { acquireModalLock, releaseModalLock } from "@/lib/modal-lock";
import { getItemClassLookup, resolveSupplyClassLabel } from "@/lib/supply-class-resolver";
import dynamic from "next/dynamic";

// Dynamic import for Leaflet (avoids SSR errors)
const LeafletMap = dynamic<{ lat: number; lng: number; onChange: (lat: number, lng: number) => void }>(
    () => import("@/components/LeafletMap"),
    {
        ssr: false,
        loading: () => <div className="h-44 w-full bg-slate-100 animate-pulse rounded-lg flex items-center justify-center text-slate-400 text-xs font-medium">Loading Map...</div>
    }
);

interface Supply {
    category: string;
    item: string;
    quantity: number;
}

interface RequisitionOption {
    id: string;
    requisitionNumber: string;
    requestedByName?: string;
    embeddedSupplies: Supply[];
}

const normalizeLookupValue = (value: unknown): string =>
    String(value ?? "").trim().toLowerCase();

const isDeliveredStatus = (status: unknown): boolean => {
    const normalized = normalizeLookupValue(status).replace(/[_-]+/g, " ");
    return (
        normalized === "delivered" ||
        normalized === "completed" ||
        normalized === "successful dispatch" ||
        normalized === "sucessful dispatch" ||
        normalized === "success dispatch"
    );
};

interface Props {
    onClose: () => void;
    onSuccess: () => void;
}



export default function DispatchModal({ onClose, onSuccess }: Props) {
    const { user } = useAuth();
    // Core form state
    const [dispatchId, setDispatchId] = useState("");
    const [startLat, setStartLat] = useState("9.748257");
    const [startLng, setStartLng] = useState("118.771556");
    const [startLocationLabel, setStartLocationLabel] = useState("Base Camp");
    const [deliveryLat, setDeliveryLat] = useState("9.748257");
    const [deliveryLng, setDeliveryLng] = useState("118.771556");
    const [deliveryLocationLabel, setDeliveryLocationLabel] = useState("");
    const [pinTarget, setPinTarget] = useState<"start" | "delivery">("delivery");
    const [personnels, setPersonnels] = useState("");
    const [personnelIncluded, setPersonnelIncluded] = useState("");
    const [truck, setTruck] = useState("");
    const [requisitionNumber, setRequisitionNumber] = useState("");
    const [fetchedSupplies, setFetchedSupplies] = useState<Supply[]>([]);
    const [loadingSupplies, setLoadingSupplies] = useState(false);
    const [othersNote, setOthersNote] = useState("");
    
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
    const [approvedRequisitions, setApprovedRequisitions] = useState<RequisitionOption[]>([]);
    const [loadingRequisitions, setLoadingRequisitions] = useState(false);

    useEffect(() => {
        acquireModalLock();
        return () => {
            releaseModalLock();
        };
    }, []);

    // Computed: All blowbagets checked
    const hasBlowbagets = Object.values(blowbagetsChecklist).every(checked => checked);

    // Toggle individual checklist item
    const toggleBlowbagetsItem = (item: keyof typeof blowbagetsChecklist) => {
        setBlowbagetsChecklist(prev => ({ ...prev, [item]: !prev[item] }));
    };

    // Check all blowbagets items
    const checkAllBlowbagets = () => {
        setBlowbagetsChecklist({
            battery: true,
            lights: true,
            oil: true,
            water: true,
            brakes: true,
            air: true,
            gas: true,
            engine: true,
            tires: true,
            self: true,
        });
    };

    // Normalize mixed item payloads into dispatch supply format
    const normalizeSupplies = (rawItems: any[]): Supply[] => {
        return rawItems
            .map((entry: any) => {
                const itemName =
                    entry?.item ||
                    entry?.itemName ||
                    entry?.name ||
                    entry?.description ||
                    entry?.productName ||
                    entry?.itemDescription ||
                    "";

                const qtyRaw =
                    entry?.quantity ??
                    entry?.qty ??
                    entry?.requestedQty ??
                    entry?.approvedQty ??
                    entry?.releasedQty ??
                    entry?.releaseQty ??
                    entry?.issuedQty ??
                    entry?.count ??
                    0;

                const quantity = Number(qtyRaw) || 0;

                return {
                    category:
                        entry?.category ||
                        entry?.supplyClass ||
                        entry?.supply_class ||
                        entry?.classification ||
                        entry?.type ||
                        "Uncategorized",
                    item: String(itemName).trim(),
                    quantity,
                };
            })
            .filter((s) => s.item.length > 0);
    };

    const applySupplyClassCategories = async (supplies: Supply[]): Promise<Supply[]> => {
        if (!supplies.length) return supplies;

        const itemClassLookup = await getItemClassLookup();
        return supplies.map((supply) => ({
            ...supply,
            category: resolveSupplyClassLabel(supply, itemClassLookup),
        }));
    };

    // Fetch released requisitions from Firestore
    const fetchApprovedRequisitionsInitial = async () => {
        setLoadingRequisitions(true);
        try {
            // Exclude requisitions/POs already completed by delivered/successful dispatches.
            const deliveredDispatchRefs = new Set<string>();
            const dispatchesSnap = await getDocs(collection(db, "dispatches"));
            dispatchesSnap.forEach((dispatchDoc) => {
                const data = dispatchDoc.data() as any;
                if (!isDeliveredStatus(data.status)) return;

                [
                    data.requisitionNumber,
                    data.requisitionId,
                    data.requisitionNo,
                    data.requestNumber,
                    data.poNumber,
                    data.po,
                ].forEach((ref) => {
                    const normalizedRef = normalizeLookupValue(ref);
                    if (normalizedRef) {
                        deliveredDispatchRefs.add(normalizedRef);
                    }
                });
            });

            const requisitionSnap = await getDocs(collection(db, "requisitions"));

            const requisitionList = await Promise.all(
                requisitionSnap.docs.map(async (d) => {
                    const data = d.data() as any;
                    const rawStatus =
                        data.status ||
                        data.requisitionStatus ||
                        data.currentStatus ||
                        data.workflowStatus ||
                        data.approvalStatus ||
                        data.approval?.status ||
                        "";

                    const normalizedStatus = String(rawStatus).trim().toLowerCase().replace(/[_-]+/g, " ");
                    const isReleased = normalizedStatus === "released" || normalizedStatus === "for release" || !!data.releasedAt;

                    const embeddedLists = [
                        data.items,
                        data.supplies,
                        data.requisitionItems,
                        data.requestItems,
                        data.lineItems,
                        data.inventoryItems,
                    ].filter(Array.isArray) as any[][];

                    const embeddedSupplies = await applySupplyClassCategories(
                        normalizeSupplies(embeddedLists.flat())
                    );

                    return {
                        id: d.id,
                        isReleased,
                        requisitionNumber:
                            data.requisitionNumber ||
                            data.requisitionNo ||
                            data.requestNumber ||
                            data.requisitionId ||
                            data.poNumber ||
                            d.id,
                        requestedByName:
                            data.requestedByName ||
                            data.requestorName ||
                            data.createdByName ||
                            data.requestedBy ||
                            "",
                        embeddedSupplies,
                    };
                })
            );

            const filteredRequisitionList = requisitionList
                .filter((r) => r.isReleased)
                .map(({ id, requisitionNumber, requestedByName, embeddedSupplies }) => ({ id, requisitionNumber, requestedByName, embeddedSupplies }))
                .filter((r) => !deliveredDispatchRefs.has(normalizeLookupValue(r.requisitionNumber)));

            setApprovedRequisitions(filteredRequisitionList);
        } catch (err) {
            console.error("Error fetching released requisitions:", err);
            setApprovedRequisitions([]);
            setError("Unable to load released requisitions. Please check Firestore permissions for requisitions.");
        } finally {
            setLoadingRequisitions(false);
        }
    };

    // Handle requisition selection and auto-fetch supplies
    const handleRequisitionChange = (selectedRequisition: RequisitionOption) => {
        setRequisitionNumber(selectedRequisition.requisitionNumber);
        if (selectedRequisition.requisitionNumber) {
            fetchSuppliesFromRequisition(selectedRequisition);
        } else {
            setFetchedSupplies([]);
        }
    };

    // Fetch supplies from requisition (document items, subcollection items, then items collection fallback)
    const fetchSuppliesFromRequisition = async (selectedRequisition: RequisitionOption) => {
        if (!selectedRequisition.requisitionNumber.trim()) {
            setFetchedSupplies([]);
            return;
        }

        setLoadingSupplies(true);
        try {
            // 1) Prefer items already embedded in requisition doc
            if (selectedRequisition.embeddedSupplies.length > 0) {
                setFetchedSupplies(await applySupplyClassCategories(selectedRequisition.embeddedSupplies));
                setError("");
                return;
            }

            // 2) Fallback: requisitions/{id}/items subcollection
            const subItemsSnap = await getDocs(collection(db, "requisitions", selectedRequisition.id, "items"));
            const subSupplies = await applySupplyClassCategories(
                normalizeSupplies(subItemsSnap.docs.map((d) => d.data()))
            );
            if (subSupplies.length > 0) {
                setFetchedSupplies(subSupplies);
                setError("");
                return;
            }

            // 3) Last fallback: filter from global items collection by requisition number
            const itemsSnap = await getDocs(query(collection(db, "items"), orderBy("name", "asc")));
            const items = itemsSnap.docs.map(doc => doc.data());

            const requisitionSupplies = await applySupplyClassCategories(
                normalizeSupplies(
                    items
                    .filter((item: any) =>
                        item.requisitionNumber === selectedRequisition.requisitionNumber ||
                        item.requisitionNo === selectedRequisition.requisitionNumber ||
                        item.requisition === selectedRequisition.requisitionNumber ||
                        item.requestNumber === selectedRequisition.requisitionNumber ||
                        item.poNumber === selectedRequisition.requisitionNumber ||
                        item.po === selectedRequisition.requisitionNumber
                    )
                )
            );

            setFetchedSupplies(requisitionSupplies);
            setError("");
        } catch (err) {
            console.error("Error fetching supplies from requisition:", err);
            setError("Failed to fetch supplies from requisition. Please select a valid requisition and try again.");
            setFetchedSupplies([]);
        } finally {
            setLoadingSupplies(false);
        }
    };

    // Generate dispatch ID and fetch data
    useEffect(() => {
        const loadInitialData = async () => {
            try {
                const counterRef = doc(db, "meta", "dispatchCounter");
                const snap = await getDoc(counterRef);
                const count = snap.exists() ? (snap.data().count as number) : 0;
                const year = new Date().getFullYear();
                setDispatchId(`${year}${String(count + 1).padStart(8, "0")}`);
            } catch (err) {
                console.error("Error loading dispatch counter:", err);
            }

            try {
                const vSnap = await getDocs(query(collection(db, "vehicles"), orderBy("codename", "asc")));
                const vData = vSnap.docs.map(d => ({
                    id: d.id,
                    codename: d.data().codename,
                    plate: d.data().plate,
                }));
                setDbVehicles(vData);
                if (vData.length > 0) setTruck(vData[0].codename);
            } catch (err) {
                console.error("Error loading vehicles:", err);
            }

            try {
                const oSnap = await getDocs(query(collection(db, "personnelAccount"), orderBy("lastName", "asc")));
                setDbPersonnels(oSnap.docs.map(d => {
                    const data = d.data();
                    return {
                        id: d.id,
                        name: `[${data.rank}] ${data.lastName}, ${data.firstName}`,
                    };
                }));
            } catch (err) {
                console.error("Error loading personnels:", err);
            }

            await fetchApprovedRequisitionsInitial();
        };
        loadInitialData();
    }, []);



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
                <td>${deliveryLocationLabel || `${deliveryLat}, ${deliveryLng}`}</td>
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
        if (!hasBlowbagets) { setError("All BLOWBAGETS checklist items must be checked before submitting."); return; }
        setError("");
        setSubmitting(true);

        try {
            const suppliesWithResolvedClass = await applySupplyClassCategories(fetchedSupplies);
            const counterRef = doc(db, "meta", "dispatchCounter");
            const dispatchRef = doc(collection(db, "dispatches"));
            let createdDispatchId = "";

            await runTransaction(db, async (tx) => {
                const counterSnap = await tx.get(counterRef);
                const prevCount = counterSnap.exists() ? counterSnap.data().count : 0;
                const newCount = prevCount + 1;
                const year = new Date().getFullYear();
                const padded = String(newCount).padStart(8, "0");
                const finalId = `${year}${padded}`;
                createdDispatchId = finalId;

                tx.set(counterRef, { count: newCount }, { merge: true });
                tx.set(dispatchRef, {
                    dispatchId: finalId,
                    startLocation: {
                        lat: parseFloat(startLat),
                        lng: parseFloat(startLng),
                        label: startLocationLabel || `${startLat}, ${startLng}`,
                    },
                    deliveryLocation: {
                        lat: parseFloat(deliveryLat),
                        lng: parseFloat(deliveryLng),
                        label: deliveryLocationLabel || `${deliveryLat}, ${deliveryLng}`,
                    },
                    // Backward-compatible field for existing screens and historical data
                    location: {
                        lat: parseFloat(deliveryLat),
                        lng: parseFloat(deliveryLng),
                        label: deliveryLocationLabel || `${deliveryLat}, ${deliveryLng}`,
                    },
                    officer: personnels.trim(),
                    personnels: personnels.trim(),
                    personnelIncluded: personnelIncluded.trim(),
                    truck,
                    supplies: suppliesWithResolvedClass,
                    requisitionNumber: requisitionNumber.trim(),
                    requisitionId: requisitionNumber.trim(),
                    poNumber: requisitionNumber.trim(),
                    othersNote: othersNote.trim(),
                    blowbagetsChecklist,
                    hasBlowbagets,
                    status: "Pending",
                    createdAt: serverTimestamp(),
                });
            });

            // Log activity
            if (user?.email) {
                await logActivity(
                    "DISPATCH_CREATED",
                    `Created dispatch ${createdDispatchId}`,
                    user.email,
                    {
                        dispatchId: createdDispatchId,
                        officer: personnels.trim(),
                        truck,
                        location: deliveryLocationLabel || `${deliveryLat}, ${deliveryLng}`,
                        suppliesCount: fetchedSupplies.length,
                        requisitionNumber: requisitionNumber.trim(),
                    }
                );
            }

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
                                        <span className="text-sm font-black text-white tracking-wide uppercase">Start & Delivery Pin Point</span>
                                        <div className="ml-auto">
                                            <span className="px-2.5 py-0.5 bg-white/20 rounded-full text-[9px] font-bold text-white uppercase tracking-wider backdrop-blur-sm border border-white/30">Required</span>
                                        </div>
                                    </div>
                                    <div className="p-5 space-y-4">
                                        <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-gradient-to-r from-slate-900 to-slate-800 rounded-xl border border-slate-700 font-mono text-xs text-slate-300 shadow-lg">
                                            <span className="text-emerald-400 font-bold uppercase tracking-wider text-[10px]">Editing:</span>
                                            <span className="font-black text-emerald-300 text-xs">{pinTarget === "start" ? "Starting Pin Point" : "Delivery Pin Point"}</span>
                                            <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse shadow-lg shadow-emerald-400/50"></div>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setPinTarget("start")}
                                                className={`rounded-xl border-2 px-3 py-2 text-xs font-bold transition-all ${pinTarget === "start" ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:border-blue-300"}`}
                                            >
                                                Set Starting Pin Point
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setPinTarget("delivery")}
                                                className={`rounded-xl border-2 px-3 py-2 text-xs font-bold transition-all ${pinTarget === "delivery" ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-600 hover:border-emerald-300"}`}
                                            >
                                                Set Delivery Pin Point
                                            </button>
                                        </div>
                                        <div className="rounded-2xl overflow-hidden border-4 border-white shadow-2xl aspect-square relative group">
                                            <LeafletMap
                                                lat={parseFloat(pinTarget === "start" ? startLat : deliveryLat)}
                                                lng={parseFloat(pinTarget === "start" ? startLng : deliveryLng)}
                                                onChange={(newLat, newLng) => {
                                                    if (pinTarget === "start") {
                                                        setStartLat(newLat.toFixed(6));
                                                        setStartLng(newLng.toFixed(6));
                                                    } else {
                                                        setDeliveryLat(newLat.toFixed(6));
                                                        setDeliveryLng(newLng.toFixed(6));
                                                    }
                                                }}
                                            />
                                            <div className="absolute top-3 right-3 z-[1000] bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-lg shadow-xl font-black text-[10px] text-emerald-700 border-2 border-emerald-200 uppercase tracking-widest hover:scale-105 transition-transform">
                                                📍 Click to Set
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            <div className="space-y-2">
                                                <label className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wide">
                                                    <span className="h-1 w-1 rounded-full bg-blue-500"></span>
                                                    Starting Pin Point
                                                </label>
                                                <p className="rounded-lg bg-slate-100 px-3 py-2 text-[11px] font-mono text-slate-700">{startLat}, {startLng}</p>
                                                <input
                                                    type="text"
                                                    value={startLocationLabel}
                                                    onChange={(e) => setStartLocationLabel(e.target.value)}
                                                    className="w-full rounded-xl border-2 border-slate-200 px-4 py-2.5 text-sm font-medium focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 focus:outline-none transition-all bg-white shadow-sm hover:shadow-md"
                                                    placeholder="e.g. AFP Base Camp"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wide">
                                                    <span className="h-1 w-1 rounded-full bg-emerald-500"></span>
                                                    Delivery Pin Point
                                                </label>
                                                <p className="rounded-lg bg-slate-100 px-3 py-2 text-[11px] font-mono text-slate-700">{deliveryLat}, {deliveryLng}</p>
                                                <input
                                                    type="text"
                                                    value={deliveryLocationLabel}
                                                    onChange={(e) => setDeliveryLocationLabel(e.target.value)}
                                                    className="w-full rounded-xl border-2 border-slate-200 px-4 py-2.5 text-sm font-medium focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/20 focus:outline-none transition-all bg-white shadow-sm hover:shadow-md"
                                                    placeholder="e.g. Puerto Princesa Main Camp"
                                                />
                                            </div>
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
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={checkAllBlowbagets}
                                                        className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-all shadow-sm hover:shadow-md flex items-center gap-1"
                                                    >
                                                        <span className="material-symbols-outlined" style={{ fontSize: "0.9rem" }}>done_all</span>
                                                        Check All
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={exportBlowbagets}
                                                        className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-all shadow-sm hover:shadow-md flex items-center gap-1"
                                                    >
                                                        <span className="material-symbols-outlined" style={{ fontSize: "0.9rem" }}>print</span>
                                                        Print
                                                    </button>
                                                </div>
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

                            {/* Requisition Input - Auto-Fill Supplies */}
                            <div className="rounded-3xl border border-amber-200/50 overflow-hidden bg-gradient-to-br from-white to-amber-50/30 shadow-xl hover:shadow-2xl transition-shadow duration-500">
                                <div className="flex items-center gap-3 bg-gradient-to-r from-amber-600 via-amber-500 to-orange-600 px-6 py-4 relative overflow-hidden">
                                    <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 animate-shimmer"></div>
                                    <div className="h-10 w-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/30 shadow-lg">
                                        <span className="material-symbols-outlined text-white" style={{ fontSize: "1.4rem" }}>receipt_long</span>
                                    </div>
                                    <span className="text-base font-black text-white tracking-wide uppercase">Requisition - Auto Supply Loader</span>
                                    <div className="ml-auto">
                                        <span className="px-3 py-1 bg-white/20 rounded-full text-[10px] font-bold text-white uppercase tracking-wider backdrop-blur-sm border border-white/30">Optional</span>
                                    </div>
                                </div>
                                <div className="p-6 space-y-4">
                                    <div className="space-y-3">
                                        <label className="flex items-center gap-2 text-sm font-bold text-slate-700 uppercase tracking-wide">
                                            <span className="h-1 w-1 rounded-full bg-amber-500"></span>
                                            Select Requisition
                                        </label>
                                        {loadingRequisitions ? (
                                            <div className="w-full rounded-xl border-2 border-slate-200 px-5 py-3 text-sm font-medium bg-white shadow-sm text-slate-500">
                                                Loading Requisitions...
                                            </div>
                                        ) : approvedRequisitions.length === 0 ? (
                                            <div className="w-full rounded-xl border-2 border-amber-200 px-5 py-3 text-sm font-medium bg-amber-50 text-amber-700">
                                                No released requisitions found.
                                            </div>
                                        ) : (
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-56 overflow-y-auto pr-1">
                                                {approvedRequisitions.map((req) => {
                                                    const isSelected = requisitionNumber === req.requisitionNumber;
                                                    return (
                                                        <button
                                                            key={req.id}
                                                            type="button"
                                                            onClick={() => handleRequisitionChange(req)}
                                                            className={`text-left p-3 rounded-xl border-2 transition-all ${isSelected
                                                                ? "border-emerald-500 bg-emerald-50 shadow-md"
                                                                : "border-slate-200 bg-white hover:border-amber-300 hover:shadow-sm"
                                                                }`}
                                                        >
                                                            <div className="flex items-center justify-between gap-2">
                                                                <p className="text-sm font-bold text-slate-800 truncate">{req.requisitionNumber}</p>
                                                                {isSelected && (
                                                                    <span className="material-symbols-outlined text-emerald-600" style={{ fontSize: "1rem" }}>check_circle</span>
                                                                )}
                                                            </div>
                                                            {req.requestedByName && (
                                                                <p className="text-[11px] text-slate-500 mt-1 truncate">Requested by: {req.requestedByName}</p>
                                                            )}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                        {loadingSupplies && (
                                            <p className="text-xs text-amber-600 font-semibold">Loading supplies from selected requisition...</p>
                                        )}
                                        <p className="text-xs text-slate-500 italic">Select a released requisition to automatically load supplies from your inventory management system.</p>
                                    </div>

                                    {/* Loaded Supplies Preview */}
                                    {fetchedSupplies.length > 0 && (
                                        <div className="pt-4 border-t border-amber-100">
                                            <p className="text-xs font-bold text-slate-600 uppercase mb-3">Loaded Supplies ({fetchedSupplies.length} items)</p>
                                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 max-h-48 overflow-y-auto">
                                                {fetchedSupplies.map((supply, idx) => (
                                                    <div key={idx} className="p-2 rounded-lg bg-white border border-amber-200 hover:border-amber-400 transition-all">
                                                        <p className="text-xs font-semibold text-slate-700 truncate">{supply.item}</p>
                                                        <div className="flex items-center justify-between mt-1">
                                                            <p className="text-[10px] text-slate-500">{supply.category}</p>
                                                            <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded text-[10px] font-bold">x{supply.quantity}</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Special Notes */}
                                    <div className="pt-4 border-t border-amber-100">
                                        <label className="flex items-center gap-2 text-sm font-bold text-slate-700 uppercase tracking-wide mb-3">
                                            <span className="h-1 w-1 rounded-full bg-amber-500"></span>
                                            Additional Notes (Optional)
                                        </label>
                                        <textarea
                                            value={othersNote}
                                            onChange={(e) => setOthersNote(e.target.value)}
                                            rows={3}
                                            className="w-full rounded-xl border-2 border-slate-200 px-5 py-4 text-sm font-medium focus:border-amber-500 focus:ring-4 focus:ring-amber-500/20 focus:outline-none resize-none transition-all bg-white shadow-sm hover:shadow-md"
                                            placeholder="Any special notes about this dispatch..."
                                        />
                                    </div>
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
                                        lat={parseFloat(deliveryLat)}
                                        lng={parseFloat(deliveryLng)}
                                        onChange={() => { }} // Read-only in summary
                                    />
                                    <div className="absolute top-4 left-4 z-[1000] bg-white/90 backdrop-blur-md px-4 py-2 rounded-2xl shadow-lg border border-slate-200 flex items-center gap-2">
                                        <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                                        <span className="text-[10px] font-bold text-slate-800 uppercase tracking-widest">Target Pinned</span>
                                    </div>
                                    <div className="absolute bottom-4 left-4 z-[1000] bg-slate-900/80 backdrop-blur-md px-3 py-1.5 rounded-xl text-[9px] font-mono text-white border border-white/20">
                                        {deliveryLat}, {deliveryLng}
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
                                        <div className="p-5 rounded-3xl bg-white border border-slate-200 shadow-sm hover:border-blue-200 transition-colors">
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Starting Pin Point</p>
                                            <div className="flex items-start gap-3">
                                                <div className="h-10 w-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
                                                    <span className="material-symbols-outlined">trip_origin</span>
                                                </div>
                                                <div>
                                                    <p className="font-bold text-slate-900 leading-snug">{startLocationLabel || "Unlabeled Start"}</p>
                                                    <p className="text-xs text-slate-500 mt-0.5">{startLat}, {startLng}</p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Delivery Location */}
                                        <div className="p-5 rounded-3xl bg-white border border-slate-200 shadow-sm hover:border-emerald-200 transition-colors">
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Delivery Pin Point</p>
                                            <div className="flex items-start gap-3">
                                                <div className="h-10 w-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
                                                    <span className="material-symbols-outlined">location_on</span>
                                                </div>
                                                <div>
                                                    <p className="font-bold text-slate-900 leading-snug">{deliveryLocationLabel || "Unlabeled Marker"}</p>
                                                    <p className="text-xs text-slate-500 mt-0.5">{deliveryLat}, {deliveryLng}</p>
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
                                    {requisitionNumber.trim() && <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded uppercase border border-amber-200">{requisitionNumber}</span>}
                                    <span className="text-[10px] font-bold text-slate-400 uppercase ml-4">{fetchedSupplies.length} Items</span>
                                </div>

                                <div className="max-h-96 overflow-y-auto pr-2 custom-scrollbar">
                                    {fetchedSupplies.length > 0 ? (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
                                            {fetchedSupplies.map((supply, idx) => (
                                                <div key={idx} className="flex items-center justify-between text-sm p-3 bg-white rounded-2xl border border-slate-100 hover:border-emerald-200 hover:shadow-md transition-all group">
                                                    <div className="flex flex-col gap-1">
                                                        <span className="text-slate-700 font-semibold">{supply.item}</span>
                                                        <span className="text-[10px] text-slate-500">{supply.category}</span>
                                                    </div>
                                                    <span className="font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-xl border border-emerald-100/50 whitespace-nowrap">
                                                        x{supply.quantity}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-center py-12 bg-slate-50 rounded-3xl border border-dashed border-slate-200">
                                            <span className="material-symbols-outlined text-slate-300 text-4xl block mb-2">inventory_2</span>
                                            <p className="text-sm text-slate-400 italic font-medium">No supplies loaded from requisition. Select a requisition to auto-populate supplies.</p>
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
                            onClick={() => {
                                if (step === "form") {
                                    if (!personnels.trim()) { setError("Personnel assignment is required."); return; }
                                    if (!truck) { setError("Truck selection is required."); return; }
                                    if (!requisitionNumber.trim()) { setError("Please select a released requisition before proceeding to summary review."); return; }
                                    if (!hasBlowbagets) { setError("All BLOWBAGETS checklist items must be checked before proceeding to summary review."); return; }
                                    setError("");
                                    setStep("summary");
                                    return;
                                }
                                handleSubmit();
                            }}
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
