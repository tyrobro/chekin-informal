/**
 * gateSetupStorage.js
 *
 * Persistence helpers for A4 Gate Setup onboarding state.
 * Uses localStorage so it survives page reloads but is cleared
 * when the user clears browser storage.
 *
 * Key schema:
 *   explarax_gate_setup_<staffId>  →  JSON { completedAt, cameraPermission }
 */

const prefix = 'explarax_gate_setup_';

/**
 * Check whether onboarding has already been completed for this staff member
 * on this device.
 *
 * @param {string} staffId
 * @returns {boolean}
 */
export function isOnboardingComplete(staffId) {
  if (!staffId) return false;
  try {
    const raw = localStorage.getItem(prefix + staffId);
    if (!raw) return false;
    const data = JSON.parse(raw);
    return !!data?.completedAt;
  } catch {
    return false;
  }
}

/**
 * Mark onboarding as complete for this staff member.
 *
 * @param {string} staffId
 * @param {'granted'|'denied'|'prompt'} cameraPermission
 */
export function markOnboardingComplete(staffId, cameraPermission) {
  if (!staffId) return;
  try {
    localStorage.setItem(
      prefix + staffId,
      JSON.stringify({ completedAt: new Date().toISOString(), cameraPermission })
    );
  } catch { /* storage full — fail silently */ }
}

/**
 * Retrieve the stored camera permission from a previous onboarding run.
 *
 * @param {string} staffId
 * @returns {'granted'|'denied'|'prompt'|null}
 */
export function getStoredCameraPermission(staffId) {
  if (!staffId) return null;
  try {
    const raw = localStorage.getItem(prefix + staffId);
    if (!raw) return null;
    return JSON.parse(raw)?.cameraPermission ?? null;
  } catch {
    return null;
  }
}

/**
 * Clear onboarding state (e.g. for testing or forced re-onboarding).
 *
 * @param {string} staffId
 */
export function clearOnboarding(staffId) {
  if (!staffId) return;
  try { localStorage.removeItem(prefix + staffId); } catch { /* ignore */ }
}
