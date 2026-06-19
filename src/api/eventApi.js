/**
 * eventApi.js — live data fetches for events and attendees.
 *
 * Endpoints (per Postman collection):
 *   GET https://event.explarax.com/api/event                       — event list
 *   GET https://payments.explarax.com/api/event/{id}/attendees     — attendee list
 *
 * Supabase queries (for persistent check-in state):
 *   GET /rest/v1/event_attendees   — presence = event is prepared
 *   GET /rest/v1/event_preparations — sync_status, completed_at
 *
 * All ExplaraX API requests require a Bearer token in the Authorization header.
 * Supabase requests use the project's anon key via supabaseFetch.
 */

import { supabaseFetch } from '../lib/supabaseClient.js';

const EVENT_BASE    = 'https://event.explarax.com/api';
const PAYMENTS_BASE = 'https://payments.explarax.com/api';

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

/**
 * Fetch the authenticated user's event list from ExplaraX.
 *
 * @param {string} token
 * @returns {Promise<Array>} raw event array
 */
export async function fetchEvents(token) {
  const res = await fetch(`${EVENT_BASE}/event`, {
    headers: authHeaders(token),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(body || `Failed to load events (${res.status})`);
  }

  const data = await res.json();
  return Array.isArray(data) ? data : (data?.data ?? data?.events ?? []);
}

/**
 * Fetch the attendee list for a single event and return the total count.
 *
 * @param {string|number} eventId
 * @param {string} token
 * @returns {Promise<number>}
 */
export async function fetchAttendeeCount(eventId, token) {
  const res = await fetch(`${PAYMENTS_BASE}/event/${eventId}/attendees`, {
    headers: authHeaders(token),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(body || `Failed to load attendees for event ${eventId} (${res.status})`);
  }

  const data = await res.json();
  const list = Array.isArray(data) ? data : (data?.data ?? data?.attendees ?? []);
  return list.length;
}

/**
 * Fetch the persistent check-in state for a list of event IDs from Supabase.
 *
 * Strategy
 * ────────
 * Two concurrent queries, both filtered to the supplied event IDs:
 *
 *   1. event_attendees — one lightweight HEAD/count query per event to
 *      determine whether the event has been prepared (attendees synced).
 *      We select only event_id and limit 1 — we only need presence, not data.
 *
 *   2. event_preparations — the preparation record written by C1 when sync
 *      completes. Contains sync_status and completed_at.
 *
 * Status derivation per event
 * ───────────────────────────
 *   sync_status = 'complete'  → status = 'completed',  sync_status = 'complete'
 *   attendees exist in Supabase
 *     + end_time in the past  → status = 'live'         (event running or just ended)
 *     + end_time in future    → status = 'prepared'
 *   no attendees in Supabase  → status = 'not_prepared'
 *
 * @param {string[]} eventIds
 * @param {Array<{ id: string, end_time?: string }>} rawEvents  — original API events
 * @returns {Promise<Map<string, { status: string, sync_status: string|null }>>}
 */
export async function fetchEventCheckinState(eventIds, rawEvents) {
  if (!eventIds.length) return new Map();

  const idList = eventIds.map(encodeURIComponent).join(',');

  // Run both queries in parallel — either can fail silently; we degrade
  // gracefully to 'not_prepared' rather than crashing the whole dashboard.
  const [prepRows, attendeePresence] = await Promise.all([
    // 1. event_preparations — sync_status + completed_at
    supabaseFetch(
      `/rest/v1/event_preparations` +
      `?event_id=in.(${idList})` +
      `&select=event_id,sync_status,completed_at`,
    ).catch(() => []),

    // 2. event_attendees — one row per event_id to confirm presence.
    //    We group by event_id by fetching distinct event_ids that exist.
    supabaseFetch(
      `/rest/v1/event_attendees` +
      `?event_id=in.(${idList})` +
      `&select=event_id` +
      `&limit=1000`,   // enough to cover all event_ids in a single request
    ).catch(() => []),
  ]);

  // Build lookup: event_id → preparation row
  /** @type {Map<string, { sync_status: string, completed_at: string|null }>} */
  const prepByEvent = new Map(
    (prepRows ?? []).map((r) => [String(r.event_id), r]),
  );

  // Build set: event_ids that have at least one attendee row in Supabase
  const preparedEventIds = new Set(
    (attendeePresence ?? []).map((r) => String(r.event_id)),
  );

  // Build lookup: event_id → end_time from the original API payload
  const endTimeByEvent = new Map(
    (rawEvents ?? []).map((e) => [
      String(e.id ?? e.event_id),
      e.end_time ?? e.ends_at ?? e.event_end ?? null,
    ]),
  );

  const now = Date.now();

  const result = new Map();
  for (const id of eventIds) {
    const sid  = String(id);
    const prep = prepByEvent.get(sid);

    // Sync complete → terminal state regardless of time
    if (prep?.sync_status === 'complete') {
      result.set(sid, { status: 'completed', sync_status: 'complete' });
      continue;
    }

    // Sync failed but attendees exist — host needs to retry
    if (prep?.sync_status === 'failed' && preparedEventIds.has(sid)) {
      result.set(sid, { status: 'live', sync_status: 'failed' });
      continue;
    }

    if (preparedEventIds.has(sid)) {
      // Attendees exist — determine live vs prepared by time bounds
      const endTime = endTimeByEvent.get(sid);
      const isLive  = endTime ? new Date(endTime).getTime() < now : false;
      result.set(sid, {
        status:      isLive ? 'live' : 'prepared',
        sync_status: prep?.sync_status ?? null,
      });
      continue;
    }

    // No attendees in Supabase — not prepared yet
    result.set(sid, { status: 'not_prepared', sync_status: null });
  }

  return result;
}
