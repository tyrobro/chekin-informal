/**
 * staffApi.js — Supabase data access for the checkin_staff table.
 *
 * Table schema (relevant columns):
 *   id            uuid  PK
 *   event_id      text
 *   name          text
 *   email         text
 *   gate          text   — free-form gate assignment (NO gate_id FK)
 *   invite_token  text   — secure random string
 *   expires_at    timestamptz
 *   revoked       boolean
 *   token_used_at timestamptz | null
 *   created_at    timestamptz
 */

import { supabaseFetch } from '../lib/supabaseClient.js';
import { signStaffToken } from '../lib/hmacLink.js';

// Edge Function base URL — same origin as the REST API, different path prefix.
const SUPABASE_URL     = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '');
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Invoke a Supabase Edge Function by name.
 * Failures are non-fatal — the caller decides whether to surface them.
 *
 * @param {string} fnName     — function slug (e.g. 'send-staff-invite')
 * @param {object} payload    — JSON-serialisable body
 * @returns {Promise<object>} — parsed response body
 * @throws {Error}            — on network failure or non-2xx response
 */
async function invokeEdgeFunction(fnName, payload) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${fnName}`, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey:         SUPABASE_ANON_KEY,
      Authorization:  `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new Error(
      data?.error ?? `Edge function '${fnName}' returned HTTP ${res.status}`,
    );
  }

  return data;
}

const TABLE = '/rest/v1/checkin_staff';

/**
 * Generate a cryptographically secure random token (32 hex bytes = 64 chars).
 * Uses Web Crypto API — available in all modern browsers.
 *
 * @returns {string}
 */
function generateSecureToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Fetch all staff rows for a given event, ordered newest first.
 *
 * @param {string} eventId
 * @returns {Promise<StaffMember[]>}
 */
export async function fetchStaff(eventId) {
  return supabaseFetch(
    `${TABLE}?event_id=eq.${encodeURIComponent(eventId)}&order=created_at.desc&select=id,event_id,name,email,gate,invite_token,expires_at,revoked,token_used_at,created_at`,
  );
}

/**
 * Invite a new staff member.
 *
 * @param {{ eventId: string, name: string, email: string, gate: string, eventEndsAt: string }} params
 *   eventEndsAt — ISO string of the event end time; expires_at = eventEndsAt + 24 h
 * @returns {Promise<StaffMember>} — the newly created row
 */
export async function inviteStaff({ eventId, name, email, gate, eventEndsAt }) {
  // expires_at = event end + 24 h. If the event end is unknown or in the past,
  // fall back to 7 days from now so the link remains usable.
  let expiresAt;
  if (eventEndsAt) {
    const eventEnd = new Date(eventEndsAt);
    const candidate = new Date(eventEnd.getTime() + 24 * 60 * 60 * 1000);
    // If the event has already ended and the 24h window is in the past, give 7 days.
    expiresAt = candidate > new Date()
      ? candidate.toISOString()
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  } else {
    console.warn('[inviteStaff] eventEndsAt is missing — expires_at defaulting to 7 days from now');
    expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  }
  const inviteToken = generateSecureToken();

  const rows = await supabaseFetch(TABLE, {
    method:  'POST',
    body: JSON.stringify({
      event_id:     eventId,
      name:         name.trim(),
      email:        email.trim().toLowerCase(),
      gate:         gate.trim(),
      invite_token: inviteToken,
      expires_at:   expiresAt,
      revoked:      false,
      // token_used_at intentionally omitted — Supabase defaults to null
    }),
  });

  // supabaseFetch returns an array when Prefer: return=representation is set
  const newMember = Array.isArray(rows) ? rows[0] : rows;

  // Sign the token with HMAC for tamper protection
  if (newMember?.invite_token) {
    newMember.signed_token = await signStaffToken(newMember.invite_token);
  }

  // ── Trigger invite email (fire-and-forget) ──────────────────────────────
  // A delivery hiccup must never prevent the staff member from being added.
  // Errors are logged as warnings so the host can follow up manually.
  invokeEdgeFunction('send-staff-invite', {
    name:        name.trim(),
    email:       email.trim().toLowerCase(),
    gate:        gate.trim(),
    inviteToken: inviteToken,
    staffAppBaseUrl: import.meta.env.DEV
      ? `${window.location.origin}/staff`
      : 'https://checkin.explarax.com/staff',
  }).catch((err) => {
    console.warn(
      '[inviteStaff] Email invite could not be sent — staff member was still created.',
      err?.message ?? err,
    );
  });

  return newMember;
}

/**
 * Revoke a staff member's access.
 *
 * @param {string} staffId — row id (uuid)
 * @returns {Promise<StaffMember>} — the updated row
 */
export async function revokeStaff(staffId) {
  const rows = await supabaseFetch(
    `${TABLE}?id=eq.${encodeURIComponent(staffId)}`,
    {
      method: 'PATCH',
      body:   JSON.stringify({ revoked: true }),
    },
  );
  return Array.isArray(rows) ? rows[0] : rows;
}

/**
 * Re-generate the invite token for a staff member (Resend action).
 * Resets token_used_at to null and creates a fresh token with a new expiry.
 *
 * @param {string} staffId
 * @param {string} eventEndsAt — ISO string
 * @returns {Promise<StaffMember>}
 */
export async function resendInvite(staffId, eventEndsAt) {
  let expiresAt;
  if (eventEndsAt) {
    const eventEnd = new Date(eventEndsAt);
    const candidate = new Date(eventEnd.getTime() + 24 * 60 * 60 * 1000);
    expiresAt = candidate > new Date()
      ? candidate.toISOString()
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  } else {
    expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  }
  const inviteToken = generateSecureToken();

  const rows = await supabaseFetch(
    `${TABLE}?id=eq.${encodeURIComponent(staffId)}`,
    {
      method: 'PATCH',
      body:   JSON.stringify({
        invite_token:  inviteToken,
        expires_at:    expiresAt,
        revoked:       false,
        token_used_at: null,
      }),
    },
  );
  const result = Array.isArray(rows) ? rows[0] : rows;
  if (result?.invite_token) {
    result.signed_token = await signStaffToken(result.invite_token);
  }
  return result;
}
