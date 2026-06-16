/**
 * RecentScans — scrollable feed of the last 50 scan events.
 *
 * Each row shows: Name, Ticket Type, Gate, Scan Time, Method, Result.
 * New rows animate in from the top.
 *
 * @param {{ scans: ScanRecord[] }} props
 */

import styles from './RecentScans.module.css';

/** Format ISO timestamp to human-readable HH:MM:SS */
function fmtTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour:   '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

/** Result chip colours */
const RESULT_STYLES = {
  success:   { label: 'Admitted',  cls: 'success' },
  denied:    { label: 'Denied',    cls: 'denied'  },
  duplicate: { label: 'Duplicate', cls: 'warn'    },
};

function ResultChip({ result }) {
  const cfg = RESULT_STYLES[result] ?? { label: result ?? '—', cls: 'warn' };
  return (
    <span className={`${styles.chip} ${styles[cfg.cls]}`}>
      {cfg.label}
    </span>
  );
}

function RecentScans({ scans }) {
  if (!scans.length) {
    return (
      <div className={styles.empty} role="status">
        No scans yet — they will appear here in real time.
      </div>
    );
  }

  return (
    <div
      className={styles.feedWrapper}
      role="feed"
      aria-label="Recent scans"
      aria-live="polite"
      aria-relevant="additions"
    >
      <table className={styles.table}>
        <thead className={styles.thead}>
          <tr>
            <th className={styles.th} scope="col">Attendee</th>
            <th className={styles.th} scope="col">Ticket Type</th>
            <th className={styles.th} scope="col">Gate</th>
            <th className={styles.th} scope="col">Time</th>
            <th className={styles.th} scope="col">Staff</th>
            <th className={styles.th} scope="col">Result</th>
          </tr>
        </thead>
        <tbody>
          {scans.map((scan, idx) => (
            <tr
              key={scan.id ?? idx}
              className={`${styles.tr} ${idx === 0 ? styles.newRow : ''}`}
            >
              <td className={styles.td}>
                <span className={styles.name}>{scan.attendee_name ?? '—'}</span>
              </td>
              <td className={styles.td}>
                <span className={styles.type}>{scan.ticket_type ?? '—'}</span>
              </td>
              <td className={styles.td}>
                <span className={styles.gate}>{scan.gate ?? '—'}</span>
              </td>
              <td className={`${styles.td} ${styles.time}`}>
                {fmtTime(scan.scanned_at)}
              </td>
              <td className={styles.td}>
                <span className={styles.method}>
                  {scan.staff_user ?? '—'}
                </span>
              </td>
              <td className={styles.td}>
                <ResultChip result={scan.result} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default RecentScans;
