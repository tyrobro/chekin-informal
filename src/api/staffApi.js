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
  const eventEnd   = eventEndsAt ? new Date(eventEndsAt) : new Date();
  const expiresAt  = new Date(eventEnd.getTime() + 24 * 60 * 60 * 1000).toISOString();
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
  return Array.isArray(rows) ? rows[0] : rows;
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
  const eventEnd   = eventEndsAt ? new Date(eventEndsAt) : new Date();
  const expiresAt  = new Date(eventEnd.getTime() + 24 * 60 * 60 * 1000).toISOString();
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
  return Array.isArray(rows) ? rows[0] : rows;
}
