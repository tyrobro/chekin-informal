import React, { useState, useRef, useCallback } from 'react';

/**
 * ScanResult — Slice A2 QR Check-in Result Display
 *
 * Processes decoded QR vCard text, extracts ticket_id from NOTE field,
 * calls the Supabase Edge Function, and displays result overlays.
 *
 * Architecture:
 *   QRScanner (A1) → window.handlePwaScan(rawText) → ScanResult (A2)
 *   ScanResult → Edge Function /functions/v1/checkin → result overlay
 */

// ── Audit logger — logs scan events for debugging ────────────────────────────
function auditLog(type, details) {
  const entry = { timestamp: new Date().toISOString(), type, ...details };
  console.info('[A2 Audit]', JSON.stringify(entry));
}

export default function ScanResult({
  staffId = 'unknown',
  gateId = 'unknown',
  eventId = 'unknown',
  onDismiss,
}) {
  const [resultState, setResultState] = useState('idle'); // idle | loading | success | error
  const [ticketData, setTicketData] = useState(null);
  const [errorDetails, setErrorDetails] = useState({ title: '', message: '', retryPayload: null });

  // Concurrency & caching refs
  const recentScansRef = useRef(new Map());     // 5-second duplicate lock per ticket_id
  const processingLockRef = useRef(false);      // 200ms race condition lock

  // ── triggerSuccess — GREEN screen, auto-dismiss after 1.5s ─────────────────
  const triggerSuccess = useCallback((info) => {
    if (navigator.vibrate) navigator.vibrate(200); // Single short vibration
    setTicketData(info);
    setResultState('success');
    setTimeout(() => { handleDismiss(); }, 1500);
  }, []);

  // ── triggerError — RED screen, requires manual dismissal ───────────────────
  const triggerError = useCallback((title, message, retryPayload = null) => {
    if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 200]); // Triple vibration
    setErrorDetails({ title, message, retryPayload });
    setResultState('error');
  }, []);

  // ── handleDismiss — return to idle/scan mode ───────────────────────────────
  const handleDismiss = useCallback(() => {
    setResultState('idle');
    setTicketData(null);
    setErrorDetails({ title: '', message: '', retryPayload: null });
    // Release concurrency lock 200ms after UI clears (prevents rapid-fire race)
    setTimeout(() => { processingLockRef.current = false; }, 200);
    if (onDismiss) onDismiss();
  }, [onDismiss]);

  // ── callEdgeFunction — network request to Supabase checkin function ────────
  const callEdgeFunction = useCallback(async (payload) => {
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 8000);

    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/checkin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify(payload),
        signal: abortController.signal,
      });

      clearTimeout(timeoutId);

      // Handle malformed response — don't crash on invalid JSON
      let data;
      try {
        data = await response.json();
      } catch {
        auditLog('malformed_response', { ticketId: payload.qr_token, status: response.status });
        triggerError('Check-in Error', 'Received an invalid response from the server.');
        return;
      }

      if (data.success) {
        auditLog('checkin_success', { ticketId: payload.qr_token, name: data.ticketInfo?.userName });
        triggerSuccess(data.ticketInfo);
      } else {
        auditLog('checkin_denied', { ticketId: payload.qr_token, error: data.error });
        handleBackendError(data);
      }
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        auditLog('network_timeout', { ticketId: payload.qr_token });
        triggerError('Network issue, try again', 'Connection timed out. Please try again.', payload);
      } else {
        auditLog('network_error', { ticketId: payload.qr_token, message: error.message });
        triggerError('Network Error', 'Could not reach the server.', payload);
      }
    }
  }, [triggerSuccess, triggerError]);

  // ── handleBackendError — map edge function error codes to UI ────────────────
  const handleBackendError = useCallback((data) => {
    switch (data.error) {
      case 'denied_already_used':
        triggerError(
          `Already used at ${data.ticketInfo?.originalGate ?? 'Unknown Gate'} · ${data.ticketInfo?.checkinTime ?? ''}`,
          `Confirm Identity: ${data.ticketInfo?.userName ?? 'Unknown'}`,
        );
        break;
      case 'denied_not_found':
        triggerError('Ticket Not Found', 'This QR code does not exist in the database.');
        break;
      case 'denied_invalid_event':
        triggerError('Wrong Event', 'This ticket is for a different event.');
        break;
      default:
        triggerError('Check-in Failed', data.message || 'Unknown error occurred.');
    }
  }, [triggerError]);

  // ── processQRCode — main entry point called by QRScanner (A1) ──────────────
  const processQRCode = useCallback(async (rawQrString) => {
    // Race condition guard: ignore if already processing
    if (processingLockRef.current) return;
    processingLockRef.current = true;
    setResultState('loading');

    // 1. Parse vCard — extract ticket_id from NOTE:#EA<number> field
    //    vCard format: NOTE:#EA11089 → ticket_id = "11089"
    const noteMatch = rawQrString.match(/NOTE:#EA(\d+)/);

    if (!noteMatch || !noteMatch[1]) {
      auditLog('invalid_vcard', { raw: rawQrString.substring(0, 100) });
      triggerError('Invalid ticket', 'Could not find ticket ID in QR code.');
      return;
    }

    const ticketId = noteMatch[1]; // e.g., "11089" (numeric only)

    // 2. Duplicate scan protection — same ticket at same gate within 5 seconds
    const now = Date.now();
    const cacheKey = `${ticketId}__${gateId}`;
    const lastScanTime = recentScansRef.current.get(cacheKey);
    if (lastScanTime && (now - lastScanTime) < 5000) {
      triggerError('Already used at this gate', 'Scanned seconds ago. Do not re-scan.');
      return;
    }
    recentScansRef.current.set(cacheKey, now);

    // 3. Call edge function — use "manual:" prefix so edge function
    //    queries event_attendees.ticket_id (not qr_token HMAC hash)
    const payload = {
      qr_token: `manual:${ticketId}`,
      gate: gateId,
      staff_id: staffId,
      event_id: eventId,
      client_scan_id: crypto.randomUUID(),
      method: 'qr_scan',
    };

    await callEdgeFunction(payload);
  }, [gateId, staffId, eventId, callEdgeFunction, triggerError]);

  // ── handleRetry — retry the last failed network request ────────────────────
  const handleRetry = useCallback(() => {
    const payload = errorDetails.retryPayload;
    if (payload) {
      setResultState('loading');
      setErrorDetails({ title: '', message: '', retryPayload: null });
      callEdgeFunction(payload);
    } else {
      handleDismiss();
    }
  }, [errorDetails.retryPayload, callEdgeFunction, handleDismiss]);

  // ── Expose processor to QRScanner via window global ────────────────────────
  React.useEffect(() => {
    window.handlePwaScan = processQRCode;
  }, [processQRCode]);

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  if (resultState === 'idle') return null;

  // ── Loading spinner ────────────────────────────────────────────────────────
  if (resultState === 'loading') {
    return (
      <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
        <div className="w-12 h-12 border-4 border-slate-600 border-t-[#5BC97C] rounded-full animate-spin" />
      </div>
    );
  }

  // ── GREEN: Success ─────────────────────────────────────────────────────────
  if (resultState === 'success' && ticketData) {
    return (
      <div className="absolute inset-0 z-50 flex flex-col justify-center p-6 bg-[#2E7D32]">
        <div className="text-center">
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
      </div>
    );
  }

  // ── RED: Error / Denied ────────────────────────────────────────────────────
  const isNetworkError = errorDetails.retryPayload !== null;

  return (
    <div className="absolute inset-0 z-50 flex flex-col justify-center p-6 bg-[#D32F2F]">
      <div className="text-center">
        <svg className="w-24 h-24 mx-auto mb-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <h1 className="text-4xl font-black text-white mb-4 leading-tight">
          {errorDetails.title}
        </h1>
        <p className="text-xl text-red-100 font-medium mb-12">
          {errorDetails.message}
        </p>
        {isNetworkError ? (
          <div className="space-y-3">
            <button
              onClick={handleRetry}
              className="w-full bg-white text-red-700 font-bold text-xl py-5 rounded-2xl shadow-xl active:scale-95 transition-transform"
            >
              Retry
            </button>
            <button
              onClick={handleDismiss}
              className="w-full bg-white/20 text-white font-semibold text-base py-3 rounded-xl active:scale-95 transition-transform"
            >
              Dismiss
            </button>
          </div>
        ) : (
          <button
            onClick={handleDismiss}
            className="w-full bg-white text-red-700 font-bold text-xl py-5 rounded-2xl shadow-xl active:scale-95 transition-transform"
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}
