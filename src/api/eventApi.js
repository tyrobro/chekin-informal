/**
 * eventApi.js — live data fetches for events and attendees.
 *
 * Endpoints (per Postman collection):
 *   GET https://event.explarax.com/api/event           — event list
 *   GET https://payments.explarax.com/api/event/{id}/attendees — attendee list
 *
 * All requests require a Bearer token in the Authorization header.
 */

const EVENT_BASE    = 'https://event.explarax.com/api';
const PAYMENTS_BASE = 'https://payments.explarax.com/api';

/**
 * Build the Authorization header object.
 * @param {string} token
 */
function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

/**
 * Fetch the authenticated user's event list.
 *
 * @param {string} token — Bearer token from auth flow
 * @returns {Promise<Array>} raw event array from the API
 * @throws {Error} on non-2xx response
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

  // Handle both { data: [...] } envelope and bare array responses.
  return Array.isArray(data) ? data : (data?.data ?? data?.events ?? []);
}

/**
 * Fetch the attendee list for a single event and return the total count.
 *
 * @param {string|number} eventId
 * @param {string} token — Bearer token from auth flow
 * @returns {Promise<number>} total attendee count
 * @throws {Error} on non-2xx response
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

  // The response may be a bare array or wrapped under data/attendees.
  const list = Array.isArray(data) ? data : (data?.data ?? data?.attendees ?? []);
  return list.length;
}
