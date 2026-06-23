import styles from './StaffErrorStates.module.css';

/**
 * NoSearchResults — inline empty state shown inside the ManualCheckIn flow
 * when a search returns zero attendees. The search box remains visible above.
 *
 * Props:
 *   query — string — the search term that produced no results.
 */
function NoSearchResults({ query }) {
  return (
    <div className={styles.inlineEmpty} role="status" aria-live="polite">
      <div className={`${styles.iconWrap} ${styles.iconNeutral}`} aria-hidden="true">
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
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
          <line x1="8" y1="11" x2="14" y2="11" />
        </svg>
      </div>

      <h2 className={styles.inlineTitle}>
        Couldn't find{' '}
        {query ? (
          <span className={styles.inlineQuery}>"{query}"</span>
        ) : (
          'that guest'
        )}
      </h2>

      <p className={styles.inlineDescription}>
        Try a different spelling, or escalate to the host.
      </p>
    </div>
  );
}

export default NoSearchResults;
