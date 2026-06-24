/**
 * staffAuthService.js — Passwordless magic-link staff authentication.
 *
 * Authentication model:
 *   Staff authenticate solely by possession of a valid invite token.
 *   Clicking the link → validate-staff-invite edge function → local session.
 *   No passwords, no Supabase Auth accounts, no JWTs.
 *
 * Session shape:
 *   {
 *     staffId:         string,
 *     eventId:         string,
 *     eventName:       string | undefined,
 *     staffName:       string,
 *     email:           string,
 *     gate:            string,
 *     inviteToken:     string,
 *     authenticatedAt: string,  — ISO timestamp
 *   }
 *
 * Storage:
 *   localStorage — survives page reloads, cleared with browser storage.
 *   Keyed per staffId so multiple staff on the same device stay independent.
 */

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '');
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// ── Storage key ───────────────────────────────────────────────────────────────
const SESSION_KEY = 'explarax_staff_session';

// ── validate-staff-invite ─────────────────────────────────────────────────────

/**
 * Call the validate-staff-invite edge function.
 *
 * PUBLIC endpoint — verify_jwt=false. No Authorization header sent.
 * The edge function uses the service role key internally.
 *
 * Success response (HTTP 200, valid: true):
 * {
 *   valid:       true,
 *   staffId:     string,
 *   eventId:     string,
 *   eventName?:  string,
 *   name:        string,
 *   email:       string,
 *   gate:        string,
 *   firstTime:   boolean,   — kept for backend compatibility, ignored by UI
 *   authUserId:  string | null,
 * }
 *
 * Error response (HTTP 200, valid: false):
 * { valid: false, error: 'invalid_link' | 'revoked' | 'expired' | 'missing_token' | 'server_error' }
 *
 * @param {string} inviteToken
 * @returns {Promise<object>} — raw validated invite payload
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
        // No Authorization header — pre-auth public endpoint
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

  if (!res.ok) {
    const code = data?.error ?? 'invalid_link';
    const err  = new Error(_inviteErrorMessage(code));
    err.code   = code;
    throw err;
  }

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

// ── Session creation ──────────────────────────────────────────────────────────

/**
 * Build and persist a staff session from a validated invite payload.
 * This is the single authentication step — no password required.
 *
 * @param {object} inviteData — response from validateStaffInvite
 * @param {string} inviteToken — the raw token from the URL
 * @returns {{ staffId, eventId, eventName, staffName, email, gate, inviteToken, authenticatedAt }}
 */
export function createSession(inviteData, inviteToken) {
  const session = {
    staffId:         inviteData.staffId,
    eventId:         inviteData.eventId,
    eventName:       inviteData.eventName ?? undefined,
    staffName:       inviteData.name,
    email:           inviteData.email,
    gate:            inviteData.gate,
    inviteToken,
    authenticatedAt: new Date().toISOString(),
  };
  saveSession(session);
  return session;
}

// ── Session persistence ───────────────────────────────────────────────────────

/**
 * Persist session to localStorage.
 * @param {object} session
 */
export function saveSession(session) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch { /* storage full — fail silently */ }
}

/**
 * Load session from localStorage.
 * Returns null if absent or unparseable.
 * @returns {object | null}
 */
export function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Synchronous session check — returns the session if valid, null otherwise.
 * "Valid" means the session object has the required fields.
 * @returns {object | null}
 */
export function getSession() {
  const s = loadSession();
  if (!s?.staffId || !s?.authenticatedAt) return null;
  return s;
}

/** Clear the current session. */
export function clearSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
}

/** Sign out — clears local session (no server call needed). */
export function signOut() {
  clearSession();
}
