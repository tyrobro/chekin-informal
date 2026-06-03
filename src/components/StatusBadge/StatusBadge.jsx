import styles from './StatusBadge.module.css';

/**
 * StatusBadge — reusable, stateless UI atom
 *
 * Props:
 *   status — 'not_prepared' | 'prepared' | 'live' | 'unknown' | null | any
 *
 * Maps each status to a human-readable label and a CSS modifier class.
 * Null and unrecognised values render "Status Unknown".
 */

const STATUS_MAP = {
  not_prepared: { label: 'Not Prepared', modifierClass: 'notPrepared' },
  prepared:     { label: 'Prepared',     modifierClass: 'prepared' },
  live:         { label: 'Live',         modifierClass: 'live' },
};

function StatusBadge({ status }) {
  const config = STATUS_MAP[status] ?? { label: 'Status Unknown', modifierClass: 'unknown' };

  return (
    <span className={`${styles.badge} ${styles[config.modifierClass]}`}>
      {config.label}
    </span>
  );
}

export default StatusBadge;
