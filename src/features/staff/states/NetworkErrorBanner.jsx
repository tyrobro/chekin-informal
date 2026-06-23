import { useState } from 'react';
import styles from './StaffErrorStates.module.css';

/**
 * NetworkErrorBanner — non-blocking dismissible banner shown when the device
 * has no network connectivity. The scanner remains visible behind it.
 *
 * Props:
 *   onDismiss — () => void (optional) — called when the banner is dismissed.
 */
function NetworkErrorBanner({ onDismiss }) {
  const [dismissed, setDismissed] = useState(false);

  const handleDismiss = () => {
    setDismissed(true);
    if (onDismiss) onDismiss();
  };

  if (dismissed) return null;

  return (
    <div
      className={styles.banner}
      role="alert"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className={styles.bannerContent}>
        <svg
          className={styles.bannerIcon}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="1" y1="1" x2="23" y2="23" />
          <path d="M16.72 11.06A10.94 10.94 0 0119 12.55" />
          <path d="M5 12.55a10.94 10.94 0 015.17-2.39" />
          <path d="M10.71 5.05A16 16 0 0122.56 9" />
          <path d="M1.42 9a15.91 15.91 0 014.7-2.88" />
          <path d="M8.53 16.11a6 6 0 016.95 0" />
          <line x1="12" y1="20" x2="12.01" y2="20" />
        </svg>

        <div className={styles.bannerText}>
          <span className={styles.bannerPrimary}>
            ExplaraX Check-in needs internet right now.
          </span>
          <span className={styles.bannerSecondary}>
            Offline mode is coming in the next update.
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss network error"
        className={styles.bannerDismiss}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          style={{ width: 16, height: 16 }}
        >
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

export default NetworkErrorBanner;
