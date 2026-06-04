import { useState, useEffect, useCallback } from 'react';
import { fetchEvents } from '../../api/eventApi.js';
import { useAuth } from '../../context/AuthContext.jsx';

/**
 * useEventStatus — fetches the live event list from the ExplaraX Events API
 * and manages local status mutations (e.g. marking an event as prepared).
 *
 * NOTE: attendee counts are intentionally NOT stored here — they live in
 * a separate attendeeCounts map in EventDashboard, fetched in batches.
 *
 * @returns {{
 *   events: Event[],
 *   isLoading: boolean,
 *   error: string | null,
 *   reload: () => void,
 *   markPrepared: (eventId: string | number) => void,
 * }}
 */
export function useEventStatus() {
  const { token } = useAuth();
  const [events, setEvents]     = useState([]);
  const [isLoading, setLoading] = useState(true);
  const [error, setError]       = useState(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const raw = await fetchEvents(token);

      // The main ExplaraX API returns status: "publish" which has no meaning
      // in the check-in context. Inject 'not_prepared' as the initial local
      // state for every event — the host must explicitly prepare each one.
      const normalised = raw.map((e) => ({
        id:     e.id ?? e.event_id,
        name:   e.name ?? e.title ?? e.event_name ?? '(Unnamed event)',
        status: 'not_prepared',
      }));

      setEvents(normalised);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const markPrepared = useCallback((eventId) => {
    setEvents((prev) =>
      prev.map((ev) =>
        ev.id === eventId ? { ...ev, status: 'prepared' } : ev
      )
    );
  }, []);

  return { events, isLoading, error, reload: load, markPrepared };
}
