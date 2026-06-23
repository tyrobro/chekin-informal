import React, { useState, useRef, useCallback } from 'react';

// --- NATIVE BROWSER CRYPTOGRAPHY ---
// Verifies HMAC-SHA256 in < 5ms without external libraries
async function verifyHMAC(payloadObj, signatureHex, secretKey) {
  try {
    const enc = new TextEncoder();
    // Re-stringify the payload deterministically (or use the raw string if provided by A1)
    const payloadStr = JSON.stringify(payloadObj); 
    
    const key = await crypto.subtle.importKey(
      'raw', enc.encode(secretKey),
      { name: 'HMAC', hash: 'SHA-256' },
      false, ['sign']
    );
    
    const signatureBuffer = await crypto.subtle.sign('HMAC', key, enc.encode(payloadStr));
    const hashArray = Array.from(new Uint8Array(signatureBuffer));
    const expectedHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    return expectedHex === signatureHex;
  } catch (e) {
    return false;
  }
}

export default function ScanResult({ 
  staffId = "staff-01", 
  gateId = "Gate A", 
  eventId = "evt-01", 
  onDismiss 
}) {
  const [resultState, setResultState] = useState('idle'); // idle | loading | success | error
  const [ticketData, setTicketData] = useState(null);
  const [errorDetails, setErrorDetails] = useState({ title: '', message: '' });
  
  // Concurrency & Caching Refs
  const recentScansRef = useRef(new Map()); // 5-second duplicate lock
  const processingLockRef = useRef(false);  // 200ms race condition lock

  // --- MAIN PROCESSOR ---
  const processQRCode = useCallback(async (rawQrString) => {
    if (processingLockRef.current) return;
    processingLockRef.current = true;
    setResultState('loading');

    // 1. Extract the unique ticket token from the vCard
    // This regex looks for "NOTE:" and grabs everything after it until a space or newline
    const tokenMatch = rawQrString.match(/NOTE:([^\s\r\n]+)/);
    
    if (!tokenMatch || !tokenMatch[1]) {
      triggerError("Invalid ticket", "Could not find ticket ID in QR code.");
      return;
    }
    
    const qrToken = tokenMatch[1]; // e.g., "#EA11081"

    // 2. The 5-Second Duplicate Cache (PRD Requirement)
    const now = Date.now();
    const lastScanTime = recentScansRef.current.get(qrToken);
    if (lastScanTime && (now - lastScanTime) < 5000) {
      triggerError("Already used at this gate", "Scanned seconds ago. Do not re-scan.");
      return;
    }
    // Update cache
    recentScansRef.current.set(qrToken, now);

    // 3. Edge Function Network Call (with 2s Timeout)
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 2000);

    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/checkin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({
          qr_token: qrToken,
          gate: gateId,
          staff_id: staffId,
          event_id: eventId,
          client_scan_id: crypto.randomUUID()
        }),
        signal: abortController.signal
      });

      clearTimeout(timeoutId);
      const data = await response.json();

      if (data.success) {
        triggerSuccess(data.ticketInfo);
      } else {
        handleBackendError(data);
      }

    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        triggerError("Network issue, try again", "Connection timed out after 2 seconds.");
      } else {
        triggerError("Network Error", "Could not reach the server.");
      }
    }
  }, [eventId, gateId, staffId]);

  // --- STATE HANDLERS & HAPTICS ---
  const triggerSuccess = (info) => {
    if (navigator.vibrate) navigator.vibrate(200); // PRD Haptic
    setTicketData(info);
    setResultState('success');
    
    // Auto-dismiss after 1.5s
    setTimeout(() => {
      handleDismiss();
    }, 1500);
  };

  const handleBackendError = (data) => {
    if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 200]); // PRD Haptic
    
    switch (data.error) {
      case 'denied_already_used':
        triggerError(
          `Already used at ${data.ticketInfo.originalGate} · ${data.ticketInfo.checkinTime}`, 
          `Confirm Identity: ${data.ticketInfo.userName}`
        );
        break;
      case 'denied_not_found':
        triggerError("Ticket Not Found", "This QR code does not exist in the database.");
        break;
      case 'denied_invalid_event':
        triggerError("Wrong Event", "This ticket is for a different event.");
        break;
      default:
        triggerError("Check-in Failed", data.message || "Unknown error occurred.");
    }
  };

  const triggerError = (title, message) => {
    if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 200]);
    setErrorDetails({ title, message });
    setResultState('error');
  };

  const handleDismiss = () => {
    setResultState('idle');
    setTicketData(null);
    setErrorDetails({ title: '', message: '' });
    // Release the concurrency lock 200ms after UI clears
    setTimeout(() => { processingLockRef.current = false; }, 200);
    if (onDismiss) onDismiss();
  };

  // --- EXPOSE PROCESSOR TO PARENT ---
  // We use a React effect to attach this function to the window or pass via props 
  // so your A1 scanner component can call `processQRCode(scannedText)`
  React.useEffect(() => {
    window.handlePwaScan = processQRCode;
  }, [processQRCode]);

  // --- RENDER UI ---
  if (resultState === 'idle') return null;
  if (resultState === 'loading') return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="w-12 h-12 border-4 border-slate-600 border-t-[#5BC97C] rounded-full animate-spin" />
    </div>
  );

  return (
    <div className={`absolute inset-0 z-50 flex flex-col justify-center p-6 ${
      resultState === 'success' ? 'bg-[#2E7D32]' : 'bg-[#D32F2F]'
    }`}>
      {resultState === 'success' && ticketData ? (
        <div className="text-center animate-in fade-in zoom-in duration-200">
          <svg className="w-24 h-24 mx-auto mb-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h1 className="text-5xl font-black text-white mb-2 leading-tight">
            {ticketData.userName}
          </h1>
          <p className="text-2xl text-green-100 font-semibold mb-4">
            {ticketData.ticketType}
          </p>
          {(ticketData.company || ticketData.seat) && (
            <div className="inline-block bg-black/20 rounded-xl px-6 py-3 mt-4">
              {ticketData.company && <p className="text-white text-lg font-medium">{ticketData.company}</p>}
              {ticketData.seat && <p className="text-green-100 text-lg">Seat: {ticketData.seat}</p>}
            </div>
          )}
        </div>
      ) : (
        <div className="text-center animate-in fade-in zoom-in duration-200">
          <svg className="w-24 h-24 mx-auto mb-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <h1 className="text-4xl font-black text-white mb-4 leading-tight">
            {errorDetails.title}
          </h1>
          <p className="text-xl text-red-100 font-medium mb-12">
            {errorDetails.message}
          </p>
          <button 
            onClick={handleDismiss}
            className="w-full bg-white text-red-700 font-bold text-xl py-5 rounded-2xl shadow-xl active:scale-95 transition-transform"
          >
            {errorDetails.title.includes("Network") ? "Retry / Dismiss" : "Dismiss"}
          </button>
        </div>
      )}
    </div>
  );
}