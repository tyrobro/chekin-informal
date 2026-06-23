/**
 * MetricsBar — four KPI tiles with Framer Motion hover lift.
 * All numbers passed as props — purely presentational.
 */

import { motion } from 'framer-motion';
import styles from './MetricsBar.module.css';

function MetricsBar({ total, arrived, absent, arrivalRate }) {
  const pct = total > 0 ? Math.round((arrived / total) * 100) : 0;

  const tiles = [
    {
      label:  'Total Attendees',
      value:  total.toLocaleString(),
      sub:    'registered',
      accent: '#7E57C2',
      bg:     'rgba(126,87,194,0.07)',
    },
    {
      label:  'Arrived',
      value:  arrived.toLocaleString(),
      sub:    `${pct}% checked in`,
      accent: '#5BC97C',
      bg:     'rgba(91,201,124,0.08)',
    },
    {
      label:  'Absent',
      value:  absent.toLocaleString(),
      sub:    `${100 - pct}% remaining`,
      accent: '#D64545',
      bg:     'rgba(214,69,69,0.07)',
    },
    {
      label:  'Arrival Rate',
      value:  arrivalRate.toLocaleString(),
      sub:    'scans / last 5 min',
      accent: '#F59E0B',
      bg:     'rgba(245,158,11,0.07)',
    },
  ];

  return (
    <div className={styles.bar} role="region" aria-label="Event metrics">
      {tiles.map(({ label, value, sub, accent, bg }, i) => (
        <motion.div
          key={label}
          className={styles.tile}
          style={{ '--tile-accent': accent, '--tile-bg': bg }}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0  }}
          transition={{ duration: 0.32, delay: i * 0.06, ease: [0.4, 0, 0.2, 1] }}
          whileHover={{
            y: -4,
            boxShadow: `0 16px 40px -8px ${accent}30`,
            transition: { duration: 0.2 },
          }}
        >
          <span className={styles.tileLabel}>{label}</span>
          <span className={styles.tileValue}>{value}</span>
          <span className={styles.tileSub}>{sub}</span>
          <div className={styles.accentBar} aria-hidden="true" />
        </motion.div>
      ))}
    </div>
  );
}

export default MetricsBar;
