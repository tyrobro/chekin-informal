/**
 * LiveDashboard — Slice B3 entry point.
 * All data logic is unchanged — only presentation layer upgraded.
 */

import { useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLiveDashboard }  from './useLiveDashboard.js';
import MetricsBar            from './MetricsBar.jsx';
import GateBreakdown         from './GateBreakdown.jsx';
import RecentScans           from './RecentScans.jsx';
import ConnectionBanner      from './ConnectionBanner.jsx';
import styles                from './LiveDashboard.module.css';

const pageVariants = {
  initial:  { opacity: 0, y: 10 },
  animate:  { opacity: 1, y: 0  },
};
const pageTransition = { duration: 0.3, ease: [0.4, 0, 0.2, 1] };

const sectionVariants = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0  },
};

function LiveDashboard({ event, onBack }) {
  const { stats, recentScans, isLoading, loadError, mode, refresh } =
    useLiveDashboard(event.id);

  const handleRetry = useCallback(() => refresh(), [refresh]);

  return (
    <motion.div
      className={styles.page}
      variants={pageVariants}
      initial="initial"
      animate="animate"
      transition={pageTransition}
    >
      {/* ── Sticky glassmorphism header ── */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <motion.button
            className={styles.backBtn}
            onClick={onBack}
            aria-label="Back to events"
            whileHover={{ x: -2, scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            transition={{ duration: 0.15 }}
          >
            ← Back
          </motion.button>
          <div>
            <h1 className={styles.title}>Live Dashboard</h1>
            <p className={styles.subtitle}>{event.name}</p>
          </div>
        </div>

        <div className={styles.headerRight}>
          <AnimatePresence mode="wait">
            <motion.span
              key={mode}
              initial={{ opacity: 0, scale: 0.88 }}
              animate={{ opacity: 1, scale: 1    }}
              exit={{    opacity: 0, scale: 0.88 }}
              transition={{ duration: 0.2 }}
              className={`${styles.liveChip} ${mode === 'live' ? styles.livePulse : styles.liveOff}`}
              aria-label={mode === 'live' ? 'Live connection active' : 'Connection paused'}
            >
              <span className={styles.liveDot} aria-hidden="true" />
              {mode === 'live' ? 'LIVE' : 'PAUSED'}
            </motion.span>
          </AnimatePresence>

          <motion.button
            className={styles.refreshBtn}
            onClick={refresh}
            aria-label="Manually refresh data"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.95 }}
            transition={{ duration: 0.15 }}
          >
            ↻ Refresh
          </motion.button>
        </div>
      </header>

      {/* ── Connection banner ── */}
      <AnimatePresence>
        {mode === 'polling' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{    opacity: 0, height: 0      }}
            transition={{ duration: 0.22 }}
          >
            <ConnectionBanner mode={mode} onRetry={handleRetry} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Loading ── */}
      {isLoading && (
        <div className={styles.loadingState} role="status">
          <span className={styles.spinner} aria-hidden="true" />
          <span>Loading dashboard…</span>
        </div>
      )}

      {/* ── Error ── */}
      <AnimatePresence>
        {!isLoading && loadError && (
          <motion.div
            className={styles.errorState}
            role="alert"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{    opacity: 0        }}
          >
            <span>Could not load data: {loadError}</span>
            <button className={styles.retryInline} onClick={refresh}>Retry</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Main content ── */}
      {!isLoading && (
        <motion.div
          className={styles.content}
          initial="initial"
          animate="animate"
          variants={{ animate: { transition: { staggerChildren: 0.09 } } }}
        >
          {/* KPI tiles */}
          <motion.section
            variants={sectionVariants}
            transition={{ duration: 0.35 }}
            aria-labelledby="metrics-heading"
          >
            <h2 id="metrics-heading" className={styles.sectionHeading}>Overview</h2>
            <MetricsBar
              total={stats.total}
              arrived={stats.arrived}
              absent={stats.absent}
              arrivalRate={stats.arrivalRate}
            />
          </motion.section>

          {/* Gate breakdown */}
          <motion.section
            variants={sectionVariants}
            transition={{ duration: 0.35 }}
            aria-labelledby="gate-heading"
          >
            <h2 id="gate-heading" className={styles.sectionHeading}>Per-Gate Breakdown</h2>
            <GateBreakdown gateBreakdown={stats.gateBreakdown} total={stats.arrived} />
          </motion.section>

          {/* Recent scans */}
          <motion.section
            variants={sectionVariants}
            transition={{ duration: 0.35 }}
            aria-labelledby="scans-heading"
          >
            <h2 id="scans-heading" className={styles.sectionHeading}>
              Recent Scans
              <span className={styles.scanCount}>{recentScans.length} shown</span>
            </h2>
            <RecentScans scans={recentScans} />
          </motion.section>
        </motion.div>
      )}
    </motion.div>
  );
}

export default LiveDashboard;
