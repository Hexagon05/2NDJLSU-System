/*
Migration script: compute_dispatch_delays.js

Usage:
1. Place a Firebase service account JSON at `scripts/serviceAccountKey.json` OR set
   the `GOOGLE_APPLICATION_CREDENTIALS` environment variable pointing to your key file.
2. Run in dry-run mode (no writes):
   node scripts/compute_dispatch_delays.js
3. To actually persist computed fields, set RUN_MIGRATION=1:
   RUN_MIGRATION=1 node scripts/compute_dispatch_delays.js

Fields written to each dispatch document (when RUN_MIGRATION=1):
- computedDelayMinutes: number
- computedStopOverMinutes: number
- computedIdleMinutes: number
- computedDelayLabel: string
- computedDelayComputedAt: server timestamp

Warning: this script writes to your Firestore. Review and run with care.
*/

const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

function initFirebase() {
  // Prefer GOOGLE_APPLICATION_CREDENTIALS if set
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    admin.initializeApp();
    return;
  }

  const keyPath = path.join(__dirname, "serviceAccountKey.json");
  if (fs.existsSync(keyPath)) {
    const key = require(keyPath);
    admin.initializeApp({ credential: admin.credential.cert(key) });
    return;
  }

  console.error("No service account found. Set GOOGLE_APPLICATION_CREDENTIALS or place serviceAccountKey.json in scripts/.");
  process.exit(1);
}

initFirebase();

const db = admin.firestore();

function toMillis(ts) {
  if (ts == null) return 0;
  if (typeof ts === "number" && Number.isFinite(ts)) return ts;
  if (ts instanceof Date) return ts.getTime();
  if (ts && typeof ts.toMillis === "function") return ts.toMillis();
  if (typeof ts === "object") {
    if (typeof ts.seconds === "number") {
      const nanos = typeof ts.nanoseconds === "number" ? Math.floor(ts.nanoseconds / 1e6) : 0;
      return ts.seconds * 1000 + nanos;
    }
    if (typeof ts._seconds === "number") {
      const nanos = typeof ts._nanoseconds === "number" ? Math.floor(ts._nanoseconds / 1e6) : 0;
      return ts._seconds * 1000 + nanos;
    }
  }
  return 0;
}

function isDelayReport(entry) {
  if (!entry) return false;
  try {
    const text = String(entry.text || entry.message || entry.statusNote || "").toLowerCase();
    const kind = String(entry.type || entry.status || entry.action || "").toLowerCase();
    const signal = `${text} ${kind}`;
    return signal.includes("delay") || signal.includes("late") || signal.includes("traffic") || signal.includes("break") || signal.includes("rest");
  } catch (e) {
    return false;
  }
}

function isStopOverReport(entry) {
  if (!entry) return false;
  try {
    const text = String(entry.text || entry.message || entry.statusNote || "").toLowerCase();
    const kind = String(entry.type || entry.status || entry.action || "").toLowerCase();
    const signal = `${text} ${kind}`;
    return signal.includes("stop over") || signal.includes("stopover") || signal.includes("stop-over");
  } catch (e) {
    return false;
  }
}

function isResumeReport(entry) {
  if (!entry) return false;
  try {
    const text = String(entry.text || entry.message || entry.statusNote || "").toLowerCase();
    const kind = String(entry.type || entry.status || entry.action || "").toLowerCase();
    const signal = `${text} ${kind}`;
    return signal.includes("resume") || signal.includes("resumed") || signal.includes("back on route") || signal.includes("dispatch resumed");
  } catch (e) {
    return false;
  }
}

function parseDurationMinutes(value) {
  if (value == null) return null;

  const text = String(value).trim().toLowerCase();
  if (!text) return null;

  if (/^\d+(?:\.\d+)?$/.test(text)) {
    return Number(text);
  }

  let total = 0;
  let matched = false;

  const hourRegex = /(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours)\b/g;
  const minuteRegex = /(\d+(?:\.\d+)?)\s*(m|min|mins|minute|minutes)\b/g;

  let match;
  while ((match = hourRegex.exec(text)) !== null) {
    total += Number(match[1]) * 60;
    matched = true;
  }

  while ((match = minuteRegex.exec(text)) !== null) {
    total += Number(match[1]);
    matched = true;
  }

  // Accept compact forms like 1h30m or 2h15
  const compactMatch = text.match(/^(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+(?:\.\d+)?)\s*m?)?$/i);
  if (!matched && compactMatch) {
    const hours = compactMatch[1] ? Number(compactMatch[1]) : 0;
    const minutes = compactMatch[2] ? Number(compactMatch[2]) : 0;
    if (hours > 0 || minutes > 0) {
      return hours * 60 + minutes;
    }
  }

  // Common shorthand like "90m" or "1.5h"
  const shorthand = text.match(/^(\d+(?:\.\d+)?)(h|m)$/i);
  if (!matched && shorthand) {
    const amount = Number(shorthand[1]);
    if (shorthand[2].toLowerCase() === "h") return amount * 60;
    if (shorthand[2].toLowerCase() === "m") return amount;
  }

  return matched ? total : null;
}

function getExplicitDurationMinutes(entry) {
  if (!entry || typeof entry !== "object") return null;

  const candidates = [
    entry.estimatedDelay,
    entry.duration,
    entry.durationMinutes,
    entry.delayMinutes,
    entry.timeFrame,
    entry.timeframe,
    entry.reason,
    entry.text,
    entry.message,
    entry.statusNote,
    entry.description,
  ];

  for (const candidate of candidates) {
    const parsed = parseDurationMinutes(candidate);
    if (parsed !== null && Number.isFinite(parsed) && parsed > 0) return parsed;
  }

  return null;
}

function formatDurationMinutes(totalMinutes) {
  if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) return "0m";
  const safe = Math.max(0, Math.floor(totalMinutes));
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  if (hours <= 0) return `${minutes}m`;
  if (minutes <= 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

async function processBatch(startAfterDoc) {
  const pageSize = 200;
  let q = db.collection("dispatches").orderBy("createdAt", "desc").limit(pageSize);
  if (startAfterDoc) q = q.startAfter(startAfterDoc);
  const snap = await q.get();
  if (snap.empty) return { docs: [], lastDoc: null };
  const docs = snap.docs;
  for (const docSnap of docs) {
    const dispatch = { id: docSnap.id, ...(docSnap.data() || {}) };
    try {
      await processDispatch(dispatch);
    } catch (err) {
      console.error(`Dispatch ${dispatch.id} failed:`, err?.message || err);
    }
  }
  return { docs, lastDoc: docs[docs.length - 1] };
}

async function processDispatch(dispatch) {
  if (!dispatch || !dispatch.id) return;
  const dispatchId = dispatch.id;

  // Read messages and status_reports
  const messagesRef = db.collection("dispatches").doc(dispatchId).collection("messages");
  const statusRef = db.collection("dispatches").doc(dispatchId).collection("status_reports");

  const [messagesSnap, statusSnap] = await Promise.all([
    messagesRef.orderBy("timestamp", "asc").limit(500).get(),
    statusRef.orderBy("timestamp", "asc").limit(500).get(),
  ]);

  const messages = messagesSnap.docs.map((d) => d.data());
  const statuses = statusSnap.docs.map((d) => d.data());
  const dispatchChatEntries = Array.isArray(dispatch.dispatchChat) ? dispatch.dispatchChat : [];
  const allEntries = [...messages, ...statuses, ...dispatchChatEntries];

  const delayEntries = allEntries.filter(isDelayReport);
  const stopOverEntries = allEntries.filter(isStopOverReport);
  const resumeEntries = allEntries.filter(isResumeReport);

  const latestDelayAtMs = delayEntries.length === 0 ? 0 : Math.max(...delayEntries.map((e) => toMillis(e.timestamp ?? e.createdAt ?? e.updatedAt ?? null)));
  const latestStopOverAtMs = stopOverEntries.length === 0 ? 0 : Math.max(...stopOverEntries.map((e) => toMillis(e.timestamp ?? e.createdAt ?? e.updatedAt ?? null)));
  const latestResumeAtMs = resumeEntries.length === 0 ? 0 : Math.max(...resumeEntries.map((e) => toMillis(e.timestamp ?? e.createdAt ?? e.updatedAt ?? null)));

  const explicitIdleMinutes = delayEntries
    .map(getExplicitDurationMinutes)
    .filter((value) => Number.isFinite(value) && value > 0)
    .pop();

  const normalizedStatus = String(dispatch.status || "").toLowerCase();
  const dispatchStatusUpdatedAtMs = toMillis(dispatch.UpdatedAt || dispatch.updatedAt || dispatch.createdAt || null);
  const isTerminal = ["completed", "successful dispatch", "cancelled", "delivered"].includes(normalizedStatus);
  const statusIsStopOver = normalizedStatus.includes("stop over") || normalizedStatus.includes("stopover");
  const isStopOverActive = statusIsStopOver && !isTerminal;

  const stopOverStartedAtMs = latestStopOverAtMs > 0 ? latestStopOverAtMs : (isStopOverActive ? dispatchStatusUpdatedAtMs : 0);
  const latestMovementAfterStopMs = latestStopOverAtMs === 0 ? 0 : Math.max(0, ...allEntries.map((e) => toMillis(e.timestamp ?? e.createdAt ?? e.updatedAt ?? null)).filter((t) => t > latestStopOverAtMs));
  const stopOverEndedAtMs = isStopOverActive
    ? Date.now()
    : Math.max(dispatchStatusUpdatedAtMs, latestResumeAtMs, latestMovementAfterStopMs || 0);
  const timestampBasedStopOverMinutes = stopOverStartedAtMs > 0 ? Math.max(0, (Math.max(stopOverEndedAtMs, stopOverStartedAtMs) - stopOverStartedAtMs) / 60000) : 0;
  const explicitStopOverMinutes = stopOverEntries
    .map(getExplicitDurationMinutes)
    .filter((value) => Number.isFinite(value) && value > 0)
    .pop();
  const stopOverTrackedMinutes = explicitStopOverMinutes ?? timestampBasedStopOverMinutes;

  const dispatchDeliveredAtMs = toMillis(dispatch.deliveredAt || dispatch.completedAt || dispatch.successfulDispatchAt || dispatch.updatedAt || dispatch.UpdatedAt || dispatch.createdAt || null);
  const timestampBasedIdleMinutes = latestDelayAtMs > 0 && dispatchDeliveredAtMs > 0 ? Math.max(0, (dispatchDeliveredAtMs - latestDelayAtMs) / 60000) : 0;
  const idleTrackedMinutes = explicitIdleMinutes ?? timestampBasedIdleMinutes;

  const totalDelayMinutes = stopOverTrackedMinutes + idleTrackedMinutes;

  const label = `${formatDurationMinutes(totalDelayMinutes)} (${formatDurationMinutes(stopOverTrackedMinutes)}+${formatDurationMinutes(idleTrackedMinutes)})`;

  const shouldWrite = process.env.RUN_MIGRATION === "1";
  console.log(`Dispatch ${dispatchId}: total=${totalDelayMinutes.toFixed(2)}m, stopOver=${stopOverTrackedMinutes.toFixed(2)}m, idle=${idleTrackedMinutes.toFixed(2)}m`);

  if (shouldWrite) {
    await db.collection("dispatches").doc(dispatchId).update({
      computedDelayMinutes: totalDelayMinutes,
      computedStopOverMinutes: stopOverTrackedMinutes,
      computedIdleMinutes: idleTrackedMinutes,
      computedDelayLabel: label,
      computedDelayComputedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(` -> updated dispatch ${dispatchId}`);
  } else {
    console.log(` -> dry-run (not writing). Set RUN_MIGRATION=1 to persist changes.`);
  }
}

async function main() {
  console.log("Starting dispatch delay computation migration");
  let lastDoc = null;
  let processed = 0;
  while (true) {
    const { docs, lastDoc: last } = await processBatch(lastDoc);
    if (!docs || docs.length === 0) break;
    processed += docs.length;
    lastDoc = last;
    if (docs.length < 200) break;
  }
  console.log(`Migration complete. Processed ~${processed} dispatches.`);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
