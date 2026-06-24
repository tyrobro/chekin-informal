/**
 * staffInviteUrl.js
 *
 * Single source of truth for staff invitation URL generation.
 *
 * Uses window.location.origin so the correct host is used in every
 * environment (localhost:5173 in dev, the real domain in production)
 * without any hardcoded base URL.
 *
 * @param {string} token — invite_token from the checkin_staff row
 * @returns {string}     — e.g. https://localhost:5173/staff/invite?token=abc123
 */
export function buildStaffInviteUrl(token) {
  const base = typeof window !== 'undefined'
    ? window.location.origin
    : '';
  return `${base}/staff/invite?token=${encodeURIComponent(token)}`;
}
