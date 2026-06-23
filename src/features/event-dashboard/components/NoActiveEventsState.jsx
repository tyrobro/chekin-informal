import styles from './NoActiveEventsState.module.css';

/**
 * NoActiveEventsState — empty state for the host dashboard when no active
 * events are available for check-in.
 *
 * Props:
 *   helpUrl — string (optional) — URL to inject into the CTA link.
 *             Defaults to the ExplaraX help centre placeholder.
 */
function NoActiveEventsState({ helpUrl = 'https://help.explarax.com/set-up-event' }) {
  return (
    <div className={styles.container} role="status" aria-live="polite">
      <div className={styles.iconWrap} aria-hidden="true">
        <svg
          className={styles.icon}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      </div>

      <h2 className={styles.title}>No active events yet</h2>

      <p className={styles.description}>
        You don't have any active events available for check-in.
      </p>

      <a
        href={helpUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={styles.cta}
      >
        How to set up an event on ExplaraX
        <svg
          className={styles.ctaIcon}
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      </a>
    </div>
  );
}

export default NoActiveEventsState;
