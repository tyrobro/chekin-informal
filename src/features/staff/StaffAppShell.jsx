import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import QRScanner from './QRScanner.jsx';
import ScanResult from './ScanResult.jsx';
import ManualCheckIn from './ManualCheckIn.jsx';
import RevokedLinkState from './states/RevokedLinkState.jsx';
import ExpiredLinkState from './states/ExpiredLinkState.jsx';
import NetworkErrorBanner from './states/NetworkErrorBanner.jsx';
import CameraDeniedState from './states/CameraDeniedState.jsx';
import { getSession } from '../../services/staffAuthService.js';

// localStorage key scoped to the invite token so different staff links
// on the same device each maintain their own setup state.
const setupKey = (token) => `explarax_setup_${token}`;

// ─────────────────────────────────────────────────────────────────────────────
// StaffAppShell
//
// Props:
//   session — { access_token, user } (optional)
//     When provided (from StaffInviteRouter after auth), used directly.
//     When absent (legacy /staff?token=... dev route), falls back to URL param check.
//   initialCameraPermission — 'prompt' | 'granted' | 'denied' (optional)
//     When provided by A4 onboarding router, seeds the camera status so the
//     setup screen can be skipped if permission was already resolved upstream.
//
// State machine:
//   authStatus:   'loading' | 'authenticated' | 'unauthorized' | 'missing_token'
//                 | 'revoked' | 'expired'
//   setupStatus:  'pending' | 'requesting' | 'complete'
//   cameraStatus: 'pending' | 'granted' | 'denied' | 'desktop'
// ─────────────────────────────────────────────────────────────────────────────
function StaffAppShell({ session: sessionProp = null, initialCameraPermission = 'prompt' }) {
  const [searchParams] = useSearchParams();
  const urlToken = searchParams.get('token');
  const status   = searchParams.get('status'); // 'revoked' | 'expired' for demo/routing

  // ── Session (magic-link invite flow) ─────────────────────────────────────
  // sessionChecked gates the rest of the UI. When sessionProp is provided
  // (from StaffInviteRouter), it's already checked. When absent (legacy dev
  // route), we call getSession() once and proceed regardless of result.
  const [sessionChecked, setSessionChecked] = useState(sessionProp !== null);
  const [activeSession,  setActiveSession]  = useState(sessionProp);

  useEffect(() => {
    if (sessionProp !== null) {
      setActiveSession(sessionProp);
      setSessionChecked(true);
      return;
    }
    // Legacy dev route: check stored session, but don't block if absent.
    getSession().then((sess) => {
      setActiveSession(sess);
      setSessionChecked(true);
    });
  }, [sessionProp]);

  // ── Auth ──────────────────────────────────────────────────────────────────
  const [authStatus, setAuthStatus] = useState('loading');
  const [staffData,  setStaffData]  = useState(null); // { staffId, eventId, gateId, name }

  // ── Onboarding (Slice A4) ─────────────────────────────────────────────────
  // If initialCameraPermission was provided by an upstream router (e.g., A4's
  // onboarding resolved camera permission before mounting this shell), seed
  // cameraStatus and skip the setup screen.
  const alreadyOnboarded = initialCameraPermission !== 'prompt';
  const [setupStatus,    setSetupStatus]    = useState(alreadyOnboarded ? 'complete' : 'pending');
  const [cameraStatus,   setCameraStatus]   = useState(
    alreadyOnboarded ? initialCameraPermission : 'pending',
  );
  const [deferredPrompt, setDeferredPrompt] = useState(null); // BeforeInstallPromptEvent

  // ── Scanner / Manual toggle ────────────────────────────────────────────────
  const [showManual, setShowManual] = useState(false);

  // ── Network connectivity ───────────────────────────────────────────────────
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);

  // ── Online/offline listeners ───────────────────────────────────────────────
  useEffect(() => {
    const goOnline  = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online',  goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online',  goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // ── PWA install prompt capture ─────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      e.preventDefault(); // stop Chrome mini-infobar
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // ── Token validation + localStorage setup-state rehydration ──────────────
  useEffect(() => {
    if (!urlToken) {
      setAuthStatus('missing_token');
      return;
    }

    const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnon) {
      console.error('StaffAppShell: VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is not set.');
      setAuthStatus('unauthorized');
      return;
    }

    const endpoint =
      `${supabaseUrl}/rest/v1/checkin_staff` +
      `?invite_token=eq.${encodeURIComponent(urlToken)}` +
      `&select=id,event_id,gate,name,revoked,expires_at` +
      `&limit=1`;

    fetch(endpoint, {
      headers: {
        apikey:          supabaseAnon,
        Authorization:   `Bearer ${supabaseAnon}`,
        'Content-Type':  'application/json',
      },
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((rows) => {
        if (!Array.isArray(rows) || rows.length === 0) {
          setAuthStatus('unauthorized');
          return;
        }
        const row = rows[0];

        // Specific failure reasons — checked before granting access
        if (row.revoked === true) {
          setAuthStatus('revoked');
          return;
        }
        if (row.expires_at && new Date(row.expires_at) < new Date()) {
          setAuthStatus('expired');
          return;
        }

        setStaffData({ staffId: row.id, eventId: row.event_id, gateId: row.gate, name: row.name });
        setAuthStatus('authenticated');

        // Check if this token has already completed onboarding (only if not
        // already seeded from initialCameraPermission prop)
        if (!alreadyOnboarded) {
          try {
            const saved = localStorage.getItem(setupKey(urlToken));
            if (saved) {
              const parsed = JSON.parse(saved);
              setCameraStatus(parsed.cameraStatus ?? 'granted');
              setSetupStatus('complete');
            }
          } catch {
            // Corrupted localStorage — treat as first-launch
          }
        }
      })
      .catch((err) => {
        console.error('StaffAppShell: token validation failed —', err);
        setAuthStatus('unauthorized');
      });
  }, [urlToken, alreadyOnboarded]);

  // ── completeSetup — persists state and marks onboarding done ─────────────
  const completeSetup = useCallback((camStatus) => {
    setCameraStatus(camStatus);
    setSetupStatus('complete');
    try {
      localStorage.setItem(setupKey(urlToken), JSON.stringify({ cameraStatus: camStatus }));
    } catch {
      // Private browsing / storage quota — non-fatal; setup just runs again next time
    }
  }, [urlToken]);

  // ── handleContinue — camera permission request + optional PWA install ─────
  const handleContinue = useCallback(async () => {
    setSetupStatus('requesting');

    // Trigger PWA Add-to-Home-Screen prompt if the browser surfaced one
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
      } catch { /* install prompt may only be called once */ }
      setDeferredPrompt(null);
    }

    // Strict Desktop vs Mobile Detection
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    if (!isMobile) {
      // It's a desktop. Skip camera, degrade to manual mode instantly.
      completeSetup('desktop');
      return;
    }

    // Request camera permission for mobile devices
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      // Immediately release — we only needed the permission grant
      stream.getTracks().forEach((t) => t.stop());
      completeSetup('granted');
    } catch (err) {
      const name = err?.name ?? '';
      if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        completeSetup('desktop');
      } else {
        completeSetup('denied');
      }
    }
  }, [deferredPrompt, completeSetup]);

  // ─────────────────────────────────────────────────────────────────────────
  // View: Session loading (invite flow — waiting for getSession())
  // ─────────────────────────────────────────────────────────────────────────
  if (!sessionChecked) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <svg className="animate-spin w-8 h-8 text-[#7E57C2]" viewBox="0 0 24 24" fill="none" aria-label="Loading">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3.5" opacity="0.25" />
          <path fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" opacity="0.8" />
        </svg>
      </div>
    );
  }

  // ── Demo/routing shortcut: ?status=revoked|expired in the URL ────────────
  // Allows QA and the invite router to trigger error states without a DB call.
  if (status === 'revoked' || (urlToken && urlToken === 'revoked')) {
    return <RevokedLinkState />;
  }
  if (status === 'expired' || (urlToken && urlToken === 'expired')) {
    return <ExpiredLinkState />;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // View: Auth check in progress (token being validated against Supabase)
  // ─────────────────────────────────────────────────────────────────────────
  if (authStatus === 'loading') {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center gap-4 text-white">
        <div
          className="w-10 h-10 rounded-full border-4 border-slate-700 border-t-[#7E57C2] animate-spin"
          role="status"
          aria-label="Securing connection"
        />
        <p className="text-sm font-medium text-slate-400 tracking-wide">Securing Connection…</p>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // View: Access denied (missing token or completely invalid)
  // ─────────────────────────────────────────────────────────────────────────
  if (authStatus === 'missing_token' || authStatus === 'unauthorized') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 max-w-sm w-full text-center">
          <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-5">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none"
              stroke="#D64545" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-slate-900 mb-2">Access Denied</h2>
          <p className="text-sm text-slate-500 leading-relaxed">
            This link is invalid or has expired.<br />
            Please ask the host to send a new invite link.
          </p>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // View: Revoked — delegate to reusable A5 component
  // ─────────────────────────────────────────────────────────────────────────
  if (authStatus === 'revoked') {
    return <RevokedLinkState />;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // View: Expired — delegate to reusable A5 component
  // ─────────────────────────────────────────────────────────────────────────
  if (authStatus === 'expired') {
    return <ExpiredLinkState />;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // View: First-launch Setup (authenticated but onboarding not yet complete)
  // ─────────────────────────────────────────────────────────────────────────
  if (authStatus === 'authenticated' && setupStatus !== 'complete') {
    const isRequesting = setupStatus === 'requesting';

    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col">

        {/* Branding strip */}
        <div className="px-6 pt-8 pb-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#7E57C2]">
            ExplaraX Chek-In
          </p>
        </div>

        {/* Main welcome card */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 pb-12">
          <div className="w-full max-w-sm">

            {/* Icon */}
            <div className="w-16 h-16 rounded-2xl bg-[#7E57C2]/15 flex items-center justify-center mb-8 mx-auto">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none"
                stroke="#c4b5fd" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M23 7l-7 5 7 5V7z" />
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
              </svg>
            </div>

            {/* Welcome text */}
            <h1 className="text-3xl font-black text-white text-center leading-tight mb-3">
              Welcome,<br />{staffData?.name ?? 'Staff Member'}.
            </h1>
            <p className="text-slate-400 text-center text-base leading-relaxed mb-10">
              You're checking in guests at{' '}
              <span className="text-white font-semibold">
                {staffData?.gateId ?? 'your gate'}
              </span>.
            </p>

            {/* Step indicators */}
            <div className="space-y-3 mb-10">
              {[
                { icon: '📷', label: 'Allow camera access for QR scanning' },
                { icon: '📲', label: 'Add to Home Screen for the best experience' },
              ].map(({ icon, label }) => (
                <div key={label} className="flex items-center gap-3 bg-slate-800/60 rounded-xl px-4 py-3">
                  <span className="text-lg" aria-hidden="true">{icon}</span>
                  <p className="text-sm text-slate-300">{label}</p>
                </div>
              ))}
            </div>

            {/* CTA */}
            <button
              type="button"
              onClick={handleContinue}
              disabled={isRequesting}
              className={`w-full py-4 rounded-2xl font-bold text-base transition-all
                ${isRequesting
                  ? 'bg-[#7E57C2]/50 text-white/50 cursor-not-allowed'
                  : 'bg-[#7E57C2] text-white hover:bg-[#6a48a8] active:scale-[0.97] shadow-lg shadow-[#7E57C2]/25'
                }`}
              aria-busy={isRequesting}
            >
              {isRequesting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Setting up…
                </span>
              ) : (
                'Continue to Scanner →'
              )}
            </button>

            <p className="text-xs text-slate-600 text-center mt-4">
              Camera permission is requested once and remembered.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // View: Authenticated + Setup complete — main scanner shell
  //
  // cameraStatus === 'denied' | 'desktop'  →  show CameraDeniedState instead of scanner
  // cameraStatus === 'granted'             →  show QRScanner as normal
  // ─────────────────────────────────────────────────────────────────────────
  const cameraUnavailable = cameraStatus === 'denied' || cameraStatus === 'desktop';

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col relative overflow-hidden">

      {/* Network error banner — non-blocking, sits at top; uses reusable A5 component */}
      {!isOnline && (
        <NetworkErrorBanner onDismiss={() => setIsOnline(true)} />
      )}

      {/* Header */}
      <header className="px-6 py-4 border-b border-slate-800 flex justify-between items-center z-10 shrink-0">
        <div>
          <h1 className="text-sm font-bold tracking-wide text-slate-300">ExplaraX Chek-In</h1>
          {staffData?.name && (
            <p className="text-xs text-slate-500 mt-0.5">{staffData.name}</p>
          )}
        </div>
        {staffData?.gateId && (
          <span className="px-3 py-1 bg-[#7E57C2]/20 text-[#7E57C2] text-xs font-bold rounded-full border border-[#7E57C2]/30">
            {staffData.gateId}
          </span>
        )}
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center justify-start p-6 w-full max-w-md mx-auto z-10 overflow-y-auto">

        {showManual ? (
          /* ── Manual Check-In panel ── */
          <div className="w-full h-full">
            <ManualCheckIn
              eventId={staffData?.eventId}
              gateId={staffData?.gateId}
              staffName={staffData?.name}
              onClose={() => setShowManual(false)}
            />
          </div>
        ) : (
          /* ── Scanner or camera-unavailable state ── */
          <div className="w-full flex flex-col items-center">

            {cameraUnavailable ? (
              /* Reusable A5 component handles its own CTA and copy */
              <CameraDeniedState onManualCheckIn={() => setShowManual(true)} />
            ) : (
              <>
                <QRScanner onScanSuccess={() => {}} />

                <button
                  type="button"
                  onClick={() => setShowManual(true)}
                  className="mt-8 px-8 py-4 bg-slate-800 text-white font-semibold rounded-2xl border border-slate-700 hover:bg-slate-700 active:scale-95 transition-all w-full text-base focus:outline-none focus:ring-2 focus:ring-[#7E57C2]/50"
                >
                  Manual Check-in
                </button>
              </>
            )}

          </div>
        )}
      </main>

      {/* Global result overlay — always uses real staffData props */}
      <ScanResult
        staffId={staffData?.staffId ?? 'unknown'}
        gateId={staffData?.gateId   ?? 'unknown'}
        eventId={staffData?.eventId ?? 'unknown'}
      />
    </div>
  );
}

export default StaffAppShell;
