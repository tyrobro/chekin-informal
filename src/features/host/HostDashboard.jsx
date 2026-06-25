/**
 * HostDashboard.jsx — Host Dashboard stub (ExplaraX Check-in)
 *
 * Slice B1 entry point for event hosts. Renders the event list when events
 * exist, or an empty state with a setup guide link when the list is empty.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Mock data — replace with a real Supabase / API fetch when the data layer
// is wired up. An empty array triggers the empty state for now.
// ─────────────────────────────────────────────────────────────────────────────
const activeEvents = [];

// ─────────────────────────────────────────────────────────────────────────────
// HostDashboard
// ─────────────────────────────────────────────────────────────────────────────
function HostDashboard() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">

      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#7E57C2]">
            ExplaraX
          </p>
          <h1 className="text-base font-bold text-slate-900 leading-tight">Host Dashboard</h1>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 flex flex-col px-6 py-8 max-w-2xl w-full mx-auto">

        {activeEvents.length === 0 ? (
          /* ── Empty state ── */
          <div className="flex-1 flex flex-col items-center justify-center text-center py-16">

            {/* Illustration placeholder */}
            <div className="w-16 h-16 rounded-2xl bg-[#7E57C2]/10 flex items-center justify-center mb-6">
              <svg
                width="30" height="30" viewBox="0 0 24 24" fill="none"
                stroke="#7E57C2" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
                <path d="M12 14v4m-2-2h4" />
              </svg>
            </div>

            <p className="text-slate-700 text-base font-medium mb-1">
              No active events yet.{' '}
              <a
                href="#"
                className="text-[#7E57C2] underline underline-offset-2 hover:text-[#6a48a8] transition-colors"
              >
                How to set up an event on ExplaraX
              </a>
            </p>
            <p className="text-slate-400 text-sm mt-2 max-w-xs">
              Once you create an event, it will appear here and you'll be able to prepare check-in staff.
            </p>

          </div>
        ) : (
          /* ── Event list (rendered when activeEvents is populated) ── */
          <ul className="space-y-3">
            {activeEvents.map((event) => (
              <li
                key={event.id}
                className="bg-white border border-slate-200 rounded-2xl px-5 py-4 flex items-center justify-between shadow-sm"
              >
                <div>
                  <p className="font-semibold text-slate-900">{event.name}</p>
                  <p className="text-slate-500 text-sm mt-0.5">{event.date}</p>
                </div>
                <span className="px-3 py-1 bg-[#7E57C2]/10 text-[#7E57C2] text-xs font-bold rounded-full border border-[#7E57C2]/20">
                  {event.status ?? 'Active'}
                </span>
              </li>
            ))}
          </ul>
        )}

      </main>
    </div>
  );
}

export default HostDashboard;
