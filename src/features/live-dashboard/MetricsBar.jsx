/**
 * MetricsBar — four KPI tiles: Total, Arrived, Absent, Arrival Rate.
 * Purely presentational — all numbers passed as props.
 */

import styles from './MetricsBar.module.css';

/**
 * @param {{
 *   total:       number,
 *   arrived:     number,
 *   absent:      number,
 *   arrivalRate: number,  // scans in last 5 min
 * }} props
 */
function MetricsBar({ total, arrived, absent, arrivalRate }) {
  const pct = total > 0 ? Math.round((arrived / total) * 100) : 0;

  const tiles = [
    {
      label:    'Total Attendees',
      value:    total.toLocaleString(),
      sub:      'registered',
      accent:   'var(--color-primary, #7E57C2)',
      bg:       'rgba(126,87,194,0.08)',
    },
    {
      label:    'Arrived',
      value:    arrived.toLocaleString(),
      sub:      `${pct}% of total`,
      accent:   'var(--color-success, #5BC97C)',
      bg:       'rgba(91,201,124,0.10)',
    },
    {
      label:    'Absent',
      value:    absent.toLocaleString(),
      sub:      `${100 - pct}% remaining`,
      accent:   'var(--color-error, #D64545)',
      bg:       'rgba(214,69,69,0.08)',
    },
    {
      label:    'Arrival Rate',
      value:    arrivalRate.toLocaleString(),
      sub:      'scans / last 5 min',
      accent:   '#F59E0B',   // amber — distinct from the three brand tokens
      bg:       'rgba(245,158,11,0.08)',
    },
  ];

  return (
    <div className={styles.bar} role="region" aria-label="Event metrics">
      {tiles.map(({ label, value, sub, accent, bg }) => (
        <div
          key={label}
          className={styles.tile}
          style={{ '--tile-accent': accent, '--tile-bg': bg }}
        >
          <span className={styles.tileLabel}>{label}</span>
          <span className={styles.tileValue}>{value}</span>
          <span className={styles.tileSub}>{sub}</span>
          {/* bottom accent bar */}
          <div className={styles.accentBar} aria-hidden="true" />
        </div>
      ))}
    </div>
  );
}

export default MetricsBar;
