import { useState, useEffect, useCallback } from 'react';
import { useEventStatus } from './useEventStatus.js';
import { useModal } from './useModal.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { fetchAttendeeCount } from '../../api/eventApi.js';
import StatusBadge from '../../components/StatusBadge/StatusBadge.jsx';
import Button from '../../components/Button/Button.jsx';
import PrepareSyncModal from './PrepareSyncModal.jsx';
import ErrorState from '../../components/ErrorState/ErrorState.jsx';
import styles from './EventDashboard.module.css';

/** Max concurrent attendee-count requests to avoid rate-limiting. */
const BATCH_SIZE = 3;

/**
 * Run an array of async task factories in controlled batches.
 * Each "task" is a zero-arg function that returns a Promise.
 * Results are ignored — side-effects happen inside each task.
 *
 * @param {Array<() => Promise<void>>} tasks
 * @param {number} concurrency
 */
async function runInBatches(tasks, concurrency) {
  for (let i = 0; i < tasks.length; i += concurrency) {
    await Promise.allSettled(tasks.slice(i, i + concurrency).map((t) => t()));
  }
}

/**
 * EventDashboard — live event list with prepare / re-sync actions.
 *
 * Attendee counts are pre-fetched for all events in batches of 3
 * as soon as the event list resolves, so cards can display counts
 * immediately without waiting for user interaction.
 */
function EventDashboard() {
  const { token, logout } = useAuth();
  const { events, isLoading, error, reload, markPrepared } = useEventStatus();
  const { activeModal, openPrepareModal, openResyncModal, closeModal } = useModal();

  /**
   * attendeeCounts: { [eventId]: number | undefined }
   *   undefined  → not yet fetched (show "Loading…")
   *   number     → resolved count (may be 0)
   */
  const [attendeeCounts, setAttendeeCounts] = useState({});

  // ── Batch-fetch all attendee counts whenever the event list changes ──
  useEffect(() => {
    if (!events.length || !token) return;

    // Reset counts when a fresh event list arrives (e.g. after reload).
    setAttendeeCounts({});

    const tasks = events.map((event) => async () => {
      try {
        const count = await fetchAttendeeCount(event.id, token);
        setAttendeeCounts((prev) => ({ ...prev, [event.id]: count }));
      } catch {
        // On failure store 0 so the card renders a definite (zero) state
        // rather than staying stuck on "Loading…".
        setAttendeeCounts((prev) => ({ ...prev, [event.id]: 0 }));
      }
    });

    runInBatches(tasks, BATCH_SIZE);
  }, [events, token]);

  // The event object for the currently open modal.
  const activeEvent = activeModal
    ? events.find((e) => e.id === activeModal.eventId)
    : null;

  // Pre-fetched count for the modal event (may still be undefined while loading).
  const activeEventAttendeeCount = activeModal
    ? (attendeeCounts[activeModal.eventId] ?? 0)
    : 0;

  /**
   * "Prepare Check-in" click handler.
   * Count is already in attendeeCounts from the background fetch.
   * No extra request needed — just open the modal.
   */
  const handlePrepareClick = useCallback((eventId) => {
    openPrepareModal(eventId);
  }, [openPrepareModal]);

  // ── Loading state ──
  if (isLoading) {
    return (
      <main className={styles.dashboard}>
        <header className={styles.header}>
          <h1 className={styles.title}>Check-in Dashboard</h1>
        </header>
        <div className={styles.centred}>
          <div className={styles.spinner} aria-label="Loading events…" />
          <p className={styles.loadingText}>Loading your events…</p>
        </div>
      </main>
    );
  }

  // ── Error state ──
  if (error) {
    return (
      <main className={styles.dashboard}>
        <header className={styles.header}>
          <h1 className={styles.title}>Check-in Dashboard</h1>
        </header>
        <ErrorState
          message={`Could not load events: ${error}`}
          onRetry={reload}
        />
      </main>
    );
  }

  return (
    <main className={styles.dashboard}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Check-in Dashboard</h1>
          <p className={styles.subtitle}>Manage event preparation and attendee sync</p>
        </div>
        <Button variant="secondary" onClick={logout}>
          Sign out
        </Button>
      </header>

      {events.length === 0 ? (
        <p className={styles.emptyState}>No events found on your account.</p>
      ) : (
        <ul className={styles.eventList} role="list">
          {events.map((event) => {
            const count = attendeeCounts[event.id]; // undefined | number
            const isCounting = count === undefined;

            return (
              <li key={event.id} className={styles.eventCard}>
                {/* ── Card header ── */}
                <div className={styles.cardHeader}>
                  <div className={styles.cardMeta}>
                    <h2 className={styles.eventName}>{event.name}</h2>
                    <p className={`${styles.attendeeCount} ${isCounting ? styles.attendeeLoading : ''}`}>
                      {isCounting
                        ? 'Attendees: Loading…'
                        : `${count.toLocaleString()} attendees`}
                    </p>
                  </div>
                  <StatusBadge status={event.status} />
                </div>

                {/* ── Action bar ── */}
                <div className={styles.actions}>
                  {event.status === 'not_prepared' && (
                    <Button
                      variant="primary"
                      onClick={() => handlePrepareClick(event.id)}
                    >
                      Prepare Check-in
                    </Button>
                  )}

                  {(event.status === 'prepared' || event.status === 'live') && (
                    <>
                      <Button
                        variant="secondary"
                        onClick={() => openResyncModal(event.id)}
                      >
                        Re-sync
                      </Button>
                      <Button variant="secondary" disabled>
                        Invite Check-in Staff
                      </Button>
                      <Button variant="secondary" disabled>
                        View Live Dashboard
                      </Button>
                    </>
                  )}

                  {/* null / unknown — no buttons per requirement 2.5 */}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* ── Modal — passes pre-fetched count directly ── */}
      {activeModal && activeEvent && (
        <PrepareSyncModal
          event={activeEvent}
          totalAttendees={activeEventAttendeeCount}
          modalType={activeModal.type}
          onClose={closeModal}
          onSyncSuccess={markPrepared}
        />
      )}
    </main>
  );
}

export default EventDashboard;
