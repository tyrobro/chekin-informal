import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

/**
 * ManualCheckIn — Slice A3 Manual Lookup UI
 *
 * Fetches the full attendee list for the event ONCE on mount (already synced
 * during Prepare Check-in), then does all searching client-side.
 *
 * Check-in uses the same Supabase Edge Function as ScanResult (A2) via
 * window.handlePwaScan — triggering the same GREEN/RED overlay behavior.
 *
 * Props:
 *   eventId   — assigned event (scoped)
 *   gateId    — gate label
 *   staffName — staff display name (used as staff_id)
 *   onClose   — return to scanner
 */

const ID_DOC_OPTIONS = ['Aadhaar', 'PAN', 'Driving Licence', 'Passport', 'Other'];

// ── Simple fuzzy match — handles accents, apostrophes, case-insensitive ──────
function fuzzyMatch(text, query) {
  if (!text || !query) return false;
  const normalize = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/['']/g, '');
  return normalize(text).includes(normalize(query));
}

function ManualCheckIn({ eventId, gateId, staffName, onClose }) {
  // ── Attendee cache (fetched once) ──────────────────────────────────────────
  const [attendees, setAttendees] = useState([]);
  const [cacheLoading, setCacheLoading] = useState(true);
  const [cacheError, setCacheError] = useState(null);

  // ── Search state ───────────────────────────────────────────────────────────
  const [searchTerm, setSearchTerm] = useState('');
  const searchRef = useRef(null);

  // ── Detail/verification state ──────────────────────────────────────────────
  const [selectedGuest, setSelectedGuest] = useState(null);
  const [last4Input, setLast4Input] = useState('');
  const [idType, setIdType] = useState('');
  const [cardError, setCardError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY;

  // ── Fetch full attendee list once on mount (client-side search) ─────────────
  useEffect(() => {
    if (!eventId) return;
    setCacheLoading(true);
    setCacheError(null);

    fetch(
      `${supabaseUrl}/rest/v1/event_attendees` +
      `?event_id=eq.${encodeURIComponent(eventId)}` +
      `&select=ticket_id,attendee_name,ticket_type,company,seat,designation,checked_in_at` +
      `&order=attendee_name.asc`,
      {
        headers: {
          apikey: supabaseAnon,
          Authorization: `Bearer ${supabaseAnon}`,
          'Content-Type': 'application/json',
        },
      }
    )
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((data) => setAttendees(data || []))
      .catch((e) => setCacheError(e.message))
      .finally(() => setCacheLoading(false));
  }, [eventId, supabaseUrl, supabaseAnon]);

  // ── Focus search on mount ──────────────────────────────────────────────────
  useEffect(() => { searchRef.current?.focus(); }, []);

  // ── Client-side filtered results (fuzzy, 2-char minimum) ───────────────────
  // Searches both attendee name AND ticket ID so empty-name tickets are findable.
  const results = useMemo(() => {
    if (searchTerm.length < 2) return [];
    return attendees.filter((a) =>
      fuzzyMatch(a.attendee_name, searchTerm) ||
      (a.ticket_id && a.ticket_id.includes(searchTerm))
    );
  }, [attendees, searchTerm]);

  // ── Check for duplicate names to show designation ──────────────────────────
  const nameCounts = useMemo(() => {
    const counts = {};
    results.forEach((a) => { counts[a.attendee_name] = (counts[a.attendee_name] || 0) + 1; });
    return counts;
  }, [results]);

  // ── Handle check-in via Edge Function (same as A2) ─────────────────────────
  const handleCheckIn = useCallback(async ({ method, idTypeValue }) => {
    if (!selectedGuest) return;
    setIsProcessing(true);
    setCardError('');

    const payload = {
      qr_token: `manual:${selectedGuest.ticket_id}`,
      gate: gateId || 'unknown',
      staff_id: staffName || 'unknown',
      event_id: eventId,
      client_scan_id: crypto.randomUUID(),
      method: method,
      ...(idTypeValue ? { idType: idTypeValue } : {}),
    };

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 8000);

    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/checkin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supabaseAnon}`,
        },
        body: JSON.stringify(payload),
        signal: abortController.signal,
      });

      clearTimeout(timeoutId);

      let data;
      try { data = await response.json(); }
      catch { setCardError('Invalid server response'); setIsProcessing(false); return; }

      if (data.success) {
        // Mark as checked-in locally
        setAttendees((prev) =>
          prev.map((a) => a.ticket_id === selectedGuest.ticket_id
            ? { ...a, checked_in_at: new Date().toISOString() } : a)
        );

        // Trigger A2 GREEN overlay with method footer
        if (navigator.vibrate) navigator.vibrate(200);
        const methodLabel = method === 'manual_ticket_id' || method === 'manual_name_ticket_id'
          ? 'Manual: Ticket ID'
          : `Manual: ${idTypeValue || 'ID Document'}`;

        // Use a temporary overlay within this component
        setCheckInResult({ type: 'success', data: data.ticketInfo, methodLabel });
        setTimeout(() => { setCheckInResult(null); setSelectedGuest(null); }, 1500);
      } else {
        // Map edge function errors
        if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 200]);
        switch (data.error) {
          case 'denied_already_used':
            setCardError(`Already checked in at ${data.ticketInfo?.originalGate ?? 'Unknown Gate'}`);
            break;
          case 'denied_not_found':
            setCardError('Ticket not found in database.');
            break;
          case 'denied_invalid_event':
            setCardError('Wrong event — this ticket belongs to another event.');
            break;
          default:
            setCardError(data.message || 'Check-in failed.');
        }
      }
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        setCardError('Network timeout — try again.');
      } else {
        setCardError('Network error — could not reach server.');
      }
    } finally {
      setIsProcessing(false);
    }
  }, [selectedGuest, gateId, staffName, eventId, supabaseUrl, supabaseAnon]);

  // ── Check-in result overlay state ──────────────────────────────────────────
  const [checkInResult, setCheckInResult] = useState(null);

  // ── Mode A validation ──────────────────────────────────────────────────────
  const last4Upper = last4Input.toUpperCase();
  const expectedLast4 = selectedGuest?.ticket_id?.slice(-4).toUpperCase() ?? '';
  const modeAReady = last4Upper.length >= 4 && last4Upper === expectedLast4;
  const modeAWrong = last4Upper.length >= 4 && last4Upper !== expectedLast4;

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  // ── GREEN success overlay (mirrors A2 behavior) ────────────────────────────
  if (checkInResult?.type === 'success') {
    const info = checkInResult.data;
    return (
      <div className="fixed inset-0 z-50 flex flex-col justify-center p-6 bg-[#2E7D32]">
        <div className="text-center">
          <svg className="w-20 h-20 mx-auto mb-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h1 className="text-4xl font-black text-white mb-2">{info?.userName || selectedGuest?.attendee_name}</h1>
          <p className="text-xl text-green-100 font-semibold mb-2">{info?.ticketType || selectedGuest?.ticket_type || 'General'}</p>
          {(info?.company || info?.seat) && (
            <div className="inline-block bg-black/20 rounded-xl px-5 py-2 mt-2">
              {info.company && <p className="text-white text-base">{info.company}</p>}
              {info.seat && <p className="text-green-100">Seat: {info.seat}</p>}
            </div>
          )}
          {/* Verification method footer — A3 requirement */}
          <p className="mt-6 text-green-200 text-sm font-medium">{checkInResult.methodLabel}</p>
        </div>
      </div>
    );
  }

  // ── Detail screen (selected guest) ─────────────────────────────────────────
  if (selectedGuest) {
    return (
      <div className="w-full h-full flex flex-col bg-slate-900 text-white">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 shrink-0">
          <button onClick={() => { setSelectedGuest(null); setCardError(''); setLast4Input(''); setIdType(''); }}
            className="text-sm font-semibold text-[#c4b5fd]">← Back</button>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-full bg-slate-800"
            aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Attendee info card */}
          <div className="bg-slate-800 rounded-2xl p-5 space-y-2">
            <h2 className="text-xl font-black text-white">{selectedGuest.attendee_name || '—'}</h2>
            <p className="text-sm text-slate-400">{selectedGuest.ticket_type || 'General'}</p>
            {selectedGuest.company && <p className="text-sm text-slate-300">🏢 {selectedGuest.company}</p>}
            {selectedGuest.seat && <p className="text-sm text-slate-300">💺 Seat: {selectedGuest.seat}</p>}
          </div>

          {/* Error */}
          {cardError && (
            <div className="bg-red-500/10 border border-red-500/25 rounded-xl px-4 py-3">
              <p className="text-red-400 text-sm">{cardError}</p>
            </div>
          )}

          {/* Mode A — Ticket ID */}
          <div className="bg-slate-800 rounded-2xl p-5 space-y-3">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Verify with Ticket ID</p>
            <p className="text-xs text-slate-500">Ask the guest for the last 4 characters of their ticket ID.</p>
            <input type="text" maxLength={4} value={last4Input}
              onChange={(e) => { setLast4Input(e.target.value); setCardError(''); }}
              placeholder="Last 4 chars"
              className={`w-full bg-slate-900 border rounded-xl px-4 py-3 text-center font-mono text-lg tracking-widest text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 transition-colors ${
                modeAWrong ? 'border-red-500 focus:ring-red-500/30' : modeAReady ? 'border-emerald-500 focus:ring-emerald-500/30' : 'border-slate-600 focus:ring-[#7E57C2]/40'
              }`}
              aria-label="Enter last 4 characters of ticket ID" />
            {modeAWrong && <p className="text-red-400 text-xs text-center">Ticket ID does not match. Try again.</p>}
            <button type="button" disabled={!modeAReady || isProcessing}
              onClick={() => handleCheckIn({ method: 'manual_name_ticket_id' })}
              className={`w-full py-3 rounded-xl font-bold text-sm transition-all ${modeAReady && !isProcessing ? 'bg-[#5BC97C] text-white active:scale-[0.97]' : 'bg-slate-700 text-slate-500 cursor-not-allowed'}`}>
              {isProcessing ? 'Processing…' : 'Check In'}
            </button>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-slate-700" />
            <span className="text-[10px] uppercase tracking-widest text-slate-600 font-bold">or</span>
            <div className="flex-1 h-px bg-slate-700" />
          </div>

          {/* Mode B — ID Document */}
          <div className="bg-slate-800 rounded-2xl p-5 space-y-3">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Verify with ID Document</p>
            <p className="text-xs text-slate-500">Visually verify the guest's identity using a government ID. No ID number is stored.</p>
            <select value={idType} onChange={(e) => { setIdType(e.target.value); setCardError(''); }}
              className={`w-full appearance-none bg-slate-900 border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 cursor-pointer ${
                idType ? 'border-[#7E57C2] text-white' : 'border-slate-600 text-slate-500'
              } focus:ring-[#7E57C2]/40`}
              aria-label="Select ID document type">
              <option value="" disabled>Select document type…</option>
              {ID_DOC_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
            </select>
            <button type="button" disabled={!idType || isProcessing}
              onClick={() => handleCheckIn({ method: 'manual_name_id_doc', idTypeValue: idType })}
              className={`w-full py-3 rounded-xl font-bold text-sm transition-all ${idType && !isProcessing ? 'bg-[#5BC97C] text-white active:scale-[0.97]' : 'bg-slate-700 text-slate-500 cursor-not-allowed'}`}>
              {isProcessing ? 'Processing…' : 'Confirm — ID Verified'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Search list view ───────────────────────────────────────────────────────
  return (
    <div className="w-full h-full flex flex-col bg-slate-900 text-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 shrink-0">
        <h2 className="text-base font-bold tracking-wide">Manual Check-in</h2>
        <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-full bg-slate-800"
          aria-label="Close manual check-in">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>

      {/* Search input */}
      <div className="px-4 pt-4 pb-3 border-b border-slate-800 shrink-0">
        <input ref={searchRef} type="search" placeholder="Search by name or ticket ID…" value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-slate-800 text-white border border-slate-700 rounded-xl px-4 py-3 text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#7E57C2]/60 focus:border-[#7E57C2] transition-colors"
          autoFocus aria-label="Search attendee by name" />
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {cacheLoading && (
          <div className="flex items-center justify-center py-10 gap-3 text-slate-400">
            <div className="w-5 h-5 border-2 border-slate-600 border-t-[#7E57C2] rounded-full animate-spin" />
            <span className="text-sm">Loading attendees…</span>
          </div>
        )}

        {cacheError && (
          <p className="text-red-400 text-sm text-center py-4">Failed to load attendees: {cacheError}</p>
        )}

        {!cacheLoading && searchTerm.length >= 2 && results.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <p className="text-slate-300 text-sm font-medium">Not finding the guest?</p>
            <p className="text-slate-500 text-xs">Escalate to host.</p>
          </div>
        )}

        {results.map((guest) => {
          const isCheckedIn = Boolean(guest.checked_in_at);
          const showDesignation = (nameCounts[guest.attendee_name] || 0) > 1;

          return (
            <button key={guest.ticket_id} type="button" disabled={isCheckedIn}
              onClick={() => { setSelectedGuest(guest); setLast4Input(''); setIdType(''); setCardError(''); }}
              className={`w-full text-left bg-slate-800 rounded-xl border px-4 py-3 transition-colors ${
                isCheckedIn ? 'border-slate-700 opacity-60 cursor-default' : 'border-slate-700 hover:border-[#7E57C2]/50 cursor-pointer'
              }`}>
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-200 text-sm truncate">{guest.attendee_name || '—'}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="px-2 py-0.5 bg-slate-700 text-slate-400 text-[10px] uppercase font-bold rounded">
                      {guest.ticket_type || 'General'}
                    </span>
                    {guest.company && <span className="text-slate-500 text-[11px]">{guest.company}</span>}
                    {showDesignation && guest.designation && (
                      <span className="text-slate-500 text-[11px] italic">· {guest.designation}</span>
                    )}
                  </div>
                </div>
                {isCheckedIn ? (
                  <span className="shrink-0 ml-2 px-2 py-0.5 bg-emerald-500/15 text-emerald-400 text-[10px] font-bold rounded-full border border-emerald-500/30">
                    Done
                  </span>
                ) : (
                  <svg className="shrink-0 ml-2 text-slate-600" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default ManualCheckIn;
