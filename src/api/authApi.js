/**
 * authApi.js — ExplaraX authentication layer.
 *
 * Single-step flow (real API behaviour):
 *   GET https://account.explarax.com/api/login?email=…&password=…
 *   Response: { account: { token: "…", … }, … }
 *
 * The permanent Bearer token lives at loginData.account.token.
 * The /api/verify step is not used — the OTP it requires is a
 * one-time code that expires and the login response already carries
 * the permanent token directly.
 *
 * NOTE: GET with query-param credentials follows the API spec exactly.
 */

const ACCOUNT_BASE = 'https://account.explarax.com/api';

/**
 * Authenticate with email + password.
 * Extracts the Bearer token from loginData.account.token.
 *
 * @param {string} email
 * @param {string} password
 * @returns {Promise<string>} permanent Bearer token
 * @throws {Error} on non-2xx response or missing token in response
 */
export async function login(email, password) {
  const url = new URL(`${ACCOUNT_BASE}/login`);
  url.searchParams.set('email', email);
  url.searchParams.set('password', password);

  const res = await fetch(url.toString());

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(body || `Login failed (${res.status})`);
  }

  const data = await res.json();

  // Primary path: loginData.account.token (confirmed from real response)
  const token =
    data?.account?.token ??
    data?.token ??
    data?.data?.token ??
    data?.access_token;

  if (!token) {
    throw new Error('Login response did not include a token. Check the API response shape.');
  }

  return token;
}
