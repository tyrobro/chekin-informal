import { useState, useEffect } from 'react';

// Added gateId and staffName to props
function ManualCheckIn({ eventId, gateId, staffName, onClose }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState(null);
  
  // Track which specific ticket is currently being checked in
  const [processingId, setProcessingId] = useState(null);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY;

  // ── Search Logic ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!searchTerm || searchTerm.length < 2) {
      setResults([]);
      return;
    }

    const timerId = setTimeout(async () => {
      setIsSearching(true);
      setError(null);

      try {
        const safeQuery = encodeURIComponent(`%${searchTerm}%`);

        // Added checked_in_at to the select query
        const endpoint = 
          `${supabaseUrl}/rest/v1/event_attendees` + 
          `?event_id=eq.${eventId}` +
          `&attendee_name=ilike.${safeQuery}` +
          `&select=ticket_id,attendee_name,ticket_type,checked_in_at` + 
          `&limit=20`;

        const response = await fetch(endpoint, {
          headers: {
            'apikey': supabaseAnon,
            'Authorization': `Bearer ${supabaseAnon}`,
            'Content-Type': 'application/json',
          }
        });

        if (!response.ok) throw new Error("Search failed");
        
        const data = await response.json();
        setResults(data || []);
      } catch (err) {
        console.error("Search error:", err);
        setError("Failed to fetch guest list. Please try again.");
      } finally {
        setIsSearching(false);
      }
    }, 400);

    return () => clearTimeout(timerId);
  }, [searchTerm, eventId, supabaseUrl, supabaseAnon]);

  // ── Dual-Write Check-In Logic ─────────────────────────────────────────────
  const handleCheckIn = async (ticketId) => {
    setProcessingId(ticketId);
    const now = new Date().toISOString();
    const clientScanId = crypto.randomUUID(); // Generates a unique ID for the audit log

    try {
      // 1. UPDATE the attendee record
      const updateAttendeeReq = fetch(`${supabaseUrl}/rest/v1/event_attendees?ticket_id=eq.${ticketId}`, {
        method: 'PATCH',
        headers: {
          'apikey': supabaseAnon,
          'Authorization': `Bearer ${supabaseAnon}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          checked_in_at: now,
          checked_in_gate: gateId || 'unknown',
          checked_in_by: staffName || 'unknown',
          checkin_method: 'manual'
        })
      });

      // 2. INSERT the audit log into checkin_events
      const insertLogReq = fetch(`${supabaseUrl}/rest/v1/checkin_events`, {
        method: 'POST',
        headers: {
          'apikey': supabaseAnon,
          'Authorization': `Bearer ${supabaseAnon}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ticket_id: ticketId,
          event_id: eventId,
          gate: gateId || 'unknown',
          staff_user: staffName || 'unknown',
          result: 'allowed',
          scanned_at: now,
          client_scan_id: clientScanId
        })
      });

      // Run both network requests simultaneously for speed
      const [updateRes, logRes] = await Promise.all([updateAttendeeReq, insertLogReq]);

      if (!updateRes.ok || !logRes.ok) {
        throw new Error("Failed to write check-in data to the database.");
      }

      // 3. Update the local UI instantly so the button turns green
      setResults((prevResults) => 
        prevResults.map((guest) => 
          guest.ticket_id === ticketId 
            ? { ...guest, checked_in_at: now } 
            : guest
        )
      );

    } catch (err) {
      console.error("Check-in error:", err);
      alert("Check-in failed. Please check your connection and try again.");
    } finally {
      setProcessingId(null);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="w-full h-full flex flex-col bg-slate-900 text-white relative">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-800">
        <h2 className="text-lg font-bold">Manual Search</h2>
        <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-full bg-slate-800">
          ✕
        </button>
      </div>

      {/* Search Input */}
      <div className="p-4 border-b border-slate-800 relative">
        <input
          type="text"
          placeholder="Search by name..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-slate-800 text-white border border-slate-700 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#7E57C2]"
          autoFocus
        />
        {isSearching && (
          <div className="absolute right-8 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-[#7E57C2]/30 border-t-[#7E57C2] rounded-full animate-spin"></div>
        )}
      </div>

      {/* Results List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {error && <p className="text-red-400 text-sm text-center py-4">{error}</p>}
        
        {!isSearching && searchTerm.length >= 2 && results.length === 0 && !error && (
          <p className="text-slate-500 text-center py-8">No guests found matching "{searchTerm}"</p>
        )}

        {results.map((guest) => (
          <div key={guest.ticket_id} className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex justify-between items-center">
            <div>
              <p className="font-bold text-slate-200">{guest.attendee_name}</p>
              <span className="inline-block mt-1 px-2 py-0.5 bg-slate-700 text-slate-300 text-[10px] uppercase font-bold rounded">
                {guest.ticket_type || 'General'}
              </span>
            </div>
            
            {/* Dynamic Button State */}
            {guest.checked_in_at ? (
              <span className="px-3 py-1 bg-green-500/20 text-green-400 text-xs font-bold rounded-full border border-green-500/30">
                Checked In
              </span>
            ) : (
              <button 
                onClick={() => handleCheckIn(guest.ticket_id)}
                disabled={processingId === guest.ticket_id}
                className="px-4 py-2 bg-[#7E57C2] hover:bg-[#6b48a8] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold rounded-lg transition-colors"
              >
                {processingId === guest.ticket_id ? 'Processing...' : 'Check In'}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default ManualCheckIn;