import { useState, useRef, useEffect, useCallback } from 'react';
import Modal from '../../components/Modal/Modal.jsx';
import Button from '../../components/Button/Button.jsx';
import ProgressBar from '../../components/ProgressBar/ProgressBar.jsx';
import VerificationPolicySelector from './VerificationPolicySelector.jsx';
import { mockPrepareCheckin } from '../../api/mockCheckinApi.js';
import styles from './PrepareSyncModal.module.css';

/**
 * PrepareSyncModal — unified modal for Prepare and Re-sync flows.
 *
 * Props:
 *   event          — Event object { id, name, status }
 *   totalAttendees — number — pre-fetched attendee count (passed from EventDashboard)
 *   modalType      — 'prepare' | 'resync'
 *   onClose        — () => void — called after cancel or successful sync close
 *   onSyncSuccess  — (eventId: string) => void — called when sync completes
 */
function PrepareSyncModal({ event, totalAttendees = 0, modalType, onClose, onSyncSuccess }) {
  const [selectedPolicy, setSelectedPolicy] = useState('both');
  const [syncPhase, setSyncPhase] = useState('idle'); // 'idle' | 'syncing' | 'success' | 'error'
  const [synced, setSynced] = useState(0);
  const [total, setTotal] = useState(totalAttendees);
  const [errorSynced, setErrorSynced] = useState(0);

  const cancelRef = useRef(null);
  const policyRef = useRef(selectedPolicy);

  // Keep policyRef in sync so retry can reuse it
  useEffect(() => {
    policyRef.current = selectedPolicy;
  }, [selectedPolicy]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (cancelRef.current) {
        cancelRef.current();
      }
    };
  }, []);

  const percent = total > 0 ? Math.min(100, Math.round((synced / total) * 100)) : 0;

  const runSync = useCallback((policy, alreadySynced = 0) => {
    setSyncPhase('syncing');
    setSynced(alreadySynced);
    setTotal(totalAttendees);

    if (cancelRef.current) {
      cancelRef.current();
    }

    cancelRef.current = mockPrepareCheckin(
      event.id,
      policy,
      totalAttendees,
      (payload) => {
        if (payload.status === 'progress') {
          setSynced(payload.synced);
        } else if (payload.status === 'success') {
          setSynced(payload.synced);
          setSyncPhase('success');
          onSyncSuccess(event.id);
        } else if (payload.status === 'error') {
          setSynced(payload.synced);
          setErrorSynced(payload.synced);
          setSyncPhase('error');
        }
      },
      {alreadySynced}
    );
  }, [event, totalAttendees, onSyncSuccess]);

  const handlePrepareConfirm = () => {
    runSync(selectedPolicy, 0);
  };

  const handleResyncConfirm = () => {
    runSync(policyRef.current, 0);
  };

  const handleRetry = () => {
    runSync(policyRef.current, errorSynced);
  };

  const handleCancel = () => {
    if (cancelRef.current) {
      cancelRef.current();
      cancelRef.current = null;
    }
    onClose();
  };

  const isPrepare = modalType === 'prepare';
  const isZeroAttendees = totalAttendees === 0;
  const isSyncing = syncPhase === 'syncing';
  const isError = syncPhase === 'error';
  const isSuccess = syncPhase === 'success';
  const failed = total - synced;

  // Title changes by phase
  let title = isPrepare ? 'Prepare Check-in' : 'Re-sync Attendees';
  if (isSyncing) title = 'Syncing Attendees…';
  if (isSuccess) title = 'Sync Complete';
  if (isError) title = 'Sync Failed';

  return (
    <Modal title={title} onClose={handleCancel}>
      <div className={styles.body}>

        {/* ── Progress / Error / Success view ── */}
        {(isSyncing || isError || isSuccess) && (
          <div className={styles.syncView}>
            <ProgressBar
              percent={percent}
              frozen={isError}
              label="Attendee sync progress"
            />
            <div
              aria-live="polite"
              aria-atomic="true"
              className={styles.statusText}
            >
              {isSyncing && (
                <p className={styles.inProgress}>
                  Syncing {synced} of {total} attendees…
                </p>
              )}
              {isSuccess && (
                <p className={styles.successText}>
                  Sync complete — {total} attendees are ready for check-in.
                </p>
              )}
              {isError && synced > 0 && (
                <p className={styles.errorText}>
                  Sync failed — {synced} of {total} attendees uploaded.{' '}
                  {failed} attendees could not be synced.
                </p>
              )}
              {isError && synced === 0 && (
                <p className={styles.errorText}>
                  Sync could not be started — please check your connection and try again.
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── Idle: Prepare content ── */}
        {syncPhase === 'idle' && isPrepare && (
          <div className={styles.prepareContent}>
            <p className={styles.attendeeMessage}>
              This will sync{' '}
              <strong>{totalAttendees}</strong> attendees to the check-in system.
            </p>
            {isZeroAttendees && (
              <p className={styles.warningText}>
                There are no attendees for this event yet. The "Prepare" action is disabled until attendees are added.
              </p>
            )}
            <VerificationPolicySelector
              selected={selectedPolicy}
              onChange={setSelectedPolicy}
            />
          </div>
        )}

        {/* ── Idle: Re-sync content ── */}
        {syncPhase === 'idle' && !isPrepare && (
          <p className={styles.attendeeMessage}>
            Re-syncing will refresh attendee data with any new tickets sold.
            Existing check-ins are preserved.
          </p>
        )}

        {/* ── Action buttons ── */}
        <div className={styles.actions}>
          {/* Success: just a close button */}
          {isSuccess && (
            <Button variant="primary" onClick={onClose}>
              Close
            </Button>
          )}

          {/* Error: retry + cancel */}
          {isError && (
            <>
              <Button variant="secondary" onClick={handleCancel}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleRetry}>
                Retry
              </Button>
            </>
          )}

          {/* Syncing: only cancel */}
          {isSyncing && (
            <Button variant="secondary" onClick={handleCancel}>
              Cancel
            </Button>
          )}

          {/* Idle prepare */}
          {syncPhase === 'idle' && isPrepare && (
            <>
              <Button variant="secondary" onClick={handleCancel}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handlePrepareConfirm}
                disabled={isZeroAttendees}
              >
                Prepare
              </Button>
            </>
          )}

          {/* Idle resync */}
          {syncPhase === 'idle' && !isPrepare && (
            <>
              <Button variant="secondary" onClick={handleCancel}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleResyncConfirm}>
                Re-sync
              </Button>
            </>
          )}
        </div>

      </div>
    </Modal>
  );
}

export default PrepareSyncModal;
