/**
 * StaffManagement — Slice B2 entry point.
 *
 * Renders:
 *   1. InviteForm  — invite a new staff member
 *   2. StaffTable  — list all staff with status + actions
 *   3. Toast       — transient feedback notifications
 *
 * Props:
 *   event — { id: string, name: string, end_time?: string, ends_at?: string }
 *           end_time (ISO string) drives the 24-hour token expiry window.
 *           Falls back to ends_at for compatibility, then to 24 h from now.
 *   onBack — () => void  — called when the user taps "← Back to Events"
 */

import { useStaff }  from './useStaff.js';
import InviteForm    from './InviteForm.jsx';
import StaffTable    from './StaffTable.jsx';
import Toast         from './Toast.jsx';
import styles        from './StaffManagement.module.css';

function StaffManagement({ event, onBack }) {
  const {
    staff,
    isLoading,
    error,
    reload,
    isSubmitting,
    invite,
    revoke,
    resend,
    copyLink,
    toast,
    dismissToast,
  } = useStaff(event.id, event.end_time ?? event.ends_at ?? null);

  return (
    <div className={styles.page}>

      {/* ── Toast ── */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onDismiss={dismissToast}
        />
      )}

      {/* ── Page header ── */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <button
            className={styles.backBtn}
            onClick={onBack}
            aria-label="Back to events"
          >
            ← Back
          </button>
          <div>
            <h1 className={styles.title}>Chek-In Staff</h1>
            <p className={styles.subtitle}>{event.name}</p>
          </div>
        </div>

        <button
          className={styles.refreshBtn}
          onClick={reload}
          aria-label="Refresh staff list"
          title="Refresh"
        >
          ↻ Refresh
        </button>
      </header>

      {/* ── Invite form ── */}
      <section aria-labelledby="invite-heading">
        <InviteForm onSubmit={invite} isSubmitting={isSubmitting} />
      </section>

      {/* ── Staff list ── */}
      <section className={styles.listSection} aria-label="Staff list">
        <h2 className={styles.listHeading}>
          Team Members
          {!isLoading && (
            <span className={styles.count}>{staff.length}</span>
          )}
        </h2>

        {isLoading && (
          <div className={styles.loadingState} role="status">
            <span className={styles.spinner} aria-hidden="true" />
            <span>Loading staff…</span>
          </div>
        )}

        {!isLoading && error && (
          <div className={styles.errorState} role="alert">
            <span>Could not load staff: {error}</span>
            <button className={styles.retryBtn} onClick={reload}>
              Retry
            </button>
          </div>
        )}

        {!isLoading && !error && (
          <StaffTable
            staff={staff}
            onRevoke={revoke}
            onResend={resend}
            onCopyLink={copyLink}
          />
        )}
      </section>
    </div>
  );
}

export default StaffManagement;
