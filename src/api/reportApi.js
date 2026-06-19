/**
 * reportApi.js — Supabase REST queries for the Post-Event Analytics Report.
 *
 * Correct PRD schema
 * ───────────────────
 *   event_attendees
 *     ticket_id, attendee_name, ticket_type,
 *     checked_in_at, checked_in_gate, checkin_method   ← method lives HERE
 *
 *   checkin_events  (append-only scan log)
 *     ticket_id, gate, staff_user, result, scanned_at, client_scan_id
 *     ↑ NO checkin_method column on this table
 *
 * All aggregation (histograms, gate analytics, method breakdown) is done in
 * usePostEventReport.js so the REST layer stays thin.
 */

import { supabaseFetch } from '../lib/supabaseClient.js';

const ATTENDEES_TABLE      = '/rest/v1/event_attendees';
const CHECKIN_EVENTS_TABLE = '/rest/v1/checkin_events';

/**
 * Fetch every attendee row for the event.
 *
 * Includes checkin_method because method breakdown is derived from
 * event_attendees, NOT from checkin_events.
 *
 * @param {string} eventId
 * @returns {Promise<AttendeeRow[]>}
 */
export async function fetchReportAttendees(eventId) {
  const rows = await supabaseFetch(
    `${ATTENDEES_TABLE}` +
    `?event_id=eq.${encodeURIComponent(eventId)}` +
    `&select=ticket_id,attendee_name,ticket_type,checked_in_at,checked_in_gate,checkin_method` +
    `&order=attendee_name.asc`,
  );
  return rows ?? [];
}

/**
 * Fetch ALL checkin_events rows for the event (no limit).
 * Used for the arrival histogram and per-gate traffic analysis.
 *
 * NOTE: checkin_method is intentionally excluded — it does not exist on
 * this table. Method breakdown uses event_attendees.checkin_method instead.
 *
 * @param {string} eventId
 * @returns {Promise<ScanRow[]>}
 */
export async function fetchAllScans(eventId) {
  const rows = await supabaseFetch(
    `${CHECKIN_EVENTS_TABLE}` +
    `?event_id=eq.${encodeURIComponent(eventId)}` +
    `&select=ticket_id,gate,result,scanned_at` +
    `&order=scanned_at.asc`,
  );
  return rows ?? [];
}
