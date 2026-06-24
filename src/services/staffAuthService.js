/**
 * staffAuthService.js — Supabase Auth operations for the staff PWA.
 *
 * Uses bare-fetch against Supabase Auth REST endpoints to stay consistent
 * with the project's plain-fetch pattern (no SDK dependency).
 *
 * Auth endpoints used:
 *   POST /auth/v1/signup          — create account (first-time)
 *   POST /auth/v1/token?grant_type=password — sign in
 *   GET  /auth/v1/user            — get current user from session token
 *   POST /auth/v1/logout          — sign out
 *
 * Edge Function used:
 *   POST /functions/v1/validate-staff-invite — validate invite token
 *
 * All functions throw an Error with a user-readable message on failure.
 */

const SUPABASE_URL     = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '');
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// ── Session storage key ───────────────────────────────────────────────────────
const SESSION_KEY = 'explarax_staff_session';

// ── Internal helpers ──────────────────────────────────────────────────────────

function authHeaders(accessToken) {
  return {
    'Content-Type': 'application/json',
    apikey:        SUPABASE_ANON_KEY,
    Authorization: `Bearer ${accessToken ?? SUPABASE_ANON_KEY}`,
  };
}

async function parseResponse(res) {
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { message: text }; }
  if (!res.ok) {
    throw new Error(
      body?.error_description ?? body?.msg ?? body?.message ?? `Request failed (${res.status})`
    );
  }
  return body;
}

// ── Session persistence ───────────────────────────────────────────────────────

/**
 * Persist session to sessionStorage (cleared on tab close — appropriate for
 * a shared check-in device).
 * @param {{ access_token: string, refresh_token: string, user: object }} session
 */
export function saveSession(session) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

/**
 * Load session from sessionStorage.
 * @returns {{ access_token: string, refresh_token: string, user: object } | null}
 */
export function loadSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Clear session from sessionStorage. */
export function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

// ── validate-staff-invite ─────────────────────────────────────────────────────

/**
 * Call the validate-staff-invite edge function.
 *
 * This is a PUBLIC endpoint — no staff session exists yet at this point.
 * The function runs with verify_jwt=false and uses the service role key
 * internally to query checkin_staff.
 *
 * We send only apikey (no Authorization header) to be explicit about the
 * pre-auth nature of this call.
 *
 * Success response (HTTP 200, valid: true):
 * {
 *   valid:       true,
 *   firstTime:   boolean,   — true if auth_user_id is null (never logged in)
 *   staffId:     string,
 *   eventId:     string,
 *   email:       string,
 *   name:        string,
 *   gate:        string,
 *   eventName?:  string,
 *   authUserId:  string | null,
 * }
 *
 * Error response (HTTP 200, valid: false):
 * { valid: false, error: 'invalid_link' | 'revoked' | 'expired' | 'missing_token' | 'server_error' }
 *
 * @param {string} inviteToken
 * @returns {Promise<InviteValidationResult>}
 * @throws {Error} with .code set to the error string, or 'network_error'
 */
export async function validateStaffInvite(inviteToken) {
  let res;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/validate-staff-invite`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        // No Authorization header — this is a pre-auth public endpoint
      },
      body: JSON.stringify({ token: inviteToken }),
    });
  } catch {
    const err = new Error('Could not reach the server. Check your connection.');
    err.code = 'network_error';
    throw err;
  }

  let data;
  try { data = await res.json(); } catch { data = {}; }

  // HTTP-level failure (shouldn't normally happen on this endpoint)
  if (!res.ok) {
    const code = data?.error ?? 'invalid_link';
    const err  = new Error(_inviteErrorMessage(code));
    err.code   = code;
    throw err;
  }

  // The function always returns 200 — check the valid flag
  if (!data.valid) {
    const code = data?.error ?? 'invalid_link';
    const err  = new Error(_inviteErrorMessage(code));
    err.code   = code;
    throw err;
  }

  return data;
}

function _inviteErrorMessage(code) {
  const map = {
    invalid_link:  'This invitation link is not valid.',
    missing_token: 'This invitation link is not valid.',
    revoked:       'This link has been revoked by the host.',
    expired:       'This invitation link has expired.',
    server_error:  'Something went wrong. Please try again.',
  };
  return map[code] ?? 'Invitation validation failed.';
}

// ── Sign up (first-time account creation) ─────────────────────────────────────

/**
 * Create a new Supabase Auth account and automatically establish a session.
 *
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{ access_token: string, refresh_token: string, user: object }>}
 */
export async function signUp(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method:  'POST',
    headers: authHeaders(null),
    body:    JSON.stringify({ email, password }),
  });
  const data = await parseResponse(res);

  // Supabase returns the session inline when email confirmation is disabled.
  // Shape: { access_token, refresh_token, user, ... }
  if (!data.access_token) {
    // Email confirmation is enabled on this project — not supported by this flow.
    throw new Error(
      'Account created but email confirmation is required. ' +
      'Disable "Confirm email" in your Supabase Auth settings.'
    );
  }

  const session = {
    access_token:  data.access_token,
    refresh_token: data.refresh_token,
    user:          data.user,
  };
  saveSession(session);
  return session;
}

// ── Sign in (existing account) ────────────────────────────────────────────────

/**
 * Sign in with email + password.
 *
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{ access_token: string, refresh_token: string, user: object }>}
 */
export async function signInWithPassword(email, password) {
  const res = await fetch(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      method:  'POST',
      headers: authHeaders(null),
      body:    JSON.stringify({ email, password }),
    }
  );
  const data = await parseResponse(res);

  const session = {
    access_token:  data.access_token,
    refresh_token: data.refresh_token,
    user:          data.user,
  };
  saveSession(session);
  return session;
}

// ── Get current user ──────────────────────────────────────────────────────────

/**
 * Fetch the current user using the stored session token.
 * Returns null if no session exists or the token is invalid.
 *
 * @returns {Promise<object | null>}
 */
export async function getSession() {
  const session = loadSession();
  if (!session?.access_token) return null;

  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: authHeaders(session.access_token),
    });
    if (!res.ok) {
      clearSession();
      return null;
    }
    const user = await res.json();
    return { ...session, user };
  } catch {
    return null;
  }
}

// ── Sign out ──────────────────────────────────────────────────────────────────

/**
 * Sign out: revoke the token server-side and clear local session.
 */
export async function signOut() {
  const session = loadSession();
  if (session?.access_token) {
    try {
      await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
        method:  'POST',
        headers: authHeaders(session.access_token),
      });
    } catch { /* best-effort */ }
  }
  clearSession();
}

// ── Link auth_user_id on checkin_staff row ────────────────────────────────────

/**
 * After a successful signUp, patch the checkin_staff row with the new
 * Supabase Auth user ID so RLS policies can identify this staff member.
 *
 * @param {string} staffId   — checkin_staff.id (uuid)
 * @param {string} authUserId — auth.users.id from the session
 * @param {string} accessToken
 * @returns {Promise<void>}
 */
export async function linkAuthUser(staffId, authUserId, accessToken) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/checkin_staff?id=eq.${encodeURIComponent(staffId)}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        apikey:        SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
        Prefer:        'return=minimal',
      },
      body: JSON.stringify({ auth_user_id: authUserId }),
    }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    // Non-fatal: log and continue — the staff member is authenticated
    console.warn('[staffAuthService] linkAuthUser failed:', text);
  }
}

console.log('SUPABASE_URL', SUPABASE_URL);
console.log('SUPABASE_ANON_KEY', SUPABASE_ANON_KEY?.slice(0, 20));
