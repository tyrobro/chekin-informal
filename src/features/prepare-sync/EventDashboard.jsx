import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useEventStatus } from './useEventStatus.js';
import { useModal } from './useModal.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { fetchAttendeeCount } from '../../api/eventApi.js';
import PrepareSyncModal  from './PrepareSyncModal.jsx';
import StaffManagement   from '../staff/StaffManagement.jsx';
import LiveDashboard     from '../live-dashboard/LiveDashboard.jsx';
import PostEventReport   from '../post-event/PostEventReport.jsx';

const BATCH_SIZE = 3;

async function runInBatches(tasks, concurrency) {
  for (let i = 0; i < tasks.length; i += concurrency) {
    await Promise.allSettled(tasks.slice(i, i + concurrency).map((t) => t()));
  }
}

// ── animation variants ────────────────────────────────────────────────────────

const pageVariants = {
  initial:  { opacity: 0, y: 10 },
  animate:  { opacity: 1, y: 0 },
  exit:     { opacity: 0, y: -6 },
};

const pageTransition = { duration: 0.28, ease: [0.4, 0, 0.2, 1] };

const cardVariants = {
  initial: { opacity: 0, y: 16, scale: 0.98 },
  animate: { opacity: 1, y: 0,  scale: 1    },
};

// ── sub-components ────────────────────────────────────────────────────────────

function StatusPill({ status }) {
  const map = {
    not_prepared: { label: 'Not Prepared', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
    prepared:     { label: 'Prepared',     cls: 'bg-violet-50 text-violet-700 border-violet-200' },
    live:         { label: 'Live',         cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    completed:    { label: 'Completed',    cls: 'bg-sky-50 text-sky-700 border-sky-200' },
  };
  const cfg = map[status] ?? { label: 'Unknown', cls: 'bg-amber-50 text-amber-700 border-amber-200' };
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold
                      border tracking-wide whitespace-nowrap ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

function Spinner({ label = 'Loading…' }) {
  return (
    <div className="flex flex-col items-center gap-3 py-20">
      <svg className="animate-spin w-9 h-9" viewBox="0 0 24 24" fill="none"
           style={{ color: '#7E57C2' }}>
        <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3.5" />
        <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
      </svg>
      <p className="text-sm text-slate-400 font-medium">{label}</p>
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

function EventDashboard() {
  const { token, logout } = useAuth();
  const { events, isLoading, error, reload, markPrepared } = useEventStatus();
  const { activeModal, openPrepareModal, openResyncModal, closeModal } = useModal();

  const [attendeeCounts, setAttendeeCounts] = useState({});
  const [staffEvent,     setStaffEvent]     = useState(null);
  const [liveEvent,      setLiveEvent]      = useState(null);
  const [reportEvent,    setReportEvent]    = useState(null);

  useEffect(() => {
    if (!events.length || !token) return;
    setAttendeeCounts({});
    const tasks = events.map((event) => async () => {
      try {
        const count = await fetchAttendeeCount(event.id, token);
        setAttendeeCounts((prev) => ({ ...prev, [event.id]: count }));
      } catch {
        setAttendeeCounts((prev) => ({ ...prev, [event.id]: 0 }));
      }
    });
    runInBatches(tasks, BATCH_SIZE);
  }, [events, token]);

  const activeEvent             = activeModal ? events.find((e) => e.id === activeModal.eventId) : null;
  const activeEventAttendeeCount = activeModal ? (attendeeCounts[activeModal.eventId] ?? 0) : 0;

  const handlePrepareClick       = useCallback((id) => openPrepareModal(id),   [openPrepareModal]);
  const handleInviteStaffClick   = useCallback((ev) => setStaffEvent(ev),      []);
  const handleLiveDashboardClick = useCallback((ev) => setLiveEvent(ev),       []);
  const handleViewReportClick    = useCallback((ev) => setReportEvent(ev),     []);

  // ── sub-views ──
  if (reportEvent) {
    return (
      <motion.div
        className="min-h-screen"
        style={{ background: '#F5F3FF' }}
        variants={pageVariants} initial="initial" animate="animate" exit="exit"
        transition={pageTransition}
      >
        <PostEventReport event={reportEvent} onBack={() => setReportEvent(null)} />
      </motion.div>
    );
  }

  // ── sub-views ──
  if (liveEvent) {
    return (
      <motion.div
        className="min-h-screen"
        style={{ background: '#F5F3FF' }}
        variants={pageVariants} initial="initial" animate="animate" exit="exit"
        transition={pageTransition}
      >
        <LiveDashboard event={liveEvent} onBack={() => setLiveEvent(null)} />
      </motion.div>
    );
  }

  if (staffEvent) {
    return (
      <motion.div
        className="min-h-screen bg-slate-50"
        variants={pageVariants} initial="initial" animate="animate" exit="exit"
        transition={pageTransition}
      >
        <StaffManagement event={staffEvent} onBack={() => setStaffEvent(null)} />
      </motion.div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <NavBar onLogout={logout} />
        <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-10">
          <Spinner label="Loading your events…" />
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <NavBar onLogout={logout} />
        <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-10">
          <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center space-y-4">
            <p className="text-sm text-red-600 font-medium">Could not load events: {error}</p>
            <motion.button
              onClick={reload}
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
              className="text-sm font-semibold text-red-600 underline underline-offset-2"
            >
              Try again
            </motion.button>
          </div>
        </main>
      </div>
    );
  }

  // ── main view ──
  return (
    <motion.div
      className="min-h-screen flex flex-col"
      style={{ background: '#F5F3FF' }}
      variants={pageVariants} initial="initial" animate="animate"
      transition={pageTransition}
    >
      <NavBar onLogout={logout} />

      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-8">
        {events.length === 0 ? (
          <motion.div
            variants={cardVariants} initial="initial" animate="animate"
            transition={{ duration: 0.35 }}
            className="bg-white rounded-2xl border border-slate-100 shadow-sm px-8 py-16 text-center"
            style={{ boxShadow: '0 10px 40px -10px rgba(126,87,194,0.12)' }}
          >
            <div className="w-12 h-12 rounded-2xl bg-violet-50 flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-violet-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
              </svg>
            </div>
            <p className="text-base font-bold text-slate-700">No events found</p>
            <p className="text-sm text-slate-400 mt-1">Events on your ExplaraX account will appear here.</p>
          </motion.div>
        ) : (
          <motion.ul
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5"
            role="list"
            initial="initial" animate="animate"
            variants={{ animate: { transition: { staggerChildren: 0.06 } } }}
          >
            {events.map((event) => {
              const count      = attendeeCounts[event.id];
              const isCounting = count === undefined;

              return (
                <motion.li
                  key={event.id}
                  variants={cardVariants}
                  transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                  whileHover={{ y: -4, boxShadow: '0 20px 40px -10px rgba(126,87,194,0.18)' }}
                  className="bg-white border border-slate-100 rounded-2xl flex flex-col"
                  style={{ boxShadow: '0 4px 16px -4px rgba(126,87,194,0.10)' }}
                >
                  {/* Card body */}
                  <div className="p-6 flex-1 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="text-base font-bold text-slate-900 leading-snug line-clamp-2">
                        {event.name}
                      </h2>
                      <div className="shrink-0 pt-0.5">
                        <StatusPill status={event.status} />
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <svg className="w-4 h-4 text-slate-300 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
                      </svg>
                      <p className={`text-sm font-medium ${isCounting ? 'text-slate-300 italic' : 'text-slate-500'}`}>
                        {isCounting ? 'Loading attendees…' : `${count.toLocaleString()} attendees`}
                      </p>
                    </div>
                  </div>

                  {/* Card footer */}
                  <div className="border-t border-slate-100 px-6 py-4 flex flex-wrap gap-2">
                    {event.status === 'not_prepared' && (
                      <ActionButton
                        onClick={() => handlePrepareClick(event.id)}
                        bg="#7E57C2" hoverBg="#6A3FB5"
                        icon={<path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />}
                      >
                        Prepare Chek-In
                      </ActionButton>
                    )}

                    {(event.status === 'prepared' || event.status === 'live') && (
                      <>
                        <ActionButton
                          onClick={() => openResyncModal(event.id)}
                          bg="transparent" hoverBg="rgba(126,87,194,0.08)"
                          textColor="#7E57C2" border="1px solid rgba(126,87,194,0.3)"
                          icon={<path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />}
                        >
                          Re-sync
                        </ActionButton>
                        <ActionButton
                          onClick={() => handleInviteStaffClick(event)}
                          bg="#7E57C2" hoverBg="#6A3FB5"
                          icon={<path d="M8 9a3 3 0 100-6 3 3 0 000 6zM8 11a6 6 0 016 6H2a6 6 0 016-6zM16 7a1 1 0 10-2 0v1h-1a1 1 0 100 2h1v1a1 1 0 102 0v-1h1a1 1 0 100-2h-1V7z" />}
                        >
                          Invite Staff
                        </ActionButton>
                        <ActionButton
                          onClick={() => handleLiveDashboardClick(event)}
                          bg="#5BC97C" hoverBg="#47b568"
                          icon={<path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />}
                        >
                          Live Dashboard
                        </ActionButton>
                      </>
                    )}

                    {/* ── Completed: sync is done, show report button ── */}
                    {(event.sync_status === 'complete' || event.status === 'prepared') && (
                      <ActionButton
                        onClick={() => handleViewReportClick(event)}
                        bg="#7E57C2" hoverBg="#6A3FB5"
                        icon={<path fillRule="evenodd" d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V7.414A2 2 0 0015.414 6L12 2.586A2 2 0 0010.586 2H6zm2 10a1 1 0 10-2 0v1a1 1 0 102 0v-1zm0-4a1 1 0 10-2 0v3a1 1 0 102 0V8zm4-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />}
                      >
                        View Report
                      </ActionButton>
                    )}
                  </div>
                </motion.li>
              );
            })}
          </motion.ul>
        )}
      </main>

      {activeModal && activeEvent && (
        <PrepareSyncModal
          event={activeEvent}
          totalAttendees={activeEventAttendeeCount}
          modalType={activeModal.type}
          onClose={closeModal}
          onSyncSuccess={markPrepared}
        />
      )}
    </motion.div>
  );
}

// ── shared nav ────────────────────────────────────────────────────────────────

function NavBar({ onLogout }) {
  return (
    <header
      className="sticky top-0 z-20 border-b"
      style={{
        background: 'rgba(255,255,255,0.80)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderColor: 'rgba(0,0,0,0.06)',
      }}
    >
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center text-white font-black text-sm select-none"
            style={{ background: 'linear-gradient(135deg,#7E57C2,#9575CD)' }}
          >
            X
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-900 leading-none tracking-tight">
              Chek-In Dashboard
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">ExplaraX Host Portal</p>
          </div>
        </div>
        <motion.button
          onClick={onLogout}
          whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
          className="text-sm font-semibold text-slate-500 px-3 py-1.5 rounded-lg
                     hover:bg-slate-100 transition-colors"
        >
          Sign out
        </motion.button>
      </div>
    </header>
  );
}

// ── reusable action button ────────────────────────────────────────────────────

function ActionButton({ onClick, children, icon, bg, hoverBg, textColor = '#fff', border = 'none' }) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.02, backgroundColor: hoverBg }}
      whileTap={{ scale: 0.96 }}
      transition={{ duration: 0.15 }}
      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold
                 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
      style={{
        background: bg,
        color: textColor,
        border,
        boxShadow: bg !== 'transparent' ? '0 2px 8px rgba(0,0,0,0.10)' : 'none',
      }}
    >
      {icon && (
        <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
          {icon}
        </svg>
      )}
      {children}
    </motion.button>
  );
}

export default EventDashboard;
