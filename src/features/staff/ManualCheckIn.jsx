import React, { useState, useMemo, useEffect } from 'react';

export default function ManualCheckIn({ onClose, eventId = "evt-01" }) {
  // --- STATE ---
  const [attendees, setAttendees] = useState([]);
  const [isSyncing, setIsSyncing] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAttendee, setSelectedAttendee] = useState(null);
  const [step, setStep] = useState('search'); // 'search' | 'picker' | 'modeA' | 'modeB'
  
  const [last4Input, setLast4Input] = useState('');
  const [selectedIdType, setSelectedIdType] = useState('');

  // --- FETCH REAL DATA ---
  useEffect(() => {
    async function fetchAttendees() {
      try {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/event_attendees?event_id=eq.${eventId}&select=id,attendee_name,ticket_type,company,designation,ticket_id`,
          {
            headers: {
              'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
            }
          }
        );

        if (!response.ok) throw new Error("Failed to fetch");

        const data = await response.json();
        
        const formattedList = data.map(row => ({
          id: row.id,
          name: row.attendee_name,
          ticket_type: row.ticket_type,
          company: row.company || '',
          designation: row.designation || '',
          ticket_id: row.ticket_id
        }));

        setAttendees(formattedList);
      } catch (error) {
        console.error("Error fetching attendees:", error);
      } finally {
        setIsSyncing(false);
      }
    }
    fetchAttendees();
  }, [eventId]);

  // --- FUZZY SEARCH ---
  // --- FUZZY SEARCH ---
  const searchResults = useMemo(() => {
    if (searchQuery.length < 2) return [];
    const queryWords = searchQuery.toLowerCase().split(' ').filter(Boolean);
    
    return attendees.filter(a => {
      const normalizedName = (a.name || '').toLowerCase();
      const ticketId = (a.ticket_id || '').toLowerCase();
      
      // Match if the search query exists in EITHER the name or the ticket ID
      return queryWords.every(word => 
        normalizedName.includes(word) || ticketId.includes(word)
      );
    });
  }, [searchQuery, attendees]);

  // --- HANDOFF TO SCANNER ---
  const executeCheckIn = (method, idType = null) => {
    const payload = JSON.stringify({
      qr_token: `manual:${selectedAttendee.ticket_id}`,
      method: method,
      id_type: idType
    });
    
    // Fire the exact same trigger the camera uses
    if (window.handlePwaScan) {
      window.handlePwaScan(payload);
    }
  };

  // --- RENDER HELPERS ---
  const handleSelectAttendee = (attendee) => {
    setSelectedAttendee(attendee);
    setStep('picker');
  };

  const handleBack = () => {
    if (step === 'picker') {
      setSelectedAttendee(null);
      setStep('search');
    } else {
      setStep('picker');
      setLast4Input('');
      setSelectedIdType('');
    }
  };

  // 1. SEARCH SCREEN
  if (step === 'search') {
    return (
      <div className="w-full flex flex-col h-full animate-in fade-in">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold">Manual Search</h2>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <input
          type="text"
          placeholder="Search by name..."
          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-4 text-white placeholder-slate-400 focus:outline-none focus:border-[#7E57C2] mb-4"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          autoFocus
        />

        {isSyncing && (
          <div className="text-center py-8 text-slate-400 animate-pulse text-sm">
            Fetching guest list...
          </div>
        )}

        {!isSyncing && searchQuery.length >= 2 && searchResults.length === 0 && (
          <div className="text-center py-8 text-slate-400">
            <p>No matches found.</p>
            <p className="text-sm mt-2">Not finding the guest? Escalate to host.</p>
          </div>
        )}

        <div className="flex-1 overflow-y-auto flex flex-col gap-2 pb-4">
          {searchResults.map(a => (
            <button 
              key={a.id}
              onClick={() => handleSelectAttendee(a)}
              className="text-left bg-slate-800/50 p-4 rounded-xl border border-slate-700 hover:bg-slate-800 active:scale-[0.98] transition-all"
            >
              <div className="flex justify-between items-start">
                <span className="font-bold text-lg">{a.name}</span>
                <span className="text-xs font-bold px-2 py-1 bg-slate-700 rounded text-slate-300">{a.ticket_type}</span>
              </div>
              {(a.company || a.designation) && (
                <div className="text-sm text-slate-400 mt-1">
                  {a.designation} {a.designation && a.company && '·'} {a.company}
                </div>
              )}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // 2. MODE PICKER SCREEN
  if (step === 'picker') {
    return (
      <div className="w-full flex flex-col animate-in slide-in-from-right-4">
        <button onClick={handleBack} className="text-sm text-[#7E57C2] font-semibold mb-6 flex items-center gap-1">
          &larr; Back to search
        </button>
        
        <div className="bg-slate-800 border border-slate-700 p-5 rounded-2xl mb-6 text-center">
          <h2 className="text-2xl font-black text-white mb-1">{selectedAttendee.name}</h2>
          <p className="text-[#5BC97C] font-semibold">{selectedAttendee.ticket_type}</p>
        </div>

        <h3 className="text-slate-400 text-sm font-bold tracking-wider uppercase mb-4 text-center">Verify Identity</h3>
        
        <button onClick={() => setStep('modeA')} className="w-full bg-slate-800 border border-slate-700 rounded-xl p-5 mb-3 flex items-center justify-between hover:border-slate-500 transition-colors">
          <div className="text-left">
            <span className="block font-bold text-white mb-1">Ticket ID (Mode A)</span>
            <span className="block text-sm text-slate-400">Match the last 4 digits of their ticket</span>
          </div>
          <span className="text-slate-500">&rarr;</span>
        </button>

        <button onClick={() => setStep('modeB')} className="w-full bg-slate-800 border border-slate-700 rounded-xl p-5 flex items-center justify-between hover:border-slate-500 transition-colors">
          <div className="text-left">
            <span className="block font-bold text-white mb-1">ID Document (Mode B)</span>
            <span className="block text-sm text-slate-400">Visually verify government ID</span>
          </div>
          <span className="text-slate-500">&rarr;</span>
        </button>
      </div>
    );
  }

  // 3. MODE A: TICKET MATCH
  if (step === 'modeA') {
    const expectedLast4 = selectedAttendee.ticket_id.slice(-4).toUpperCase();
    const isMatch = last4Input.toUpperCase() === expectedLast4;

    return (
      <div className="w-full flex flex-col animate-in slide-in-from-right-4">
        <button onClick={handleBack} className="text-sm text-[#7E57C2] font-semibold mb-6">&larr; Back to modes</button>
        
        <h2 className="text-2xl font-black mb-2">Ticket Match</h2>
        <p className="text-slate-400 mb-8">Ask the guest for the last 4 characters of their ticket ID to confirm.</p>

        <input
          type="text"
          maxLength={4}
          placeholder="e.g. A1B2"
          value={last4Input}
          onChange={(e) => setLast4Input(e.target.value)}
          className={`w-full bg-slate-800 border-2 rounded-xl px-4 py-4 text-center text-3xl tracking-[0.5em] font-mono text-white placeholder-slate-600 focus:outline-none transition-colors ${last4Input.length === 4 ? (isMatch ? 'border-[#5BC97C]' : 'border-[#D64545]') : 'border-slate-700 focus:border-[#7E57C2]'}`}
          autoFocus
        />

        {last4Input.length === 4 && !isMatch && (
          <p className="text-[#D64545] text-sm text-center mt-3 font-semibold">Ticket ID does not match.</p>
        )}

        <button 
          disabled={!isMatch}
          onClick={() => executeCheckIn('manual_ticket_id')}
          className="w-full mt-auto py-5 bg-[#5BC97C] text-black font-bold text-xl rounded-2xl shadow-[0_0_20px_rgba(91,201,124,0.3)] disabled:opacity-30 disabled:shadow-none disabled:bg-slate-700 disabled:text-slate-400 transition-all absolute bottom-0 left-0"
        >
          Check In
        </button>
      </div>
    );
  }

  // 4. MODE B: ID DOCUMENT
  if (step === 'modeB') {
    return (
      <div className="w-full flex flex-col animate-in slide-in-from-right-4 h-[400px]">
        <button onClick={handleBack} className="text-sm text-[#7E57C2] font-semibold mb-6">&larr; Back to modes</button>
        
        <h2 className="text-2xl font-black mb-2">Visual Verification</h2>
        <p className="text-slate-400 mb-8">Verify the guest's physical ID matches the name: <span className="text-white font-bold">{selectedAttendee.name}</span></p>

        <select 
          value={selectedIdType}
          onChange={(e) => setSelectedIdType(e.target.value)}
          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-4 text-white text-lg focus:outline-none focus:border-[#7E57C2] appearance-none"
        >
          <option value="" disabled>Select Document Type...</option>
          <option value="Aadhaar">Aadhaar Card</option>
          <option value="PAN">PAN Card</option>
          <option value="Driving Licence">Driving Licence</option>
          <option value="Passport">Passport</option>
          <option value="Other">Other Valid ID</option>
        </select>

        <p className="text-xs text-slate-500 mt-4 text-center">Do not capture or store ID numbers.</p>

        <button 
          disabled={!selectedIdType}
          onClick={() => executeCheckIn('manual_name_id_doc', selectedIdType)}
          className="w-full mt-auto py-5 bg-[#5BC97C] text-black font-bold text-xl rounded-2xl shadow-[0_0_20px_rgba(91,201,124,0.3)] disabled:opacity-30 disabled:shadow-none disabled:bg-slate-700 disabled:text-slate-400 transition-all absolute bottom-0 left-0"
        >
          Confirm — ID Verified
        </button>
      </div>
    );
  }

  return null;
}