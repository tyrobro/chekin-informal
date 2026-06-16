/**
 * LiveDashboard — Slice B3 entry point.
 *
 * Renders:
 *   - ConnectionBanner  (polling fallback indicator)
 *   - MetricsBar        (Total / Arrived / Absent / Arrival Rate)
 *   - GateBreakdown     (per-gate check-in table)
 *   - RecentScans       (scrolling feed of last 50 scans)
 *
 * Props:
 *   event  — { id: string, name: string }
 *   onBack — () => void
 */

import { useCallback } from 'react';
import { useLiveDashboard }  from './useLiveDashboard.js';
import MetricsBar            from './MetricsBar.jsx';
import GateBreakdown         from './GateBreakdown.jsx';
import RecentScans           from './RecentScans.jsx';
import ConnectionBanner      from './ConnectionBanner.jsx';
import styles                from './LiveDashboard.module.css';

function LiveDashboard({ event, onBack }) {
  const {
    stats,
    recentScans,
    isLoading,
    loadError,
    mode,
    refresh,
  } = useLiveDashboard(event.id);

  // "Retry live" taps into refresh — the hook will re-attempt the WS
  // connection automatically; refreshing REST data as a side-effect is
  // useful either way.
  const handleRetry = useCallback(() => {
    refresh();
  }, [refresh]);

  return (
    <div className={styles.page}>

      {/* ── Page header ── */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <button
            className={styles.backBtn}
            onClick={onBack}
            aria-label="Back to events"
          >
            ← Back
          </button>
          <div>
            <h1 className={styles.title}>Live Dashboard</h1>
            <p className={styles.subtitle}>{event.name}</p>
          </div>
        </div>

        <div className={styles.headerRight}>
          {/* Live indicator dot */}
          <span
            className={`${styles.liveChip} ${mode === 'live' ? styles.livePulse : styles.liveOff}`}
            aria-label={mode === 'live' ? 'Live connection active' : 'Connection paused'}
          >
            <span className={styles.liveDot} aria-hidden="true" />
            {mode === 'live' ? 'LIVE' : 'PAUSED'}
          </span>

          <button
            className={styles.refreshBtn}
            onClick={refresh}
            aria-label="Manually refresh data"
            title="Refresh now"
          >
            ↻ Refresh
          </button>
        </div>
      </header>

      {/* ── Connection banner (polling mode) ── */}
      <ConnectionBanner mode={mode} onRetry={handleRetry} />

      {/* ── Loading state ── */}
      {isLoading && (
        <div className={styles.loadingState} role="status">
          <span className={styles.spinner} aria-hidden="true" />
          <span>Loading dashboard…</span>
        </div>
      )}

      {/* ── Error state ── */}
      {!isLoading && loadError && (
        <div className={styles.errorState} role="alert">
          <span>Could not load data: {loadError}</span>
          <button className={styles.retryInline} onClick={refresh}>
            Retry
          </button>
        </div>
      )}

      {/* ── Main content (shown even while polling — data may be stale) ── */}
      {!isLoading && (
        <div className={styles.content}>

          {/* KPI tiles */}
          <section aria-labelledby="metrics-heading">
            <h2 id="metrics-heading" className={styles.sectionHeading}>
              Overview
            </h2>
            <MetricsBar
              total={stats.total}
              arrived={stats.arrived}
              absent={stats.absent}
              arrivalRate={stats.arrivalRate}
            />
          </section>

          {/* Gate breakdown */}
          <section aria-labelledby="gate-heading">
            <h2 id="gate-heading" className={styles.sectionHeading}>
              Per-Gate Breakdown
            </h2>
            <GateBreakdown
              gateBreakdown={stats.gateBreakdown}
              total={stats.arrived}
            />
          </section>

          {/* Recent scans feed */}
          <section aria-labelledby="scans-heading">
            <h2 id="scans-heading" className={styles.sectionHeading}>
              Recent Scans
              <span className={styles.scanCount}>
                {recentScans.length} shown
              </span>
            </h2>
            <RecentScans scans={recentScans} />
          </section>

        </div>
      )}
    </div>
  );
}

export default LiveDashboard;
