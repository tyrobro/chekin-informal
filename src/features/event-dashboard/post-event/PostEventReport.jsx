/**
 * PostEventReport.jsx — Post-Event Analytics Report (Slice B4).
 *
 * Rendered when event.sync_status === 'complete'.
 *
 * Sections:
 *   1. KPI Headline      — Total / Arrived / Absent / Arrival %
 *   2. Method Breakdown  — QR vs Mode A vs Mode B
 *   3. Per-Gate Analytics — table with totals, peak time, avg dwell
 *   4. Arrival Histogram — 5-min bucket bar chart (pure CSS, no chart lib)
 *   5. Absentee Roster   — scrollable list with live search
 *
 * Print export:
 *   @media print rules in PostEventReport.module.css hide nav + interactive
 *   elements and render a clean A4-friendly layout.
 *
 * Props:
 *   event  — { id, name, sync_status, starts_at? }
 *   onBack — () => void
 */

import { useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePostEventReport } from './usePostEventReport.js';
import styles from './PostEventReport.module.css';

// ── animation presets ─────────────────────────────────────────────────────────

const PAGE = {
  initial:  { opacity: 0, y: 10 },
  animate:  { opacity: 1, y: 0  },
  transition: { duration: 0.3, ease: [0.4, 0, 0.2, 1] },
};

const SECTION = {
  initial:  { opacity: 0, y: 14 },
  animate:  { opacity: 1, y: 0  },
  transition: { duration: 0.32 },
};

// ── KPI tile ──────────────────────────────────────────────────────────────────

function KpiTile({ label, value, sub, accent, bg }) {
  return (
    <motion.div
      className={styles.kpiTile}
      style={{ '--tile-accent': accent, '--tile-bg': bg }}
      whileHover={{ y: -4, boxShadow: `0 16px 40px -8px ${accent}30` }}
      transition={{ duration: 0.18 }}
    >
      <span className={styles.kpiLabel}>{label}</span>
      <span className={styles.kpiValue}>{value}</span>
      {sub && <span className={styles.kpiSub}>{sub}</span>}
      <div className={styles.kpiAccentBar} aria-hidden="true" />
    </motion.div>
  );
}

// ── Method bar ────────────────────────────────────────────────────────────────

const METHOD_COLORS = {
  'QR Scan':        '#7E57C2',
  'Manual — Mode A': '#5BC97C',
  'Manual — Mode B': '#F59E0B',
  'Other':           '#94a3b8',
};

function MethodBar({ method, count, pct }) {
  const color = METHOD_COLORS[method] ?? '#94a3b8';
  return (
    <div className={styles.methodRow}>
      <span className={styles.methodLabel}>{method}</span>
      <div className={styles.methodTrack}>
        <motion.div
          className={styles.methodFill}
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
        />
      </div>
      <span className={styles.methodCount}>{count.toLocaleString()}</span>
      <span className={styles.methodPct}>{pct}%</span>
    </div>
  );
}

// ── Arrival Histogram ─────────────────────────────────────────────────────────

function ArrivalHistogram({ histogram }) {
  if (!histogram.length) {
    return <div className={styles.emptyHint}>No scan data to display.</div>;
  }

  const maxCount = Math.max(...histogram.map((b) => b.count), 1);

  // Show at most 48 bars (4 hours of 5-min buckets) — scroll for more
  return (
    <div className={styles.histogramOuter}>
      <div className={styles.histogramScrollArea}>
        {histogram.map(({ label, count }) => {
          const heightPct = (count / maxCount) * 100;
          return (
            <div key={label} className={styles.histBar} title={`${label}: ${count}`}>
              <span className={styles.histCount}>{count > 0 ? count : ''}</span>
              <motion.div
                className={styles.histFill}
                initial={{ scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
                style={{ height: `${Math.max(heightPct, 2)}%` }}
              />
              <span className={styles.histLabel}>{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Gate Analytics table ──────────────────────────────────────────────────────

function GateTable({ gateAnalytics }) {
  if (!gateAnalytics.length) {
    return <div className={styles.emptyHint}>No gate data recorded.</div>;
  }
  return (
    <div className={styles.tableWrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.th}>Gate</th>
            <th className={styles.th}>Total Chek-Ins</th>
            <th className={styles.th}>Peak Traffic (5 min)</th>
            <th className={styles.th}>Avg Gap Between Scans</th>
          </tr>
        </thead>
        <tbody>
          {gateAnalytics.map(({ gate, total, peakTime, avgDwellMin }) => (
            <tr key={gate} className={styles.tr}>
              <td className={`${styles.td} ${styles.tdGate}`}>{gate}</td>
              <td className={`${styles.td} ${styles.tdNum}`}>{total.toLocaleString()}</td>
              <td className={styles.td}>{peakTime}</td>
              <td className={styles.td}>{avgDwellMin}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Absentee Roster ───────────────────────────────────────────────────────────

function AbsenteeRoster({ absentees, search, onSearchChange }) {
  return (
    <div className={styles.rosterWrapper}>
      {/* Search bar */}
      <div className={styles.rosterSearch} data-print-hide>
        <svg className={styles.searchIcon} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
        </svg>
        <input
          type="search"
          className={styles.searchInput}
          placeholder="Search by name, ticket type, or ID…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label="Filter absentees"
        />
        {search && (
          <button
            className={styles.searchClear}
            onClick={() => onSearchChange('')}
            aria-label="Clear search"
          >×</button>
        )}
      </div>

      {/* List */}
      {absentees.length === 0 ? (
        <div className={styles.emptyHint}>
          {search ? 'No attendees match your search.' : 'All attendees checked in — great event!'}
        </div>
      ) : (
        <div className={styles.rosterScroll}>
          <AnimatePresence initial={false}>
            {absentees.map((a) => (
              <motion.div
                key={a.ticket_id}
                layout
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0  }}
                exit={{    opacity: 0          }}
                transition={{ duration: 0.18 }}
                className={styles.rosterRow}
              >
                <div className={styles.rosterAvatar} aria-hidden="true">
                  {(a.attendee_name ?? '?')[0].toUpperCase()}
                </div>
                <div className={styles.rosterInfo}>
                  <span className={styles.rosterName}>{a.attendee_name ?? '—'}</span>
                  <span className={styles.rosterMeta}>{a.ticket_type ?? '—'} · {a.ticket_id}</span>
                </div>
                <span className={styles.absentChip}>Absent</span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

function PostEventReport({ event, onBack }) {
  const {
    kpi,
    methodBreakdown,
    gateAnalytics,
    histogram,
    absentees,
    isLoading,
    loadError,
    search,
    setSearch,
    reload,
  } = usePostEventReport(event.id);

  const printRef = useRef(null);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  return (
    <motion.div
      className={styles.page}
      initial={PAGE.initial}
      animate={PAGE.animate}
      transition={PAGE.transition}
      ref={printRef}
    >
      {/* ── Sticky glassmorphism header ── */}
      <header className={styles.header} data-print-hide>
        <div className={styles.headerLeft}>
          <motion.button
            className={styles.backBtn}
            onClick={onBack}
            whileHover={{ x: -2, scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            transition={{ duration: 0.15 }}
            aria-label="Back to events"
          >
            ← Back
          </motion.button>
          <div>
            <h1 className={styles.title}>Post-Event Report</h1>
            <p className={styles.subtitle}>{event.name}</p>
          </div>
        </div>

        <div className={styles.headerRight}>
          {/* Completed badge */}
          <span className={styles.completedBadge}>
            <span className={styles.badgeDot} aria-hidden="true" />
            Sync Complete
          </span>

          <motion.button
            className={styles.downloadBtn}
            onClick={handlePrint}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.96 }}
            transition={{ duration: 0.15 }}
            aria-label="Download or print report"
          >
            <svg className={styles.downloadIcon} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
            Share / Download Report
          </motion.button>
        </div>
      </header>

      {/* ── Print-only title block ── */}
      <div className={styles.printHeader}>
        <h1 className={styles.printTitle}>Post-Event Report — {event.name}</h1>
        <p className={styles.printMeta}>Generated {new Date().toLocaleString()}</p>
      </div>

      {/* ── Loading ── */}
      {isLoading && (
        <div className={styles.loadingState} role="status">
          <span className={styles.spinner} aria-hidden="true" />
          <span>Loading analytics…</span>
        </div>
      )}

      {/* ── Error ── */}
      <AnimatePresence>
        {!isLoading && loadError && (
          <motion.div
            className={styles.errorState}
            role="alert"
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
          >
            <span>Could not load report: {loadError}</span>
            <button className={styles.retryBtn} onClick={reload}>Retry</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Main content ── */}
      {!isLoading && !loadError && (
        <motion.div
          className={styles.content}
          initial="initial" animate="animate"
          variants={{ animate: { transition: { staggerChildren: 0.08 } } }}
        >

          {/* 1. KPI Headline */}
          <motion.section
            variants={SECTION} transition={SECTION.transition}
            aria-labelledby="kpi-heading"
          >
            <h2 id="kpi-heading" className={styles.sectionHeading}>Overview</h2>
            <div className={styles.kpiGrid}>
              <KpiTile
                label="Total Attendees" value={kpi.total.toLocaleString()}
                sub="registered" accent="#7E57C2" bg="rgba(126,87,194,0.07)"
              />
              <KpiTile
                label="Arrived" value={kpi.arrived.toLocaleString()}
                sub={`${kpi.arrivalPct}% chek-in rate`} accent="#5BC97C" bg="rgba(91,201,124,0.08)"
              />
              <KpiTile
                label="Absent" value={kpi.absent.toLocaleString()}
                sub={`${100 - kpi.arrivalPct}% did not attend`} accent="#D64545" bg="rgba(214,69,69,0.07)"
              />
              <KpiTile
                label="Arrival Rate" value={`${kpi.arrivalPct}%`}
                sub="final chek-in rate" accent="#F59E0B" bg="rgba(245,158,11,0.07)"
              />
            </div>
          </motion.section>

          {/* 2. Method Breakdown */}
          <motion.section
            variants={SECTION} transition={SECTION.transition}
            aria-labelledby="method-heading"
          >
            <h2 id="method-heading" className={styles.sectionHeading}>Chek-In Method Breakdown</h2>
            <div className={styles.card}>
              {methodBreakdown.length === 0 ? (
                <div className={styles.emptyHint}>No scan data available.</div>
              ) : (
                <div className={styles.methodList}>
                  {methodBreakdown.map((m) => (
                    <MethodBar key={m.method} {...m} />
                  ))}
                </div>
              )}
            </div>
          </motion.section>

          {/* 3. Per-Gate Analytics */}
          <motion.section
            variants={SECTION} transition={SECTION.transition}
            aria-labelledby="gate-heading"
          >
            <h2 id="gate-heading" className={styles.sectionHeading}>Per-Gate Analytics</h2>
            <GateTable gateAnalytics={gateAnalytics} />
          </motion.section>

          {/* 4. Arrival Histogram */}
          <motion.section
            variants={SECTION} transition={SECTION.transition}
            aria-labelledby="hist-heading"
          >
            <h2 id="hist-heading" className={styles.sectionHeading}>
              Arrival Timeline
              <span className={styles.headingMeta}>5-minute intervals</span>
            </h2>
            <div className={styles.card}>
              <ArrivalHistogram histogram={histogram} />
            </div>
          </motion.section>

          {/* 5. Absentee Roster */}
          <motion.section
            variants={SECTION} transition={SECTION.transition}
            aria-labelledby="absent-heading"
          >
            <h2 id="absent-heading" className={styles.sectionHeading}>
              Absentee Roster
              <span className={styles.headingMeta}>{kpi.absent} did not check in</span>
            </h2>
            <AbsenteeRoster
              absentees={absentees}
              search={search}
              onSearchChange={setSearch}
            />
          </motion.section>

        </motion.div>
      )}
    </motion.div>
  );
}

export default PostEventReport;
