import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import QRScanner from './QRScanner.jsx';
import ScanResult from './ScanResult.jsx';
import ManualCheckIn from './ManualCheckIn.jsx';
import { verifyStaffToken } from '../../lib/hmacLink.js';

// ─────────────────────────────────────────────────────────────────────────────
// Storage keys — scoped per token
// ─────────────────────────────────────────────────────────────────────────────
const setupKey = (token) => `explarax_setup_${token}`;
const a2hsKey  = (token) => `explarax_a2hs_${token}`;

// ─────────────────────────────────────────────────────────────────────────────
// Desktop detection — desktops skip camera entirely
// ─────────────────────────────────────────────────────────────────────────────
function isDesktop() {
  return !/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// ─────────────────────────────────────────────────────────────────────────────
// StaffAppShell — Slice A4 Gate Setup
//
// Flow:
//   1. Auth (magic link validation via edge function)
//   2. Returning user check (localStorage) → skip to scanner if already done
//   3. Gate Confirmation screen
//   4. Add-to-Home-Screen prompt (if browser supports it, one-time only)
//   5. Desktop → immediately complete with 'desktop' camera status (no camera step)
//      Mobile → request camera → complete with 'granted' or 'denied'
//   6. Main scanner shell
// ─────────────────────────────────────────────────────────────────────────────
function StaffAppShell() {
  const [searchParams] = useSearchParams();
  const urlToken = searchParams.get('token');

  // ── Auth ──────────────────────────────────────────────────────────────────
  const [authStatus, setAuthStatus] = useState('loading');
  const [staffData, setStaffData] = useState(null);

  // ── Onboarding state machine ──────────────────────────────────────────────
  // 'pending'    → show gate confirmation
  // 'a2hs'      → show add-to-home-screen prompt
  // 'camera'    → requesting camera permission (mobile only)
  // 'complete'  → show scanner/manual
  const [setupStatus, setSetupStatus] = useState('pending');
  const [cameraStatus, setCameraStatus] = useState('pending');
  const [deferredPrompt, setDeferredPrompt] = useState(null);

  // ── Scanner / Manual toggle ────────────────────────────────────────────────
  const [showManual, setShowManual] = useState(false);

  // ── Network ────────────────────────────────────────────────────────────────
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const up = () => setIsOnline(true);
    const down = () => setIsOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);

  // ── Capture beforeinstallprompt ────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => { e.preventDefault(); setDeferredPrompt(e); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // ── Token validation ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!urlToken) { setAuthStatus('missing_token'); return; }

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnon) { setAuthStatus('unauthorized'); return; }

    // ── HMAC verification — must happen BEFORE any privileged operation ──────
    // Parse "token.hmac" format and verify integrity.
    // If signature is invalid or missing, show "Invalid Link" immediately.
    // No staff data is loaded, no session created, no event info exposed.
    async function validateAndAuth() {
      const { valid: hmacValid, token: rawToken } = await verifyStaffToken(urlToken);

      if (!hmacValid) {
        setAuthStatus('tampered');
        return;
      }

      // HMAC verified — proceed with the actual staff token (without signature)
      // Device fingerprint for token binding
      const ua = navigator.userAgent || '';
      const scr = `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth}`;
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      const lang = navigator.language || '';
      const raw = `${ua}|${scr}|${tz}|${lang}`;
      let h = 0;
      for (let i = 0; i < raw.length; i++) { h = ((h << 5) - h) + raw.charCodeAt(i); h |= 0; }
      const fingerprint = h.toString(36);

      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/validate-staff-invite`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: supabaseAnon, Authorization: `Bearer ${supabaseAnon}` },
          body: JSON.stringify({ token: rawToken, fingerprint }),
        });
        const data = await res.json();

        if (!data.valid) {
          const map = { expired: 'expired', revoked: 'revoked', invalid_link: 'unauthorized', missing_token: 'missing_token', device_mismatch: 'unauthorized' };
          setAuthStatus(map[data.error] ?? 'unauthorized');
          return;
        }

        setStaffData({
          staffId: data.staffId,
          eventId: data.eventId,
          gateId: data.gate,
          name: data.name,
          eventName: data.eventName ?? null,
        });
        setAuthStatus('authenticated');

        // Returning user: skip entire onboarding
        try {
          const saved = localStorage.getItem(setupKey(rawToken));
          if (saved) {
            const parsed = JSON.parse(saved);
            setCameraStatus(parsed.cameraStatus ?? 'granted');
            setSetupStatus('complete');
          }
        } catch { /* corrupted — treat as first launch */ }
      } catch {
        setAuthStatus('unauthorized');
      }
    }

    validateAndAuth();
  }, [urlToken]);

  // ── Persist setup completion ───────────────────────────────────────────────
  const finishSetup = useCallback((camStatus) => {
    setCameraStatus(camStatus);
    setSetupStatus('complete');
    try { localStorage.setItem(setupKey(urlToken), JSON.stringify({ cameraStatus: camStatus })); } catch {}
  }, [urlToken]);

  // ── Gate Confirm → proceed to A2HS or camera/desktop ───────────────────────
  const handleGateConfirm = useCallback(() => {
    // Check if A2HS is available AND not already dismissed
    const alreadyDismissed = (() => { try { return !!localStorage.getItem(a2hsKey(urlToken)); } catch { return false; } })();

    if (deferredPrompt && !alreadyDismissed) {
      // Show A2HS prompt next
      setSetupStatus('a2hs');
    } else {
      // Skip A2HS → go straight to camera/desktop
      proceedAfterA2HS();
    }
  }, [deferredPrompt, urlToken]);

  // ── After A2HS is handled (installed or dismissed) ─────────────────────────
  const proceedAfterA2HS = useCallback(() => {
    if (isDesktop()) {
      // Desktop: immediately degrade — no camera step at all
      finishSetup('desktop');
    } else {
      // Mobile: go to camera permission step
      setSetupStatus('camera');
    }
  }, [finishSetup]);

  const handleA2HSInstall = useCallback(async () => {
    if (deferredPrompt) {
      try { await deferredPrompt.prompt(); } catch {}
      setDeferredPrompt(null);
    }
    try { localStorage.setItem(a2hsKey(urlToken), '1'); } catch {}
    proceedAfterA2HS();
  }, [deferredPrompt, urlToken, proceedAfterA2HS]);

  const handleA2HSDismiss = useCallback(() => {
    try { localStorage.setItem(a2hsKey(urlToken), '1'); } catch {}
    proceedAfterA2HS();
  }, [urlToken, proceedAfterA2HS]);

  // ── Camera permission request (mobile only) ────────────────────────────────
  const handleCameraRequest = useCallback(async () => {
    setSetupStatus('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      stream.getTracks().forEach((t) => t.stop());
      finishSetup('granted');
    } catch (err) {
      const name = err?.name ?? '';
      if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        finishSetup('desktop');
      } else {
        finishSetup('denied');
      }
    }
  }, [finishSetup]);

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Loading ────────────────────────────────────────────────────────────────
  if (authStatus === 'loading') {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center gap-4 text-white">
        <div className="w-10 h-10 rounded-full border-4 border-slate-700 border-t-[#7E57C2] animate-spin" role="status" aria-label="Securing connection" />
        <p className="text-sm font-medium text-slate-400 tracking-wide">Securing Connection…</p>
      </div>
    );
  }

  // ── Error states ───────────────────────────────────────────────────────────
  if (authStatus === 'missing_token' || authStatus === 'unauthorized') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 max-w-sm w-full text-center">
          <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-5">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#D64545" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
          </div>
          <h2 className="text-lg font-bold text-slate-900 mb-2">Access Denied</h2>
          <p className="text-sm text-slate-500">This link is invalid or has expired.<br />Please ask the host to send a new invite link.</p>
        </div>
      </div>
    );
  }

  if (authStatus === 'revoked') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 max-w-sm w-full text-center">
          <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-5">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#D64545" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M4.93 4.93l14.14 14.14" /></svg>
          </div>
          <h2 className="text-lg font-bold text-slate-900 mb-2">Link Revoked</h2>
          <p className="text-sm text-slate-500">This link has been revoked. Please ask the host to send you a new one.</p>
        </div>
      </div>
    );
  }

  if (authStatus === 'expired') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 max-w-sm w-full text-center">
          <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-5">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
          </div>
          <h2 className="text-lg font-bold text-slate-900 mb-2">Link Expired</h2>
          <p className="text-sm text-slate-500">This link has expired. ExplaraX Check-in links are valid until 24 hours after the event ends.</p>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // View: Tampered/Invalid Link (HMAC verification failed)
  // No staff data loaded, no session created, no event info exposed.
  // ─────────────────────────────────────────────────────────────────────────
  if (authStatus === 'tampered') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 max-w-sm w-full text-center">
          <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-5">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#D64545" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-slate-900 mb-2">Invalid or Tampered Link</h2>
          <p className="text-sm text-slate-500 leading-relaxed">
            This staff link has been modified and cannot be verified.<br />
            Please request a new invite from the event host.
          </p>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Step 1: Gate Confirmation
  // ─────────────────────────────────────────────────────────────────────────
  if (authStatus === 'authenticated' && setupStatus === 'pending') {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col">
        <div className="px-6 pt-8"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#7E57C2]">ExplaraX Chek-In</p></div>
        <div className="flex-1 flex flex-col items-center justify-center px-6 pb-12">
          <div className="w-full max-w-sm">
            <h1 className="text-3xl font-black text-white text-center leading-tight mb-6">
              Welcome,<br />{staffData?.name ?? 'Staff Member'}.
            </h1>
            <div className="bg-slate-800/70 border border-slate-700 rounded-2xl p-6 mb-8 space-y-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500 mb-1">You're checking in at</p>
                <p className="text-lg font-bold text-white">{staffData?.eventName || `Event #${staffData?.eventId}` || 'Your Event'}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500 mb-1">Gate</p>
                <span className="inline-flex items-center px-4 py-2 bg-[#7E57C2]/20 text-[#c4b5fd] text-base font-bold rounded-xl border border-[#7E57C2]/30">
                  {staffData?.gateId ?? 'Unassigned'}
                </span>
              </div>
            </div>
            <button type="button" onClick={handleGateConfirm}
              className="w-full py-4 rounded-2xl font-bold text-base bg-[#7E57C2] text-white hover:bg-[#6a48a8] active:scale-[0.97] shadow-lg shadow-[#7E57C2]/25 transition-all">
              Confirm &amp; Continue →
            </button>
            <p className="text-xs text-slate-600 text-center mt-4">Wrong gate? Contact the event host to update your assignment.</p>
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Step 2: Add-to-Home-Screen (only if browser supports it)
  // This is a proper popup with a functioning Install button that triggers
  // the browser's native install flow.
  // ─────────────────────────────────────────────────────────────────────────
  if (authStatus === 'authenticated' && setupStatus === 'a2hs') {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 text-center space-y-5">
            {/* Icon */}
            <div className="w-16 h-16 rounded-2xl bg-[#7E57C2]/15 flex items-center justify-center mx-auto">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#c4b5fd" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </div>
            <h2 className="text-xl font-black text-white">Add to Home Screen</h2>
            <p className="text-slate-400 text-sm leading-relaxed">
              Add ExplaraX Check-in to your home screen for faster access next time.
            </p>
            {/* Install button — triggers browser's native PWA install */}
            <button type="button" onClick={handleA2HSInstall}
              className="w-full py-4 rounded-2xl font-bold text-base bg-[#7E57C2] text-white hover:bg-[#6a48a8] active:scale-[0.97] shadow-lg shadow-[#7E57C2]/25 transition-all">
              Install App
            </button>
            {/* Skip button */}
            <button type="button" onClick={handleA2HSDismiss}
              className="w-full py-3 rounded-xl font-semibold text-sm text-slate-400 hover:text-white transition-colors">
              Not now, continue →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Step 3: Camera Permission (mobile only — desktops never reach here)
  // Includes a "Skip" option for manual-only mode.
  // ─────────────────────────────────────────────────────────────────────────
  if (authStatus === 'authenticated' && (setupStatus === 'camera' || setupStatus === 'requesting')) {
    const isRequesting = setupStatus === 'requesting';
    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm text-center">
          <div className="w-16 h-16 rounded-2xl bg-[#7E57C2]/15 flex items-center justify-center mb-8 mx-auto">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#c4b5fd" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 7l-7 5 7 5V7z" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
            </svg>
          </div>
          <h2 className="text-2xl font-black text-white mb-3">Camera Access</h2>
          <p className="text-slate-400 text-base leading-relaxed mb-10">
            Allow camera access to scan attendee QR codes, or skip to use manual check-in only.
          </p>
          <button type="button" onClick={handleCameraRequest} disabled={isRequesting}
            className={`w-full py-4 rounded-2xl font-bold text-base transition-all ${isRequesting ? 'bg-[#7E57C2]/50 text-white/50 cursor-not-allowed' : 'bg-[#7E57C2] text-white hover:bg-[#6a48a8] active:scale-[0.97] shadow-lg shadow-[#7E57C2]/25'}`}
            aria-busy={isRequesting}>
            {isRequesting
              ? <span className="flex items-center justify-center gap-2"><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Requesting…</span>
              : 'Allow Camera →'}
          </button>
          {/* Skip to manual check-in — user can opt out of camera */}
          <button type="button" onClick={() => finishSetup('denied')} disabled={isRequesting}
            className="w-full mt-4 py-3 rounded-xl font-semibold text-sm text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 transition-all">
            Skip — Use Manual Check-in Only
          </button>
          <p className="text-xs text-slate-600 text-center mt-4">Permission is requested once and remembered by your browser.</p>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Main Scanner Shell (setup complete)
  // ─────────────────────────────────────────────────────────────────────────
  const cameraUnavailable = cameraStatus === 'denied' || cameraStatus === 'desktop';

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col relative overflow-hidden">
      {/* Header */}
      <header className="px-6 py-4 border-b border-slate-800 flex justify-between items-center z-10 shrink-0">
        <div>
          <h1 className="text-sm font-bold tracking-wide text-slate-300">ExplaraX Chek-In</h1>
          {staffData?.name && <p className="text-xs text-slate-500 mt-0.5">{staffData.name}</p>}
        </div>
        {staffData?.gateId && (
          <span className="px-3 py-1 bg-[#7E57C2]/20 text-[#7E57C2] text-xs font-bold rounded-full border border-[#7E57C2]/30">{staffData.gateId}</span>
        )}
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center justify-start p-6 w-full max-w-md mx-auto z-10 overflow-y-auto">
        {/* Offline banner */}
        {!isOnline && (
          <div role="alert" className="w-full bg-[#D64545] text-white rounded-xl px-4 py-3 mb-5 flex items-center gap-3 shrink-0">
            <svg className="shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="1" y1="1" x2="23" y2="23" /><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
            </svg>
            <p className="text-sm font-medium">No internet connection. Offline mode coming soon.</p>
          </div>
        )}

        {showManual ? (
          <div className="w-full h-full">
            <ManualCheckIn eventId={staffData?.eventId} gateId={staffData?.gateId} staffName={staffData?.name} onClose={() => setShowManual(false)} />
          </div>
        ) : (
          <div className="w-full flex flex-col items-center">
            {cameraUnavailable ? (
              <div className="w-full">
                <div className="w-full bg-[#D64545]/10 border border-[#D64545]/30 rounded-2xl px-5 py-5 flex items-start gap-4 mb-6">
                  <div className="shrink-0 w-10 h-10 rounded-full bg-[#D64545]/15 flex items-center justify-center mt-0.5">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D64545" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 8v4m0 4h.01" /></svg>
                  </div>
                  <div>
                    <p className="text-[#f87171] font-bold text-sm mb-1">
                      {cameraStatus === 'desktop' ? 'Desktop Mode' : 'Camera Access Denied'}
                    </p>
                    <p className="text-slate-400 text-sm leading-relaxed">
                      {cameraStatus === 'desktop'
                        ? 'Camera scanning is not available on desktop. You can still check guests in manually.'
                        : 'Camera access denied. You can still check guests in manually.'}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <QRScanner onScanSuccess={() => {}} />
            )}

            <button type="button" onClick={() => setShowManual(true)}
              className={`w-full font-semibold rounded-2xl transition-all text-base focus:outline-none focus:ring-2 focus:ring-[#7E57C2]/50 ${
                cameraUnavailable
                  ? 'mt-0 px-8 py-5 bg-[#7E57C2] text-white hover:bg-[#6a48a8] active:scale-[0.97] shadow-lg shadow-[#7E57C2]/25 text-lg font-bold'
                  : 'mt-8 px-8 py-4 bg-slate-800 text-white border border-slate-700 hover:bg-slate-700 active:scale-95'
              }`}>
              {cameraUnavailable ? '→ Manual Check-in' : 'Manual Check-in'}
            </button>
          </div>
        )}
      </main>

      {/* Scan result overlay */}
      <ScanResult staffId={staffData?.staffId ?? 'unknown'} gateId={staffData?.gateId ?? 'unknown'} eventId={staffData?.eventId ?? 'unknown'} />
    </div>
  );
}

export default StaffAppShell;
