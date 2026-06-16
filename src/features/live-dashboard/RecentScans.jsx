/**
 * RecentScans — scrollable feed of the last 50 scans.
 * New rows slide in with Framer Motion spring physics.
 * Existing rows smoothly shift down via the `layout` prop.
 */

import { AnimatePresence, motion } from 'framer-motion';
import styles from './RecentScans.module.css';

function fmtTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  } catch { return iso; }
}

const RESULT_STYLES = {
  success:   { label: 'Admitted',  cls: 'success' },
  denied:    { label: 'Denied',    cls: 'denied'  },
  duplicate: { label: 'Duplicate', cls: 'warn'    },
};

function ResultChip({ result }) {
  const cfg = RESULT_STYLES[result] ?? { label: result ?? '—', cls: 'warn' };
  return <span className={`${styles.chip} ${styles[cfg.cls]}`}>{cfg.label}</span>;
}

// Row spring — new items drop in from above; layout shifts existing rows.
const rowVariants = {
  initial: { opacity: 0, y: -20, scale: 0.98 },
  animate: { opacity: 1, y: 0,   scale: 1    },
  exit:    { opacity: 0,          scale: 0.97 },
};

const rowTransition = {
  type: 'spring',
  stiffness: 300,
  damping: 24,
};

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
      {/* Sticky header — rendered outside the animated list so it never moves */}
      <div className={styles.tableHeader}>
        <span className={styles.th}>Attendee</span>
        <span className={styles.th}>Ticket Type</span>
        <span className={styles.th}>Gate</span>
        <span className={styles.th}>Time</span>
        <span className={styles.th}>Staff</span>
        <span className={styles.th}>Result</span>
      </div>

      <ul className={styles.list}>
        <AnimatePresence initial={false}>
          {scans.map((scan) => (
            <motion.li
              key={scan.id ?? scan.client_scan_id ?? scan.scanned_at}
              layout
              variants={rowVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={rowTransition}
              className={styles.row}
            >
              <span className={styles.name}>{scan.attendee_name ?? '—'}</span>
              <span className={styles.type}>{scan.ticket_type   ?? '—'}</span>
              <span className={styles.gate}>{scan.gate          ?? '—'}</span>
              <span className={styles.time}>{fmtTime(scan.scanned_at)}</span>
              <span className={styles.staff}>{scan.staff_user   ?? '—'}</span>
              <ResultChip result={scan.result} />
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}

export default RecentScans;
