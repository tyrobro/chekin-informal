import { useState, useEffect, useCallback } from 'react';
import { useEventStatus } from './useEventStatus.js';
import { useModal } from './useModal.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { fetchAttendeeCount } from '../../api/eventApi.js';
import PrepareSyncModal from './PrepareSyncModal.jsx';

/** Max concurrent attendee-count requests to avoid rate-limiting. */
const BATCH_SIZE = 3;

async function runInBatches(tasks, concurrency) {
  for (let i = 0; i < tasks.length; i += concurrency) {
    await Promise.allSettled(tasks.slice(i, i + concurrency).map((t) => t()));
  }
}

// ── Inline sub-components (no external deps, purely presentational) ─────────

function StatusPill({ status }) {
  const map = {
    not_prepared: { label: 'Not Prepared', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
    prepared:     { label: 'Prepared',     cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
    live:         { label: 'Live',         cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  };
  const cfg = map[status] ?? { label: 'Status Unknown', cls: 'bg-amber-50 text-amber-700 border-amber-200' };
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold
                      border tracking-wide whitespace-nowrap ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

function Spinner({ label = 'Loading…' }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16">
      <svg className="animate-spin w-8 h-8 text-indigo-500" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
      </svg>
      <p className="text-sm text-slate-500">{label}</p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

/**
 * EventDashboard — live event list with prepare / re-sync actions.
 *
 * All hooks, state, and API logic are unchanged.
 * Only markup and Tailwind utility classes have been updated.
 */
function EventDashboard() {
  const { token, logout } = useAuth();
  const { events, isLoading, error, reload, markPrepared } = useEventStatus();
  const { activeModal, openPrepareModal, openResyncModal, closeModal } = useModal();

  const [attendeeCounts, setAttendeeCounts] = useState({});

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

  const activeEvent = activeModal ? events.find((e) => e.id === activeModal.eventId) : null;
  const activeEventAttendeeCount = activeModal ? (attendeeCounts[activeModal.eventId] ?? 0) : 0;

  const handlePrepareClick = useCallback((eventId) => {
    openPrepareModal(eventId);
  }, [openPrepareModal]);

  // ── Loading ──
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <header className="bg-white border-b border-slate-100 px-6 py-4">
          <span className="text-lg font-bold text-slate-900 tracking-tight">Check-in Dashboard</span>
        </header>
        <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-10">
          <Spinner label="Loading your events…" />
        </main>
      </div>
    );
  }

  // ── Error ──
  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <header className="bg-white border-b border-slate-100 px-6 py-4">
          <span className="text-lg font-bold text-slate-900 tracking-tight">Check-in Dashboard</span>
        </header>
        <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-10">
          <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center space-y-4">
            <p className="text-sm text-red-700">Could not load events: {error}</p>
            <button
              onClick={reload}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-red-700
                         underline underline-offset-2 hover:text-red-900 transition-colors"
            >
              Try again
            </button>
          </div>
        </main>
      </div>
    );
  }

  // ── Main ──
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">

      {/* ── Top nav ── */}
      <header className="bg-white border-b border-slate-100 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center
                            text-white font-black text-sm select-none">
              X
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900 leading-none tracking-tight">
                Check-in Dashboard
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">Manage event preparation and attendee sync</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="text-sm font-medium text-slate-500 hover:text-slate-900
                       transition-colors duration-150 px-3 py-1.5 rounded-lg
                       hover:bg-slate-100 focus:outline-none focus:ring-2
                       focus:ring-indigo-500 focus:ring-offset-2"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* ── Content ── */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-8">

        {events.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm px-8 py-16
                          text-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
              </svg>
            </div>
            <p className="text-base font-semibold text-slate-700">No events found</p>
            <p className="text-sm text-slate-400">Events on your ExplaraX account will appear here.</p>
          </div>
        ) : (
          <ul
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5"
            role="list"
          >
            {events.map((event) => {
              const count      = attendeeCounts[event.id];
              const isCounting = count === undefined;

              return (
                <li
                  key={event.id}
                  className="bg-white border border-slate-200 rounded-xl shadow-sm
                             flex flex-col gap-0
                             transition-all duration-200 ease-in-out
                             hover:-translate-y-1 hover:shadow-md"
                >
                  {/* Card body */}
                  <div className="p-5 flex-1 space-y-3">
                    {/* Status pill — top right */}
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="text-lg font-bold text-slate-900 leading-snug line-clamp-2">
                        {event.name}
                      </h2>
                      <div className="shrink-0 pt-0.5">
                        <StatusPill status={event.status} />
                      </div>
                    </div>

                    {/* Attendee count */}
                    <div className="flex items-center gap-1.5">
                      <svg className="w-4 h-4 text-slate-400 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
                      </svg>
                      <p className={`text-sm ${isCounting ? 'text-slate-300 italic' : 'text-slate-500'}`}>
                        {isCounting
                          ? 'Loading attendees…'
                          : `${count.toLocaleString()} attendees`}
                      </p>
                    </div>
                  </div>

                  {/* Card footer / actions */}
                  <div className="border-t border-slate-100 px-5 py-3.5 flex flex-wrap gap-2">
                    {event.status === 'not_prepared' && (
                      <button
                        onClick={() => handlePrepareClick(event.id)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg
                                   text-sm font-semibold text-white bg-blue-600
                                   hover:bg-blue-700 active:bg-blue-800
                                   transition-all duration-200
                                   focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                        </svg>
                        Prepare Check-in
                      </button>
                    )}

                    {(event.status === 'prepared' || event.status === 'live') && (
                      <>
                        <button
                          onClick={() => openResyncModal(event.id)}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg
                                     text-sm font-semibold text-blue-600 bg-blue-50
                                     hover:bg-blue-100 border border-blue-200
                                     transition-all duration-200
                                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                          </svg>
                          Re-sync
                        </button>
                        <button disabled className="inline-flex items-center px-3 py-2 rounded-lg text-xs
                                                    font-medium text-slate-400 bg-slate-50 border border-slate-200
                                                    cursor-not-allowed">
                          Invite Staff
                        </button>
                        <button disabled className="inline-flex items-center px-3 py-2 rounded-lg text-xs
                                                    font-medium text-slate-400 bg-slate-50 border border-slate-200
                                                    cursor-not-allowed">
                          Live Dashboard
                        </button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>

      {/* ── Modal ── */}
      {activeModal && activeEvent && (
        <PrepareSyncModal
          event={activeEvent}
          totalAttendees={activeEventAttendeeCount}
          modalType={activeModal.type}
          onClose={closeModal}
          onSyncSuccess={markPrepared}
        />
      )}
    </div>
  );
}

export default EventDashboard;
