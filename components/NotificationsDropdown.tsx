"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Activity, fetchRecentActivities, getActivityIcon, getActivityColor } from "@/lib/activity-logger";
import { Timestamp } from "firebase/firestore";

function formatTimeAgo(timestamp: Timestamp | null): string {
  if (!timestamp) return "—";
  const now = new Date();
  const date = timestamp.toDate();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}

interface NotificationsDropdownProps {
  userEmail?: string | null;
}

export default function NotificationsDropdown({ userEmail: _userEmail }: NotificationsDropdownProps) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, right: 16 });
  const wrapperRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const loadActivities = async () => {
      setLoading(true);
      const data = await fetchRecentActivities(15);
      setActivities(data);
      setLoading(false);
    };

    loadActivities();
    // Refresh activities every 15 seconds
    const interval = setInterval(loadActivities, 15000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const clickedInsideButton = buttonRef.current?.contains(target);
      const clickedInsidePanel = panelRef.current?.contains(target);

      if (!clickedInsideButton && !clickedInsidePanel) {
        setDropdownOpen(false);
      }
    };

    if (dropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [dropdownOpen]);

  useEffect(() => {
    if (!dropdownOpen) return;

    const EDGE_GAP = 16;

    const updatePosition = () => {
      if (!buttonRef.current) return;
      const rect = buttonRef.current.getBoundingClientRect();
      const top = rect.bottom + 8;
      const right = Math.max(EDGE_GAP, window.innerWidth - rect.right);
      setDropdownPosition({ top, right });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [dropdownOpen]);

  const hasUnread = activities.length > 0;

  const dropdownPanel =
    dropdownOpen && mounted
      ? createPortal(
          <div
            ref={panelRef}
            className="fixed w-[min(24rem,calc(100vw-2rem))] bg-white rounded-2xl shadow-2xl border border-slate-200 z-[99999] overflow-hidden animate-fade-in"
            style={{ top: dropdownPosition.top, right: dropdownPosition.right }}
          >
            {/* Header */}
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">Recent Activities</h3>
              <button
                onClick={() => setDropdownOpen(false)}
                className="p-1 hover:bg-slate-200 rounded-lg transition-colors"
              >
                <span className="material-symbols-outlined text-slate-400 text-sm">close</span>
              </button>
            </div>

            {/* Activities List */}
            <div className="max-h-96 overflow-y-auto custom-scrollbar">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <span className="material-symbols-outlined animate-spin text-emerald-400" style={{ fontSize: "1.5rem" }}>
                    progress_activity
                  </span>
                </div>
              ) : activities.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 px-4">
                  <span className="material-symbols-outlined text-slate-300" style={{ fontSize: "2.5rem" }}>
                    history
                  </span>
                  <p className="text-xs text-slate-400 mt-2 text-center">No activities yet</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-50">
                  {activities.map((activity, idx) => (
                    <div
                      key={activity.id}
                      className="px-4 py-3 hover:bg-slate-50/50 transition-colors group cursor-pointer animate-fade-in"
                      style={{ animationDelay: `${idx * 0.02}s` }}
                    >
                      <div className="flex gap-3">
                        {/* Icon */}
                        <div className={`flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 flex-shrink-0 group-hover:bg-slate-200 transition-all ${getActivityColor(activity.type)}`}>
                          <span className="material-symbols-outlined text-sm">
                            {getActivityIcon(activity.type)}
                          </span>
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <p className="text-xs font-bold text-slate-900 leading-tight group-hover:text-emerald-700 transition-colors">
                                {activity.description}
                              </p>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-[10px] text-slate-500 font-medium">
                                  {activity.user}
                                </span>
                              </div>
                            </div>
                            <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap flex-shrink-0">
                              {formatTimeAgo(activity.timestamp)}
                            </span>
                          </div>

                          {/* Details summary if any */}
                          {activity.details && Object.keys(activity.details).length > 0 && (
                            <div className="mt-1.5 text-[10px] text-slate-500 space-y-0.5">
                              {Object.entries(activity.details)
                                .slice(0, 2)
                                .map(([key, value]) => (
                                  <div key={key} className="flex items-center gap-1">
                                    <span className="font-medium text-slate-600">{key}:</span>
                                    <span className="text-slate-500">{String(value).substring(0, 30)}</span>
                                  </div>
                                ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-2 border-t border-slate-100 bg-slate-50">
              <p className="text-[10px] text-slate-400 text-center">
                Showing the {Math.min(15, activities.length)} most recent activities
              </p>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <div ref={wrapperRef} className="relative">
      <button
        ref={buttonRef}
        onClick={() => setDropdownOpen(!dropdownOpen)}
        className="relative p-2.5 bg-gradient-to-br from-blue-50 to-blue-100 hover:from-blue-100 hover:to-blue-200 rounded-xl transition-all duration-200 group shadow-sm hover:shadow-md border border-blue-200"
      >
        <span
          className="material-symbols-outlined text-blue-600 group-hover:text-blue-700"
          style={{ fontSize: "1.5rem" }}
        >
          notifications
        </span>
        {hasUnread && (
          <span className="absolute top-1 right-1 h-3 w-3 bg-rose-500 rounded-full animate-pulse ring-2 ring-white shadow-lg shadow-rose-500/50"></span>
        )}
      </button>
      {dropdownPanel}

      <style jsx>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out forwards;
          opacity: 0;
        }
      `}</style>
    </div>
  );
}
