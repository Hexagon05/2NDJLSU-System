import { db } from "@/lib/firebase";
import { collection, addDoc, query, orderBy, limit, getDocs, Timestamp } from "firebase/firestore";

const LOCAL_ACTIVITY_KEY = "admin_activities_fallback_v1";

export type ActivityType = 
  | "PERSONNEL_CREATED"
  | "PERSONNEL_UPDATED"
  | "VEHICLE_CREATED"
  | "VEHICLE_UPDATED"
  | "DISPATCH_CREATED"
  | "DISPATCH_COMPLETED"
  | "EXPORT_EXCEL"
  | "LOGIN"
  | "LOGOUT";

export interface Activity {
  id: string;
  type: ActivityType;
  description: string;
  user: string;
  details?: Record<string, any>;
  timestamp: Timestamp;
}

interface LocalActivity {
  id: string;
  type: ActivityType;
  description: string;
  user: string;
  details?: Record<string, any>;
  timestampISO: string;
}

function getLocalActivities(): LocalActivity[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_ACTIVITY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LocalActivity[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocalActivity(entry: LocalActivity) {
  if (typeof window === "undefined") return;
  try {
    const items = getLocalActivities();
    const next = [entry, ...items].slice(0, 50);
    window.localStorage.setItem(LOCAL_ACTIVITY_KEY, JSON.stringify(next));
  } catch {
    // Intentionally ignore local storage errors.
  }
}

function toActivity(entry: LocalActivity): Activity {
  return {
    id: entry.id,
    type: entry.type,
    description: entry.description,
    user: entry.user,
    details: entry.details,
    timestamp: Timestamp.fromDate(new Date(entry.timestampISO)),
  };
}

export const logActivity = async (
  type: ActivityType,
  description: string,
  userEmail: string,
  details?: Record<string, any>
) => {
  const fallbackEntry: LocalActivity = {
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    description,
    user: userEmail,
    details: details || {},
    timestampISO: new Date().toISOString(),
  };

  try {
    await addDoc(collection(db, "activities"), {
      type,
      description,
      user: userEmail,
      details: details || {},
      timestamp: Timestamp.now(),
    });
  } catch (error) {
    console.error("Error logging activity:", error);
    saveLocalActivity(fallbackEntry);
  }
};

export const fetchRecentActivities = async (limitCount: number = 10): Promise<Activity[]> => {
  try {
    const q = query(
      collection(db, "activities"),
      orderBy("timestamp", "desc"),
      limit(limitCount)
    );
    const snap = await getDocs(q);
    const remoteActivities = snap.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as Omit<Activity, "id">),
    }));

    if (remoteActivities.length > 0) {
      return remoteActivities;
    }

    return getLocalActivities().slice(0, limitCount).map(toActivity);
  } catch (error) {
    console.error("Error fetching activities:", error);
    return getLocalActivities().slice(0, limitCount).map(toActivity);
  }
};

export const getActivityIcon = (type: ActivityType): string => {
  const iconMap: Record<ActivityType, string> = {
    PERSONNEL_CREATED: "person_add",
    PERSONNEL_UPDATED: "person_edit",
    VEHICLE_CREATED: "local_shipping",
    VEHICLE_UPDATED: "edit",
    DISPATCH_CREATED: "send",
    DISPATCH_COMPLETED: "task_alt",
    EXPORT_EXCEL: "download",
    LOGIN: "login",
    LOGOUT: "logout",
  };
  return iconMap[type] || "info";
};

export const getActivityColor = (type: ActivityType): string => {
  const colorMap: Record<ActivityType, string> = {
    PERSONNEL_CREATED: "text-blue-600",
    PERSONNEL_UPDATED: "text-blue-500",
    VEHICLE_CREATED: "text-violet-600",
    VEHICLE_UPDATED: "text-violet-500",
    DISPATCH_CREATED: "text-emerald-600",
    DISPATCH_COMPLETED: "text-green-600",
    EXPORT_EXCEL: "text-amber-600",
    LOGIN: "text-teal-600",
    LOGOUT: "text-slate-500",
  };
  return colorMap[type] || "text-slate-500";
};
