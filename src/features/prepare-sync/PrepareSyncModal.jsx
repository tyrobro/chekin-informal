import { useState, useRef, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import VerificationPolicySelector from './VerificationPolicySelector.jsx';
import { triggerPrepareSync, fetchSyncStatus } from '../../api/checkinApi.js';
import { useAuth } from '../../context/AuthContext.jsx';

/** How often to poll the status endpoint while a sync is in progress (ms). */
const POLL_INTERVAL_MS = 2000;

/* ── Inline ProgressBar ─────────────────────────────────────────────────── */
function ProgressBar({ percent, frozen, error }) {
  const fillColor = error ? 'bg-red-500' : 'bg-blue-600';
  return (
    <div
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Attendee sync progress"
      className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden"
    >
      <div
        className={`h-full rounded-full ${fillColor} ${frozen ? '' : 'transition-[width] duration-500 ease-in-out'}`}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

/* ── Modal shell ────────────────────────────────────────────────────────── */
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

function ModalShell({ title, onClose, children }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const prev = document.activeElement;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusable = Array.from(dialog.querySelectorAll(FOCUSABLE));
    focusable[0]?.focus();

    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (e.key === 'Tab') {
        const els = Array.from(dialog.querySelectorAll(FOCUSABLE));
        if (!els.length) { e.preventDefault(); return; }
        const first = els[0], last = els[els.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) { e.preventDefault(); last.focus(); }
        } else {
          if (document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [onClose]);

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" aria-hidden="true" />

      {/* Panel */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className="relative z-10 w-full max-w-lg bg-white rounded-2xl shadow-xl
                   border border-slate-100 flex flex-col max-h-[90vh] overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100">
          <h2 id="modal-title" className="text-lg font-bold text-slate-900 tracking-tight">
            {title}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400
                       hover:text-slate-700 hover:bg-slate-100 transition-all duration-150
                       focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
          >
            <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-8 py-6">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ── Main component ─────────────────────────────────────────────────────── */

/**
 * PrepareSyncModal — unified modal for Prepare and Re-sync flows.
 *
 * Props:
 *   event          — { id, name, status }
 *   totalAttendees — number  pre-fetched attendee count from EventDashboard
 *   modalType      — 'prepare' | 'resync'
 *   onClose        — () => void
 *   onSyncSuccess  — (eventId) => void   called when backend reports 'completed'
 *
 * All hooks, state, and API/polling logic are unchanged.
 * Only markup and Tailwind utility classes have been updated.
 */
function PrepareSyncModal({ event, totalAttendees = 0, modalType, onClose, onSyncSuccess }) {
  const { token } = useAuth();

  const [selectedPolicy, setSelectedPolicy] = useState('both');
  const [syncPhase, setSyncPhase]           = useState('idle');
  const [processed, setProcessed]           = useState(0);
  const [total, setTotal]                   = useState(totalAttendees);
  const [failedCount, setFailedCount]       = useState(0);

  const policyRef  = useRef(selectedPolicy);
  const pollRef    = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => { policyRef.current = selectedPolicy; }, [selectedPolicy]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; stopPolling(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function stopPolling() {
    if (pollRef.current !== null) { clearInterval(pollRef.current); pollRef.current = null; }
  }

  const startPolling = useCallback((eventId) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const status = await fetchSyncStatus(eventId, token);
        if (!mountedRef.current) return;
        setProcessed(status.processed);
        if (status.total > 0) setTotal(status.total);
        if (status.status === 'completed') {
          stopPolling(); setSyncPhase('success'); onSyncSuccess(eventId); return;
        }
        if (status.status === 'failed') {
          stopPolling(); setFailedCount(status.failed); setSyncPhase('error'); return;
        }
      } catch {
        if (!mountedRef.current) return;
        stopPolling(); setSyncPhase('error');
      }
    }, POLL_INTERVAL_MS);
  }, [token, onSyncSuccess]);

  const runSync = useCallback(async (policy) => {
    setSyncPhase('syncing');
    setProcessed(0);
    setFailedCount(0);
    setTotal(totalAttendees);
    try {
      await triggerPrepareSync(event.id, policy, token);
      if (!mountedRef.current) return;
      startPolling(event.id);
    } catch {
      if (!mountedRef.current) return;
      setSyncPhase('error');
    }
  }, [event.id, totalAttendees, token, startPolling]);

  const handlePrepareConfirm = () => { policyRef.current = selectedPolicy; runSync(selectedPolicy); };
  const handleResyncConfirm  = () => { runSync(policyRef.current); };
  const handleRetry          = () => { runSync(policyRef.current); };
  const handleCancel         = () => { stopPolling(); onClose(); };

  // ── Derived ──
  const percent         = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;
  const isPrepare       = modalType === 'prepare';
  const isZeroAttendees = totalAttendees === 0;
  const isSyncing       = syncPhase === 'syncing';
  const isError         = syncPhase === 'error';
  const isSuccess       = syncPhase === 'success';
  const displayFailed   = failedCount > 0 ? failedCount : (total - processed);
  // In dev mode the backend injects mock attendees dynamically, so the
  // zero-attendee guard is bypassed to unblock local testing.
  const devBypass       = isZeroAttendees && import.meta.env.DEV;
  const prepareDisabled = isSyncing || (isZeroAttendees && !import.meta.env.DEV);

  let title = isPrepare ? 'Prepare Check-in' : 'Re-sync Attendees';
  if (isSyncing) title = 'Syncing Attendees…';
  if (isSuccess) title = 'Sync Complete';
  if (isError)   title = 'Sync Failed';

  // ── Render ──
  return (
    <ModalShell title={title} onClose={handleCancel}>
      <div className="space-y-6">

        {/* ── Active / terminal sync view ── */}
        {(isSyncing || isError || isSuccess) && (
          <div className="space-y-4">
            <ProgressBar percent={percent} frozen={isError} error={isError} />

            {/* Numeric progress label */}
            {(isSyncing || isError) && total > 0 && (
              <div className="flex items-center justify-between text-xs text-slate-500 -mt-2">
                <span>{processed.toLocaleString()} synced</span>
                <span className="font-medium">{percent}%</span>
                <span>{total.toLocaleString()} total</span>
              </div>
            )}

            {/* Status message */}
            <div aria-live="polite" aria-atomic="true">
              {isSyncing && (
                <div className="flex items-center gap-2 text-sm text-slate-600 bg-slate-50
                                border border-slate-200 rounded-xl px-4 py-3">
                  <svg className="animate-spin w-4 h-4 text-indigo-500 shrink-0" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  <span>
                    {total > 0
                      ? `Syncing ${processed.toLocaleString()} of ${total.toLocaleString()} attendees…`
                      : 'Sync in progress…'}
                  </span>
                </div>
              )}

              {isSuccess && (
                <div className="flex flex-col items-center text-center gap-4 py-4">
                  {/* Large success icon */}
                  <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
                    <svg className="w-8 h-8 text-emerald-600" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-base font-bold text-emerald-800">
                      Check-in system is ready!
                    </p>
                    <p className="text-sm text-emerald-700">
                      {total.toLocaleString()} attendees synced successfully.
                    </p>
                  </div>
                  {/* Stat chips */}
                  <div className="flex items-center gap-2 flex-wrap justify-center">
                    <span className="inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-200
                                     text-emerald-700 text-xs font-semibold px-3 py-1.5 rounded-full">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
                      </svg>
                      {total.toLocaleString()} attendees
                    </span>
                    <span className="inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-200
                                     text-emerald-700 text-xs font-semibold px-3 py-1.5 rounded-full">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      Sync complete
                    </span>
                  </div>
                </div>
              )}

              {isError && processed > 0 && (
                <div className="flex items-start gap-3 bg-red-50 border border-red-200
                                rounded-xl px-4 py-3">
                  <svg className="w-5 h-5 text-red-500 shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <p className="text-sm text-red-700 font-medium">
                    Sync failed — {processed.toLocaleString()} of {total.toLocaleString()} attendees uploaded.{' '}
                    <span className="font-bold">{displayFailed.toLocaleString()}</span> could not be synced.
                  </p>
                </div>
              )}

              {isError && processed === 0 && (
                <div className="flex items-start gap-3 bg-red-50 border border-red-200
                                rounded-xl px-4 py-3">
                  <svg className="w-5 h-5 text-red-500 shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <p className="text-sm text-red-700 font-medium">
                    Sync could not be started — please check your connection and try again.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Idle: Prepare content ── */}
        {syncPhase === 'idle' && isPrepare && (
          <div className="space-y-4">
            {/* Attendee count pill */}
            <div className="flex items-center gap-3 bg-slate-50 border border-slate-200
                            rounded-xl px-4 py-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-indigo-600" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
                </svg>
              </div>
              <p className="text-sm text-slate-700">
                This will sync{' '}
                <span className="font-bold text-slate-900">{totalAttendees.toLocaleString()}</span>{' '}
                attendees to the check-in system.
              </p>
            </div>

            {/* Zero-attendee warning — production only */}
            {isZeroAttendees && !import.meta.env.DEV && (
              <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200
                              rounded-xl px-4 py-3 text-amber-700 text-sm">
                <svg className="w-4 h-4 mt-0.5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <span>
                  There are no attendees for this event yet. The "Prepare" action is disabled
                  until attendees are added.
                </span>
              </div>
            )}

            {/* Dev-mode bypass badge — only visible in development */}
            {devBypass && (
              <div className="flex items-center gap-2 bg-violet-50 border border-violet-200
                              rounded-lg px-3 py-2">
                <span className="inline-flex items-center justify-center w-4 h-4 rounded
                                 bg-violet-500 text-white text-[9px] font-black leading-none
                                 shrink-0 select-none">
                  D
                </span>
                <span className="text-xs font-medium text-violet-700">
                  Dev mode · Empty sync bypass enabled — mock attendees will be injected by the backend
                </span>
              </div>
            )}

            <VerificationPolicySelector
              selected={selectedPolicy}
              onChange={setSelectedPolicy}
            />
          </div>
        )}

        {/* ── Idle: Re-sync content ── */}
        {syncPhase === 'idle' && !isPrepare && (
          <div className="flex items-start gap-3 bg-indigo-50 border border-indigo-100
                          rounded-xl px-4 py-3">
            <svg className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
            <p className="text-sm text-indigo-800">
              Re-syncing will refresh attendee data with any new tickets sold.{' '}
              <span className="font-semibold">Existing check-ins are preserved.</span>
            </p>
          </div>
        )}

        {/* ── Action buttons ── */}
        <div className="flex justify-end gap-2.5 pt-1 border-t border-slate-100">
          {isSuccess && (
            <button
              onClick={onClose}
              className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white
                         bg-emerald-600 hover:bg-emerald-700 transition-all duration-200
                         focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
            >
              Close
            </button>
          )}

          {isError && (
            <>
              <button
                onClick={handleCancel}
                className="px-5 py-2 rounded-xl text-sm font-semibold text-slate-600
                           bg-white border border-slate-200 hover:bg-slate-50
                           transition-all duration-200
                           focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2"
              >
                Cancel
              </button>
              <button
                onClick={handleRetry}
                className="px-5 py-2 rounded-xl text-sm font-semibold text-white
                           bg-indigo-600 hover:bg-indigo-700 transition-all duration-200
                           focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
              >
                Retry
              </button>
            </>
          )}

          {isSyncing && (
            <button
              onClick={handleCancel}
              className="px-5 py-2 rounded-xl text-sm font-semibold text-slate-600
                         bg-white border border-slate-200 hover:bg-slate-50
                         transition-all duration-200
                         focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2"
            >
              Cancel
            </button>
          )}

          {syncPhase === 'idle' && isPrepare && (
            <>
              <button
                onClick={handleCancel}
                className="px-5 py-2 rounded-xl text-sm font-semibold text-slate-600
                           bg-white border border-slate-200 hover:bg-slate-50
                           transition-all duration-200
                           focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2"
              >
                Cancel
              </button>
              <button
                onClick={handlePrepareConfirm}
                disabled={prepareDisabled}
                className="px-5 py-2 rounded-xl text-sm font-semibold text-white
                           bg-indigo-600 hover:bg-indigo-700 transition-all duration-200
                           focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2
                           disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none"
              >
                Prepare
              </button>
            </>
          )}

          {syncPhase === 'idle' && !isPrepare && (
            <>
              <button
                onClick={handleCancel}
                className="px-5 py-2 rounded-xl text-sm font-semibold text-slate-600
                           bg-white border border-slate-200 hover:bg-slate-50
                           transition-all duration-200
                           focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2"
              >
                Cancel
              </button>
              <button
                onClick={handleResyncConfirm}
                className="px-5 py-2 rounded-xl text-sm font-semibold text-white
                           bg-indigo-600 hover:bg-indigo-700 transition-all duration-200
                           focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
              >
                Re-sync
              </button>
            </>
          )}
        </div>

      </div>
    </ModalShell>
  );
}

export default PrepareSyncModal;
