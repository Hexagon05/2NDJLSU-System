"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import {
    collection,
    addDoc,
    getDocs,
    Timestamp,
    orderBy,
    query,
    doc,
    updateDoc,
} from "firebase/firestore";
import { hashPassword } from "@/lib/password-utils";
import { uploadImageToCloudinary } from "@/lib/cloudinary";

interface Officer {
    id?: string;
    lastName: string;
    firstName: string;
    middleInitial: string;
    rank: string;
    position: string;
    contactNo: string;
    email: string;
    dateOfBirth: string;
    dateAdded: string;
    currentAddress: string;
    permanentAddress: string;
    username: string;
    imageUrl?: string;
}

const EMPTY_FORM: Omit<Officer, "id" | "dateAdded" | "username"> & { password: string; confirmPassword: string } = {
    lastName: "",
    firstName: "",
    middleInitial: "",
    rank: "",
    position: "",
    contactNo: "",
    email: "",
    dateOfBirth: "",
    currentAddress: "",
    permanentAddress: "",
    password: "",
    confirmPassword: "",
    imageUrl: "",
};

export default function PersonnelsPage() {
    const { user, loading, signOut } = useAuth();
    const router = useRouter();

    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [viewMode, setViewMode] = useState<"card" | "list">("card");
    const [searchTerm, setSearchTerm] = useState("");
    const [modalOpen, setModalOpen] = useState(false);
    const [form, setForm] = useState({ ...EMPTY_FORM });
    const [submitting, setSubmitting] = useState(false);
    const [personnels, setPersonnels] = useState<Officer[]>([]);
    const [fetchLoading, setFetchLoading] = useState(true);
    const [successMsg, setSuccessMsg] = useState("");
    const [errorMsg, setErrorMsg] = useState("");
    const [selectedPersonnel, setSelectedPersonnel] = useState<Officer | null>(null);
    const [originalPersonnel, setOriginalPersonnel] = useState<Officer | null>(null);
    const [detailsModalOpen, setDetailsModalOpen] = useState(false);
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [confirmationOpen, setConfirmationOpen] = useState(false);
    const [cancelConfirmationOpen, setCancelConfirmationOpen] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [uploadingImage, setUploadingImage] = useState(false);
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string>("");

    const today = new Date().toISOString().split("T")[0];

    const navigationItems = [
        { name: "Dashboard", icon: "dashboard", href: "/dashboard", active: false },
        { name: "Personnels", icon: "groups", href: "/personnels", active: true },
        { name: "Vehicle", icon: "local_shipping", href: "/vehicle", active: false },
        { name: "History", icon: "history", href: "/history", active: false },
    ];

    // ── fetch officers ──────────────────────────────────────────────
    const fetchOfficers = async () => {
        setFetchLoading(true);
        try {
            const q = query(collection(db, "personnelAccount"), orderBy("dateAdded", "desc"));
            const snap = await getDocs(q);
            const data: Officer[] = snap.docs.map((doc) => ({
                id: doc.id,
                ...(doc.data() as Omit<Officer, "id">),
            }));
            setPersonnels(data);
        } catch (e) {
            console.error("Error fetching officers:", e);
        } finally {
            setFetchLoading(false);
        }
    };

    useEffect(() => {
        if (user) fetchOfficers();
    }, [user]);

    // Set image preview when editing personnel with existing image
    useEffect(() => {
        if (editModalOpen && selectedPersonnel?.imageUrl) {
            setImagePreview(selectedPersonnel.imageUrl);
        } else if (!editModalOpen) {
            setImagePreview("");
            setImageFile(null);
        }
    }, [editModalOpen, selectedPersonnel?.imageUrl]);

    // ── auth guards ─────────────────────────────────────────────────
    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
                <div className="text-center">
                    <span
                        className="material-symbols-outlined animate-spin text-blue-400"
                        style={{ fontSize: "3rem" }}
                    >
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

    // ── form helpers ────────────────────────────────────────────────
    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    };

    // ── password validation ─────────────────────────────────────────
    const validatePassword = (password: string): { valid: boolean; error?: string } => {
        if (password.length < 8) {
            return { valid: false, error: "Password must be at least 8 characters" };
        }
        if (!/\d/.test(password)) {
            return { valid: false, error: "Password must contain at least one number" };
        }
        if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
            return { valid: false, error: "Password must contain at least one symbol" };
        }
        return { valid: true };
    };

    // ── generate personnel ID ───────────────────────────────────────
    const generatePersonnelId = (): string => {
        const currentYear = new Date().getFullYear();
        const yearStr = String(currentYear);
        
        // Filter for IDs created this year
        const thisYearPersonnels = personnels.filter(p => {
            if (!p.username) return false;
            const idYear = p.username.substring(0, 4);
            return idYear === yearStr;
        });
        
        const nextSequence = thisYearPersonnels.length + 1;
        const sequenceStr = String(nextSequence).padStart(5, '0');
        
        return `${yearStr}${sequenceStr}`;
    };

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            // Validate file type
            const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];
            if (!validTypes.includes(file.type)) {
                setErrorMsg("Invalid file type. Please upload a valid image (JPEG, PNG, GIF, or WebP).");
                return;
            }
            // Validate file size (max 10MB)
            const maxSize = 10 * 1024 * 1024;
            if (file.size > maxSize) {
                setErrorMsg("File size too large. Maximum size is 10MB.");
                return;
            }
            setImageFile(file);
            // Create preview
            const reader = new FileReader();
            reader.onloadend = () => {
                setImagePreview(reader.result as string);
            };
            reader.readAsDataURL(file);
            setErrorMsg("");
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        setErrorMsg("");
        
        try {
            // Upload image if selected
            let imageUrl = "";
            if (imageFile) {
                setUploadingImage(true);
                try {
                    const uploadResult = await uploadImageToCloudinary(imageFile, "personnel");
                    imageUrl = uploadResult.secure_url;
                } catch (error) {
                    console.error("Image upload error:", error);
                    setErrorMsg("Failed to upload image. You can still save without an image.");
                    // Continue without image
                } finally {
                    setUploadingImage(false);
                }
            }
            
            // Validate password
            const passwordValidation = validatePassword(form.password);
            if (!passwordValidation.valid) {
                setErrorMsg(passwordValidation.error || "Invalid password");
                setSubmitting(false);
                return;
            }
            
            // Check if passwords match
            if (form.password !== form.confirmPassword) {
                setErrorMsg("Passwords do not match");
                setSubmitting(false);
                return;
            }
            
            // Generate personnel ID as username
            const username = generatePersonnelId();
            
            // Hash password for storage
            const hashedPassword = await hashPassword(form.password);
            
            // Remove plain password and confirmPassword from form data
            const { password, confirmPassword, ...formDataWithoutPassword } = form;
            
            // Add personnel account with all information
            await addDoc(collection(db, "personnelAccount"), {
                ...formDataWithoutPassword,
                username,
                password: hashedPassword,
                dateAdded: today,
                role: "officer",
                isActive: true,
                createdAt: Timestamp.now(),
                imageUrl: imageUrl || "",
            });
            
            setSuccessMsg(`Personnel added successfully! Username: ${username}`);
            setForm({ ...EMPTY_FORM });
            setModalOpen(false);
            await fetchOfficers();
            setTimeout(() => setSuccessMsg(""), 5000);
        } catch (err) {
            console.error("Error adding personnel:", err);
            setErrorMsg("Failed to add personnel. Please try again.");
        } finally {
            setSubmitting(false);
        }
    };

    const handleCloseModal = () => {
        setModalOpen(false);
        setForm({ ...EMPTY_FORM });
        setErrorMsg("");
        setShowPassword(false);
        setShowConfirmPassword(false);
        setImageFile(null);
        setImagePreview("");
    };

    const handleViewDetails = (officer: Officer) => {
        setSelectedPersonnel(officer);
        setOriginalPersonnel(officer);
        setDetailsModalOpen(true);
    };

    const handleSaveChanges = () => {
        setConfirmationOpen(true);
    };

    const handleConfirmSave = async () => {
        if (!selectedPersonnel || !selectedPersonnel.id) return;
        try {
            // Upload image if a new image was selected
            let imageUrl = selectedPersonnel.imageUrl || "";
            if (imageFile) {
                setUploadingImage(true);
                try {
                    const uploadResult = await uploadImageToCloudinary(imageFile, "personnel");
                    imageUrl = uploadResult.secure_url;
                } catch (error) {
                    console.error("Image upload error:", error);
                    setErrorMsg("Failed to upload image. Saving other changes...");
                } finally {
                    setUploadingImage(false);
                }
            }

            const { id, dateAdded, ...dataToUpdate } = selectedPersonnel;
            await updateDoc(doc(db, "personnelAccount", selectedPersonnel.id), {
                ...dataToUpdate,
                imageUrl,
            });
            // Update both selectedPersonnel and originalPersonnel with the new imageUrl
            const updatedPersonnel = { ...selectedPersonnel, imageUrl };
            setSelectedPersonnel(updatedPersonnel);
            setOriginalPersonnel(updatedPersonnel);
            setSuccessMsg("Personnel updated successfully!");
            setTimeout(() => setSuccessMsg(""), 3500);
            await fetchOfficers();
            setConfirmationOpen(false);
            setEditModalOpen(false);
            setDetailsModalOpen(true);
            setImageFile(null);
            setImagePreview("");
        } catch (error) {
            console.error("Error saving personnel details:", error);
            setErrorMsg("Failed to save personnel. Please try again.");
        }
    };

    const handleEditChange = (field: keyof Officer, value: any) => {
        if (selectedPersonnel) {
            setSelectedPersonnel({ ...selectedPersonnel, [field]: value });
        }
    };

    // ── filter ──────────────────────────────────────────────────────
    const filtered = personnels.filter((o) => {
        const term = searchTerm.toLowerCase();
        return (
            o.lastName.toLowerCase().includes(term) ||
            o.firstName.toLowerCase().includes(term) ||
            o.rank.toLowerCase().includes(term) ||
            o.position.toLowerCase().includes(term) ||
            o.email.toLowerCase().includes(term)
        );
    });

    // ── avatar initials ─────────────────────────────────────────────
    const initials = (o: Officer) =>
        `${o.firstName.charAt(0)}${o.lastName.charAt(0)}`.toUpperCase();

    const avatarColors = [
        "from-blue-500 to-indigo-600",
        "from-emerald-500 to-teal-600",
        "from-violet-500 to-purple-600",
        "from-rose-500 to-pink-600",
        "from-amber-500 to-orange-600",
        "from-cyan-500 to-sky-600",
    ];
    const getAvatarColor = (idx: number) => avatarColors[idx % avatarColors.length];

    // ── render ──────────────────────────────────────────────────────
    return (
        <div className="flex h-screen bg-gradient-to-br from-slate-100 to-slate-200">
            {/* ── Sidebar ── */}
            <div
                className={`${sidebarOpen ? "w-64" : "w-20"
                    } bg-gradient-to-b from-slate-900 to-slate-800 shadow-2xl transition-all duration-300 ease-in-out flex flex-col border-r border-slate-700/50`}
            >
                {/* Logo */}
                <div
                    className={`flex h-16 items-center border-b border-slate-700/50 px-3 ${sidebarOpen ? "justify-between" : "justify-center"
                        }`}
                >
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-green-600 text-white shadow-lg shadow-emerald-500/30 flex-shrink-0">
                            <span className="material-symbols-outlined" style={{ fontSize: "1.4rem" }}>
                                local_shipping
                            </span>
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
                            onClick={() => setSidebarOpen(false)}
                            className="rounded-lg p-1.5 hover:bg-slate-700 transition-colors text-slate-400 hover:text-white flex-shrink-0"
                        >
                            <span className="material-symbols-outlined" style={{ fontSize: "1.25rem" }}>
                                menu_open
                            </span>
                        </button>
                    )}
                </div>
                {!sidebarOpen && (
                    <button
                        onClick={() => setSidebarOpen(true)}
                        className="flex items-center justify-center w-full py-2 hover:bg-slate-700 transition-colors text-slate-400 hover:text-white border-b border-slate-700/50"
                    >
                        <span className="material-symbols-outlined" style={{ fontSize: "1.25rem" }}>
                            menu
                        </span>
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
                            <span
                                className="material-symbols-outlined flex-shrink-0"
                                style={{ fontSize: "1.5rem" }}
                            >
                                {item.icon}
                            </span>
                            {sidebarOpen && <span className="truncate text-sm font-semibold">{item.name}</span>}
                        </a>
                    ))}
                </nav>

                {/* Logout */}
                <div className="border-t border-slate-700/50 p-3">
                    <button
                        onClick={handleLogout}
                        className={`flex w-full items-center rounded-xl py-4 text-slate-400 hover:bg-rose-500/10 hover:text-rose-400 transition-all duration-200 border border-transparent hover:border-rose-500/20 ${sidebarOpen ? "gap-3 px-4" : "justify-center px-2"
                            }`}
                    >
                        <span className="material-symbols-outlined flex-shrink-0" style={{ fontSize: "1.5rem" }}>
                            logout
                        </span>
                        {sidebarOpen && <span className="text-sm font-semibold">Logout</span>}
                    </button>
                </div>
            </div>

            {/* ── Main Content ── */}
            <div className="flex flex-1 flex-col overflow-hidden">
                {/* Header */}
                <header className="border-b border-slate-200 bg-white/80 backdrop-blur-sm px-6 py-4 shadow-sm">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <span
                                className="material-symbols-outlined text-slate-600"
                                style={{ fontSize: "1.75rem" }}
                            >
                                groups
                            </span>
                            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                                Personnel Management
                            </h1>
                        </div>
                        <div className="flex items-center gap-4">
                            <button className="relative p-2.5 hover:bg-slate-100 rounded-xl transition-colors group">
                                <span
                                    className="material-symbols-outlined text-slate-500 group-hover:text-slate-700"
                                    style={{ fontSize: "1.5rem" }}
                                >
                                    notifications
                                </span>
                                <span className="absolute top-1.5 right-1.5 h-2.5 w-2.5 bg-rose-500 rounded-full animate-pulse ring-2 ring-white" />
                            </button>
                            <div className="flex items-center gap-3 pl-4 border-l border-slate-200">
                                <div className="text-right">
                                    <p className="text-sm font-semibold text-slate-900">{user?.email}</p>
                                    <p className="text-xs text-slate-500">System Administrator</p>
                                </div>
                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-md shadow-blue-500/30">
                                    <span className="material-symbols-outlined" style={{ fontSize: "1.25rem" }}>
                                        person
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </header>

                {/* Content */}
                <div className="flex-1 overflow-auto">
                    <div className="p-6 space-y-6">

                        {/* Success Banner */}
                        {successMsg && (
                            <div className="flex items-center gap-3 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-emerald-800 animate-fade-in">
                                <span className="material-symbols-outlined text-emerald-500" style={{ fontSize: "1.25rem" }}>
                                    check_circle
                                </span>
                                <span className="text-sm font-medium">{successMsg}</span>
                            </div>
                        )}

                        {/* Toolbar */}
                        <div className="flex gap-3 flex-wrap items-center">
                            {/* Search */}
                            <div className="flex-1 min-w-64 relative">
                                <span
                                    className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-slate-400"
                                    style={{ fontSize: "1.25rem" }}
                                >
                                    search
                                </span>
                                <input
                                    type="text"
                                    placeholder="Search by name, rank, or position..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-slate-900 placeholder-slate-400 shadow-sm transition-all focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                                />
                            </div>

                            {/* View toggle */}
                            <div className="flex items-center rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                                <button
                                    onClick={() => setViewMode("card")}
                                    className={`flex items-center gap-1.5 px-4 py-3 text-sm font-semibold transition-all ${viewMode === "card"
                                        ? "bg-gradient-to-r from-slate-800 to-slate-900 text-white"
                                        : "text-slate-500 hover:bg-slate-50"
                                        }`}
                                >
                                    <span className="material-symbols-outlined" style={{ fontSize: "1.1rem" }}>
                                        grid_view
                                    </span>
                                    Card
                                </button>
                                <button
                                    onClick={() => setViewMode("list")}
                                    className={`flex items-center gap-1.5 px-4 py-3 text-sm font-semibold transition-all ${viewMode === "list"
                                        ? "bg-gradient-to-r from-slate-800 to-slate-900 text-white"
                                        : "text-slate-500 hover:bg-slate-50"
                                        }`}
                                >
                                    <span className="material-symbols-outlined" style={{ fontSize: "1.1rem" }}>
                                        list
                                    </span>
                                    List
                                </button>
                            </div>

                            {/* Add Personnel */}
                            <button
                                onClick={() => setModalOpen(true)}
                                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 px-5 py-3 text-white text-sm font-semibold shadow-lg shadow-emerald-500/30 transition-all hover:shadow-xl active:scale-95"
                            >
                                <span className="material-symbols-outlined" style={{ fontSize: "1.1rem" }}>
                                    person_add
                                </span>
                                Add Personnel
                            </button>
                        </div>

                        {/* Stats bar */}
                        <div className="flex items-center gap-2 text-sm text-slate-500 font-medium">
                            <span className="material-symbols-outlined text-slate-400" style={{ fontSize: "1rem" }}>
                                groups
                            </span>
                            {fetchLoading ? "Loading…" : `${filtered.length} officer${filtered.length !== 1 ? "s" : ""} found`}
                        </div>

                        {/* ── Card View ── */}
                        {viewMode === "card" && (
                            <div>
                                {fetchLoading ? (
                                    <div className="flex justify-center py-20">
                                        <span className="material-symbols-outlined animate-spin text-emerald-400" style={{ fontSize: "2.5rem" }}>
                                            progress_activity
                                        </span>
                                    </div>
                                ) : filtered.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-24 text-slate-400">
                                        <span className="material-symbols-outlined" style={{ fontSize: "4rem" }}>
                                            group_off
                                        </span>
                                        <p className="mt-3 text-base font-medium">No personnel found</p>
                                        <p className="text-sm">Add one using the button above.</p>
                                    </div>
                                ) : (
                                    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                                        {filtered.map((officer, idx) => (
                                            <button
                                                key={officer.id}
                                                onClick={() => handleViewDetails(officer)}
                                                className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md hover:shadow-xl transition-all duration-300 hover:-translate-y-1 animate-fade-in text-left outline-none cursor-pointer"
                                                style={{ animationDelay: `${idx * 0.06}s` }}
                                            >
                                                {/* Card top accent */}
                                                <div className={`h-2 w-full bg-gradient-to-r ${getAvatarColor(idx)}`} />
                                                <div className="p-5">
                                                    {/* Avatar + name */}
                                                    <div className="flex flex-col items-center text-center mb-4">
                                                        {officer.imageUrl ? (
                                                            <div className="relative h-20 w-20 rounded-full overflow-hidden shadow-lg mb-3 ring-2 ring-slate-200">
                                                                <img
                                                                    src={officer.imageUrl}
                                                                    alt={`${officer.firstName} ${officer.lastName}`}
                                                                    className="h-full w-full object-cover"
                                                                />
                                                            </div>
                                                        ) : (
                                                            <div
                                                                className={`flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br ${getAvatarColor(idx)} text-white text-2xl font-bold shadow-lg mb-3`}
                                                            >
                                                                {initials(officer)}
                                                            </div>
                                                        )}
                                                        <h3 className="font-bold text-slate-900 text-base leading-tight">
                                                            {officer.rank} {officer.lastName}, {officer.firstName}{" "}
                                                            {officer.middleInitial}.
                                                        </h3>
                                                        <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 border border-slate-200">
                                                            <span className="material-symbols-outlined" style={{ fontSize: "0.85rem" }}>
                                                                badge
                                                            </span>
                                                            {officer.position}
                                                        </span>
                                                    </div>

                                                    {/* Details */}
                                                    <div className="space-y-2 text-xs text-slate-600 border-t border-slate-100 pt-4">
                                                        <div className="flex items-center gap-2">
                                                            <span className="material-symbols-outlined text-slate-400" style={{ fontSize: "1rem" }}>
                                                                call
                                                            </span>
                                                            <span>{officer.contactNo || "—"}</span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="material-symbols-outlined text-slate-400" style={{ fontSize: "1rem" }}>
                                                                mail
                                                            </span>
                                                            <span className="truncate">{officer.email || "—"}</span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="material-symbols-outlined text-slate-400" style={{ fontSize: "1rem" }}>
                                                                calendar_today
                                                            </span>
                                                            <span>Added: {officer.dateAdded}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ── List View ── */}
                        {viewMode === "list" && (
                            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
                                {fetchLoading ? (
                                    <div className="flex justify-center py-20">
                                        <span className="material-symbols-outlined animate-spin text-emerald-400" style={{ fontSize: "2.5rem" }}>
                                            progress_activity
                                        </span>
                                    </div>
                                ) : filtered.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-24 text-slate-400">
                                        <span className="material-symbols-outlined" style={{ fontSize: "4rem" }}>
                                            group_off
                                        </span>
                                        <p className="mt-3 text-base font-medium">No personnel found</p>
                                    </div>
                                ) : (
                                    <table className="w-full">
                                        <thead className="bg-gradient-to-r from-slate-800 to-slate-900 text-white">
                                            <tr>
                                                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider">Name</th>
                                                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider">Rank</th>
                                                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider">Position</th>
                                                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider">Contact</th>
                                                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider">Email</th>
                                                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider">Date Added</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {filtered.map((officer, idx) => (
                                                <tr
                                                    key={officer.id}
                                                    onClick={() => handleViewDetails(officer)}
                                                    className="hover:bg-slate-50 transition-colors duration-200 animate-fade-in cursor-pointer"
                                                    style={{ animationDelay: `${idx * 0.05}s` }}
                                                >
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-3">
                                                            {officer.imageUrl ? (
                                                                <div className="relative h-11 w-11 rounded-full overflow-hidden flex-shrink-0 ring-2 ring-slate-200">
                                                                    <img
                                                                        src={officer.imageUrl}
                                                                        alt={`${officer.firstName} ${officer.lastName}`}
                                                                        className="h-full w-full object-cover"
                                                                    />
                                                                </div>
                                                            ) : (
                                                                <div
                                                                    className={`flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br ${getAvatarColor(idx)} text-white text-base font-bold flex-shrink-0`}
                                                                >
                                                                    {initials(officer)}
                                                                </div>
                                                            )}
                                                            <span className="text-sm font-bold text-slate-900">
                                                                {officer.lastName}, {officer.firstName} {officer.middleInitial}.
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 text-sm text-slate-700 font-medium">{officer.rank}</td>
                                                    <td className="px-6 py-4">
                                                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 border border-slate-200">
                                                            {officer.position}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 text-sm text-slate-600">{officer.contactNo || "—"}</td>
                                                    <td className="px-6 py-4 text-sm text-slate-600">{officer.email || "—"}</td>
                                                    <td className="px-6 py-4 text-sm text-slate-500">{officer.dateAdded}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Add Personnel Modal ── */}
            {modalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <div
                        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                        onClick={handleCloseModal}
                    />

                    {/* Modal */}
                    <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl animate-fade-in">
                        {/* Modal Header */}
                        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-slate-800 to-slate-900 px-6 py-4 rounded-t-2xl">
                            <div className="flex items-center gap-3">
                                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/20 border border-emerald-500/30">
                                    <span className="material-symbols-outlined text-emerald-400" style={{ fontSize: "1.2rem" }}>
                                        person_add
                                    </span>
                                </div>
                                <h2 className="text-lg font-bold text-white tracking-tight">Add New Personnel</h2>
                            </div>
                            <button
                                onClick={handleCloseModal}
                                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-700 hover:text-white transition-colors"
                            >
                                <span className="material-symbols-outlined" style={{ fontSize: "1.25rem" }}>close</span>
                            </button>
                        </div>

                        {/* Form */}
                        <form onSubmit={handleSubmit} className="p-6 space-y-5">
                            {errorMsg && (
                                <div className="flex items-center gap-2 rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-rose-700 text-sm">
                                    <span className="material-symbols-outlined text-rose-500" style={{ fontSize: "1.1rem" }}>error</span>
                                    {errorMsg}
                                </div>
                            )}

                            {/* Profile Image Upload - TOP */}
                            <div className="flex flex-col items-center border border-emerald-200 bg-gradient-to-br from-emerald-50/50 to-green-50/30 rounded-2xl p-6">
                                <label className="block text-sm font-bold text-slate-700 mb-3 uppercase tracking-wide">
                                    Profile Image
                                </label>
                                {/* Image Preview */}
                                <div className="mb-4">
                                    {imagePreview ? (
                                        <div className="relative w-40 h-40 rounded-2xl border-4 border-emerald-300 overflow-hidden shadow-lg">
                                            <img
                                                src={imagePreview}
                                                alt="Preview"
                                                className="w-full h-full object-cover"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setImageFile(null);
                                                    setImagePreview("");
                                                }}
                                                className="absolute top-2 right-2 bg-rose-500 hover:bg-rose-600 text-white rounded-full p-1.5 transition-colors shadow-lg"
                                            >
                                                <span className="material-symbols-outlined" style={{ fontSize: "1.1rem" }}>close</span>
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="w-40 h-40 rounded-2xl border-4 border-dashed border-emerald-300 bg-white flex items-center justify-center">
                                            <span className="material-symbols-outlined text-emerald-400" style={{ fontSize: "4rem" }}>person</span>
                                        </div>
                                    )}
                                </div>
                                
                                {/* Upload Button */}
                                <input
                                    type="file"
                                    id="personnel-image"
                                    accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                                    onChange={handleImageChange}
                                    className="hidden"
                                />
                                <label
                                    htmlFor="personnel-image"
                                    className="inline-flex items-center gap-2 cursor-pointer rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 px-6 py-3 text-sm font-bold text-white hover:from-emerald-600 hover:to-green-700 transition-all shadow-lg shadow-emerald-500/30"
                                >
                                    <span className="material-symbols-outlined" style={{ fontSize: "1.2rem" }}>upload</span>
                                    Choose Profile Image
                                </label>
                                <p className="text-xs text-slate-500 mt-3 text-center">
                                    Supported: JPEG, PNG, GIF, WebP • Max size: 10MB
                                </p>
                                {uploadingImage && (
                                    <p className="text-xs text-emerald-600 mt-2 flex items-center gap-1 font-semibold">
                                        <span className="material-symbols-outlined animate-spin" style={{ fontSize: "1rem" }}>progress_activity</span>
                                        Uploading image...
                                    </p>
                                )}
                            </div>

                            {/* Username & Password */}
                            <div className="border border-emerald-200 bg-emerald-50/30 rounded-xl p-5">
                                <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-emerald-600" style={{ fontSize: "1.1rem" }}>lock</span>
                                    Login Credentials
                                </h3>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                                        Username (Auto-generated)
                                    </label>
                                    <input
                                        type="text"
                                        value={generatePersonnelId()}
                                        readOnly
                                        className="w-full rounded-xl border border-slate-200 bg-slate-100 px-4 py-2.5 text-sm text-slate-600 font-mono cursor-not-allowed"
                                        placeholder="Auto-generated on submit"
                                    />
                                    <p className="text-xs text-slate-500 mt-1">Format: YEAR + 5-digit sequence</p>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                                            Password <span className="text-rose-500">*</span>
                                        </label>
                                        <div className="relative">
                                            <input
                                                required
                                                type={showPassword ? "text" : "password"}
                                                name="password"
                                                value={form.password}
                                                onChange={handleChange}
                                                placeholder="Enter password"
                                                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 pr-11 text-sm text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPassword(!showPassword)}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                                            >
                                                <span className="material-symbols-outlined" style={{ fontSize: "1.1rem" }}>
                                                    {showPassword ? "visibility_off" : "visibility"}
                                                </span>
                                            </button>
                                        </div>
                                        <p className="text-xs text-slate-500 mt-1">
                                            Min 8 chars • 1 number • 1 symbol
                                        </p>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                                            Confirm Password <span className="text-rose-500">*</span>
                                        </label>
                                        <div className="relative">
                                            <input
                                                required
                                                type={showConfirmPassword ? "text" : "password"}
                                                name="confirmPassword"
                                                value={form.confirmPassword}
                                                onChange={handleChange}
                                                placeholder="Re-enter password"
                                                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 pr-11 text-sm text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                                            >
                                                <span className="material-symbols-outlined" style={{ fontSize: "1.1rem" }}>
                                                    {showConfirmPassword ? "visibility_off" : "visibility"}
                                                </span>
                                            </button>
                                        </div>
                                        <p className="text-xs text-slate-500 mt-1">
                                            Must match password above
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Name Row */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <div className="sm:col-span-1">
                                    <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                                        Last Name <span className="text-rose-500">*</span>
                                    </label>
                                    <input
                                        required
                                        type="text"
                                        name="lastName"
                                        value={form.lastName}
                                        onChange={handleChange}
                                        placeholder="e.g. Dela Cruz"
                                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all"
                                    />
                                </div>
                                <div className="sm:col-span-1">
                                    <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                                        First Name <span className="text-rose-500">*</span>
                                    </label>
                                    <input
                                        required
                                        type="text"
                                        name="firstName"
                                        value={form.firstName}
                                        onChange={handleChange}
                                        placeholder="e.g. Juan"
                                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all"
                                    />
                                </div>
                                <div className="sm:col-span-1">
                                    <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                                        Middle In.
                                    </label>
                                    <input
                                        type="text"
                                        name="middleInitial"
                                        value={form.middleInitial}
                                        onChange={handleChange}
                                        placeholder="e.g. R"
                                        maxLength={3}
                                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all"
                                    />
                                </div>
                            </div>

                            {/* Rank & Position */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                                        Rank <span className="text-rose-500">*</span>
                                    </label>
                                    <input
                                        required
                                        type="text"
                                        name="rank"
                                        value={form.rank}
                                        onChange={handleChange}
                                        placeholder="e.g. Major"
                                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                                        Position <span className="text-rose-500">*</span>
                                    </label>
                                    <input
                                        required
                                        type="text"
                                        name="position"
                                        value={form.position}
                                        onChange={handleChange}
                                        placeholder="e.g. Commanding Officer"
                                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all"
                                    />
                                </div>
                            </div>

                            {/* Contact & Email */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                                        Contact No.
                                    </label>
                                    <input
                                        type="text"
                                        name="contactNo"
                                        value={form.contactNo}
                                        onChange={handleChange}
                                        placeholder="e.g. 09171234567"
                                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                                        Email Address
                                    </label>
                                    <input
                                        type="email"
                                        name="email"
                                        value={form.email}
                                        onChange={handleChange}
                                        placeholder="e.g. officer@afp.mil.ph"
                                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all"
                                    />
                                </div>
                            </div>

                            {/* DOB & Date Added */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                                        Date of Birth
                                    </label>
                                    <input
                                        type="date"
                                        name="dateOfBirth"
                                        value={form.dateOfBirth}
                                        onChange={handleChange}
                                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                                        Date Added
                                    </label>
                                    <input
                                        type="date"
                                        value={today}
                                        readOnly
                                        className="w-full rounded-xl border border-slate-200 bg-slate-100 px-4 py-2.5 text-sm text-slate-500 cursor-not-allowed"
                                    />
                                </div>
                            </div>

                            {/* Current Address */}
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                                    Current Address
                                </label>
                                <input
                                    type="text"
                                    name="currentAddress"
                                    value={form.currentAddress}
                                    onChange={handleChange}
                                    placeholder="Street, Barangay, City, Province"
                                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all"
                                />
                            </div>

                            {/* Permanent Address */}
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                                    Permanent Address
                                </label>
                                <input
                                    type="text"
                                    name="permanentAddress"
                                    value={form.permanentAddress}
                                    onChange={handleChange}
                                    placeholder="Street, Barangay, City, Province"
                                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all"
                                />
                            </div>

                            {/* Footer buttons */}
                            <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
                                <button
                                    type="button"
                                    onClick={handleCloseModal}
                                    className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 hover:shadow-xl active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                                >
                                    {submitting ? (
                                        <>
                                            <span className="material-symbols-outlined animate-spin" style={{ fontSize: "1rem" }}>
                                                progress_activity
                                            </span>
                                            Saving…
                                        </>
                                    ) : (
                                        <>
                                            <span className="material-symbols-outlined" style={{ fontSize: "1rem" }}>
                                                save
                                            </span>
                                            Submit
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── Personnel Details Modal ── */}
            {detailsModalOpen && selectedPersonnel && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
                    <div
                        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                        onClick={() => setDetailsModalOpen(false)}
                    />
                    <div className="relative w-full max-w-5xl my-8 rounded-2xl bg-white shadow-2xl animate-fade-in overflow-hidden">
                        <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-6 py-3.5 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/20 border border-blue-500/30">
                                    <span className="material-symbols-outlined text-blue-400" style={{ fontSize: "1.2rem" }}>person</span>
                                </div>
                                <h2 className="text-lg font-bold text-white">Personnel Details</h2>
                            </div>
                            <button
                                onClick={() => setDetailsModalOpen(false)}
                                className="text-slate-400 hover:text-white transition-colors"
                            >
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                        <div className="p-6">
                            <div className="grid grid-cols-12 gap-6">
                                {/* Profile Image Section - Left side */}
                                <div className="col-span-4 flex flex-col items-center">
                                    {selectedPersonnel.imageUrl ? (
                                        <div className="relative w-full aspect-square rounded-2xl border-4 border-blue-300 overflow-hidden shadow-lg mb-4">
                                            <img
                                                src={selectedPersonnel.imageUrl}
                                                alt={`${selectedPersonnel.firstName} ${selectedPersonnel.lastName}`}
                                                className="w-full h-full object-cover"
                                            />
                                        </div>
                                    ) : (
                                        <div className="w-full aspect-square rounded-2xl border-4 border-slate-200 bg-slate-100 flex items-center justify-center mb-4">
                                            <span className="material-symbols-outlined text-slate-400" style={{ fontSize: "5rem" }}>person</span>
                                        </div>
                                    )}
                                    <div className="text-center w-full">
                                        <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Personnel ID</label>
                                        <p className="text-sm text-slate-900 font-mono font-bold bg-slate-50 rounded-lg p-2">{selectedPersonnel.username || "N/A"}</p>
                                    </div>
                                </div>
                                
                                {/* Details Grid - Right side */}
                                <div className="col-span-8 grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">First Name</label>
                                        <p className="text-sm text-slate-900 font-bold bg-slate-50 rounded-lg p-2.5">{selectedPersonnel.firstName}</p>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Last Name</label>
                                        <p className="text-sm text-slate-900 font-bold bg-slate-50 rounded-lg p-2.5">{selectedPersonnel.lastName}</p>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Middle Initial</label>
                                        <p className="text-sm text-slate-900 font-medium bg-slate-50 rounded-lg p-2.5">{selectedPersonnel.middleInitial || "N/A"}</p>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Rank</label>
                                        <p className="text-sm text-slate-900 font-medium bg-slate-50 rounded-lg p-2.5">{selectedPersonnel.rank}</p>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Position</label>
                                        <p className="text-sm text-slate-900 font-medium bg-slate-50 rounded-lg p-2.5">{selectedPersonnel.position}</p>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Contact Number</label>
                                        <p className="text-sm text-slate-900 font-medium bg-slate-50 rounded-lg p-2.5">{selectedPersonnel.contactNo || "N/A"}</p>
                                    </div>
                                    <div className="col-span-2">
                                        <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Email</label>
                                        <p className="text-sm text-slate-900 font-medium bg-slate-50 rounded-lg p-2.5">{selectedPersonnel.email || "N/A"}</p>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Date of Birth</label>
                                        <p className="text-sm text-slate-900 font-medium bg-slate-50 rounded-lg p-2.5">{selectedPersonnel.dateOfBirth || "N/A"}</p>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Date Added</label>
                                        <p className="text-sm text-slate-900 font-medium bg-slate-50 rounded-lg p-2.5">{selectedPersonnel.dateAdded}</p>
                                    </div>
                                    <div className="col-span-2">
                                        <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Current Address</label>
                                        <p className="text-sm text-slate-900 font-medium bg-slate-50 rounded-lg p-2.5">{selectedPersonnel.currentAddress || "N/A"}</p>
                                    </div>
                                    <div className="col-span-2">
                                        <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Permanent Address</label>
                                        <p className="text-sm text-slate-900 font-medium bg-slate-50 rounded-lg p-2.5">{selectedPersonnel.permanentAddress || "N/A"}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 p-6 border-t border-slate-100 bg-slate-50">
                            <button
                                type="button"
                                onClick={() => setDetailsModalOpen(false)}
                                className="rounded-lg border-2 border-slate-200 py-2.5 px-6 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-all"
                            >
                                Close
                            </button>
                            <button
                                onClick={() => {
                                    setDetailsModalOpen(false);
                                    setEditModalOpen(true);
                                }}
                                className="rounded-lg bg-blue-600 py-2.5 px-6 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 hover:shadow-xl hover:bg-blue-700 active:scale-95 transition-all flex items-center gap-2"
                            >
                                <span className="material-symbols-outlined" style={{ fontSize: "1rem" }}>edit</span>
                                Edit
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Edit Personnel Modal ── */}
            {editModalOpen && selectedPersonnel && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div
                        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                    />
                    <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl animate-fade-in overflow-hidden max-h-[90vh] overflow-y-auto">
                        <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
                            <h2 className="text-lg font-bold text-white">Edit Personnel Details</h2>
                            <button
                                onClick={() => {
                                    setCancelConfirmationOpen(true);
                                }}
                                className="text-slate-400 hover:text-white transition-colors"
                            >
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                        <form onSubmit={(e) => { e.preventDefault(); handleSaveChanges(); }} className="p-6 space-y-4">
                            {/* Profile Image Upload Section */}
                            <div className="flex flex-col items-center border border-blue-200 bg-gradient-to-br from-blue-50/50 to-sky-50/30 rounded-2xl p-6 mb-4">
                                <label className="block text-sm font-bold text-slate-700 mb-3 uppercase tracking-wide">
                                    Profile Image
                                </label>
                                {/* Image Preview */}
                                <div className="mb-4">
                                    {imagePreview ? (
                                        <div className="relative w-40 h-40 rounded-2xl border-4 border-blue-300 overflow-hidden shadow-lg">
                                            <img
                                                src={imagePreview}
                                                alt="Preview"
                                                className="w-full h-full object-cover"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setImageFile(null);
                                                    setImagePreview("");
                                                    if (selectedPersonnel) {
                                                        handleEditChange("imageUrl", "");
                                                    }
                                                }}
                                                className="absolute top-2 right-2 bg-rose-500 hover:bg-rose-600 text-white rounded-full p-1.5 transition-colors shadow-lg"
                                            >
                                                <span className="material-symbols-outlined" style={{ fontSize: "1.1rem" }}>close</span>
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="w-40 h-40 rounded-2xl border-4 border-dashed border-blue-300 bg-white flex items-center justify-center">
                                            <span className="material-symbols-outlined text-blue-400" style={{ fontSize: "4rem" }}>person</span>
                                        </div>
                                    )}
                                </div>
                                
                                {/* Upload Button */}
                                <input
                                    type="file"
                                    id="edit-personnel-image"
                                    accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                                    onChange={handleImageChange}
                                    className="hidden"
                                />
                                <label
                                    htmlFor="edit-personnel-image"
                                    className="inline-flex items-center gap-2 cursor-pointer rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 px-6 py-3 text-sm font-bold text-white hover:from-blue-600 hover:to-blue-700 transition-all shadow-lg shadow-blue-500/30"
                                >
                                    <span className="material-symbols-outlined" style={{ fontSize: "1.2rem" }}>upload</span>
                                    Change Profile Image
                                </label>
                                <p className="text-xs text-slate-500 mt-3 text-center">
                                    JPEG, PNG, GIF, WebP • Max: 10MB
                                </p>
                                {uploadingImage && (
                                    <p className="text-xs text-blue-600 mt-2 flex items-center gap-1 font-semibold">
                                        <span className="material-symbols-outlined animate-spin" style={{ fontSize: "1rem" }}>progress_activity</span>
                                        Uploading...
                                    </p>
                                )}
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <div className="sm:col-span-1">
                                    <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Last Name</label>
                                    <input
                                        required
                                        type="text"
                                        value={selectedPersonnel.lastName || ""}
                                        onChange={(e) => handleEditChange("lastName", e.target.value)}
                                        className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                                    />
                                </div>
                                <div className="sm:col-span-1">
                                    <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">First Name</label>
                                    <input
                                        required
                                        type="text"
                                        value={selectedPersonnel.firstName || ""}
                                        onChange={(e) => handleEditChange("firstName", e.target.value)}
                                        className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                                    />
                                </div>
                                <div className="sm:col-span-1">
                                    <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Middle In.</label>
                                    <input
                                        type="text"
                                        value={selectedPersonnel.middleInitial || ""}
                                        onChange={(e) => handleEditChange("middleInitial", e.target.value)}
                                        maxLength={3}
                                        className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Rank</label>
                                    <input
                                        required
                                        type="text"
                                        value={selectedPersonnel.rank || ""}
                                        onChange={(e) => handleEditChange("rank", e.target.value)}
                                        className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Position</label>
                                    <input
                                        required
                                        type="text"
                                        value={selectedPersonnel.position || ""}
                                        onChange={(e) => handleEditChange("position", e.target.value)}
                                        className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Contact No.</label>
                                    <input
                                        type="text"
                                        value={selectedPersonnel.contactNo || ""}
                                        onChange={(e) => handleEditChange("contactNo", e.target.value)}
                                        className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Email</label>
                                    <input
                                        type="email"
                                        value={selectedPersonnel.email || ""}
                                        onChange={(e) => handleEditChange("email", e.target.value)}
                                        className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Date of Birth</label>
                                    <input
                                        type="date"
                                        value={selectedPersonnel.dateOfBirth || ""}
                                        onChange={(e) => handleEditChange("dateOfBirth", e.target.value)}
                                        className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Date Added (Read-only)</label>
                                    <input
                                        type="date"
                                        value={selectedPersonnel.dateAdded || ""}
                                        readOnly
                                        className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm bg-slate-100 text-slate-500 cursor-not-allowed"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Current Address</label>
                                <input
                                    type="text"
                                    value={selectedPersonnel.currentAddress || ""}
                                    onChange={(e) => handleEditChange("currentAddress", e.target.value)}
                                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Permanent Address</label>
                                <input
                                    type="text"
                                    value={selectedPersonnel.permanentAddress || ""}
                                    onChange={(e) => handleEditChange("permanentAddress", e.target.value)}
                                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                                />
                            </div>
                            <div className="flex gap-3 pt-4 border-t border-slate-100">
                                <button
                                    type="button"
                                    onClick={() => setCancelConfirmationOpen(true)}
                                    className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 rounded-xl bg-emerald-500 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-500/30 hover:shadow-xl active:scale-95 transition-all"
                                >
                                    Save Changes
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── Save Confirmation Modal ── */}
            {confirmationOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div
                        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                        onClick={() => setConfirmationOpen(false)}
                    />
                    <div className="relative w-full max-w-sm rounded-2xl bg-white shadow-2xl animate-fade-in overflow-hidden">
                        <div className="p-6 text-center">
                            <h3 className="text-lg font-bold text-slate-900">Confirm Save</h3>
                            <p className="text-sm text-slate-600 mt-2">Are you sure you want to save the changes?</p>
                            <div className="mt-4 flex justify-center gap-4">
                                <button
                                    onClick={() => setConfirmationOpen(false)}
                                    className="px-4 py-2 bg-slate-200 text-slate-600 rounded-lg hover:bg-slate-300 font-semibold"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleConfirmSave}
                                    className="px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 font-semibold"
                                >
                                    Confirm
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Cancel Edit Confirmation Modal ── */}
            {cancelConfirmationOpen && selectedPersonnel && originalPersonnel && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div
                        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                    />
                    <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl animate-fade-in overflow-hidden">
                        <div className="bg-gradient-to-r from-amber-700 to-amber-800 px-6 py-4">
                            <div className="flex items-center gap-3">
                                <span className="material-symbols-outlined text-amber-200" style={{ fontSize: "1.5rem" }}>
                                    info
                                </span>
                                <h3 className="text-lg font-bold text-white">Discard Changes?</h3>
                            </div>
                        </div>
                        <div className="p-6">
                            <p className="text-sm text-slate-600 mb-4">You have made the following changes:</p>
                            <div className="bg-slate-50 rounded-lg p-4 space-y-3 max-h-48 overflow-y-auto mb-4">
                                {Object.keys(selectedPersonnel).map((key) => {
                                    const originalValue = (originalPersonnel as any)[key];
                                    const currentValue = (selectedPersonnel as any)[key];
                                    if (originalValue !== currentValue && key !== "id") {
                                        return (
                                            <div key={key} className="flex justify-between items-start text-sm">
                                                <span className="font-semibold text-slate-700 capitalize">{key}:</span>
                                                <div className="text-right">
                                                    <p className="text-slate-500 line-through">{String(originalValue || "N/A")}</p>
                                                    <p className="text-slate-900 font-medium">{String(currentValue || "N/A")}</p>
                                                </div>
                                            </div>
                                        );
                                    }
                                })}
                            </div>
                            <div className="flex gap-3">
                                <button
                                    onClick={async () => {
                                        await handleConfirmSave();
                                        setCancelConfirmationOpen(false);
                                        setEditModalOpen(false);
                                        setDetailsModalOpen(true);
                                    }}
                                    className="flex-1 rounded-lg bg-emerald-500 py-2.5 text-sm font-bold text-white hover:bg-emerald-600 transition-all"
                                >
                                    Save changes
                                </button>
                                <button
                                    onClick={() => {
                                        setCancelConfirmationOpen(false);
                                        setEditModalOpen(false);
                                        setDetailsModalOpen(true);
                                        setSelectedPersonnel(originalPersonnel);
                                    }}
                                    className="flex-1 rounded-lg border-2 border-slate-300 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 transition-all"
                                >
                                    Exit
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

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
