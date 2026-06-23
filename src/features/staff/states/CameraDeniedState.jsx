import styles from './StaffErrorStates.module.css';

/**
 * CameraDeniedState — replaces the scanner viewport when camera permission is
 * denied. The Manual Check-in button remains available above/below.
 *
 * Props:
 *   onManualCheckIn — () => void — called when staff taps the manual check-in CTA.
 *   helpUrl         — string (optional) — deep-link to OS camera permission docs.
 */
function CameraDeniedState({
  onManualCheckIn,
  helpUrl = 'https://help.explarax.com/camera-permission',
}) {
  return (
    <div className={styles.cameraPanel} role="status" aria-live="polite">
      <div className={`${styles.iconWrap} ${styles.iconWarning}`} aria-hidden="true">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={styles.icon}
          aria-hidden="true"
        >
          <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </svg>
      </div>

      <h2 className={styles.title}>Camera access denied.</h2>

      <p className={styles.description}>
        You can still check guests in manually.
      </p>

      <a
        href={helpUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={styles.helpLink}
      >
        How to re-enable camera
      </a>

      {onManualCheckIn && (
        <button
          type="button"
          onClick={onManualCheckIn}
          className={styles.ctaButton}
        >
          Manual Check-in
        </button>
      )}
    </div>
  );
}

export default CameraDeniedState;
