"use client";

import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

export default function SetupAdminPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [hasUserDoc, setHasUserDoc] = useState(false);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const checkUserDoc = async () => {
      if (!user) return;
      
      setChecking(true);
      try {
        const userDocRef = doc(db, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);
        
        if (userDocSnap.exists()) {
          setHasUserDoc(true);
          setMessage("✅ Your admin account is already set up!");
        } else {
          setHasUserDoc(false);
          setMessage("⚠️ Admin document not found. Click below to create it.");
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setChecking(false);
      }
    };

    if (user) {
      checkUserDoc();
    }
  }, [user]);

  const createUserDocument = async () => {
    if (!user) return;

    setCreating(true);
    setError("");
    
    try {
      const userDocRef = doc(db, "users", user.uid);
      await setDoc(userDocRef, {
        email: user.email,
        role: "admin",
        displayName: user.displayName || user.email?.split("@")[0] || "Admin",
        createdAt: serverTimestamp(),
        uid: user.uid,
      });
      
      setHasUserDoc(true);
      setMessage("✅ Admin account created successfully! You can now create dispatches.");
      
      // Redirect to dashboard after 2 seconds
      setTimeout(() => {
        router.push("/dashboard");
      }, 2000);
    } catch (err: any) {
      setError(`Error: ${err.message}`);
    } finally {
      setCreating(false);
    }
  };

  if (loading || checking) {
    return (
      <div className="flex h-screen items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
        <div className="text-center">
          <span className="material-symbols-outlined animate-spin text-blue-400" style={{ fontSize: "3rem" }}>
            progress_activity
          </span>
          <p className="mt-4 text-slate-300 font-medium">Checking your account...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    router.push("/login");
    return null;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-4 py-12">
      <div className="w-full max-w-2xl">
        <div className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 px-8 py-10 shadow-2xl">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-emerald-500 to-green-600 mb-4">
              <span className="material-symbols-outlined text-white" style={{ fontSize: "3rem" }}>
                admin_panel_settings
              </span>
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">Admin Setup</h1>
            <p className="text-slate-400">Configure your web admin access</p>
          </div>

          {/* Current User Info */}
          <div className="bg-white/5 rounded-xl p-6 mb-6 border border-white/10">
            <h3 className="text-sm font-bold text-slate-300 uppercase mb-3">Current User</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-emerald-400" style={{ fontSize: "1.25rem" }}>email</span>
                <span className="text-white font-mono text-sm">{user.email}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-blue-400" style={{ fontSize: "1.25rem" }}>fingerprint</span>
                <span className="text-slate-400 font-mono text-xs break-all">{user.uid}</span>
              </div>
            </div>
          </div>

          {/* Status Message */}
          {message && (
            <div className={`rounded-xl p-4 mb-6 ${
              hasUserDoc 
                ? "bg-emerald-500/10 border border-emerald-500/30" 
                : "bg-amber-500/10 border border-amber-500/30"
            }`}>
              <p className={`text-sm font-medium ${
                hasUserDoc ? "text-emerald-300" : "text-amber-300"
              }`}>
                {message}
              </p>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="rounded-xl p-4 mb-6 bg-rose-500/10 border border-rose-500/30">
              <p className="text-sm font-medium text-rose-300">{error}</p>
            </div>
          )}

          {/* Action Button */}
          <div className="space-y-4">
            {!hasUserDoc && (
              <button
                onClick={createUserDocument}
                disabled={creating}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 py-4 px-6 font-bold text-white shadow-lg hover:shadow-xl hover:from-emerald-400 hover:to-green-500 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creating ? (
                  <>
                    <span className="material-symbols-outlined animate-spin" style={{ fontSize: "1.25rem" }}>
                      progress_activity
                    </span>
                    <span>Creating Admin Account...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined" style={{ fontSize: "1.25rem" }}>
                      add_circle
                    </span>
                    <span>Create Admin Document</span>
                  </>
                )}
              </button>
            )}

            <button
              onClick={() => router.push("/dashboard")}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-white/5 border border-white/10 py-3 px-6 font-semibold text-white hover:bg-white/10 transition-all duration-300"
            >
              <span className="material-symbols-outlined" style={{ fontSize: "1.25rem" }}>
                arrow_back
              </span>
              <span>Back to Dashboard</span>
            </button>
          </div>

          {/* Info Box */}
          <div className="mt-8 rounded-xl bg-blue-500/10 border border-blue-500/30 p-4">
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined text-blue-400 flex-shrink-0" style={{ fontSize: "1.5rem" }}>
                info
              </span>
              <div className="text-sm text-blue-200">
                <p className="font-semibold mb-1">What does this do?</p>
                <p className="text-blue-300/80">
                  This creates a document in the <code className="bg-blue-500/20 px-1.5 py-0.5 rounded">users</code> collection 
                  with your Firebase Auth UID, granting you permission to create dispatches and access admin features.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
