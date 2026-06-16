/**
 * useLiveDashboard.js — real-time state engine for Slice B3.
 *
 * Architecture: single source of truth
 * ─────────────────────────────────────
 * The hook keeps ONE authoritative array:
 *
 *   attendees  — full event_attendees rows for this event
 *     { id, ticket_id, attendee_name, ticket_type,
 *       checked_in_at, checked_in_gate }
 *
 * All derived metrics (total, arrived, absent, gateBreakdown, arrivalRate)
 * are computed PURELY from that array via a stable `deriveStats()` helper.
 * Nothing is accumulated manually — there is no risk of counter drift.
 *
 * Real-time flow (checkin_events INSERT via WebSocket)
 * ─────────────────────────────────────────────────────
 * 1. Extract ticket_id and gate from the incoming checkin_events row.
 * 2. Find the matching attendee in local state by ticket_id.
 *    a. FOUND locally → surgically update checked_in_at = NOW() and
 *       checked_in_gate = gate.  Stats and gate breakdown recompute
 *       automatically from the updated array.
 *    b. NOT found locally (late sync / test token) → fire a background
 *       REST fetch to grab the attendee row, then append it as checked-in
 *       so the name never shows as "—".
 * 3. Prepend the enriched scan record to recentScans (capped at 50).
 *
 * Polling fallback
 * ─────────────────
 * If the WebSocket drops, fall back to a full REST refresh every 30 s.
 * When the WS recovers, cancel the poll and do one reconciling refresh.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createRealtimeClient } from '../../lib/supabaseRealtime.js';
import { supabaseFetch }        from '../../lib/supabaseClient.js';
import {
  fetchAllAttendees,
  fetchRecentScans,
  fetchArrivalRate,
} from '../../api/liveDashboardApi.js';

// ── constants ──────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS   = 30_000;
const RECENT_SCANS_LIMIT = 50;
const ARRIVAL_WINDOW_MIN = 5;

const ATTENDEES_TABLE = '/rest/v1/event_attendees';

// ── pure derivation ────────────────────────────────────────────────────────

/**
 * Compute all dashboard metrics from the raw attendees array.
 * Pure function — no side-effects, no state reads.
 *
 * @param {AttendeeRow[]} attendees
 * @returns {{ total, arrived, absent, gateBreakdown }}
 */
function deriveStats(attendees) {
  const total   = attendees.length;
  const arrived = attendees.filter((a) => a.checked_in_at !== null).length;
  const absent  = total - arrived;

  // Gate breakdown — group by checked_in_gate for checked-in rows only
  const gateMap = {};
  for (const a of attendees) {
    if (!a.checked_in_at) continue;
    const gate = a.checked_in_gate || 'Unknown Gate';
    gateMap[gate] = (gateMap[gate] ?? 0) + 1;
  }

  const gateBreakdown = Object.entries(gateMap)
    .map(([gate, count]) => ({ gate, count }))
    .sort((a, b) => b.count - a.count);

  return { total, arrived, absent, gateBreakdown };
}

// ── hook ───────────────────────────────────────────────────────────────────

/**
 * @param {string} eventId
 */
export function useLiveDashboard(eventId) {

  // ── source-of-truth array ────────────────────────────────────────────────
  const [attendees,   setAttendees]   = useState([]);
  const [recentScans, setRecentScans] = useState([]);
  const [arrivalRate, setArrivalRate] = useState(0);
  const [isLoading,   setIsLoading]   = useState(true);
  const [loadError,   setLoadError]   = useState(null);
  const [mode,        setMode]        = useState('loading');

  // ── derived stats — recomputed only when attendees changes ───────────────
  const stats = useMemo(
    () => ({ ...deriveStats(attendees), arrivalRate }),
    [attendees, arrivalRate],
  );

  // ── refs ─────────────────────────────────────────────────────────────────
  const isMountedRef  = useRef(true);
  const pollTimerRef  = useRef(null);
  const attendeesRef  = useRef(attendees); // always-current snapshot for WS callbacks

  // Keep ref in sync with state without re-creating WS callbacks
  useEffect(() => { attendeesRef.current = attendees; }, [attendees]);

  // ── safe setState guard ───────────────────────────────────────────────────
  const safeSet = useCallback((setter, value) => {
    if (isMountedRef.current) setter(value);
  }, []);

  // ── polling helpers ───────────────────────────────────────────────────────
  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  // ── full REST refresh ─────────────────────────────────────────────────────
  const refreshAll = useCallback(async () => {
    try {
      const [allAttendees, scans, rate] = await Promise.all([
        fetchAllAttendees(eventId),
        fetchRecentScans(eventId, RECENT_SCANS_LIMIT),
        fetchArrivalRate(eventId, ARRIVAL_WINDOW_MIN),
      ]);

      safeSet(setAttendees,   allAttendees ?? []);
      safeSet(setRecentScans, scans        ?? []);
      safeSet(setArrivalRate, rate);
      safeSet(setLoadError,   null);
    } catch (err) {
      safeSet(setLoadError, err.message);
    }
  }, [eventId, safeSet]);

  // ── polling fallback ──────────────────────────────────────────────────────
  const startPolling = useCallback(() => {
    if (pollTimerRef.current) return;
    safeSet(setMode, 'polling');
    pollTimerRef.current = setInterval(() => {
      refreshAll();
    }, POLL_INTERVAL_MS);
  }, [refreshAll, safeSet]);

  // ── WebSocket: checkin_events INSERT handler ──────────────────────────────
  /**
   * This is the core real-time handler.
   *
   * checkin_events columns available in WS payload:
   *   id, event_id, ticket_id, gate, staff_user, result, scanned_at, client_scan_id
   *
   * Steps:
   *   1. Use ticket_id to look up the attendee in local state.
   *   2a. Found → mark as checked in (checked_in_at, checked_in_gate).
   *   2b. Not found → background-fetch the attendee row, then append.
   *   3. Prepend an enriched scan row with attendee_name & ticket_type.
   */
  const handleCheckinEvent = useCallback((data) => {
    const row = data.record ?? data.new ?? data;
    if (!row?.id) return;

    const ticketId = row.ticket_id;
    const gate     = row.gate || 'Unknown Gate';
    const now      = row.scanned_at ?? new Date().toISOString();

    // ── Step 1: find attendee in local snapshot ──────────────────────────
    const localAttendee = attendeesRef.current.find(
      (a) => a.ticket_id === ticketId,
    );

    if (localAttendee) {
      // ── Step 2a: surgical update ───────────────────────────────────────
      // Only update if they haven't already been marked as checked in
      // (idempotent — duplicate WS events are safe).
      if (!localAttendee.checked_in_at) {
        safeSet(setAttendees, (prev) =>
          prev.map((a) =>
            a.ticket_id === ticketId
              ? { ...a, checked_in_at: now, checked_in_gate: gate }
              : a,
          ),
        );
      }

      // Prepend enriched scan — name available immediately from local state
      const enrichedScan = {
        ...row,
        attendee_name: localAttendee.attendee_name ?? null,
        ticket_type:   localAttendee.ticket_type   ?? null,
      };

      safeSet(setRecentScans, (prev) => {
        if (prev.some((s) => s.id === row.id)) return prev;
        return [enrichedScan, ...prev].slice(0, RECENT_SCANS_LIMIT);
      });

    } else {
      // ── Step 2b: not found locally — background fetch ──────────────────
      // Show the scan row immediately (with null name) then backfill.
      safeSet(setRecentScans, (prev) => {
        if (prev.some((s) => s.id === row.id)) return prev;
        return [
          { ...row, attendee_name: null, ticket_type: null },
          ...prev,
        ].slice(0, RECENT_SCANS_LIMIT);
      });

      // Fire background fetch — no await, this is best-effort enrichment
      supabaseFetch(
        `${ATTENDEES_TABLE}?ticket_id=eq.${encodeURIComponent(ticketId)}` +
        `&select=ticket_id,attendee_name,ticket_type,checked_in_at,checked_in_gate&limit=1`,
      )
        .then((rows) => {
          if (!isMountedRef.current) return;
          const fetched = Array.isArray(rows) ? rows[0] : rows;
          if (!fetched) return;

          // Append to attendees array so future WS events hit the fast path
          setAttendees((prev) => {
            const already = prev.some((a) => a.ticket_id === ticketId);
            if (already) return prev;
            return [
              ...prev,
              {
                ...fetched,
                checked_in_at:    now,
                checked_in_gate:  gate,
              },
            ];
          });

          // Backfill the scan row with the resolved name
          setRecentScans((prev) =>
            prev.map((s) =>
              s.id === row.id
                ? {
                    ...s,
                    attendee_name: fetched.attendee_name ?? null,
                    ticket_type:   fetched.ticket_type   ?? null,
                  }
                : s,
            ),
          );
        })
        .catch(() => { /* silent — partial data is acceptable */ });
    }
  }, [safeSet]);

  // ── WebSocket: event_attendees UPDATE handler ─────────────────────────────
  /**
   * Supabase may also push a direct UPDATE to event_attendees when the
   * scanner writes back checked_in_at.  Keep local array in sync.
   */
  const handleAttendeeUpdate = useCallback((data) => {
    const row = data.record ?? data.new ?? data;
    if (!row?.ticket_id) return;

    safeSet(setAttendees, (prev) =>
      prev.map((a) =>
        a.ticket_id === row.ticket_id ? { ...a, ...row } : a,
      ),
    );
  }, [safeSet]);

  // ── Realtime subscription setup ───────────────────────────────────────────
  useEffect(() => {
    if (!eventId) return;
    isMountedRef.current = true;

    const rt = createRealtimeClient();

    const deregisterStatus = rt.onStatusChange((status) => {
      if (!isMountedRef.current) return;
      if (status === 'connected') {
        stopPolling();
        safeSet(setMode, 'live');
        refreshAll(); // reconcile any missed events
      } else if (status === 'error' || status === 'disconnected') {
        safeSet(setMode, 'polling');
        startPolling();
      }
    });

    // Subscribe to checkin_events INSERTs (primary real-time source)
    const unsubCheckin = rt.subscribe(
      'public',
      'checkin_events',
      `event_id=eq.${eventId}`,
      handleCheckinEvent,
    );

    // Subscribe to event_attendees UPDATEs (secondary — keeps local state honest)
    const unsubAttendees = rt.subscribe(
      'public',
      'event_attendees',
      `event_id=eq.${eventId}`,
      handleAttendeeUpdate,
    );

    // Initial load
    setIsLoading(true);
    refreshAll().finally(() => {
      if (isMountedRef.current) setIsLoading(false);
    });

    return () => {
      isMountedRef.current = false;
      stopPolling();
      unsubCheckin();
      unsubAttendees();
      deregisterStatus();
      rt.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  // ── 5-min arrival rate — refreshed every 60 s ────────────────────────────
  useEffect(() => {
    if (!eventId) return;
    const timer = setInterval(async () => {
      try {
        const rate = await fetchArrivalRate(eventId, ARRIVAL_WINDOW_MIN);
        if (isMountedRef.current) safeSet(setArrivalRate, rate);
      } catch { /* non-critical */ }
    }, 60_000);
    return () => clearInterval(timer);
  }, [eventId, safeSet]);

  return {
    stats,        // { total, arrived, absent, arrivalRate, gateBreakdown }
    recentScans,
    isLoading,
    loadError,
    mode,         // 'live' | 'polling' | 'loading' | 'error'
    refresh: refreshAll,
  };
}
