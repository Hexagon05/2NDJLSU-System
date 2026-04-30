Compute dispatch delays migration

This folder contains a migration script to compute and persist delay minutes for past dispatches.

Files
- compute_dispatch_delays.js — script that reads `dispatches` and their `messages` and `status_reports` subcollections, computes stop-over and idle durations, and updates each dispatch document with computed fields.

Running
1. Provide credentials:
   - Set `GOOGLE_APPLICATION_CREDENTIALS` to your service account JSON file path; OR
   - Place a service account JSON at `scripts/serviceAccountKey.json`.

2. Dry-run (no writes):

```bash
node scripts/compute_dispatch_delays.js
```

3. Persist changes (writes):

```bash
RUN_MIGRATION=1 node scripts/compute_dispatch_delays.js
```

Notes
- The script writes these fields to each dispatch document when RUN_MIGRATION=1:
  - `computedDelayMinutes` (number)
  - `computedStopOverMinutes` (number)
  - `computedIdleMinutes` (number)
  - `computedDelayLabel` (string)
  - `computedDelayComputedAt` (server timestamp)

- Review the script before running in production. It processes dispatches in pages and updates documents in place.
