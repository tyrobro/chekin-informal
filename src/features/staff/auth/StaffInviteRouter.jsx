import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  validateStaffInvite,
  createSession,
  getSession,
} from '../../../services/staffAuthService.js';
import { isOnboardingComplete } from '../onboarding/gateSetupStorage.js';
import RevokedLinkState from '../states/RevokedLinkState.jsx';
import ExpiredLinkState from '../states/ExpiredLinkState.jsx';
import GateSetupScreen from '../onboarding/GateSetupScreen.jsx';
import StaffAppShell from '../StaffAppShell.jsx';
import styles from './StaffAuth.module.css';

/**
 * StaffInviteRouter — entry point for /staff/invite
 *
 * Passwordless magic-link flow:
 *
 *  On every mount:
 *   1. Check for existing valid local session.
 *      If found AND onboarding complete → go directly to StaffAppShell.
 *      If found AND onboarding not complete → go to A4 onboarding.
 *   2. If no session, read ?token= from URL.
 *      No token → invalid screen.
 *   3. Call validate-staff-invite.
 *      invalid_link → invalid screen
 *      revoked      → RevokedLinkState
 *      expired      → ExpiredLinkState
 *      valid        → createSession() → A4 onboarding → StaffAppShell
 */
export default function StaffInviteRouter() {
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get('token');

  /**
   * view: 'loading' | 'invalid' | 'revoked' | 'expired' | 'onboarding' | 'shell'
   */
  const [view,       setView]       = useState('loading');
  const [staffData,  setStaffData]  = useState(null); // current session / invite data
  const [cameraPermission, setCameraPermission] = useState('prompt');

  useEffect(() => {
    // ── 1. Fresh invite link takes priority over any cached session ─────────
    // If a token is in the URL, the user clicked an invite link.
    // Always validate it — don't let a stale cached session skip onboarding.
    if (inviteToken) {
      validateStaffInvite(inviteToken)
        .then((data) => {
          const session = createSession(data, inviteToken);
          setStaffData(session);
          // New invite always goes through onboarding
          setView('onboarding');
        })
        .catch((err) => {
          const code = err.code ?? 'invalid_link';
          if (code === 'revoked')      setView('revoked');
          else if (code === 'expired') setView('expired');
          else                         setView('invalid');
        });
      return;
    }

    // ── 2. No token in URL — check for existing session (page reload / revisit)
    const existing = getSession();
    if (existing) {
      setStaffData(existing);
      if (isOnboardingComplete(existing.staffId)) {
        setView('shell');
      } else {
        setView('onboarding');
      }
      return;
    }

    // ── 3. No token, no session ─────────────────────────────────────────────
    setView('invalid');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount

  // ── A4 onboarding complete ────────────────────────────────────────────────
  const handleOnboardingComplete = (camPerm) => {
    setCameraPermission(camPerm);
    setView('shell');
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (view === 'loading') {
    return (
      <div className={styles.loadingScreen} role="status" aria-live="polite">
        <svg className={styles.loadingSpinner} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3.5" opacity="0.25" />
          <path fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" opacity="0.8" />
        </svg>
        <p className={styles.loadingText}>Validating your invitation…</p>
      </div>
    );
  }

  if (view === 'invalid') {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 text-center">
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 max-w-sm w-full">
          <h2 className="text-lg font-bold text-slate-100 mb-2">Invalid invitation link</h2>
          <p className="text-sm text-slate-400">
            This link is not valid. Please ask the host to send you a new invitation.
          </p>
        </div>
      </div>
    );
  }

  if (view === 'revoked') return <RevokedLinkState />;
  if (view === 'expired') return <ExpiredLinkState />;

  if (view === 'onboarding' && staffData) {
    return (
      <GateSetupScreen
        staffId={staffData.staffId}
        name={staffData.staffName}
        eventName={staffData.eventName}
        gate={staffData.gate}
        onComplete={handleOnboardingComplete}
      />
    );
  }

  if (view === 'shell' && staffData) {
    return (
      <StaffAppShell
        session={staffData}
        initialCameraPermission={cameraPermission}
      />
    );
  }

  return null;
}
