import { useState, useMemo, useCallback } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Mock attendee list — simulates the pre-cached Supabase attendee data.
// Includes multiple "Rahul Sharma" entries with different companies to test
// the disambiguation flow.
// ─────────────────────────────────────────────────────────────────────────────
const MOCK_ATTENDEES = [
  { id: '1',  name: 'Rahul Sharma',   ticket_type: 'VIP',       company: 'Infosys Ltd.',       designation: 'Senior Engineer',    ticket_id: 'EA-TCS-2026-110087' },
  { id: '2',  name: 'Rahul Sharma',   ticket_type: 'General',   company: 'Wipro Technologies', designation: 'Product Manager',    ticket_id: 'EA-TCS-2026-220034' },
  { id: '3',  name: 'Rahul Sharma',   ticket_type: 'Speaker',   company: 'Google India',       designation: 'Staff Engineer',     ticket_id: 'EA-TCS-2026-330091' },
  { id: '4',  name: 'Priya Kapoor',   ticket_type: 'VIP',       company: 'Tata Consultancy',   designation: 'CTO',                ticket_id: 'EA-TCS-2026-440012' },
  { id: '5',  name: 'Amit Verma',     ticket_type: 'General',   company: '',                   designation: '',                   ticket_id: 'EA-TCS-2026-550067' },
  { id: '6',  name: 'Sneha Mehta',    ticket_type: 'Workshop',  company: 'Amazon India',       designation: 'UX Designer',        ticket_id: 'EA-TCS-2026-660023' },
  { id: '7',  name: 'Vikram Singh',   ticket_type: 'General',   company: 'HCL Technologies',   designation: 'Business Analyst',   ticket_id: 'EA-TCS-2026-770045' },
  { id: '8',  name: 'Ananya Bose',    ticket_type: 'VIP',       company: 'Flipkart',           designation: 'Engineering Manager',ticket_id: 'EA-TCS-2026-880099' },
  { id: '9',  name: 'Karthik Nair',   ticket_type: 'Speaker',   company: 'Microsoft India',    designation: 'Principal Engineer', ticket_id: 'EA-TCS-2026-990014' },
  { id: '10', name: 'Deepa Pillai',   ticket_type: 'Workshop',  company: 'Zomato',             designation: 'Data Scientist',     ticket_id: 'EA-TCS-2026-100058' },
];

// ─────────────────────────────────────────────────────────────────────────────
// ID document types for Mode B dropdown
// ─────────────────────────────────────────────────────────────────────────────
const ID_TYPES = ['PAN', 'Driving Licence', 'Passport', 'Other', 'Permitted ID'];

// ─────────────────────────────────────────────────────────────────────────────
// Fuzzy-ish search: normalises both sides and checks if every word in the
// query appears somewhere in the target string (order-independent).
// ─────────────────────────────────────────────────────────────────────────────
function fuzzyMatch(query, target) {
  const q = query.toLowerCase().trim();
  const t = target.toLowerCase();
  return q.split(/\s+/).every((word) => t.includes(word));
}

// ─────────────────────────────────────────────────────────────────────────────
// Ticket-type badge colour map
// ─────────────────────────────────────────────────────────────────────────────
const BADGE_COLOURS = {
  VIP:      'bg-[#7E57C2]/20 text-[#c4b5fd] border border-[#7E57C2]/30',
  Speaker:  'bg-amber-500/15 text-amber-300 border border-amber-500/25',
  Workshop: 'bg-sky-500/15 text-sky-300 border border-sky-500/25',
  General:  'bg-slate-700 text-slate-300 border border-slate-600',
};
const badgeClass = (type) => BADGE_COLOURS[type] ?? BADGE_COLOURS.General;

// ─────────────────────────────────────────────────────────────────────────────
// ManualCheckIn
//
// Props:
//   onClose()  — called when the user taps the ✕ button to return to scanner
// ─────────────────────────────────────────────────────────────────────────────
export default function ManualCheckIn({ onClose }) {
  // ── Step state ─────────────────────────────────────────────────────────
  // 'search'  → Step 1: name search
  // 'detail'  → Step 2: attendee detail + mode picker
  // 'modeA'   → Step 3a: ticket-ID last-4 verification
  // 'modeB'   → Step 3b: ID-document type selection
  const [step, setStep] = useState('search');

  // ── Search ────────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const searchResults = useMemo(() => {
    if (searchQuery.trim().length < 2) return [];
    return MOCK_ATTENDEES.filter((a) => fuzzyMatch(searchQuery, a.name));
  }, [searchQuery]);

  // ── Selection ─────────────────────────────────────────────────────────
  const [selectedAttendee, setSelectedAttendee] = useState(null);

  // ── Mode A: last-4 input ──────────────────────────────────────────────
  const [last4Input, setLast4Input] = useState('');

  // ── Mode B: ID type dropdown ──────────────────────────────────────────
  const [selectedIdType, setSelectedIdType] = useState('');

  // ── Navigation helpers ────────────────────────────────────────────────
  const selectAttendee = useCallback((attendee) => {
    setSelectedAttendee(attendee);
    setLast4Input('');
    setSelectedIdType('');
    setStep('detail');
  }, []);

  const backToSearch = useCallback(() => {
    setStep('search');
    setSelectedAttendee(null);
    setLast4Input('');
    setSelectedIdType('');
  }, []);

  const pickMode = useCallback((mode) => setStep(mode), []);

  // ── Handoff — calls the global ScanResult handler built in Slice A2 ───
  const submitCheckIn = useCallback(() => {
    if (!selectedAttendee) return;
    const payload = JSON.stringify({
      qr_token: `manual:${selectedAttendee.ticket_id}`,
      method:   step === 'modeA' ? 'ticket_id' : 'id_document',
      id_type:  step === 'modeB' ? selectedIdType : null,
    });
    if (typeof window.handlePwaScan === 'function') {
      window.handlePwaScan(payload);
    }
    // Return to scanner after handing off
    if (onClose) onClose();
  }, [selectedAttendee, step, selectedIdType, onClose]);

  // ── Derived validation ────────────────────────────────────────────────
  const expectedLast4 = selectedAttendee?.ticket_id.slice(-4) ?? '';
  const modeAReady    = last4Input === expectedLast4;
  const modeBReady    = selectedIdType !== '';

  // ─────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-slate-900 text-white">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-3">
          {step !== 'search' && (
            <button
              type="button"
              onClick={step === 'detail' ? backToSearch : () => setStep('detail')}
              aria-label="Go back"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
            >
              {/* Chevron left */}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
          )}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500 leading-none mb-0.5">
              Manual Check-In
            </p>
            <h1 className="text-sm font-bold text-slate-200 leading-none">
              {step === 'search' && 'Find Guest'}
              {step === 'detail' && 'Confirm Identity'}
              {step === 'modeA'  && 'Verify Ticket ID'}
              {step === 'modeB'  && 'Verify ID Document'}
            </h1>
          </div>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close manual check-in"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </header>

      {/* ── Body ───────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-5 pt-5 pb-8">

        {/* ═══════════════════════════════════════════════════════════
            STEP 1 — Search
        ═══════════════════════════════════════════════════════════ */}
        {step === 'search' && (
          <div className="flex flex-col gap-5">

            {/* Search input */}
            <div className="relative">
              <svg
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
                width="18" height="18" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name…"
                autoComplete="off"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-10 pr-4 py-3.5
                           text-white placeholder:text-slate-500 text-sm
                           focus:outline-none focus:ring-2 focus:ring-[#7E57C2]/60 focus:border-[#7E57C2]
                           transition-colors"
                aria-label="Search attendee by name"
              />
            </div>

            {/* Hint — shown before 2 characters */}
            {searchQuery.trim().length < 2 && (
              <p className="text-center text-slate-500 text-sm mt-4">
                Type at least 2 characters to search.
              </p>
            )}

            {/* Results list */}
            {searchQuery.trim().length >= 2 && searchResults.length > 0 && (
              <ul className="flex flex-col gap-2" role="listbox" aria-label="Search results">
                {searchResults.map((attendee) => (
                  <li key={attendee.id} role="option" aria-selected="false">
                    <button
                      type="button"
                      onClick={() => selectAttendee(attendee)}
                      className="w-full text-left bg-slate-800 border border-slate-700 rounded-xl px-4 py-3.5
                                 hover:bg-slate-700 hover:border-[#7E57C2]/50 active:scale-[0.98]
                                 transition-all focus:outline-none focus:ring-2 focus:ring-[#7E57C2]/60"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-white text-sm truncate">{attendee.name}</p>
                          {(attendee.company || attendee.designation) && (
                            <p className="text-slate-400 text-xs mt-0.5 truncate">
                              {[attendee.designation, attendee.company].filter(Boolean).join(' · ')}
                            </p>
                          )}
                        </div>
                        <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full mt-0.5 ${badgeClass(attendee.ticket_type)}`}>
                          {attendee.ticket_type}
                        </span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* Empty state */}
            {searchQuery.trim().length >= 2 && searchResults.length === 0 && (
              <div className="flex flex-col items-center gap-3 pt-8 text-center">
                <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
                    className="text-slate-500">
                    <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                    <path d="M8 11h6M11 8v6" />
                  </svg>
                </div>
                <p className="text-slate-400 text-sm font-medium">No guests found for "{searchQuery}"</p>
                <p className="text-slate-500 text-xs max-w-[240px]">
                  Not finding the guest?{' '}
                  <span className="text-[#c4b5fd] font-semibold">Escalate to host.</span>
                </p>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════
            STEP 2 — Detail view + mode picker
        ═══════════════════════════════════════════════════════════ */}
        {step === 'detail' && selectedAttendee && (
          <div className="flex flex-col gap-5">

            {/* Attendee card */}
            <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="w-11 h-11 rounded-full bg-[#7E57C2]/20 flex items-center justify-center shrink-0">
                  <span className="text-[#c4b5fd] font-bold text-base">
                    {selectedAttendee.name.charAt(0)}
                  </span>
                </div>
                <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full mt-1 ${badgeClass(selectedAttendee.ticket_type)}`}>
                  {selectedAttendee.ticket_type}
                </span>
              </div>
              <h2 className="text-xl font-black text-white mb-1">{selectedAttendee.name}</h2>
              {selectedAttendee.designation && (
                <p className="text-slate-400 text-sm">{selectedAttendee.designation}</p>
              )}
              {selectedAttendee.company && (
                <p className="text-slate-500 text-xs mt-0.5">{selectedAttendee.company}</p>
              )}
              <div className="mt-4 pt-4 border-t border-slate-700">
                <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Ticket ID</p>
                <p className="font-mono text-slate-300 text-sm tracking-wide">{selectedAttendee.ticket_id}</p>
              </div>
            </div>

            {/* Mode picker label */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3">
                Choose verification method
              </p>

              {/* Mode A */}
              <button
                type="button"
                onClick={() => pickMode('modeA')}
                className="w-full flex items-center gap-4 bg-slate-800 border border-slate-700 rounded-xl px-4 py-4 mb-2
                           hover:bg-slate-700 hover:border-[#7E57C2]/50 active:scale-[0.98]
                           transition-all focus:outline-none focus:ring-2 focus:ring-[#7E57C2]/60 text-left"
              >
                <div className="w-9 h-9 rounded-lg bg-[#7E57C2]/15 flex items-center justify-center shrink-0">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                    stroke="#c4b5fd" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="5" width="20" height="14" rx="2" />
                    <path d="M2 10h20" />
                  </svg>
                </div>
                <div>
                  <p className="font-semibold text-white text-sm">Verify with Ticket ID</p>
                  <p className="text-slate-400 text-xs mt-0.5">Attendee confirms last 4 characters</p>
                </div>
                <svg className="ml-auto text-slate-500" width="16" height="16" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>

              {/* Mode B */}
              <button
                type="button"
                onClick={() => pickMode('modeB')}
                className="w-full flex items-center gap-4 bg-slate-800 border border-slate-700 rounded-xl px-4 py-4
                           hover:bg-slate-700 hover:border-[#7E57C2]/50 active:scale-[0.98]
                           transition-all focus:outline-none focus:ring-2 focus:ring-[#7E57C2]/60 text-left"
              >
                <div className="w-9 h-9 rounded-lg bg-[#7E57C2]/15 flex items-center justify-center shrink-0">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                    stroke="#c4b5fd" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 7H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z" />
                    <circle cx="12" cy="12" r="2" />
                  </svg>
                </div>
                <div>
                  <p className="font-semibold text-white text-sm">Verify with ID Document</p>
                  <p className="text-slate-400 text-xs mt-0.5">Record document type only — no number</p>
                </div>
                <svg className="ml-auto text-slate-500" width="16" height="16" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════
            STEP 3A — Mode A: last-4 ticket ID verification
        ═══════════════════════════════════════════════════════════ */}
        {step === 'modeA' && selectedAttendee && (
          <div className="flex flex-col gap-6">

            {/* Attendee summary chip */}
            <div className="flex items-center gap-3 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3">
              <div className="w-8 h-8 rounded-full bg-[#7E57C2]/20 flex items-center justify-center shrink-0">
                <span className="text-[#c4b5fd] font-bold text-xs">{selectedAttendee.name.charAt(0)}</span>
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-white text-sm truncate">{selectedAttendee.name}</p>
                {selectedAttendee.company && (
                  <p className="text-slate-400 text-xs truncate">{selectedAttendee.company}</p>
                )}
              </div>
            </div>

            {/* Instruction */}
            <div className="text-center">
              <p className="text-slate-300 text-sm leading-relaxed">
                Ask the attendee to confirm the{' '}
                <span className="text-white font-bold">last 4 characters</span>{' '}
                of their ticket ID printed on their confirmation email.
              </p>
            </div>

            {/* Input */}
            <div>
              <label htmlFor="last4" className="block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">
                Last 4 characters
              </label>
              <input
                id="last4"
                type="text"
                maxLength={4}
                value={last4Input}
                onChange={(e) => setLast4Input(e.target.value.toUpperCase())}
                placeholder="e.g. 0087"
                autoComplete="off"
                className={`w-full bg-slate-800 border rounded-xl px-4 py-4 text-center
                            font-mono text-2xl tracking-[0.3em] text-white
                            placeholder:text-slate-600 placeholder:text-base placeholder:tracking-normal
                            focus:outline-none focus:ring-2 transition-colors ${
                              last4Input.length === 4
                                ? modeAReady
                                  ? 'border-emerald-500 focus:ring-emerald-500/40'
                                  : 'border-red-500 focus:ring-red-500/40'
                                : 'border-slate-700 focus:ring-[#7E57C2]/60 focus:border-[#7E57C2]'
                            }`}
                aria-label="Enter last 4 characters of ticket ID"
                aria-invalid={last4Input.length === 4 && !modeAReady}
              />
              {last4Input.length === 4 && !modeAReady && (
                <p className="text-red-400 text-xs mt-2 text-center">
                  Doesn't match. Ask the attendee to check again.
                </p>
              )}
            </div>

            {/* Submit */}
            <button
              type="button"
              onClick={submitCheckIn}
              disabled={!modeAReady}
              className={`w-full py-4 rounded-2xl font-bold text-base transition-all ${
                modeAReady
                  ? 'bg-[#7E57C2] text-white hover:bg-[#6a48a8] active:scale-[0.97] shadow-lg shadow-[#7E57C2]/25'
                  : 'bg-slate-700 text-slate-500 cursor-not-allowed'
              }`}
              aria-disabled={!modeAReady}
            >
              Check In
            </button>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════
            STEP 3B — Mode B: ID document type selection
        ═══════════════════════════════════════════════════════════ */}
        {step === 'modeB' && selectedAttendee && (
          <div className="flex flex-col gap-6">

            {/* Attendee summary chip */}
            <div className="flex items-center gap-3 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3">
              <div className="w-8 h-8 rounded-full bg-[#7E57C2]/20 flex items-center justify-center shrink-0">
                <span className="text-[#c4b5fd] font-bold text-xs">{selectedAttendee.name.charAt(0)}</span>
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-white text-sm truncate">{selectedAttendee.name}</p>
                {selectedAttendee.company && (
                  <p className="text-slate-400 text-xs truncate">{selectedAttendee.company}</p>
                )}
              </div>
            </div>

            {/* Instruction */}
            <div className="text-center">
              <p className="text-slate-300 text-sm leading-relaxed">
                Ask to see a valid photo ID. Select the document type below.{' '}
                <span className="text-slate-500">Do not record the ID number.</span>
              </p>
            </div>

            {/* Dropdown */}
            <div>
              <label htmlFor="idType" className="block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">
                Document type
              </label>
              <div className="relative">
                <select
                  id="idType"
                  value={selectedIdType}
                  onChange={(e) => setSelectedIdType(e.target.value)}
                  className={`w-full appearance-none bg-slate-800 border rounded-xl px-4 py-4 text-sm
                              focus:outline-none focus:ring-2 transition-colors cursor-pointer ${
                                selectedIdType
                                  ? 'border-[#7E57C2] text-white focus:ring-[#7E57C2]/60'
                                  : 'border-slate-700 text-slate-500 focus:ring-[#7E57C2]/60 focus:border-[#7E57C2]'
                              }`}
                  aria-label="Select ID document type"
                >
                  <option value="" disabled>Select document type…</option>
                  {ID_TYPES.map((type) => (
                    <option key={type} value={type} className="bg-slate-800 text-white">{type}</option>
                  ))}
                </select>
                {/* Custom chevron */}
                <svg
                  className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400"
                  width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </div>
            </div>

            {/* Submit */}
            <button
              type="button"
              onClick={submitCheckIn}
              disabled={!modeBReady}
              className={`w-full py-4 rounded-2xl font-bold text-base transition-all ${
                modeBReady
                  ? 'bg-[#7E57C2] text-white hover:bg-[#6a48a8] active:scale-[0.97] shadow-lg shadow-[#7E57C2]/25'
                  : 'bg-slate-700 text-slate-500 cursor-not-allowed'
              }`}
              aria-disabled={!modeBReady}
            >
              Confirm Check-In
            </button>
          </div>
        )}

      </div>{/* end body */}
    </div>
  );
}
