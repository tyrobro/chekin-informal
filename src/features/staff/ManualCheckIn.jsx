import { useState, useEffect, useCallback } from 'react';
import NoSearchResults from './states/NoSearchResults.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// ID document options for Mode B
// ─────────────────────────────────────────────────────────────────────────────
const ID_DOC_OPTIONS = ['Aadhaar', 'PAN', 'Driving Licence', 'Passport', 'Other'];

// ─────────────────────────────────────────────────────────────────────────────
// ManualCheckIn
//
// Props:
//   eventId    — Supabase event identifier
//   gateId     — gate label passed to the DB write
//   staffName  — staff display name passed to the DB write
//   onClose()  — callback to return to the scanner
// ─────────────────────────────────────────────────────────────────────────────
function ManualCheckIn({ eventId, gateId, staffName, onClose }) {
  // ── Search state ──────────────────────────────────────────────────────────
  const [searchTerm,  setSearchTerm]  = useState('');
  const [results,     setResults]     = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);

  // ── Expand / verification state ───────────────────────────────────────────
  // Only one card can be expanded at a time.
  const [expandedGuestId, setExpandedGuestId] = useState(null);
  // Per-card: { [ticket_id]: string } — typed last-4 input for Mode A
  const [last4Inputs,     setLast4Inputs]     = useState({});
  // Per-card: { [ticket_id]: string } — selected ID doc type for Mode B
  const [idTypeInputs,    setIdTypeInputs]    = useState({});
  // Per-card: { [ticket_id]: string } — inline error messages
  const [cardErrors,      setCardErrors]      = useState({});

  // ── Check-in processing ───────────────────────────────────────────────────
  const [processingId, setProcessingId] = useState(null);

  const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY;

  // ── Helpers ───────────────────────────────────────────────────────────────
  const setCardError = useCallback((ticketId, msg) => {
    setCardErrors((prev) => ({ ...prev, [ticketId]: msg }));
  }, []);

  const clearCardError = useCallback((ticketId) => {
    setCardErrors((prev) => {
      const next = { ...prev };
      delete next[ticketId];
      return next;
    });
  }, []);

  const toggleExpand = useCallback((ticketId) => {
    setExpandedGuestId((prev) => (prev === ticketId ? null : ticketId));
    clearCardError(ticketId);
  }, [clearCardError]);

  // ── Search (400ms debounce, 2-char minimum) ───────────────────────────────
  useEffect(() => {
    if (!searchTerm || searchTerm.length < 2) {
      setResults([]);
      return;
    }

    const timerId = setTimeout(async () => {
      setIsSearching(true);
      setSearchError(null);

      try {
        const safeQuery = encodeURIComponent(`%${searchTerm}%`);

        const endpoint =
          `${supabaseUrl}/rest/v1/event_attendees` +
          `?event_id=eq.${eventId}` +
          `&attendee_name=ilike.${safeQuery}` +
          `&select=ticket_id,attendee_name,ticket_type,checked_in_at` +
          `&limit=20`;

        const response = await fetch(endpoint, {
          headers: {
            apikey:          supabaseAnon,
            Authorization:   `Bearer ${supabaseAnon}`,
            'Content-Type':  'application/json',
          },
        });

        if (!response.ok) throw new Error('Search failed');

        const data = await response.json();
        setResults(data || []);
        // Collapse any previously expanded card when results refresh
        setExpandedGuestId(null);
      } catch (err) {
        console.error('Search error:', err);
        setSearchError('Failed to fetch guest list. Please try again.');
      } finally {
        setIsSearching(false);
      }
    }, 400);

    return () => clearTimeout(timerId);
  }, [searchTerm, eventId, supabaseUrl, supabaseAnon]);

  // ── Dual-write check-in ───────────────────────────────────────────────────
  //
  // method:  'manual_name_ticket_id'  (Mode A)
  //          'manual_name_id_doc'     (Mode B)
  // idType:  document type string for Mode B, or undefined for Mode A
  //
  // CRITICAL: The PATCH uses Prefer: return=representation.
  // If the database silently drops the write (RLS policy blocks it), Supabase
  // returns an empty array instead of the updated row. We detect that and throw
  // so the UI does NOT turn green on a silent failure.
  const handleCheckIn = useCallback(async ({ ticketId, method, idType }) => {
    setProcessingId(ticketId);
    clearCardError(ticketId);

    const now          = new Date().toISOString();
    const clientScanId = crypto.randomUUID();

    try {
      // Build PATCH body — include metadata for Mode B if idType is present
      const patchBody = {
        checked_in_at:   now,
        checked_in_gate: gateId     || 'unknown',
        checked_in_by:   staffName  || 'unknown',
        checkin_method:  method,
        ...(idType ? { metadata: JSON.stringify({ id_type: idType }) } : {}),
      };

      // 1. UPDATE event_attendees — Prefer: return=representation required so
      //    we can detect a silent RLS block (empty array = blocked write).
      const updateAttendeeReq = fetch(
        `${supabaseUrl}/rest/v1/event_attendees?ticket_id=eq.${encodeURIComponent(ticketId)}`,
        {
          method: 'PATCH',
          headers: {
            apikey:          supabaseAnon,
            Authorization:   `Bearer ${supabaseAnon}`,
            'Content-Type':  'application/json',
            Prefer:          'return=representation',   // ← required for RLS detection
          },
          body: JSON.stringify(patchBody),
        },
      );

      // 2. INSERT audit log into checkin_events (unconditional)
      const insertLogReq = fetch(`${supabaseUrl}/rest/v1/checkin_events`, {
        method: 'POST',
        headers: {
          apikey:          supabaseAnon,
          Authorization:   `Bearer ${supabaseAnon}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          ticket_id:      ticketId,
          event_id:       eventId,
          gate:           gateId    || 'unknown',
          staff_user:     staffName || 'unknown',
          result:         'allowed',
          scanned_at:     now,
          client_scan_id: clientScanId,
          checkin_method: method,
          ...(idType ? { metadata: JSON.stringify({ id_type: idType }) } : {}),
        }),
      });

      // Run both requests simultaneously
      const [updateRes, logRes] = await Promise.all([updateAttendeeReq, insertLogReq]);

      // ── HTTP-level error check ──────────────────────────────────────────
      if (!updateRes.ok) {
        const detail = await updateRes.text().catch(() => '');
        throw new Error(`Attendee update failed (HTTP ${updateRes.status}). ${detail}`.trim());
      }
      if (!logRes.ok) {
        // Audit log failure is non-fatal for the UI but we still want to know
        console.warn('[ManualCheckIn] Audit log insert failed — HTTP', logRes.status);
      }

      // ── Silent RLS failure detection ────────────────────────────────────
      // With Prefer: return=representation, a successful write returns the
      // updated row(s). An empty array means RLS blocked the write without
      // an HTTP error code — the most dangerous silent failure mode.
      const updatedRows = await updateRes.json();
      if (!Array.isArray(updatedRows) || updatedRows.length === 0) {
        throw new Error(
          'Database blocked the update. Check RLS policies for UPDATE.',
        );
      }

      // ── Success: collapse card + mark as checked-in in local state ──────
      setResults((prev) =>
        prev.map((g) =>
          g.ticket_id === ticketId ? { ...g, checked_in_at: now } : g,
        ),
      );
      setExpandedGuestId(null);

    } catch (err) {
      console.error('[ManualCheckIn] Check-in error:', err);
      setCardError(ticketId, err.message || 'Check-in failed. Please try again.');
    } finally {
      setProcessingId(null);
    }
  }, [gateId, staffName, eventId, supabaseUrl, supabaseAnon, clearCardError, setCardError]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="w-full h-full flex flex-col bg-slate-900 text-white">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 shrink-0">
        <h2 className="text-base font-bold tracking-wide">Manual Search</h2>
        <button
          type="button"
          onClick={onClose}
          className="p-2 text-slate-400 hover:text-white rounded-full bg-slate-800 transition-colors"
          aria-label="Close manual check-in"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>

      {/* Search input */}
      <div className="px-4 pt-4 pb-3 border-b border-slate-800 shrink-0 relative">
        <input
          type="search"
          placeholder="Search by name..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-slate-800 text-white border border-slate-700 rounded-xl px-4 py-3
                     text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2
                     focus:ring-[#7E57C2]/60 focus:border-[#7E57C2] transition-colors"
          autoFocus
          aria-label="Search attendee by name"
        />
        {isSearching && (
          <div className="absolute right-8 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-[#7E57C2]/30 border-t-[#7E57C2] rounded-full animate-spin" />
        )}
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">

        {/* Search-level error */}
        {searchError && (
          <p className="text-red-400 text-sm text-center py-4">{searchError}</p>
        )}

        {/* Empty state — uses reusable NoSearchResults component */}
        {!isSearching && searchTerm.length >= 2 && results.length === 0 && !searchError && (
          <NoSearchResults query={searchTerm} />
        )}

        {/* Guest cards */}
        {results.map((guest) => {
          const isExpanded   = expandedGuestId === guest.ticket_id;
          const isCheckedIn  = Boolean(guest.checked_in_at);
          const isProcessing = processingId === guest.ticket_id;
          const cardError    = cardErrors[guest.ticket_id];

          // ── Mode A values ──
          const last4Typed    = (last4Inputs[guest.ticket_id]  ?? '').toUpperCase();
          const expectedLast4 = guest.ticket_id.slice(-4).toUpperCase();
          const modeAReady    = last4Typed === expectedLast4;

          // ── Mode B values ──
          const selectedIdType = idTypeInputs[guest.ticket_id] ?? '';
          const modeBReady     = selectedIdType !== '';

          return (
            <div
              key={guest.ticket_id}
              className={`bg-slate-800 rounded-xl border transition-colors ${
                isExpanded ? 'border-[#7E57C2]/60' : 'border-slate-700'
              }`}
            >
              {/* Card header row — always visible */}
              <div
                className={`flex items-center justify-between px-4 py-3 ${
                  !isCheckedIn ? 'cursor-pointer' : 'cursor-default'
                }`}
                onClick={() => !isCheckedIn && toggleExpand(guest.ticket_id)}
                role={!isCheckedIn ? 'button' : undefined}
                aria-expanded={isExpanded}
                tabIndex={!isCheckedIn ? 0 : -1}
                onKeyDown={(e) => {
                  if (!isCheckedIn && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    toggleExpand(guest.ticket_id);
                  }
                }}
              >
                <div className="min-w-0">
                  <p className="font-semibold text-slate-200 text-sm truncate">
                    {guest.attendee_name}
                  </p>
                  <span className="inline-block mt-1 px-2 py-0.5 bg-slate-700 text-slate-400 text-[10px] uppercase font-bold rounded">
                    {guest.ticket_type || 'General'}
                  </span>
                </div>

                {isCheckedIn ? (
                  <span className="shrink-0 ml-3 px-3 py-1 bg-emerald-500/15 text-emerald-400 text-xs font-bold rounded-full border border-emerald-500/30">
                    Checked In
                  </span>
                ) : (
                  <svg
                    className={`shrink-0 ml-3 text-slate-500 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                    width="16" height="16" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M6 9l6 6 6-6"/>
                  </svg>
                )}
              </div>

              {/* Expanded verification panel */}
              {isExpanded && !isCheckedIn && (
                <div className="px-4 pb-4 space-y-4 border-t border-slate-700/50 pt-3">

                  {/* Per-card error */}
                  {cardError && (
                    <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/25 rounded-lg px-3 py-2">
                      <svg className="shrink-0 mt-0.5 text-red-400" width="14" height="14" viewBox="0 0 24 24"
                        fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/>
                      </svg>
                      <p className="text-red-400 text-xs leading-relaxed">{cardError}</p>
                    </div>
                  )}

                  {/* ── Mode A: Ticket ID verification ── */}
                  <div className="space-y-2">
                    <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
                      Mode A — Verify Ticket ID
                    </p>
                    <input
                      type="text"
                      maxLength={4}
                      value={last4Inputs[guest.ticket_id] ?? ''}
                      onChange={(e) =>
                        setLast4Inputs((prev) => ({
                          ...prev,
                          [guest.ticket_id]: e.target.value,
                        }))
                      }
                      placeholder="Last 4 chars of Ticket ID"
                      className={`w-full bg-slate-900 border rounded-lg px-3 py-2.5 text-sm font-mono
                                  text-center tracking-widest text-white placeholder:text-slate-600
                                  placeholder:text-xs placeholder:tracking-normal
                                  focus:outline-none focus:ring-2 transition-colors ${
                                    last4Typed.length === 4
                                      ? modeAReady
                                        ? 'border-emerald-500 focus:ring-emerald-500/30'
                                        : 'border-red-500 focus:ring-red-500/30'
                                      : 'border-slate-600 focus:ring-[#7E57C2]/40 focus:border-[#7E57C2]'
                                  }`}
                      aria-label="Enter last 4 characters of ticket ID"
                    />
                    {last4Typed.length === 4 && !modeAReady && (
                      <p className="text-red-400 text-[11px] text-center">
                        Doesn't match — ask the guest to check again.
                      </p>
                    )}
                    <button
                      type="button"
                      disabled={!modeAReady || isProcessing}
                      onClick={() =>
                        handleCheckIn({
                          ticketId: guest.ticket_id,
                          method:   'manual_name_ticket_id',
                        })
                      }
                      className={`w-full py-2.5 rounded-xl text-sm font-bold transition-all ${
                        modeAReady && !isProcessing
                          ? 'bg-[#7E57C2] text-white hover:bg-[#6a48a8] active:scale-[0.97]'
                          : 'bg-slate-700 text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      {isProcessing ? 'Processing…' : 'Verify & Check In'}
                    </button>
                  </div>

                  {/* Divider */}
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-px bg-slate-700" />
                    <span className="text-[10px] uppercase tracking-widest text-slate-600 font-bold">or</span>
                    <div className="flex-1 h-px bg-slate-700" />
                  </div>

                  {/* ── Mode B: ID document verification ── */}
                  <div className="space-y-2">
                    <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
                      Mode B — Verify ID Document
                    </p>
                    <div className="relative">
                      <select
                        value={selectedIdType}
                        onChange={(e) =>
                          setIdTypeInputs((prev) => ({
                            ...prev,
                            [guest.ticket_id]: e.target.value,
                          }))
                        }
                        className={`w-full appearance-none bg-slate-900 border rounded-lg px-3 py-2.5 text-sm
                                    focus:outline-none focus:ring-2 transition-colors cursor-pointer ${
                                      selectedIdType
                                        ? 'border-[#7E57C2] text-white focus:ring-[#7E57C2]/40'
                                        : 'border-slate-600 text-slate-500 focus:ring-[#7E57C2]/40 focus:border-[#7E57C2]'
                                    }`}
                        aria-label="Select ID document type"
                      >
                        <option value="" disabled>Select document type…</option>
                        {ID_DOC_OPTIONS.map((opt) => (
                          <option key={opt} value={opt} className="bg-slate-800 text-white">{opt}</option>
                        ))}
                      </select>
                      <svg
                        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"
                        width="14" height="14" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M6 9l6 6 6-6"/>
                      </svg>
                    </div>
                    <button
                      type="button"
                      disabled={!modeBReady || isProcessing}
                      onClick={() =>
                        handleCheckIn({
                          ticketId: guest.ticket_id,
                          method:   'manual_name_id_doc',
                          idType:   selectedIdType,
                        })
                      }
                      className={`w-full py-2.5 rounded-xl text-sm font-bold transition-all ${
                        modeBReady && !isProcessing
                          ? 'bg-[#7E57C2] text-white hover:bg-[#6a48a8] active:scale-[0.97]'
                          : 'bg-slate-700 text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      {isProcessing ? 'Processing…' : 'Confirm — ID Verified'}
                    </button>
                  </div>

                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default ManualCheckIn;
