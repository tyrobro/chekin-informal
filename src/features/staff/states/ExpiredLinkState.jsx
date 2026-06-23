import styles from './StaffErrorStates.module.css';

/**
 * ExpiredLinkState — full-screen state shown when the staff magic link has
 * expired (links are valid until 24 hours after the event ends).
 *
 * Props:
 *   onRequestNewLink — () => void (optional) — called when the CTA is tapped.
 */
function ExpiredLinkState({ onRequestNewLink }) {
  return (
    <div className={styles.fullScreen} role="alert" aria-live="assertive">
      <div className={styles.card}>
        <div className={`${styles.iconWrap} ${styles.iconWarning}`} aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
            className={styles.icon} aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>

        <h1 className={styles.title}>This link has expired</h1>

        <p className={styles.description}>
          ExplaraX Check-in links remain valid until 24 hours after the event ends.
        </p>

        <button
          type="button"
          onClick={onRequestNewLink}
          className={styles.ctaButton}
          disabled={!onRequestNewLink}
        >
          Request New Link
        </button>
      </div>
    </div>
  );
}

export default ExpiredLinkState;
