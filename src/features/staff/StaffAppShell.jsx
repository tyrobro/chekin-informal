import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import QRScanner from './QRScanner.jsx';
import ScanResult from './ScanResult.jsx';
import ManualCheckIn from './ManualCheckIn.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// StaffAppShell
//
// Authentication flow:
//   1. Extract ?token= from the URL.
//   2. If absent → 'missing_token'.
//   3. Fetch checkin_staff from Supabase REST API filtered by invite_token.
//   4. Empty result / network error → 'unauthorized'.
//   5. Valid row → populate staffData, set 'authenticated'.
// ─────────────────────────────────────────────────────────────────────────────
function StaffAppShell() {
  const [searchParams]   = useSearchParams();
  const urlToken         = searchParams.get('token');

  const [authStatus, setAuthStatus] = useState('loading');
  // { staffId, eventId, gateId, name }
  const [staffData, setStaffData]   = useState(null);
  const [showManual, setShowManual] = useState(false);

  // ── Token validation ──────────────────────────────────────────────────
  useEffect(() => {
    if (!urlToken) {
      setAuthStatus('missing_token');
      return;
    }

    const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY;

    // Guard: if env vars are not configured, fail gracefully
    if (!supabaseUrl || !supabaseAnon) {
      console.error('StaffAppShell: VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is not set.');
      setAuthStatus('unauthorized');
      return;
    }

    // THE FIX: Changed ?token= to ?invite_token=
    const endpoint =
      `${supabaseUrl}/rest/v1/checkin_staff` +
      `?invite_token=eq.${encodeURIComponent(urlToken)}` +
      `&select=id,event_id,gate,name` + // <-- CHANGED HERE
      `&limit=1`;

    fetch(endpoint, {
      method: 'GET',
      headers: {
        'apikey':        supabaseAnon,
        'Authorization': `Bearer ${supabaseAnon}`,
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
        setStaffData({
          staffId: row.id,
          eventId: row.event_id,
          gateId:  row.gate_id,
          name:    row.name,
        });
        setAuthStatus('authenticated');
      })
      .catch((err) => {
        console.error('StaffAppShell: token validation failed —', err);
        setAuthStatus('unauthorized');
      });
  }, [urlToken]);

  // ── Loading ───────────────────────────────────────────────────────────
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

  // ── Missing token or unauthorized ─────────────────────────────────────
  if (authStatus === 'missing_token' || authStatus === 'unauthorized') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 max-w-sm w-full text-center">
          {/* Lock icon */}
          <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-5">
            <svg
              width="26" height="26" viewBox="0 0 24 24" fill="none"
              stroke="#D64545" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-slate-900 mb-2">Access Denied</h2>
          <p className="text-sm text-slate-500 leading-relaxed">
            This link is invalid or has expired.
            <br />
            Please ask the host to send a new invite link.
          </p>
        </div>
      </div>
    );
  }

  // ── Authenticated — main scanner shell ────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col relative overflow-hidden">

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
          <div className="w-full h-full">
            <ManualCheckIn
              eventId={staffData?.eventId}
              onClose={() => setShowManual(false)}
            />
          </div>
        ) : (
          <div className="w-full flex flex-col items-center">
            <QRScanner onScanSuccess={() => {}} />

            <button
              type="button"
              onClick={() => setShowManual(true)}
              className="mt-8 w-full px-8 py-4 bg-slate-800 text-white font-semibold rounded-2xl
                         border border-slate-700 shadow-xl active:scale-95 transition-all text-lg
                         hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-[#7E57C2]/50"
            >
              Manual Check-in
            </button>
          </div>
        )}
      </main>

      {/* Global result overlay — receives dynamic staff context */}
      <ScanResult
        staffId={staffData?.staffId ?? 'unknown'}
        gateId={staffData?.gateId  ?? 'unknown'}
        eventId={staffData?.eventId ?? 'unknown'}
      />
    </div>
  );
}

export default StaffAppShell;