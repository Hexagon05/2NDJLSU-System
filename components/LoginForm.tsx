"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (!email || !password) {
        setError("Please enter both email and password");
        setLoading(false);
        return;
      }

      await signInWithEmailAndPassword(auth, email, password);
      router.push("/dashboard");
    } catch (err: unknown) {
      if (err instanceof Error) {
        if (err.message.includes("auth/user-not-found")) {
          setError("User not found. Please check your email.");
        } else if (err.message.includes("auth/wrong-password")) {
          setError("Incorrect password. Please try again.");
        } else if (err.message.includes("auth/invalid-email")) {
          setError("Invalid email address.");
        } else if (err.message.includes("auth/user-disabled")) {
          setError("This account has been disabled.");
        } else {
          setError(err.message || "Login failed. Please try again.");
        }
      } else {
        setError("An unexpected error occurred. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-4 py-12">
      {/* Background decoration */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 h-96 w-96 rounded-full bg-emerald-500/10 blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-blue-500/10 blur-3xl"></div>
      </div>

      <div className="relative w-full max-w-md">
        <div className="animate-fade-in rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 px-8 py-10 shadow-2xl shadow-black/40">
          {/* Logo and Title */}
          <div className="flex flex-col items-center space-y-4 mb-8">
            <div className="animate-float relative">
              <div className="absolute inset-0 rounded-full bg-emerald-500/30 blur-xl"></div>
              <div className="relative rounded-full bg-gradient-to-br from-slate-800 to-slate-900 p-1.5 shadow-2xl border-2 border-emerald-500/40">
                <img
                  src="/logo.png"
                  alt="AFPLSC Logo"
                  className="h-24 w-24 object-contain rounded-full"
                />
              </div>
            </div>
            <div className="text-center">
              <h1 className="text-3xl font-bold text-white tracking-tight">Admin Login</h1>
              <p className="mt-1 text-sm text-slate-400 font-medium">Joint Logistics Support Group</p>
              <p className="text-xs text-slate-500">AFPLSC 2025</p>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="animate-slide-down mb-5 flex items-center gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3">
              <span className="material-symbols-outlined text-rose-400 flex-shrink-0" style={{ fontSize: "1.25rem" }}>error</span>
              <p className="text-sm font-medium text-rose-300">{error}</p>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleLogin} className="space-y-5">
            {/* Email Field */}
            <div className="animate-slide-up">
              <label htmlFor="email" className="block text-sm font-semibold text-slate-300 mb-2">
                Username
              </label>
              <div className="relative group">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 material-symbols-outlined text-slate-500 group-focus-within:text-emerald-400 transition-colors" style={{ fontSize: "1.1rem" }}>
                  person
                </span>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your username"
                  className="w-full rounded-xl border border-white/10 bg-white/5 py-3 pl-11 pr-10 text-white placeholder-slate-500 transition-all duration-200 focus:border-emerald-500/50 focus:bg-white/10 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 hover:border-white/20"
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="animate-slide-up animation-delay-100">
              <label htmlFor="password" className="block text-sm font-semibold text-slate-300 mb-2">
                Password
              </label>
              <div className="relative group">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 material-symbols-outlined text-slate-500 group-focus-within:text-emerald-400 transition-colors" style={{ fontSize: "1.1rem" }}>
                  lock
                </span>
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full rounded-xl border border-white/10 bg-white/5 py-3 pl-11 pr-11 text-white placeholder-slate-500 transition-all duration-200 focus:border-emerald-500/50 focus:bg-white/10 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 hover:border-white/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors duration-200"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: "1.1rem" }}>
                    {showPassword ? "visibility_off" : "visibility"}
                  </span>
                </button>
              </div>
            </div>

            {/* Forgot Password */}
            <div className="flex justify-end animate-slide-up animation-delay-200">
              <a href="#" className="text-sm font-semibold text-emerald-400 hover:text-emerald-300 transition-colors duration-200">
                Forgot Password?
              </a>
            </div>

            {/* Login Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 py-3.5 px-4 font-bold text-white shadow-lg shadow-emerald-500/30 transition-all duration-300 hover:shadow-xl hover:shadow-emerald-500/40 hover:from-emerald-400 hover:to-green-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/30 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 animate-slide-up animation-delay-300"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="material-symbols-outlined animate-spin" style={{ fontSize: "1.1rem" }}>progress_activity</span>
                  Logging in...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <span className="material-symbols-outlined" style={{ fontSize: "1.1rem" }}>login</span>
                  Login
                </span>
              )}
            </button>
          </form>

          {/* Copyright */}
          <div className="mt-6 border-t border-white/10 pt-5 text-center text-xs text-slate-600">
            <p className="font-semibold text-slate-500">Logistics Support Unit — Palawan</p>
            <p className="mt-0.5">AFPSC 2025</p>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes fade-in {
          from { opacity: 0; transform: scale(0.97); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes slide-up {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-8px); }
        }
        @keyframes slide-down {
          from { opacity: 0; transform: translateY(-10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in        { animation: fade-in 0.5s ease-out; }
        .animate-slide-up       { animation: slide-up 0.5s ease-out forwards; opacity: 0; }
        .animation-delay-100    { animation-delay: 0.1s; }
        .animation-delay-200    { animation-delay: 0.2s; }
        .animation-delay-300    { animation-delay: 0.3s; }
        .animate-float          { animation: float 3s ease-in-out infinite; }
        .animate-slide-down     { animation: slide-down 0.35s ease-out; }
      `}</style>
    </div>
  );
}
