/**
 * ConnectionBanner — sticky status strip shown when NOT in live mode.
 *
 * modes:
 *   'live'    — nothing rendered (banner hidden)
 *   'polling' — amber "Live updates paused — polling" strip
 *   'loading' — nothing (spinner is shown at page level instead)
 *   'error'   — same amber strip (polling fallback is active)
 *
 * @param {{ mode: 'live'|'polling'|'loading'|'error', onRetry: () => void }} props
 */

import styles from './ConnectionBanner.module.css';

function ConnectionBanner({ mode, onRetry }) {
  if (mode === 'live' || mode === 'loading') return null;

  return (
    <div
      className={styles.banner}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {/* Pulsing dot */}
      <span className={styles.dot} aria-hidden="true" />

      <span className={styles.text}>
        Live updates paused — polling every 30 s
      </span>

      <button
        className={styles.retryBtn}
        onClick={onRetry}
        aria-label="Retry live connection"
      >
        Retry live
      </button>
    </div>
  );
}

export default ConnectionBanner;
