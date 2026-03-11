"use client";

import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { doc, getDoc, collection, getDocs, query, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";

interface DiagnosticResult {
  status: "success" | "error" | "warning";
  message: string;
  details?: any;
}

export default function DiagnosticPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [results, setResults] = useState<DiagnosticResult[]>([]);

  useEffect(() => {
    const runDiagnostics = async () => {
      if (!user) return;

      const diagnosticResults: DiagnosticResult[] = [];
      setChecking(true);

      try {
        // 1. Check Firebase Auth
        diagnosticResults.push({
          status: "success",
          message: "✅ Firebase Authentication",
          details: {
            email: user.email,
            uid: user.uid,
            emailVerified: user.emailVerified,
          },
        });

        // 2. Check users collection (Web Admin)
        try {
          const userDocRef = doc(db, "users", user.uid);
          const userDocSnap = await getDoc(userDocRef);

          if (userDocSnap.exists()) {
            diagnosticResults.push({
              status: "success",
              message: "✅ Web Admin Document Found",
              details: {
                collection: "users",
                docId: user.uid,
                data: userDocSnap.data(),
              },
            });
          } else {
            diagnosticResults.push({
              status: "error",
              message: "❌ Web Admin Document NOT FOUND",
              details: {
                collection: "users",
                docId: user.uid,
                fix: "This is why you're getting permission errors. Click 'Create Admin Document' below.",
              },
            });
          }
        } catch (err: any) {
          diagnosticResults.push({
            status: "error",
            message: `❌ Error checking users collection: ${err.message}`,
          });
        }

        // 3. Check personnelAccount collection
        try {
          const personnelDocRef = doc(db, "personnelAccount", user.uid);
          const personnelDocSnap = await getDoc(personnelDocRef);

          if (personnelDocSnap.exists()) {
            diagnosticResults.push({
              status: "warning",
              message: "⚠️ Personnel Account Found (You're logged in as field personnel, not web admin)",
              details: {
                collection: "personnelAccount",
                docId: user.uid,
                note: "Field personnel cannot create dispatches/vehicles. You need a 'users' collection document.",
              },
            });
          } else {
            diagnosticResults.push({
              status: "success",
              message: "✅ Not in personnelAccount collection (Good - you should be a web admin)",
            });
          }
        } catch (err) {
          // It's okay if this fails
        }

        // 4. Check if users collection exists
        try {
          const usersSnapshot = await getDocs(query(collection(db, "users"), limit(1)));
          if (usersSnapshot.empty) {
            diagnosticResults.push({
              status: "warning",
              message: "⚠️ Users collection is empty",
              details: "No web admin users exist yet. You'll be the first!",
            });
          } else {
            diagnosticResults.push({
              status: "success",
              message: `✅ Users collection exists (${usersSnapshot.size} document(s))`,
            });
          }
        } catch (err: any) {
          diagnosticResults.push({
            status: "error",
            message: `❌ Cannot read users collection: ${err.message}`,
            details: "This might be a Firestore rules issue.",
          });
        }

        // 5. Check meta collection
        try {
          const metaDocRef = doc(db, "meta", "dispatchCounter");
          const metaDocSnap = await getDoc(metaDocRef);
          
          if (metaDocSnap.exists()) {
            diagnosticResults.push({
              status: "success",
              message: "✅ Meta/dispatchCounter exists",
              details: metaDocSnap.data(),
            });
          } else {
            diagnosticResults.push({
              status: "warning",
              message: "⚠️ Meta collection doesn't exist yet (will be created on first dispatch)",
            });
          }
        } catch (err: any) {
          diagnosticResults.push({
            status: "error",
            message: `❌ Cannot access meta collection: ${err.message}`,
          });
        }

        // 6. Check vehicles collection
        try {
          const vehiclesSnapshot = await getDocs(query(collection(db, "vehicles"), limit(1)));
          diagnosticResults.push({
            status: "success",
            message: `✅ Can read vehicles collection (${vehiclesSnapshot.size} vehicle(s))`,
          });
        } catch (err: any) {
          diagnosticResults.push({
            status: "error",
            message: `❌ Cannot read vehicles: ${err.message}`,
          });
        }

        // 7. Check dispatches collection
        try {
          const dispatchesSnapshot = await getDocs(query(collection(db, "dispatches"), limit(1)));
          diagnosticResults.push({
            status: "success",
            message: `✅ Can read dispatches collection (${dispatchesSnapshot.size} dispatch(es))`,
          });
        } catch (err: any) {
          diagnosticResults.push({
            status: "error",
            message: `❌ Cannot read dispatches: ${err.message}`,
          });
        }

      } catch (err: any) {
        diagnosticResults.push({
          status: "error",
          message: `❌ Unexpected error: ${err.message}`,
        });
      }

      setResults(diagnosticResults);
      setChecking(false);
    };

    if (user) {
      runDiagnostics();
    }
  }, [user]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
        <div className="text-center">
          <span className="material-symbols-outlined animate-spin text-blue-400" style={{ fontSize: "3rem" }}>
            progress_activity
          </span>
          <p className="mt-4 text-slate-300 font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    router.push("/login");
    return null;
  }

  const hasError = results.some(r => r.status === "error");
  const needsAdminDoc = results.some(r => r.message.includes("Web Admin Document NOT FOUND"));

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-4 py-12">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 mb-4">
            <span className="material-symbols-outlined text-white" style={{ fontSize: "3rem" }}>
              {checking ? "autorenew" : hasError ? "error" : "verified"}
            </span>
          </div>
          <h1 className="text-4xl font-bold text-white mb-2">Database Diagnostics</h1>
          <p className="text-slate-400">Checking your Firebase setup and permissions</p>
        </div>

        {/* Results */}
        <div className="space-y-4 mb-8">
          {checking ? (
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 text-center">
              <span className="material-symbols-outlined animate-spin text-blue-400 mb-4" style={{ fontSize: "3rem" }}>
                progress_activity
              </span>
              <p className="text-white font-medium">Running diagnostics...</p>
            </div>
          ) : (
            results.map((result, index) => (
              <div
                key={index}
                className={`bg-white/5 backdrop-blur-xl border rounded-2xl p-6 ${
                  result.status === "success"
                    ? "border-emerald-500/30"
                    : result.status === "error"
                    ? "border-rose-500/30"
                    : "border-amber-500/30"
                }`}
              >
                <h3
                  className={`font-bold text-lg mb-2 ${
                    result.status === "success"
                      ? "text-emerald-400"
                      : result.status === "error"
                      ? "text-rose-400"
                      : "text-amber-400"
                  }`}
                >
                  {result.message}
                </h3>
                {result.details && (
                  <pre className="bg-black/30 rounded-lg p-4 text-xs text-slate-300 overflow-auto font-mono">
                    {JSON.stringify(result.details, null, 2)}
                  </pre>
                )}
              </div>
            ))
          )}
        </div>

        {/* Actions */}
        {!checking && (
          <div className="space-y-4">
            {needsAdminDoc && (
              <a
                href="/setup-admin"
                className="block w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 py-4 px-6 font-bold text-white shadow-lg hover:shadow-xl hover:from-emerald-400 hover:to-green-500 transition-all duration-300"
              >
                <span className="material-symbols-outlined" style={{ fontSize: "1.5rem" }}>add_circle</span>
                <span>Create Admin Document (Fix Permission Error)</span>
              </a>
            )}

            <button
              onClick={() => window.location.reload()}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-500/20 border border-blue-500/30 py-3 px-6 font-semibold text-blue-300 hover:bg-blue-500/30 transition-all duration-300"
            >
              <span className="material-symbols-outlined" style={{ fontSize: "1.25rem" }}>refresh</span>
              <span>Run Diagnostics Again</span>
            </button>

            <a
              href="/dashboard"
              className="block w-full flex items-center justify-center gap-2 rounded-xl bg-white/5 border border-white/10 py-3 px-6 font-semibold text-white hover:bg-white/10 transition-all duration-300"
            >
              <span className="material-symbols-outlined" style={{ fontSize: "1.25rem" }}>arrow_back</span>
              <span>Back to Dashboard</span>
            </a>
          </div>
        )}

        {/* Instructions */}
        <div className="mt-8 rounded-2xl bg-blue-500/10 border border-blue-500/30 p-6">
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-blue-400 flex-shrink-0" style={{ fontSize: "1.5rem" }}>
              info
            </span>
            <div className="text-sm text-blue-200">
              <p className="font-semibold mb-2">What This Shows:</p>
              <ul className="space-y-1 text-blue-300/80 list-disc list-inside">
                <li>Your Firebase Authentication status</li>
                <li>Whether you have a web admin document in <code className="bg-blue-500/20 px-1 rounded">users</code> collection</li>
                <li>Your access permissions to different collections</li>
                <li>What might be causing permission errors</li>
              </ul>
              <p className="mt-3 font-semibold text-amber-300">
                ⚠️ If you see "Web Admin Document NOT FOUND", that's why you're getting permission errors!
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
