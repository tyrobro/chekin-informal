/**
 * liveDashboardApi.js — Supabase REST queries for Slice B3 Live Dashboard.
 *
 * Correct PRD schema
 * ───────────────────
 *   event_attendees
 *     id, event_id, ticket_id, attendee_name, ticket_type,
 *     checked_in_at, checked_in_gate
 *     ↑ gate column is "checked_in_gate" — NOT "gate"
 *
 *   checkin_events  (append-only scan log — NO attendee_name / ticket_type)
 *     id, event_id, ticket_id, gate, staff_user,
 *     result, scanned_at, client_scan_id
 *
 * Design note
 * ────────────
 * useLiveDashboard keeps event_attendees as a local array and derives ALL
 * stats (total, arrived, absent, gateBreakdown) reactively from that array.
 * This file therefore exposes fetchAllAttendees (full row fetch) rather than
 * fetchAggregateStats, which is no longer used.
 *
 * No FK join syntax is used because no FK constraint exists in the current
 * dev schema.
 */

import { supabaseFetch } from '../lib/supabaseClient.js';

const ATTENDEES_TABLE      = '/rest/v1/event_attendees';
const CHECKIN_EVENTS_TABLE = '/rest/v1/checkin_events';

const RECENT_SCANS_LIMIT = 50;

// ── helpers ───────────────────────────────────────────────────────────────────

/**
 * Split an array into chunks of at most `size` elements.
 * Keeps PostgREST `in.(...)` filter URLs within safe length limits.
 *
 * @param {any[]} arr
 * @param {number} size
 * @returns {any[][]}
 */
function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

// ── exports ───────────────────────────────────────────────────────────────────

/**
 * Fetch ALL attendee rows for one event.
 *
 * This is the source-of-truth fetch.  useLiveDashboard stores the returned
 * array and derives every metric (total, arrived, absent, gateBreakdown)
 * directly from it.
 *
 * Columns selected:
 *   ticket_id       — used as the join key with checkin_events
 *   attendee_name   — shown in the RecentScans feed
 *   ticket_type     — shown in the RecentScans feed
 *   checked_in_at   — null = not yet arrived; non-null = checked in
 *   checked_in_gate — correct PRD column name (NOT "gate")
 *
 * @param {string} eventId
 * @returns {Promise<AttendeeRow[]>}
 */
export async function fetchAllAttendees(eventId) {
  const rows = await supabaseFetch(
    `${ATTENDEES_TABLE}` +
    `?event_id=eq.${encodeURIComponent(eventId)}` +
    `&select=ticket_id,attendee_name,ticket_type,checked_in_at,checked_in_gate`,
  );
  return rows ?? [];
}

/**
 * Fetch the most recent N scan events for one event, enriched with
 * attendee_name and ticket_type from event_attendees.
 *
 * Two-step approach (no FK join available in dev schema):
 *   1. Fetch latest `limit` rows from checkin_events.
 *   2. Extract unique ticket_ids.
 *   3. Fetch matching rows from event_attendees in chunks.
 *   4. Merge the two result sets by ticket_id.
 *
 * @param {string} eventId
 * @param {number} [limit=50]
 * @returns {Promise<EnrichedScanRecord[]>}
 */
export async function fetchRecentScans(eventId, limit = RECENT_SCANS_LIMIT) {
  // ── Step 1: raw scan rows ─────────────────────────────────────────────────
  const scans = await supabaseFetch(
    `${CHECKIN_EVENTS_TABLE}` +
    `?event_id=eq.${encodeURIComponent(eventId)}` +
    `&order=scanned_at.desc&limit=${limit}` +
    `&select=id,ticket_id,gate,staff_user,result,scanned_at,client_scan_id`,
  );

  if (!scans || scans.length === 0) return [];

  // ── Step 2: unique ticket_ids ─────────────────────────────────────────────
  const uniqueTicketIds = [
    ...new Set(scans.map((s) => s.ticket_id).filter(Boolean)),
  ];

  if (uniqueTicketIds.length === 0) {
    return scans.map((s) => ({ ...s, attendee_name: null, ticket_type: null }));
  }

  // ── Step 3: attendee metadata — chunked parallel fetch ───────────────────
  const CHUNK_SIZE   = 100;
  const attendeeRows = (
    await Promise.all(
      chunk(uniqueTicketIds, CHUNK_SIZE).map((ids) =>
        supabaseFetch(
          `${ATTENDEES_TABLE}` +
          `?ticket_id=in.(${ids.map(encodeURIComponent).join(',')})` +
          `&select=ticket_id,attendee_name,ticket_type`,
        ),
      ),
    )
  ).flat();

  // ── Step 4: merge ─────────────────────────────────────────────────────────
  const attendeeByTicket = new Map(
    attendeeRows.map((a) => [
      a.ticket_id,
      {
        attendee_name: a.attendee_name ?? null,
        ticket_type:   a.ticket_type   ?? null,
      },
    ]),
  );

  return scans.map((scan) => ({
    ...scan,
    ...(attendeeByTicket.get(scan.ticket_id) ?? {
      attendee_name: null,
      ticket_type:   null,
    }),
  }));
}

/**
 * Fetch the count of scan events in the last N minutes.
 * Used for the "Arrival Rate" KPI tile.
 *
 * @param {string} eventId
 * @param {number} [minutes=5]
 * @returns {Promise<number>}
 */
export async function fetchArrivalRate(eventId, minutes = 5) {
  const since = new Date(Date.now() - minutes * 60 * 1000).toISOString();
  const rows  = await supabaseFetch(
    `${CHECKIN_EVENTS_TABLE}` +
    `?event_id=eq.${encodeURIComponent(eventId)}` +
    `&scanned_at=gte.${encodeURIComponent(since)}` +
    `&select=id`,
  );
  return rows.length;
}
