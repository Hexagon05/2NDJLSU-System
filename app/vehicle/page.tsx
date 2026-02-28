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
  deleteDoc,
} from "firebase/firestore";
import { uploadImageToCloudinary } from "@/lib/cloudinary";

interface Vehicle {
  id?: string;
  codename: string;
  personnelId: string;
  personnelName: string;
  truckType: string;
  plate: string;
  gasTankCapacity: number;
  payloadCapacity: number;
  dateAdded: string;
  status: string;
  bodyNumber?: string;
  chassisNumber?: string;
  engineNumber?: string;
  vehicleType?: string;
  vehicleCondition: string;
  odometer: number;
  imageUrl?: string;
  unserviceableReasons?: {
    flatTires: boolean;
    engineFailure: boolean;
    others: boolean;
    othersText?: string;
  };
}

interface Officer {
  id: string;
  lastName: string;
  firstName: string;
  rank: string;
}

export default function VehiclePage() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [personnels, setPersonnels] = useState<Officer[]>([]);
  const [fetchLoading, setFetchLoading] = useState(true);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [form, setForm] = useState({
    codename: "",
    personnelId: "",
    truckType: "M923",
    plate: "",
    gasTankCapacity: 0,
    payloadCapacity: 5,
    bodyNumber: "",
    chassisNumber: "",
    engineNumber: "",
    vehicleType: "",
    vehicleCondition: "New",
    odometer: 0,
    imageUrl: "",
    status: "Serviceable",
    unserviceableReasons: {
      flatTires: false,
      engineFailure: false,
      others: false,
      othersText: ""
    }
  });
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [originalVehicle, setOriginalVehicle] = useState<Vehicle | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [cancelConfirmationOpen, setCancelConfirmationOpen] = useState(false);
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>("");
  const [viewMode, setViewMode] = useState<"table" | "card">("card");

  const today = new Date().toISOString().split("T")[0];

  const fetchPersonnels = async () => {
    try {
      const q = query(collection(db, "personnelAccount"), orderBy("lastName", "asc"));
      const snap = await getDocs(q);
      const data = snap.docs.map(doc => ({
        id: doc.id,
        lastName: doc.data().lastName,
        firstName: doc.data().firstName,
        rank: doc.data().rank
      })) as Officer[];
      setPersonnels(data);
    } catch (e) {
      console.error("Error fetching personnel:", e);
    }
  };

  const fetchVehicles = async () => {
    setFetchLoading(true);
    try {
      const q = query(collection(db, "vehicles"), orderBy("dateAdded", "desc"));
      const snap = await getDocs(q);
      const data = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Vehicle[];
      setVehicles(data);
    } catch (e) {
      console.error("Error fetching vehicles:", e);
    } finally {
      setFetchLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchPersonnels();
      fetchVehicles();
    }
  }, [user]);

  // Set image preview when editing vehicle with existing image
  useEffect(() => {
    if (editModalOpen && selectedVehicle?.imageUrl) {
      setImagePreview(selectedVehicle.imageUrl);
    } else if (!editModalOpen) {
      setImagePreview("");
      setImageFile(null);
    }
  }, [editModalOpen, selectedVehicle?.imageUrl]);

  // Proactive Migration: Update existing vehicles that have old types
  useEffect(() => {
    if (vehicles.length > 0) {
      const migrateVehicles = async () => {
        const needsMigration = vehicles.filter(v => v.truckType === "Truck 1" || v.truckType === "Truck 2" || !["M923", "KM450", "KM250"].includes(v.truckType));
        if (needsMigration.length > 0) {
          console.log(`Migrating ${needsMigration.length} vehicles...`);
          for (let i = 0; i < needsMigration.length; i++) {
            const v = needsMigration[i];
            const newType = i % 2 === 0 ? "M923" : "KM450";
            const newPayload = newType === "M923" ? 5 : 1.25;
            await updateDoc(doc(db, "vehicles", v.id!), {
              truckType: newType,
              payloadCapacity: newPayload
            });
          }
          await fetchVehicles();
        }
      };
      migrateVehicles();
    }
  }, [vehicles.length]);

  if (loading || (user && fetchLoading)) {
    return (
      <div className="flex h-screen items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
        <div className="text-center">
          <span className="material-symbols-outlined animate-spin text-blue-400" style={{ fontSize: "3rem" }}>
            progress_activity
          </span>
          <p className="mt-4 text-slate-300 font-medium tracking-wide">Loading Vehicles...</p>
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

    // Upload image if selected
    let imageUrl = "";
    if (imageFile) {
      setUploadingImage(true);
      try {
        const uploadResult = await uploadImageToCloudinary(imageFile, "vehicles");
        imageUrl = uploadResult.secure_url;
      } catch (error) {
        console.error("Image upload error:", error);
        setErrorMsg("Failed to upload image. You can still save without an image.");
        // Continue without image
      } finally {
        setUploadingImage(false);
      }
    }

    const assignedOfficer = personnels.find(o => o.id === form.personnelId);
    const personnelName = assignedOfficer ? `${assignedOfficer.rank} ${assignedOfficer.lastName}, ${assignedOfficer.firstName}` : "Unassigned";

    try {
      await addDoc(collection(db, "vehicles"), {
        ...form,
        personnelName,
        dateAdded: today,
        createdAt: Timestamp.now(),
        imageUrl: imageUrl || "",
      });
      setSuccessMsg("Vehicle added successfully!");
      setModalOpen(false);
      setForm({
        codename: "",
        personnelId: "",
        truckType: "M923",
        plate: "",
        gasTankCapacity: 0,
        payloadCapacity: 5,
        bodyNumber: "",
        chassisNumber: "",
        engineNumber: "",
        vehicleType: "",
        vehicleCondition: "New",
        odometer: 0,
        imageUrl: "",
        status: "Serviceable",
        unserviceableReasons: {
          flatTires: false,
          engineFailure: false,
          others: false,
          othersText: ""
        }
      });
      setImageFile(null);
      setImagePreview("");
      await fetchVehicles();
      setTimeout(() => setSuccessMsg(""), 3500);
    } catch (err) {
      console.error("Error adding vehicle:", err);
      setErrorMsg("Failed to add vehicle. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleViewDetails = (vehicle: Vehicle) => {
    setSelectedVehicle(vehicle);
    setOriginalVehicle(vehicle);
    setDetailsModalOpen(true);
  };

  const handleSaveChanges = () => {
    setConfirmationOpen(true);
  };

  const handleConfirmSave = async () => {
    if (!selectedVehicle || !selectedVehicle.id) return;
    
    setConfirmationOpen(false); // Close confirmation modal immediately
    setErrorMsg(""); // Clear any previous errors
    
    try {
      // Upload image if a new image was selected
      let imageUrl = selectedVehicle.imageUrl || "";
      if (imageFile) {
        setUploadingImage(true);
        try {
          const uploadResult = await uploadImageToCloudinary(imageFile, "vehicle");
          imageUrl = uploadResult.secure_url;
        } catch (error) {
          console.error("Image upload error:", error);
          setErrorMsg("Failed to upload image. Saving other changes...");
        } finally {
          setUploadingImage(false);
        }
      }

      const vehicleData = {
        codename: selectedVehicle.codename,
        personnelId: selectedVehicle.personnelId,
        personnelName: selectedVehicle.personnelName,
        truckType: selectedVehicle.truckType,
        plate: selectedVehicle.plate,
        gasTankCapacity: selectedVehicle.gasTankCapacity,
        payloadCapacity: selectedVehicle.payloadCapacity,
        dateAdded: selectedVehicle.dateAdded,
        status: selectedVehicle.status,
        bodyNumber: selectedVehicle.bodyNumber,
        chassisNumber: selectedVehicle.chassisNumber,
        engineNumber: selectedVehicle.engineNumber,
        vehicleType: selectedVehicle.vehicleType,
        vehicleCondition: selectedVehicle.vehicleCondition,
        odometer: selectedVehicle.odometer,
        imageUrl,
      };
      
      await updateDoc(doc(db, "vehicles", selectedVehicle.id), vehicleData);
      
      // Update the selected vehicle with the new image URL
      const updatedVehicle = { ...selectedVehicle, imageUrl };
      setSelectedVehicle(updatedVehicle);
      setOriginalVehicle(updatedVehicle);
      
      setSuccessMsg("Vehicle saved successfully!");
      setTimeout(() => setSuccessMsg(""), 3500);
      
      await fetchVehicles();
      
      setEditModalOpen(false);
      setImageFile(null);
      setImagePreview("");
      
      // Reopen details modal to show updated vehicle
      setTimeout(() => {
        setDetailsModalOpen(true);
      }, 100);
      
    } catch (error) {
      console.error("Error saving vehicle details:", error);
      setErrorMsg("Failed to save vehicle. Please try again.");
      setTimeout(() => setErrorMsg(""), 5000);
    }
  };

  const handleDeleteVehicle = async () => {
    if (!selectedVehicle || !selectedVehicle.id) return;
    try {
      await deleteDoc(doc(db, "vehicles", selectedVehicle.id));
      setSuccessMsg("Vehicle deleted successfully!");
      setTimeout(() => setSuccessMsg(""), 3500);
      await fetchVehicles();
      setDeleteConfirmationOpen(false);
      setEditModalOpen(false);
      setDetailsModalOpen(false);
      setSelectedVehicle(null);
    } catch (error) {
      console.error("Error deleting vehicle:", error);
      setErrorMsg("Failed to delete vehicle. Please try again.");
    }
  };

  const handleEditChange = (field: keyof Vehicle, value: any) => {
    if (selectedVehicle) {
      // If changing personnelId, also update personnelName
      if (field === "personnelId") {
        const selectedPersonnel = personnels.find(p => p.id === value);
        const personnelName = selectedPersonnel 
          ? `${selectedPersonnel.rank} ${selectedPersonnel.lastName}, ${selectedPersonnel.firstName}` 
          : "Unassigned";
        setSelectedVehicle({ ...selectedVehicle, personnelId: value, personnelName });
      } else {
        setSelectedVehicle({ ...selectedVehicle, [field]: value });
      }
    }
  };

  const navigationItems = [
    { name: "Dashboard", icon: "dashboard", href: "/dashboard", active: false },
    { name: "Personnels", icon: "groups", href: "/personnels", active: false },
    { name: "Vehicle", icon: "local_shipping", href: "/vehicle", active: true },
    { name: "History", icon: "history", href: "/history", active: false },
  ];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "Serviceable": return "bg-emerald-100 text-emerald-800 border border-emerald-200";
      case "Unserviceable": return "bg-rose-100 text-rose-800 border border-rose-200";
      case "In Transit": return "bg-blue-100 text-blue-800 border border-blue-200";
      case "Maintenance": return "bg-amber-100 text-amber-800 border border-amber-200";
      default: return "bg-slate-100 text-slate-800 border border-slate-200";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "Serviceable": return "check_circle";
      case "Unserviceable": return "cancel";
      case "In Transit": return "local_shipping";
      case "Maintenance": return "build";
      default: return "circle";
    }
  };

  const filteredVehicles = vehicles.filter(
    (v) =>
      v.plate.toLowerCase().includes(searchTerm.toLowerCase()) ||
      v.codename.toLowerCase().includes(searchTerm.toLowerCase()) ||
      v.personnelName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-100 to-slate-200">
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
              <span className="material-symbols-outlined text-slate-600" style={{ fontSize: "1.75rem" }}>local_shipping</span>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Vehicle Management</h1>
            </div>
            <div className="flex items-center gap-4">
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

            {/* Error Banner */}
            {errorMsg && (
              <div className="flex items-center gap-3 rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-rose-800 animate-fade-in">
                <span className="material-symbols-outlined text-rose-500" style={{ fontSize: "1.25rem" }}>
                  error
                </span>
                <span className="text-sm font-medium">{errorMsg}</span>
              </div>
            )}

            {/* Search and Add */}
            <div className="flex gap-3 flex-wrap items-center">
              <div className="flex-1 min-w-64 relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-slate-400" style={{ fontSize: "1.25rem" }}>search</span>
                <input
                  type="text"
                  placeholder="Search codename, plate, or personnel..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-slate-900 placeholder-slate-400 shadow-sm transition-all focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>
              {/* View Toggle */}
              <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
                <button
                  onClick={() => setViewMode("card")}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                    viewMode === "card"
                      ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: "1.1rem" }}>grid_view</span>
                  Cards
                </button>
                <button
                  onClick={() => setViewMode("table")}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                    viewMode === "table"
                      ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: "1.1rem" }}>table_rows</span>
                  Table
                </button>
              </div>
              <button
                onClick={() => setModalOpen(true)}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-3 text-white text-sm font-semibold shadow-lg shadow-blue-500/30 transition-all hover:shadow-xl active:scale-95"
              >
                <span className="material-symbols-outlined" style={{ fontSize: "1.1rem" }}>add</span>
                Add Vehicle
              </button>
            </div>

            {/* Card View */}
            {viewMode === "card" && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredVehicles.length === 0 ? (
                  <div className="col-span-full flex flex-col items-center justify-center py-16 text-slate-400">
                    <span className="material-symbols-outlined block text-6xl mb-4">local_shipping</span>
                    <p className="text-lg font-medium">No vehicles found. Add one to get started.</p>
                  </div>
                ) : (
                  filteredVehicles.map((vehicle, index) => (
                    <div
                      key={vehicle.id}
                      className="group relative bg-white rounded-2xl border border-slate-200 shadow-lg hover:shadow-2xl transition-all duration-300 cursor-pointer overflow-hidden animate-fade-in"
                      style={{ animationDelay: `${index * 0.05}s` }}
                      onClick={() => handleViewDetails(vehicle)}
                    >
                      {/* Vehicle Image */}
                      <div className="relative aspect-[4/3] bg-gradient-to-br from-slate-100 to-slate-200 overflow-hidden">
                        {vehicle.imageUrl ? (
                          <img
                            src={vehicle.imageUrl}
                            alt={vehicle.codename}
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <span className="material-symbols-outlined text-slate-300" style={{ fontSize: "4rem" }}>
                              local_shipping
                            </span>
                          </div>
                        )}
                        {/* Status Badge - Top Right */}
                        <div className="absolute top-3 right-3">
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold shadow-lg backdrop-blur-sm ${getStatusBadge(vehicle.status || "Serviceable")}`}>
                            <span className="material-symbols-outlined" style={{ fontSize: "0.85rem" }}>
                              {getStatusIcon(vehicle.status || "Serviceable")}
                            </span>
                            {vehicle.status || "Serviceable"}
                          </span>
                        </div>
                      </div>

                      {/* Vehicle Info */}
                      <div className="p-5 space-y-3">
                        {/* Codename & Plate */}
                        <div>
                          <h3 className="text-xl font-bold text-slate-900 mb-1 truncate group-hover:text-blue-600 transition-colors">
                            {vehicle.codename}
                          </h3>
                          <p className="text-sm font-mono text-slate-500 italic truncate">
                            {vehicle.plate}
                          </p>
                        </div>

                        {/* Personnel */}
                        <div className="flex items-center gap-2 text-sm text-slate-600 border-t border-slate-100 pt-3">
                          <span className="material-symbols-outlined text-slate-400" style={{ fontSize: "1.1rem" }}>
                            person
                          </span>
                          <span className="truncate font-medium">{vehicle.personnelName}</span>
                        </div>

                        {/* Vehicle Type */}
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                          <span className="material-symbols-outlined text-slate-400" style={{ fontSize: "1.1rem" }}>
                            directions_car
                          </span>
                          <span className="font-semibold">{vehicle.truckType}</span>
                        </div>

                        {/* Capacity Info */}
                        <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-100">
                          <div className="bg-slate-50 rounded-lg p-2.5">
                            <p className="text-xs text-slate-500 font-medium mb-0.5">Gas Tank</p>
                            <p className="text-sm font-bold text-slate-900">{vehicle.gasTankCapacity} L</p>
                          </div>
                          <div className="bg-slate-50 rounded-lg p-2.5">
                            <p className="text-xs text-slate-500 font-medium mb-0.5">Payload</p>
                            <p className="text-sm font-bold text-slate-900">{vehicle.payloadCapacity} tons</p>
                          </div>
                        </div>
                      </div>

                      {/* Hover Overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-blue-600/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Table */}
            {viewMode === "table" && (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
              <table className="w-full">
                <thead className="bg-gradient-to-r from-slate-800 to-slate-900 text-white">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider">Codename</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider">Plate</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider">Personnel Assigned</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider">Vehicle Type</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider">Status</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider">Capacity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredVehicles.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                        <span className="material-symbols-outlined block text-4xl mb-2">local_shipping</span>
                        <p>No vehicles found. Add one to get started.</p>
                      </td>
                    </tr>
                  ) : (
                    filteredVehicles.map((vehicle, index) => (
                      <tr
                        key={vehicle.id}
                        className="hover:bg-slate-50 transition-colors duration-200 animate-fade-in cursor-pointer"
                        style={{ animationDelay: `${index * 0.07}s` }}
                        onClick={() => handleViewDetails(vehicle)}
                      >
                        <td className="px-6 py-4 text-sm font-bold text-slate-900">
                          {vehicle.codename}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600 font-mono italic">
                          {vehicle.plate}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600 font-medium">
                          <span className="flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-slate-400" style={{ fontSize: "1.1rem" }}>person</span>
                            {vehicle.personnelName}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600">
                          {vehicle.truckType}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${getStatusBadge(vehicle.status || "Serviceable")}`}>
                            <span className="material-symbols-outlined" style={{ fontSize: "0.85rem" }}>{getStatusIcon(vehicle.status || "Serviceable")}</span>
                            {vehicle.status || "Serviceable"}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600">
                          <div className="flex flex-col text-xs">
                            <span>Gas: {vehicle.gasTankCapacity} L</span>
                            <span>Payload: {vehicle.payloadCapacity} tons</span>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            )}
          </div>
        </div>
      </div>

      {/* Add Vehicle Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={() => setModalOpen(false)}
          />
          <div className="relative w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl animate-fade-in">
            <div className="sticky top-0 z-10 bg-gradient-to-r from-slate-800 to-slate-900 px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <h2 className="text-lg font-bold text-white">Add New Vehicle</h2>
              <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-white">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6">
              {errorMsg && (
                <div className="p-3 bg-rose-50 text-rose-700 text-sm rounded-xl border border-rose-200 flex items-center gap-2 mb-6">
                  <span className="material-symbols-outlined text-rose-500">error</span>
                  {errorMsg}
                </div>
              )}

              {/* Two-Column Layout: Image Left, Form Right */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                {/* LEFT SIDE - Vehicle Image */}
                <div className="lg:col-span-1">
                  <div className="sticky top-6 flex flex-col items-center border-2 border-blue-200 bg-gradient-to-br from-blue-50/50 to-sky-50/30 rounded-2xl p-6">
                    <label className="block text-sm font-bold text-slate-700 mb-4 uppercase tracking-wide">
                      Vehicle Image
                    </label>
                    {/* Image Preview */}
                    <div className="mb-4 w-full">
                      {imagePreview ? (
                        <div className="relative w-full aspect-square rounded-2xl border-4 border-blue-300 overflow-hidden shadow-lg">
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
                            className="absolute top-2 right-2 bg-rose-500 hover:bg-rose-600 text-white rounded-full p-2 transition-colors shadow-lg"
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: "1.1rem" }}>close</span>
                          </button>
                        </div>
                      ) : (
                        <div className="w-full aspect-square rounded-2xl border-4 border-dashed border-blue-300 bg-white flex items-center justify-center">
                          <span className="material-symbols-outlined text-blue-400" style={{ fontSize: "5rem" }}>local_shipping</span>
                        </div>
                      )}
                    </div>
                    
                    {/* Upload Button */}
                    <input
                      type="file"
                      id="vehicle-image"
                      accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                      onChange={handleImageChange}
                      className="hidden"
                    />
                    <label
                      htmlFor="vehicle-image"
                      className="w-full inline-flex items-center justify-center gap-2 cursor-pointer rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 px-6 py-3 text-sm font-bold text-white hover:from-blue-600 hover:to-blue-700 transition-all shadow-lg shadow-blue-500/30"
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: "1.2rem" }}>upload</span>
                      Choose Image
                    </label>
                    <p className="text-xs text-slate-500 mt-3 text-center">
                      JPEG, PNG, GIF, WebP<br />Max: 10MB
                    </p>
                    {uploadingImage && (
                      <p className="text-xs text-blue-600 mt-3 flex items-center gap-1 font-semibold">
                        <span className="material-symbols-outlined animate-spin" style={{ fontSize: "1rem" }}>progress_activity</span>
                        Uploading...
                      </p>
                    )}
                  </div>
                </div>

                {/* RIGHT SIDE - Form Fields */}
                <div className="lg:col-span-2 space-y-4">

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Codename</label>
                <input
                  required
                  type="text"
                  value={form.codename}
                  onChange={(e) => setForm({ ...form, codename: e.target.value })}
                  placeholder="e.g. ALPHA-1"
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Personnel Assigned</label>
                <select
                  required
                  value={form.personnelId}
                  onChange={(e) => setForm({ ...form, personnelId: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all bg-white"
                >
                  <option value="">Select Officer</option>
                  {personnels.map(o => (
                    <option key={o.id} value={o.id}>
                      [{o.rank}] {o.lastName}, {o.firstName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Body Number</label>
                <input
                  required
                  type="text"
                  value={form.bodyNumber}
                  onChange={(e) => setForm({ ...form, bodyNumber: e.target.value })}
                  placeholder="e.g. BN12345"
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Chassis Number</label>
                <input
                  required
                  type="text"
                  value={form.chassisNumber}
                  onChange={(e) => setForm({ ...form, chassisNumber: e.target.value })}
                  placeholder="e.g. CH123456789"
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Engine Number</label>
                <input
                  required
                  type="text"
                  value={form.engineNumber}
                  onChange={(e) => setForm({ ...form, engineNumber: e.target.value })}
                  placeholder="e.g. EN987654321"
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Vehicle Type</label>
                  <select
                    value={form.truckType}
                    onChange={(e) => {
                      const val = e.target.value;
                      let payloadCapacity = 5;
                      if (val === "M923") payloadCapacity = 5;
                      else if (val === "KM450") payloadCapacity = 1.25;
                      else if (val === "KM250") payloadCapacity = 2.5;
                      setForm({
                        ...form,
                        truckType: val,
                        payloadCapacity
                      });
                    }}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all bg-white"
                  >
                    <option value="M923">M923 (5.0 Tons)</option>
                    <option value="KM450">KM450 (1.25 Tons)</option>
                    <option value="KM250">KM250 (2.5 Tons)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Plate Number</label>
                  <input
                    required
                    type="text"
                    value={form.plate}
                    onChange={(e) => setForm({ ...form, plate: e.target.value })}
                    placeholder="TGD 1234"
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Vehicle Condition</label>
                  <select
                    value={form.vehicleCondition}
                    onChange={(e) => setForm({ ...form, vehicleCondition: e.target.value, odometer: e.target.value === "New" ? 0 : form.odometer })}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all bg-white"
                  >
                    <option value="New">New</option>
                    <option value="2nd hand">2nd hand</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Vehicle Odometer</label>
                  <div className="relative">
                    <input
                      disabled={form.vehicleCondition === "New"}
                      type="number"
                      value={form.odometer || ""}
                      onChange={(e) => setForm({ ...form, odometer: parseInt(e.target.value) || 0 })}
                      placeholder="0"
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all disabled:bg-slate-50 disabled:text-slate-400"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 uppercase">Km</span>
                  </div>
                </div>
              </div>

              {/* Vehicle Status Checkbox */}
              <div className="rounded-xl border border-slate-200 p-4 bg-slate-50">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.status === "Serviceable"}
                    onChange={(e) => {
                      const newStatus = e.target.checked ? "Serviceable" : "Unserviceable";
                      setForm({ 
                        ...form, 
                        status: newStatus,
                        unserviceableReasons: newStatus === "Serviceable" ? {
                          flatTires: false,
                          engineFailure: false,
                          others: false,
                          othersText: ""
                        } : form.unserviceableReasons
                      });
                    }}
                    className="h-5 w-5 rounded border-slate-300 text-emerald-600 focus:ring-2 focus:ring-emerald-500/20 cursor-pointer"
                  />
                  <div className="flex-1">
                    <span className="block text-sm font-bold text-slate-900">Vehicle is Serviceable</span>
                    <span className="block text-xs text-slate-500 mt-0.5">Check if the vehicle is currently serviceable and ready for deployment</span>
                  </div>
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${form.status === "Serviceable" ? "bg-emerald-100 text-emerald-800 border border-emerald-200" : "bg-rose-100 text-rose-800 border border-rose-200"}`}>
                    <span className="material-symbols-outlined" style={{ fontSize: "0.85rem" }}>{form.status === "Serviceable" ? "check_circle" : "cancel"}</span>
                    {form.status}
                  </span>
                </label>
              </div>

              {/* Unserviceable Reasons - Show only when Unserviceable */}
              {form.status === "Unserviceable" && (
                <div className="rounded-xl border-2 border-rose-200 p-5 bg-rose-50/50 space-y-3 animate-fade-in">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="material-symbols-outlined text-rose-600" style={{ fontSize: "1.3rem" }}>error</span>
                    <h4 className="text-sm font-bold text-rose-900 uppercase tracking-wide">Reason for Unserviceability</h4>
                  </div>
                  
                  <label className="flex items-center gap-3 cursor-pointer hover:bg-rose-100/50 p-2 rounded-lg transition-colors">
                    <input
                      type="checkbox"
                      checked={form.unserviceableReasons.flatTires}
                      onChange={(e) => setForm({
                        ...form,
                        unserviceableReasons: {
                          ...form.unserviceableReasons,
                          flatTires: e.target.checked
                        }
                      })}
                      className="h-4 w-4 rounded border-rose-300 text-rose-600 focus:ring-2 focus:ring-rose-500/20 cursor-pointer"
                    />
                    <span className="text-sm font-medium text-slate-900">Flat Tires</span>
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer hover:bg-rose-100/50 p-2 rounded-lg transition-colors">
                    <input
                      type="checkbox"
                      checked={form.unserviceableReasons.engineFailure}
                      onChange={(e) => setForm({
                        ...form,
                        unserviceableReasons: {
                          ...form.unserviceableReasons,
                          engineFailure: e.target.checked
                        }
                      })}
                      className="h-4 w-4 rounded border-rose-300 text-rose-600 focus:ring-2 focus:ring-rose-500/20 cursor-pointer"
                    />
                    <span className="text-sm font-medium text-slate-900">Engine Failure</span>
                  </label>

                  <label className="flex items-start gap-3 cursor-pointer hover:bg-rose-100/50 p-2 rounded-lg transition-colors">
                    <input
                      type="checkbox"
                      checked={form.unserviceableReasons.others}
                      onChange={(e) => setForm({
                        ...form,
                        unserviceableReasons: {
                          ...form.unserviceableReasons,
                          others: e.target.checked,
                          othersText: e.target.checked ? form.unserviceableReasons.othersText : ""
                        }
                      })}
                      className="h-4 w-4 rounded border-rose-300 text-rose-600 focus:ring-2 focus:ring-rose-500/20 cursor-pointer mt-0.5"
                    />
                    <div className="flex-1">
                      <span className="text-sm font-medium text-slate-900 block mb-2">Others</span>
                      {form.unserviceableReasons.others && (
                        <input
                          type="text"
                          value={form.unserviceableReasons.othersText || ""}
                          onChange={(e) => setForm({
                            ...form,
                            unserviceableReasons: {
                              ...form.unserviceableReasons,
                              othersText: e.target.value
                            }
                          })}
                          placeholder="Specify other reason..."
                          className="w-full rounded-lg border border-rose-200 px-3 py-2 text-sm focus:border-rose-400 focus:ring-2 focus:ring-rose-500/20 outline-none transition-all bg-white"
                        />
                      )}
                    </div>
                  </label>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Gas Tank Capacity</label>
                  <div className="relative">
                    <input
                      required
                      type="number"
                      value={form.gasTankCapacity || ""}
                      onChange={(e) => setForm({ ...form, gasTankCapacity: parseInt(e.target.value) || 0 })}
                      className="w-full rounded-xl border border-slate-200 pl-4 pr-8 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">L</span>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Payload Capacity</label>
                  <div className="relative">
                    <input
                      required
                      type="number"
                      step="0.01"
                      value={form.payloadCapacity || ""}
                      onChange={(e) => setForm({ ...form, payloadCapacity: parseFloat(e.target.value) || 0 })}
                      className="w-full rounded-xl border border-slate-200 pl-4 pr-12 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 uppercase">tons</span>
                  </div>
                </div>
              </div>
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 rounded-xl bg-blue-600 py-3 text-sm font-bold text-white shadow-lg shadow-blue-500/30 hover:shadow-xl active:scale-95 transition-all disabled:opacity-50"
                >
                  {submitting ? "Adding..." : "Add Vehicle"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Vehicle Details Modal */}
      {detailsModalOpen && selectedVehicle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={() => setDetailsModalOpen(false)}
          />
          <div className="relative w-full max-w-6xl rounded-2xl bg-white shadow-2xl animate-fade-in overflow-hidden">
            <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/20 border border-blue-500/30">
                  <span className="material-symbols-outlined text-blue-400" style={{ fontSize: "1.3rem" }}>local_shipping</span>
                </div>
                <h2 className="text-lg font-bold text-white">Vehicle Details</h2>
              </div>
              <button
                onClick={() => setDetailsModalOpen(false)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-6 max-h-[75vh] overflow-y-auto">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* LEFT SIDE - Vehicle Image */}
                <div className="lg:col-span-1">
                  <div className="sticky top-0">
                    {selectedVehicle.imageUrl ? (
                      <div className="relative w-full aspect-square rounded-2xl border-4 border-blue-300 overflow-hidden shadow-lg bg-slate-50">
                        <img
                          src={selectedVehicle.imageUrl}
                          alt={`${selectedVehicle.codename}`}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="relative w-full aspect-square rounded-2xl border-4 border-dashed border-slate-300 overflow-hidden shadow-lg bg-slate-50 flex items-center justify-center">
                        <div className="text-center">
                          <span className="material-symbols-outlined text-slate-300" style={{ fontSize: "5rem" }}>local_shipping</span>
                          <p className="text-sm text-slate-400 mt-2 font-medium">No Image</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* RIGHT SIDE - Vehicle Details */}
                <div className="lg:col-span-2">
                  <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">Codename</label>
                  <p className="text-base text-slate-900 font-bold bg-slate-50 rounded-lg p-3">{selectedVehicle.codename}</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">Plate</label>
                  <p className="text-base text-slate-900 font-bold bg-slate-50 rounded-lg p-3 font-mono">{selectedVehicle.plate}</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">Personnel Assigned</label>
                  <p className="text-base text-slate-900 font-medium bg-slate-50 rounded-lg p-3">{selectedVehicle.personnelName}</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">Vehicle Type</label>
                  <p className="text-base text-slate-900 font-medium bg-slate-50 rounded-lg p-3">{selectedVehicle.vehicleType || "N/A"}</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">Body Number</label>
                  <p className="text-base text-slate-900 font-medium bg-slate-50 rounded-lg p-3">{selectedVehicle.bodyNumber || "N/A"}</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">Chassis Number</label>
                  <p className="text-base text-slate-900 font-medium bg-slate-50 rounded-lg p-3 font-mono">{selectedVehicle.chassisNumber || "N/A"}</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">Engine Number</label>
                  <p className="text-base text-slate-900 font-medium bg-slate-50 rounded-lg p-3 font-mono">{selectedVehicle.engineNumber || "N/A"}</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">Status</label>
                  <span className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold ${getStatusBadge(selectedVehicle.status || "Serviceable")}`}>
                    <span className="material-symbols-outlined" style={{ fontSize: "0.85rem" }}>{getStatusIcon(selectedVehicle.status || "Serviceable")}</span>
                    {selectedVehicle.status || "Serviceable"}
                  </span>
                </div>
                
                {/* Show Unserviceable Reasons if vehicle is unserviceable */}
                {selectedVehicle.status === "Unserviceable" && selectedVehicle.unserviceableReasons && (
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">Unserviceability Reasons</label>
                    <div className="bg-rose-50 border border-rose-200 rounded-lg p-4 space-y-2">
                      {selectedVehicle.unserviceableReasons.flatTires && (
                        <div className="flex items-center gap-2 text-sm">
                          <span className="material-symbols-outlined text-rose-600" style={{ fontSize: "1rem" }}>check_circle</span>
                          <span className="text-slate-900 font-medium">Flat Tires</span>
                        </div>
                      )}
                      {selectedVehicle.unserviceableReasons.engineFailure && (
                        <div className="flex items-center gap-2 text-sm">
                          <span className="material-symbols-outlined text-rose-600" style={{ fontSize: "1rem" }}>check_circle</span>
                          <span className="text-slate-900 font-medium">Engine Failure</span>
                        </div>
                      )}
                      {selectedVehicle.unserviceableReasons.others && (
                        <div className="flex items-start gap-2 text-sm">
                          <span className="material-symbols-outlined text-rose-600" style={{ fontSize: "1rem" }}>check_circle</span>
                          <div>
                            <span className="text-slate-900 font-medium">Others: </span>
                            <span className="text-slate-700">{selectedVehicle.unserviceableReasons.othersText || "Not specified"}</span>
                          </div>
                        </div>
                      )}
                      {!selectedVehicle.unserviceableReasons.flatTires && 
                       !selectedVehicle.unserviceableReasons.engineFailure && 
                       !selectedVehicle.unserviceableReasons.others && (
                        <p className="text-sm text-slate-500 italic">No specific reasons provided</p>
                      )}
                    </div>
                  </div>
                )}
                
                <div className="col-span-2 grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">Gas Tank Capacity</label>
                    <p className="text-base text-slate-900 font-bold bg-slate-50 rounded-lg p-3">{selectedVehicle.gasTankCapacity} <span className="text-xs text-slate-500 font-normal">Liters</span></p>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">Payload Capacity</label>
                    <p className="text-base text-slate-900 font-bold bg-slate-50 rounded-lg p-3">{selectedVehicle.payloadCapacity} <span className="text-xs text-slate-500 font-normal">Tons</span></p>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">Condition</label>
                  <p className="text-base text-slate-900 font-bold bg-slate-50 rounded-lg p-3">{selectedVehicle.vehicleCondition || "New"}</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">Odometer</label>
                  <p className="text-base text-slate-900 font-bold bg-slate-50 rounded-lg p-3">{selectedVehicle.odometer || 0} <span className="text-xs text-slate-500 font-normal">Km</span></p>
                </div>
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

      {editModalOpen && selectedVehicle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
          />
          <div className="relative w-full max-w-6xl rounded-2xl bg-white shadow-2xl animate-fade-in overflow-hidden max-h-[90vh] flex flex-col">
            <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Edit Vehicle Details</h2>
              <button
                onClick={() => setCancelConfirmationOpen(true)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); handleSaveChanges(); }} className="overflow-y-auto flex-1">
              <div className="p-6">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                  {/* LEFT SIDE - Vehicle Image */}
                  <div className="lg:col-span-1">
                    <div className="sticky top-0 flex flex-col items-center border-2 border-blue-200 bg-gradient-to-br from-blue-50/50 to-sky-50/30 rounded-2xl p-6">
                      <label className="block text-sm font-bold text-slate-700 mb-4 uppercase tracking-wide">
                        Vehicle Image
                      </label>
                      {/* Image Preview */}
                      <div className="mb-4 w-full">
                        {imagePreview ? (
                          <div className="relative w-full aspect-square rounded-2xl border-4 border-blue-300 overflow-hidden shadow-lg">
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
                                if (selectedVehicle) {
                                  handleEditChange("imageUrl", "");
                                }
                              }}
                              className="absolute top-2 right-2 bg-rose-500 hover:bg-rose-600 text-white rounded-full p-2 transition-colors shadow-lg"
                            >
                              <span className="material-symbols-outlined" style={{ fontSize: "1.1rem" }}>close</span>
                            </button>
                          </div>
                        ) : (
                          <div className="w-full aspect-square rounded-2xl border-4 border-dashed border-blue-300 bg-white flex items-center justify-center">
                            <span className="material-symbols-outlined text-blue-400" style={{ fontSize: "5rem" }}>local_shipping</span>
                          </div>
                        )}
                      </div>
                      
                      {/* Upload Button */}
                      <input
                        type="file"
                        id="edit-vehicle-image"
                        accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                        onChange={handleImageChange}
                        className="hidden"
                      />
                      <label
                        htmlFor="edit-vehicle-image"
                        className="w-full inline-flex items-center justify-center gap-2 cursor-pointer rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 px-6 py-3 text-sm font-bold text-white hover:from-blue-600 hover:to-blue-700 transition-all shadow-lg shadow-blue-500/30"
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: "1.2rem" }}>upload</span>
                        Change Image
                      </label>
                      <p className="text-xs text-slate-500 mt-3 text-center">
                        JPEG, PNG, GIF, WebP<br />Max: 10MB
                      </p>
                      {uploadingImage && (
                        <p className="text-xs text-blue-600 mt-3 flex items-center gap-1 font-semibold">
                          <span className="material-symbols-outlined animate-spin" style={{ fontSize: "1rem" }}>progress_activity</span>
                          Uploading...
                        </p>
                      )}
                    </div>
                  </div>

                  {/* RIGHT SIDE - Form Fields */}
                  <div className="lg:col-span-2 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Codename</label>
                        <input
                          required
                          type="text"
                          value={selectedVehicle.codename || ""}
                          onChange={(e) => handleEditChange("codename", e.target.value)}
                          className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Truck Type</label>
                        <select
                          value={selectedVehicle.truckType || ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            let payloadCapacity = 5;
                            if (val === "M923") payloadCapacity = 5;
                            else if (val === "KM450") payloadCapacity = 1.25;
                            else if (val === "KM250") payloadCapacity = 2.5;
                            handleEditChange("truckType", val);
                            handleEditChange("payloadCapacity", payloadCapacity);
                          }}
                          className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all bg-white"
                        >
                          <option value="M923">M923</option>
                          <option value="KM450">KM450</option>
                          <option value="KM250">KM250</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Personnel Assigned</label>
                      <select
                        value={selectedVehicle.personnelId || ""}
                        onChange={(e) => handleEditChange("personnelId", e.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all bg-white"
                      >
                        <option value="">Select Personnel</option>
                        {personnels.map((o) => (
                          <option key={o.id} value={o.id}>
                            [{o.rank}] {o.lastName}, {o.firstName}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Body Number</label>
                        <input
                          required
                          type="text"
                          value={selectedVehicle.bodyNumber || ""}
                          onChange={(e) => handleEditChange("bodyNumber", e.target.value)}
                          className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Chassis Number</label>
                        <input
                          required
                          type="text"
                          value={selectedVehicle.chassisNumber || ""}
                          onChange={(e) => handleEditChange("chassisNumber", e.target.value)}
                          className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Engine Number</label>
                      <input
                        required
                        type="text"
                        value={selectedVehicle.engineNumber || ""}
                        onChange={(e) => handleEditChange("engineNumber", e.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Gas Tank Capacity (L)</label>
                        <input
                          required
                          type="number"
                          value={selectedVehicle.gasTankCapacity || ""}
                          onChange={(e) => handleEditChange("gasTankCapacity", parseInt(e.target.value))}
                          className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Payload Capacity (T)</label>
                        <input
                          required
                          type="number"
                          step="0.01"
                          value={selectedVehicle.payloadCapacity || ""}
                          onChange={(e) => handleEditChange("payloadCapacity", parseFloat(e.target.value))}
                          className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Condition</label>
                        <select
                          value={selectedVehicle.vehicleCondition || "New"}
                          onChange={(e) => {
                            const cond = e.target.value;
                            setSelectedVehicle({
                              ...selectedVehicle,
                              vehicleCondition: cond,
                              odometer: cond === "New" ? 0 : selectedVehicle.odometer
                            });
                          }}
                          className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all bg-white"
                        >
                          <option value="New">New</option>
                          <option value="2nd hand">2nd hand</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Odometer (Km)</label>
                        <input
                          disabled={selectedVehicle.vehicleCondition === "New"}
                          type="number"
                          value={selectedVehicle.odometer || 0}
                          onChange={(e) => handleEditChange("odometer", parseInt(e.target.value) || 0)}
                          className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all disabled:bg-slate-50 disabled:text-slate-400"
                        />
                      </div>
                    </div>

                    {/* Vehicle Status Checkbox */}
                    <div className="rounded-xl border border-slate-200 p-4 bg-slate-50">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedVehicle.status === "Serviceable"}
                          onChange={(e) => {
                            const newStatus = e.target.checked ? "Serviceable" : "Unserviceable";
                            handleEditChange("status", newStatus);
                            if (newStatus === "Serviceable") {
                              handleEditChange("unserviceableReasons", {
                                flatTires: false,
                                engineFailure: false,
                                others: false,
                                othersText: ""
                              });
                            } else if (!selectedVehicle.unserviceableReasons) {
                              handleEditChange("unserviceableReasons", {
                                flatTires: false,
                                engineFailure: false,
                                others: false,
                                othersText: ""
                              });
                            }
                          }}
                          className="h-5 w-5 rounded border-slate-300 text-emerald-600 focus:ring-2 focus:ring-emerald-500/20 cursor-pointer"
                        />
                        <div className="flex-1">
                          <span className="block text-sm font-bold text-slate-900">Vehicle is Serviceable</span>
                          <span className="block text-xs text-slate-500 mt-0.5">Check if the vehicle is currently serviceable and ready for deployment</span>
                        </div>
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${selectedVehicle.status === "Serviceable" ? "bg-emerald-100 text-emerald-800 border border-emerald-200" : "bg-rose-100 text-rose-800 border border-rose-200"}`}>
                          <span className="material-symbols-outlined" style={{ fontSize: "0.85rem" }}>{selectedVehicle.status === "Serviceable" ? "check_circle" : "cancel"}</span>
                          {selectedVehicle.status}
                        </span>
                      </label>
                    </div>

                    {/* Unserviceable Reasons - Show only when Unserviceable */}
                    {selectedVehicle.status === "Unserviceable" && (
                      <div className="rounded-xl border-2 border-rose-200 p-5 bg-rose-50/50 space-y-3 animate-fade-in">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="material-symbols-outlined text-rose-600" style={{ fontSize: "1.3rem" }}>error</span>
                          <h4 className="text-sm font-bold text-rose-900 uppercase tracking-wide">Reason for Unserviceability</h4>
                        </div>
                        
                        <label className="flex items-center gap-3 cursor-pointer hover:bg-rose-100/50 p-2 rounded-lg transition-colors">
                          <input
                            type="checkbox"
                            checked={selectedVehicle.unserviceableReasons?.flatTires || false}
                            onChange={(e) => handleEditChange("unserviceableReasons", {
                              ...(selectedVehicle.unserviceableReasons || { flatTires: false, engineFailure: false, others: false, othersText: "" }),
                              flatTires: e.target.checked
                            })}
                            className="h-4 w-4 rounded border-rose-300 text-rose-600 focus:ring-2 focus:ring-rose-500/20 cursor-pointer"
                          />
                          <span className="text-sm font-medium text-slate-900">Flat Tires</span>
                        </label>

                        <label className="flex items-center gap-3 cursor-pointer hover:bg-rose-100/50 p-2 rounded-lg transition-colors">
                          <input
                            type="checkbox"
                            checked={selectedVehicle.unserviceableReasons?.engineFailure || false}
                            onChange={(e) => handleEditChange("unserviceableReasons", {
                              ...(selectedVehicle.unserviceableReasons || { flatTires: false, engineFailure: false, others: false, othersText: "" }),
                              engineFailure: e.target.checked
                            })}
                            className="h-4 w-4 rounded border-rose-300 text-rose-600 focus:ring-2 focus:ring-rose-500/20 cursor-pointer"
                          />
                          <span className="text-sm font-medium text-slate-900">Engine Failure</span>
                        </label>

                        <label className="flex items-start gap-3 cursor-pointer hover:bg-rose-100/50 p-2 rounded-lg transition-colors">
                          <input
                            type="checkbox"
                            checked={selectedVehicle.unserviceableReasons?.others || false}
                            onChange={(e) => handleEditChange("unserviceableReasons", {
                              ...(selectedVehicle.unserviceableReasons || { flatTires: false, engineFailure: false, others: false, othersText: "" }),
                              others: e.target.checked,
                              othersText: e.target.checked ? (selectedVehicle.unserviceableReasons?.othersText || "") : ""
                            })}
                            className="h-4 w-4 rounded border-rose-300 text-rose-600 focus:ring-2 focus:ring-rose-500/20 cursor-pointer mt-0.5"
                          />
                          <div className="flex-1">
                            <span className="text-sm font-medium text-slate-900 block mb-2">Others</span>
                            {selectedVehicle.unserviceableReasons?.others && (
                              <input
                                type="text"
                                value={selectedVehicle.unserviceableReasons?.othersText || ""}
                                onChange={(e) => handleEditChange("unserviceableReasons", {
                                  ...(selectedVehicle.unserviceableReasons || { flatTires: false, engineFailure: false, others: false, othersText: "" }),
                                  othersText: e.target.value
                                })}
                                placeholder="Specify other reason..."
                                className="w-full rounded-lg border border-rose-200 px-3 py-2 text-sm focus:border-rose-400 focus:ring-2 focus:ring-rose-500/20 outline-none transition-all bg-white"
                              />
                            )}
                          </div>
                        </label>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              {/* Footer Actions */}
              <div className="flex gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50 sticky bottom-0">
                <button
                  type="button"
                  onClick={() => setDeleteConfirmationOpen(true)}
                  className="rounded-xl border border-rose-200 bg-rose-50 px-5 py-3 text-sm font-bold text-rose-600 hover:bg-rose-100 transition-all flex items-center gap-2"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: "1.1rem" }}>delete</span>
                  Delete Vehicle
                </button>
                <div className="flex-1"></div>
                <button
                  type="button"
                  onClick={() => setCancelConfirmationOpen(true)}
                  className="rounded-xl border-2 border-slate-200 px-6 py-3 text-sm font-bold text-slate-600 hover:bg-slate-100 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-emerald-500 px-8 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-500/30 hover:shadow-xl hover:bg-emerald-600 active:scale-95 transition-all"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
                  className="px-4 py-2 bg-slate-200 text-slate-600 rounded-lg hover:bg-slate-300"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmSave}
                  className="px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600"
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {cancelConfirmationOpen && selectedVehicle && originalVehicle && (
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
                {Object.keys(selectedVehicle).map((key) => {
                  const originalValue = (originalVehicle as any)[key];
                  const currentValue = (selectedVehicle as any)[key];
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
                    setCancelConfirmationOpen(false);
                    await handleConfirmSave();
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
                    setSelectedVehicle(originalVehicle);
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

      {/* Delete Confirmation Modal */}
      {deleteConfirmationOpen && selectedVehicle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={() => setDeleteConfirmationOpen(false)}
          />
          <div className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl animate-fade-in overflow-hidden">
            <div className="bg-gradient-to-r from-rose-600 to-rose-700 px-6 py-4">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-rose-200" style={{ fontSize: "1.5rem" }}>
                  warning
                </span>
                <h3 className="text-lg font-bold text-white">Delete Vehicle</h3>
              </div>
            </div>
            <div className="p-6">
              <p className="text-sm text-slate-600 mb-4">
                Are you sure you want to delete vehicle <span className="font-bold text-slate-900">{selectedVehicle.codename}</span>?
              </p>
              <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-3 mb-4">
                <span className="material-symbols-outlined text-xs" style={{ fontSize: "0.9rem" }}>info</span>
                {" "}This action cannot be undone. The vehicle will be permanently removed from the system.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteConfirmationOpen(false)}
                  className="flex-1 rounded-lg border-2 border-slate-300 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteVehicle}
                  className="flex-1 rounded-lg bg-rose-500 py-2.5 text-sm font-bold text-white hover:bg-rose-600 transition-all flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: "1.1rem" }}>delete</span>
                  Delete Vehicle
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
