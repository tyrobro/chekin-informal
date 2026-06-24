import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { validateStaffInvite } from '../../../services/staffAuthService.js';
import { isOnboardingComplete } from '../onboarding/gateSetupStorage.js';
import RevokedLinkState from '../states/RevokedLinkState.jsx';
import ExpiredLinkState from '../states/ExpiredLinkState.jsx';
import StaffCreatePassword from './StaffCreatePassword.jsx';
import StaffLogin from './StaffLogin.jsx';
import GateSetupScreen from '../onboarding/GateSetupScreen.jsx';
import StaffAppShell from '../StaffAppShell.jsx';
import styles from './StaffAuth.module.css';

/**
 * StaffInviteRouter — entry point for /staff/invite
 *
 * Flow:
 *  1. Read ?token= from URL
 *  2. Call validate-staff-invite
 *  3. Route to the appropriate screen:
 *     - No token / invalid_link → InvalidLink screen
 *     - revoked               → RevokedLinkState
 *     - expired               → ExpiredLinkState
 *     - valid + firstTime     → StaffCreatePassword
 *     - valid + !firstTime    → StaffLogin
 *  4. After auth success:
 *     - onboarding already complete → StaffAppShell directly
 *     - onboarding not complete     → GateSetupScreen (A4) → StaffAppShell
 */
export default function StaffInviteRouter() {
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get('token');

  /**
   * view: 'loading' | 'invalid' | 'revoked' | 'expired' |
   *       'create_password' | 'login' | 'onboarding' | 'shell'
   */
  const [view,       setView]       = useState('loading');
  const [inviteData, setInviteData] = useState(null);
  const [session,    setSession]    = useState(null);
  // Camera permission resolved during A4 onboarding, passed into StaffAppShell
  const [cameraPermission, setCameraPermission] = useState('prompt');

  useEffect(() => {
    if (!inviteToken) {
      setView('invalid');
      return;
    }

    validateStaffInvite(inviteToken)
      .then((data) => {
        setInviteData(data);
        setView(data.firstTime ? 'create_password' : 'login');
      })
      .catch((err) => {
        const code = err.code ?? 'invalid_link';
        if (code === 'revoked')      setView('revoked');
        else if (code === 'expired') setView('expired');
        else                         setView('invalid');
      });
  }, [inviteToken]);

  // ── Auth success: decide whether to show A4 onboarding ───────────────────
  const handleAuthSuccess = (sess) => {
    setSession(sess);
    const staffId = inviteData?.staffId ?? sess?.user?.id;
    if (staffId && isOnboardingComplete(staffId)) {
      setView('shell');
    } else {
      setView('onboarding');
    }
  };

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

  if (view === 'create_password' && inviteData) {
    return (
      <StaffCreatePassword
        email={inviteData.email}
        name={inviteData.name}
        gate={inviteData.gate}
        eventName={inviteData.eventName}
        staffId={inviteData.staffId}
        onSuccess={handleAuthSuccess}
      />
    );
  }

  if (view === 'login' && inviteData) {
    return (
      <StaffLogin
        email={inviteData.email}
        onSuccess={handleAuthSuccess}
      />
    );
  }

  if (view === 'onboarding' && inviteData) {
    return (
      <GateSetupScreen
        staffId={inviteData.staffId}
        name={inviteData.name}
        eventName={inviteData.eventName}
        gate={inviteData.gate}
        onComplete={handleOnboardingComplete}
      />
    );
  }

  if (view === 'shell') {
    return (
      <StaffAppShell
        session={session}
        initialCameraPermission={cameraPermission}
      />
    );
  }

  return null;
}
