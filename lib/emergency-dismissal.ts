"use client";

const STORAGE_KEY = "dismissedEmergencyReportIds";

const isBrowser = typeof window !== "undefined";

function readDismissedEmergencyIds(): Set<string> {
  if (!isBrowser) {
    return new Set();
  }

  try {
    const rawValue = window.localStorage.getItem(STORAGE_KEY);
    if (!rawValue) {
      return new Set();
    }

    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) {
      return new Set();
    }

    return new Set(parsed.filter((value): value is string => typeof value === "string" && value.trim().length > 0));
  } catch {
    return new Set();
  }
}

export function getDismissedEmergencyIds(): Set<string> {
  return readDismissedEmergencyIds();
}

export function dismissEmergencyId(id?: string) {
  if (!isBrowser || !id || !id.trim()) {
    return;
  }

  const dismissedIds = readDismissedEmergencyIds();
  dismissedIds.add(id);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(dismissedIds)));
}
