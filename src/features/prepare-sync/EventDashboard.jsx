import { useEventStatus } from './useEventStatus.js';
import { useModal } from './useModal.js';
import StatusBadge from '../../components/StatusBadge/StatusBadge.jsx';
import Button from '../../components/Button/Button.jsx';
import PrepareSyncModal from './PrepareSyncModal.jsx';
import styles from './EventDashboard.module.css';

/**
 * EventDashboard — top-level Slice B1 feature component.
 *
 * Renders the event list with status badges and action buttons.
 * Opens PrepareSyncModal when Prepare / Re-sync is clicked.
 */
function EventDashboard() {
  const { events, markPrepared } = useEventStatus();
  const { activeModal, openPrepareModal, openResyncModal, closeModal } = useModal();

  const activeEvent = activeModal
    ? events.find((e) => e.id === activeModal.eventId)
    : null;

  return (
    <main className={styles.dashboard}>
      <header className={styles.header}>
        <h1 className={styles.title}>Check-in Dashboard</h1>
        <p className={styles.subtitle}>Manage event preparation and attendee sync</p>
      </header>

      <ul className={styles.eventList} role="list">
        {events.map((event) => (
          <li key={event.id} className={styles.eventCard}>
            {/* ── Card header ── */}
            <div className={styles.cardHeader}>
              <div className={styles.cardMeta}>
                <h2 className={styles.eventName}>{event.name}</h2>
                <p className={styles.attendeeCount}>
                  {event.totalAttendees.toLocaleString()} attendees
                </p>
              </div>
              <StatusBadge status={event.status} />
            </div>

            {/* ── Action bar ── */}
            <div className={styles.actions}>
              {event.status === 'not_prepared' && (
                <Button
                  variant="primary"
                  onClick={() => openPrepareModal(event.id)}
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

              {/* null / unknown — no action buttons per requirement 2.5 */}
            </div>
          </li>
        ))}
      </ul>

      {/* ── Modal ── */}
      {activeModal && activeEvent && (
        <PrepareSyncModal
          event={activeEvent}
          modalType={activeModal.type}
          onClose={closeModal}
          onSyncSuccess={(eventId) => {
            markPrepared(eventId);
          }}
        />
      )}
    </main>
  );
}

export default EventDashboard;
