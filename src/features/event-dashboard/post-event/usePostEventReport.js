/**
 * usePostEventReport.js — data hook for the Post-Event Analytics Report.
 *
 * Fetches attendees + all scan events once on mount, then derives every
 * displayed metric purely in JS — no re-fetch on interaction.
 *
 * Derived outputs
 * ───────────────
 *  kpi            { total, arrived, absent, arrivalPct }
 *  methodBreakdown [{ method, count, pct }]   — QR / Mode A / Mode B / other
 *  gateAnalytics  [{ gate, total, peakTime, avgDwellMin }]
 *  histogram      [{ label, count }]          — 5-min buckets event_start → last scan
 *  absentees      AttendeeRow[]               — full list, client-filtered by search
 *
 * checkin_events.result schema
 * ────────────────────────────
 *   Allowed values observed in production:
 *     'allowed'                          — QR scan admitted
 *     'allowed_manual_name_ticket_id'    — manual Mode A/B admitted
 *   Any value starting with 'allow' is treated as a successful check-in.
 *   Values like 'denied', 'duplicate', etc. are excluded from analytics.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { fetchReportAttendees, fetchAllScans } from '../../../api/reportApi.js';

const BUCKET_MINUTES = 5;

// ── pure helpers ──────────────────────────────────────────────────────────────

/**
 * Return true for any result value that represents a successful check-in.
 * The schema uses 'allowed' and 'allowed_*' variants — NOT 'success'.
 *
 * @param {string|null|undefined} result
 */
function isAllowed(result) {
  if (!result) return false;
  const r = result.toLowerCase();
  // Treat any 'allowed*' prefix as admitted; also accept 'success' as a
  // forward-compatibility fallback in case the schema is extended later.
  return r.startsWith('allow') || r === 'success';
}

/** Floor an ISO timestamp to the nearest N-minute bucket boundary. */
function bucketFloor(isoString, bucketMs) {
  const t = new Date(isoString).getTime();
  return new Date(Math.floor(t / bucketMs) * bucketMs);
}

/** Format a Date to HH:MM for histogram labels. */
function fmtHHMM(date) {
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/**
 * Build a 5-min histogram from a sorted list of scan timestamps.
 * Spans from the first scan to the last scan, inclusive.
 *
 * @param {string[]} timestamps — ISO strings, sorted ascending
 * @returns {{ label: string, count: number }[]}
 */
function buildHistogram(timestamps) {
  if (!timestamps.length) return [];

  const bucketMs = BUCKET_MINUTES * 60 * 1000;
  const first    = bucketFloor(timestamps[0],                     bucketMs);
  const last     = bucketFloor(timestamps[timestamps.length - 1], bucketMs);

  const map = new Map();
  for (let t = first.getTime(); t <= last.getTime(); t += bucketMs) {
    map.set(t, 0);
  }
  for (const ts of timestamps) {
    const key = bucketFloor(ts, bucketMs).getTime();
    map.set(key, (map.get(key) ?? 0) + 1);
  }

  return Array.from(map.entries()).map(([t, count]) => ({
    label: fmtHHMM(new Date(t)),
    count,
  }));
}

/**
 * Normalise a raw checkin_method value to a display label.
 * checkin_method lives on event_attendees — PRD values: 'qr_scan', 'mode_a', 'mode_b'.
 */
function methodLabel(raw) {
  const m = (raw ?? '').toLowerCase();
  if (m === 'qr_scan' || m === 'qr') return 'QR Scan';
  if (m.includes('mode_a') || m === 'a') return 'Manual — Mode A';
  if (m.includes('mode_b') || m === 'b') return 'Manual — Mode B';
  return 'Other';
}

// ── hook ──────────────────────────────────────────────────────────────────────

export function usePostEventReport(eventId) {
  const [attendees, setAttendees] = useState([]);
  const [allScans,  setAllScans]  = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [search,    setSearch]    = useState('');

  // ── initial fetch ─────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const [att, scans] = await Promise.all([
        fetchReportAttendees(eventId),
        fetchAllScans(eventId),
      ]);
      setAttendees(att);
      setAllScans(scans);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [eventId]);

  useEffect(() => { load(); }, [load]);

  // ── KPI — derived from event_attendees (unchanged, working correctly) ────
  const kpi = useMemo(() => {
    const total      = attendees.length;
    const arrived    = attendees.filter((a) => a.checked_in_at !== null).length;
    const absent     = total - arrived;
    const arrivalPct = total > 0 ? Math.round((arrived / total) * 100) : 0;
    return { total, arrived, absent, arrivalPct };
  }, [attendees]);

  // ── Method breakdown — derived from event_attendees (unchanged, working) ─
  const methodBreakdown = useMemo(() => {
    const checkedIn = attendees.filter((a) => a.checked_in_at !== null);
    const total     = checkedIn.length || 1;
    const counts    = {};
    for (const a of checkedIn) {
      const label = methodLabel(a.checkin_method);
      counts[label] = (counts[label] ?? 0) + 1;
    }
    return Object.entries(counts)
      .map(([method, count]) => ({
        method,
        count,
        pct: Math.round((count / total) * 100),
      }))
      .sort((a, b) => b.count - a.count);
  }, [attendees]);

  // ── Gate analytics — uses scan.gate and scan.scanned_at ──────────────────
  //
  // FIX: was filtering on s.result === 'success'.
  //      Actual result values are 'allowed' / 'allowed_manual_name_ticket_id'.
  //      Now uses isAllowed() which accepts any 'allow*' prefix.
  const gateAnalytics = useMemo(() => {
    // Keep only admitted scans that have a timestamp
    const admittedScans = allScans.filter(
      (s) => isAllowed(s.result) && s.scanned_at,
    );

    // Group timestamps by gate
    const gateMap = {};
    for (const s of admittedScans) {
      const gate = s.gate || 'Unknown Gate';          // ← scan.gate (correct column)
      if (!gateMap[gate]) gateMap[gate] = [];
      gateMap[gate].push(new Date(s.scanned_at).getTime()); // ← scan.scanned_at
    }

    return Object.entries(gateMap)
      .map(([gate, times]) => {
        const sorted = [...times].sort((a, b) => a - b);

        // Peak 5-min window
        const bucketMs = BUCKET_MINUTES * 60 * 1000;
        const buckets  = {};
        for (const t of sorted) {
          const key = Math.floor(t / bucketMs) * bucketMs;
          buckets[key] = (buckets[key] ?? 0) + 1;
        }
        const peakKey  = Object.entries(buckets).sort((a, b) => b[1] - a[1])[0]?.[0];
        const peakTime = peakKey ? fmtHHMM(new Date(Number(peakKey))) : '—';

        // Average gap between consecutive scans at this gate
        let avgDwellMin = '—';
        if (sorted.length >= 2) {
          const gaps = [];
          for (let i = 1; i < sorted.length; i++) {
            gaps.push((sorted[i] - sorted[i - 1]) / 1000);
          }
          const avgSec = gaps.reduce((acc, g) => acc + g, 0) / gaps.length;
          avgDwellMin = avgSec < 60
            ? `${Math.round(avgSec)}s`
            : `${(avgSec / 60).toFixed(1)}m`;
        }

        return { gate, total: sorted.length, peakTime, avgDwellMin };
      })
      .sort((a, b) => b.total - a.total);
  }, [allScans]);

  // ── Histogram — uses scan.scanned_at ─────────────────────────────────────
  //
  // FIX: was filtering on s.result === 'success'.
  //      Same fix: use isAllowed() to match 'allowed' / 'allowed_*' values.
  const histogram = useMemo(() => {
    const timestamps = allScans
      .filter((s) => isAllowed(s.result) && s.scanned_at) // ← fixed predicate
      .map((s) => s.scanned_at);                          // ← scan.scanned_at
    return buildHistogram(timestamps);
  }, [allScans]);

  // ── Absentees — derived from event_attendees (unchanged, working) ────────
  const absentees = useMemo(() => {
    const absent = attendees.filter((a) => a.checked_in_at === null);
    if (!search.trim()) return absent;
    const q = search.trim().toLowerCase();
    return absent.filter(
      (a) =>
        a.attendee_name?.toLowerCase().includes(q) ||
        a.ticket_type?.toLowerCase().includes(q)   ||
        a.ticket_id?.toLowerCase().includes(q),
    );
  }, [attendees, search]);

  return {
    kpi,
    methodBreakdown,
    gateAnalytics,
    histogram,
    absentees,
    isLoading,
    loadError,
    search,
    setSearch,
    reload: load,
  };
}
