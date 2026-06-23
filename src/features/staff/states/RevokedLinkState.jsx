import styles from './StaffErrorStates.module.css';

/**
 * RevokedLinkState — full-screen state shown when the staff magic link has
 * been revoked by the host.
 *
 * Props:
 *   onContactHost — () => void (optional) — called when the CTA is activated.
 *                   If not provided the button renders as a mailto: link fallback.
 *   hostEmail     — string (optional) — mailto fallback if onContactHost is absent.
 */
function RevokedLinkState({ onContactHost, hostEmail }) {
  const handleClick = () => {
    if (onContactHost) {
      onContactHost();
    } else if (hostEmail) {
      window.location.href = `mailto:${hostEmail}`;
    }
  };

  return (
    <div className={styles.fullScreen} role="alert" aria-live="assertive">
      <div className={styles.card}>
        <div className={`${styles.iconWrap} ${styles.iconError}`} aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
            className={styles.icon} aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
          </svg>
        </div>

        <h1 className={styles.title}>This link has been revoked</h1>

        <p className={styles.description}>
          Please ask the host to send you a new invitation.
        </p>

        <button
          type="button"
          onClick={handleClick}
          className={styles.ctaButton}
        >
          Contact Host
        </button>
      </div>
    </div>
  );
}

export default RevokedLinkState;
