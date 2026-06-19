/**
 * useEventStatus.js — fetches events from ExplaraX and enriches each one
 * with its factual check-in status read from Supabase.
 *
 * Why this is necessary
 * ─────────────────────
 * The ExplaraX Events API knows nothing about check-in preparation. It returns
 * a generic "publish" status for every event. If we trusted that value alone,
 * every page refresh would reset every event to "not_prepared", forcing the
 * host to re-prepare events that are already synced.
 *
 * Instead, on every load we concurrently query Supabase to determine the
 * ground truth for each event:
 *   - Does event_attendees contain rows for this event_id?  → prepared/live
 *   - Does event_preparations have sync_status = 'complete'? → completed
 *   - Nothing in Supabase?                                  → not_prepared
 *
 * This makes the dashboard survive hard refreshes and tab restores correctly.
 *
 * Status derivation (see eventApi.fetchEventCheckinState for full logic):
 *   'not_prepared'  — no attendees synced to Supabase yet
 *   'prepared'      — attendees synced, event end_time in future
 *   'live'          — attendees synced, event end_time in past (or unknown)
 *   'completed'     — sync_status = 'complete' in event_preparations
 */

import { useState, useEffect, useCallback } from 'react';
import { fetchEvents, fetchEventCheckinState } from '../../api/eventApi.js';
import { useAuth } from '../../context/AuthContext.jsx';

export function useEventStatus() {
  const { token } = useAuth();
  const [events,    setEvents]  = useState([]);
  const [isLoading, setLoading] = useState(true);
  const [error,     setError]   = useState(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);

    try {
      // Step 1 — fetch base event list from ExplaraX
      const raw = await fetchEvents(token);

      // Normalise the raw API shape to a consistent internal shape
      const baseEvents = raw.map((e) => ({
        id:       String(e.id ?? e.event_id),
        name:     e.name ?? e.title ?? e.event_name ?? '(Unnamed event)',
        end_time: e.end_time ?? e.ends_at ?? e.event_end ?? null,
        // Carry through any other fields the API returns (used by fetchEventCheckinState)
        _raw:     e,
      }));

      if (!baseEvents.length) {
        setEvents([]);
        return;
      }

      const eventIds = baseEvents.map((e) => e.id);

      // Step 2 — concurrently query Supabase for factual check-in state.
      // Failure is non-fatal: we fall back to 'not_prepared' for all events
      // so the dashboard still renders even if Supabase is unreachable.
      let stateMap = new Map();
      try {
        stateMap = await fetchEventCheckinState(eventIds, baseEvents);
      } catch {
        // Silent fallback — stateMap stays empty, all events → not_prepared
      }

      // Step 3 — merge factual state onto each event
      const enriched = baseEvents.map((e) => {
        const state = stateMap.get(e.id) ?? {
          status:      'not_prepared',
          sync_status: null,
        };
        return {
          id:          e.id,
          name:        e.name,
          end_time:    e.end_time,
          status:      state.status,
          sync_status: state.sync_status,
        };
      });

      setEvents(enriched);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  /**
   * Optimistically mark an event as prepared after the host confirms sync.
   * The next full reload (or page refresh) will replace this with Supabase truth.
   */
  const markPrepared = useCallback((eventId) => {
    setEvents((prev) =>
      prev.map((ev) =>
        ev.id === String(eventId)
          ? { ...ev, status: 'prepared', sync_status: null }
          : ev,
      ),
    );
  }, []);

  return { events, isLoading, error, reload: load, markPrepared };
}
