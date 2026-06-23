/**
 * useStaff — state management hook for the StaffManagement feature.
 *
 * Owns:
 *   - staff list (fetched from Supabase)
 *   - invite form submission
 *   - revoke action
 *   - resend action
 *   - toast notifications
 */

import { useState, useEffect, useCallback } from 'react';
import {
  fetchStaff,
  inviteStaff,
  revokeStaff,
  resendInvite,
} from '../../../api/staffApi.js';

const STAFF_LINK_BASE = 'https://checkin.explarax.com/staff?token=';

/** Duration (ms) a toast stays visible */
const TOAST_DURATION_MS = 3500;

/**
 * @param {string} eventId
 * @param {string} eventEndsAt  — ISO datetime string of the event end
 */
export function useStaff(eventId, eventEndsAt) {
  const [staff,     setStaff]     = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error,     setError]     = useState(null);

  // Form busy state — prevents double-submits
  const [isSubmitting, setIsSubmitting] = useState(false);

  // { id: string, message: string, type: 'success' | 'error' }
  const [toast, setToast] = useState(null);

  // ── helpers ──────────────────────────────────────────────────────────────

  const showToast = useCallback((message, type = 'success') => {
    const id = Date.now().toString();
    setToast({ id, message, type });
    setTimeout(() => setToast((t) => (t?.id === id ? null : t)), TOAST_DURATION_MS);
  }, []);

  const dismissToast = useCallback(() => setToast(null), []);

  // ── fetch ─────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!eventId) return;
    setIsLoading(true);
    setError(null);
    try {
      const rows = await fetchStaff(eventId);
      setStaff(rows ?? []);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    load();
  }, [load]);

  // ── invite ────────────────────────────────────────────────────────────────

  const invite = useCallback(async ({ name, email, gate }) => {
    setIsSubmitting(true);
    try {
      const newMember = await inviteStaff({ eventId, name, email, gate, eventEndsAt });
      setStaff((prev) => [newMember, ...prev]);
      showToast(`Invite sent to ${email}`);
      return true; // signal success to the form (lets it reset)
    } catch (err) {
      showToast(err.message ?? 'Failed to send invite', 'error');
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, [eventId, eventEndsAt, showToast]);

  // ── revoke ────────────────────────────────────────────────────────────────

  const revoke = useCallback(async (staffId) => {
    try {
      const updated = await revokeStaff(staffId);
      setStaff((prev) =>
        prev.map((m) => (m.id === staffId ? { ...m, ...updated, revoked: true } : m))
      );
      showToast('Staff access revoked');
    } catch (err) {
      showToast(err.message ?? 'Failed to revoke access', 'error');
    }
  }, [showToast]);

  // ── resend ────────────────────────────────────────────────────────────────

  const resend = useCallback(async (staffId) => {
    try {
      const updated = await resendInvite(staffId, eventEndsAt);
      setStaff((prev) =>
        prev.map((m) => (m.id === staffId ? { ...m, ...updated } : m))
      );
      showToast('New invite link sent');
    } catch (err) {
      showToast(err.message ?? 'Failed to resend invite', 'error');
    }
  }, [eventEndsAt, showToast]);

  // ── copy link ─────────────────────────────────────────────────────────────

  const copyLink = useCallback(async (inviteToken) => {
    const url = `${STAFF_LINK_BASE}${inviteToken}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast('Invite link copied to clipboard');
    } catch {
      // Fallback for browsers that block clipboard without user gesture
      showToast('Could not copy — check browser permissions', 'error');
    }
  }, [showToast]);

  return {
    staff,
    isLoading,
    error,
    reload: load,
    isSubmitting,
    invite,
    revoke,
    resend,
    copyLink,
    toast,
    dismissToast,
  };
}
