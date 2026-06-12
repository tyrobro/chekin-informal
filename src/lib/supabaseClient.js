/**
 * supabaseClient.js — bare-fetch Supabase REST client.
 *
 * Uses the Supabase REST API directly (no SDK dependency) to stay consistent
 * with the project's plain-fetch pattern.
 *
 * Required env vars (add to .env):
 *   VITE_SUPABASE_URL          — e.g. https://xyz.supabase.co
 *   VITE_SUPABASE_ANON_KEY     — public anon key (safe for frontend)
 */

const SUPABASE_URL     = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '');
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn(
    '[supabaseClient] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is not set. ' +
    'Supabase calls will fail until these are configured in .env'
  );
}

/**
 * Build Supabase REST headers.
 * @returns {Record<string, string>}
 */
function supabaseHeaders() {
  return {
    'Content-Type': 'application/json',
    apikey:         SUPABASE_ANON_KEY,
    Authorization:  `Bearer ${SUPABASE_ANON_KEY}`,
    Prefer:         'return=representation', // return inserted/updated rows
  };
}

/**
 * Execute a Supabase REST request.
 *
 * @param {string} path   — e.g. '/rest/v1/checkin_staff'
 * @param {RequestInit} options
 * @returns {Promise<any>} — parsed JSON body
 * @throws {Error}         — on non-2xx response
 */
export async function supabaseFetch(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      ...supabaseHeaders(),
      ...(options.headers ?? {}),
    },
  });

  const text = await res.text();

  if (!res.ok) {
    let message = `Supabase error (${res.status})`;
    try {
      const err = JSON.parse(text);
      message = err?.message ?? err?.error ?? message;
    } catch { /* ignore parse error, keep default message */ }
    throw new Error(message);
  }

  return text ? JSON.parse(text) : null;
}
