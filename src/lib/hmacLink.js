/**
 * hmacLink.js — HMAC utilities for staff magic link integrity protection.
 *
 * Staff links use the format: <staff_token>.<hmac_signature>
 * where hmac_signature = HMAC-SHA256(staff_token, secret) truncated to 16 hex chars.
 *
 * The secret is read from VITE_STAFF_LINK_HMAC_SECRET env var.
 * Never hardcode the secret — always read from environment.
 */

const HMAC_SECRET = import.meta.env.VITE_STAFF_LINK_HMAC_SECRET || '';

/**
 * Compute HMAC-SHA256 of a message using the configured secret.
 * Returns the full hex digest (64 chars).
 *
 * @param {string} message — the staff token to sign
 * @returns {Promise<string>} — hex HMAC signature
 */
async function computeHmac(message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(HMAC_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Sign a staff token — produces the format: token.signature
 *
 * @param {string} staffToken — the raw invite_token from the database
 * @returns {Promise<string>} — signed token in format "token.hmac"
 */
export async function signStaffToken(staffToken) {
  const hmac = await computeHmac(staffToken);
  return `${staffToken}.${hmac}`;
}

/**
 * Parse and verify a signed staff token.
 *
 * Uses constant-time comparison to prevent timing attacks:
 * computes HMAC of the received token and compares byte-by-byte
 * without early termination.
 *
 * @param {string} signedToken — "token.hmac" from URL
 * @returns {Promise<{ valid: boolean, token: string|null }>}
 */
export async function verifyStaffToken(signedToken) {
  if (!signedToken || !HMAC_SECRET) {
    return { valid: false, token: null };
  }

  // Find the LAST period — the token itself could contain periods (unlikely for hex, but safe)
  const lastDot = signedToken.lastIndexOf('.');
  if (lastDot === -1 || lastDot === 0 || lastDot === signedToken.length - 1) {
    return { valid: false, token: null };
  }

  const token = signedToken.substring(0, lastDot);
  const providedSig = signedToken.substring(lastDot + 1);

  if (!token || !providedSig) {
    return { valid: false, token: null };
  }

  // Compute expected HMAC
  const expectedSig = await computeHmac(token);

  // Constant-time comparison — compare all bytes regardless of match
  // This prevents timing-based side-channel attacks.
  if (providedSig.length !== expectedSig.length) {
    return { valid: false, token: null };
  }

  let mismatch = 0;
  for (let i = 0; i < expectedSig.length; i++) {
    mismatch |= providedSig.charCodeAt(i) ^ expectedSig.charCodeAt(i);
  }

  if (mismatch !== 0) {
    return { valid: false, token: null };
  }

  return { valid: true, token };
}
