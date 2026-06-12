/**
 * checkinApi.js — Slice C1 sync trigger and status polling.
 *
 * Base URL is read from the Vite env var VITE_CHECKIN_API_URL so it can
 * be swapped per environment without touching source code.
 * Falls back to the Laravel Herd local domain used in development.
 *
 * Endpoints:
 *   POST {base}/internal/checkin/prepare/{event_id}
 *        body: { policy: VerificationPolicy }
 *        response: 202 Accepted
 *
 *   GET  {base}/internal/checkin/prepare/{event_id}/status
 *        response: { status, processed, total, failed }
 */

const CHECKIN_BASE =
  import.meta.env.VITE_CHECKIN_API_URL?.replace(/\/$/, '') ??
  'http://checkin.test';

/**
 * @param {string} token
 */
function authHeaders(token) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

/**
 * Trigger the prepare-sync job on the backend.
 * Returns 202 Accepted — the job runs asynchronously.
 *
 * @param {string|number} eventId
 * @param {string} policy  — 'mode_a_only' | 'mode_b_only' | 'both' | 'qr_only'
 * @param {string} token   — Bearer token
 * @returns {Promise<void>}
 * @throws {Error} on non-202 response
 */
export async function triggerPrepareSync(eventId, policy, token) {
  const res = await fetch(
    `${CHECKIN_BASE}/internal/checkin/prepare/${eventId}`,
    {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ policy }),
    }
  );

  // 202 = accepted, 200 = also acceptable (idempotent re-trigger)
  if (res.status !== 202 && res.status !== 200) {
    const body = await res.text().catch(() => '');
    throw new Error(body || `Sync trigger failed (${res.status})`);
  }
}

/**
 * Poll the sync job status for a single event.
 *
 * Expected response shape (server may vary):
 * {
 *   status:    'pending' | 'processing' | 'completed' | 'failed',
 *   processed: number,   // attendees synced so far
 *   total:     number,   // total attendees for the event
 *   failed:    number,   // records that could not be synced
 *   message?:  string,   // optional human-readable detail
 * }
 *
 * @param {string|number} eventId
 * @param {string} token
 * @returns {Promise<SyncStatus>}
 * @throws {Error} on non-2xx response
 */
export async function fetchSyncStatus(eventId, token) {
  const res = await fetch(
    `${CHECKIN_BASE}/internal/checkin/prepare/${eventId}/status`,
    { headers: authHeaders(token) }
  );

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(body || `Status check failed (${res.status})`);
  }

  const data = await res.json();

  // Normalise to a consistent shape regardless of backend envelope.
  const payload = data?.data ?? data;

  return {
    status:    payload.status    ?? 'pending',
    processed: payload.processed ?? payload.synced ?? 0,
    total:     payload.total     ?? 0,
    failed:    payload.failed    ?? 0,
    message:   payload.message   ?? null,
  };
}
