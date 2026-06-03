import { useState } from 'react';
import { mockEvents } from './mockEvents.js';

/**
 * Manages the events array and exposes a way to mark an event as prepared.
 *
 * @returns {{ events: Event[], markPrepared: (eventId: string) => void }}
 */
export function useEventStatus() {
  const [events, setEvents] = useState(mockEvents);

  /**
   * Immutably updates the matching event's status to 'prepared'.
   * @param {string} eventId
   */
  const markPrepared = (eventId) => {
    setEvents((prev) =>
      prev.map((event) =>
        event.id === eventId ? { ...event, status: 'prepared' } : event
      )
    );
  };

  return { events, markPrepared };
}
