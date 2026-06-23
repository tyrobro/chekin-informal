/**
 * GateBreakdown — table showing check-in counts per gate.
 * Purely presentational.
 *
 * @param {{ gateBreakdown: Array<{gate: string, count: number}>, total: number }} props
 */

import styles from './GateBreakdown.module.css';

function GateBreakdown({ gateBreakdown, total }) {
  if (!gateBreakdown.length) {
    return (
      <div className={styles.empty} role="status">
        No gate data yet — check-ins will appear here as they happen.
      </div>
    );
  }

  const maxCount = gateBreakdown[0]?.count ?? 1; // largest bar = 100%

  return (
    <div
      className={styles.wrapper}
      role="region"
      aria-label="Check-ins per gate"
    >
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.th} scope="col">Gate</th>
            <th className={styles.th} scope="col">Check-ins</th>
            <th className={styles.th} scope="col" aria-label="Share of arrivals">%</th>
            <th className={styles.th} scope="col" aria-hidden="true" />
          </tr>
        </thead>
        <tbody>
          {gateBreakdown.map(({ gate, count }) => {
            const pct       = total > 0 ? Math.round((count / total) * 100) : 0;
            const barWidth  = maxCount > 0 ? (count / maxCount) * 100 : 0;

            return (
              <tr key={gate} className={styles.tr}>
                <td className={styles.td}>
                  <span className={styles.gateName}>{gate}</span>
                </td>
                <td className={`${styles.td} ${styles.num}`}>
                  {count.toLocaleString()}
                </td>
                <td className={`${styles.td} ${styles.pct}`}>
                  {pct}%
                </td>
                <td className={`${styles.td} ${styles.barCell}`}>
                  <div className={styles.barTrack} aria-hidden="true">
                    <div
                      className={styles.barFill}
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default GateBreakdown;
