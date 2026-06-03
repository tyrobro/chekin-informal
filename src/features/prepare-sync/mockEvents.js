/**
 * Mock event seed data for the Prepare Check-in flow (Slice B1).
 *
 * Covers all four Event_Status values:
 *   - 'not_prepared'  (requirements 2.2)
 *   - 'prepared'      (requirements 2.3, 2.4)
 *   - 'live'          (requirements 2.3, 2.4)
 *   - null            (requirements 2.5) — unknown / unrecognised status
 *
 * One entry has totalAttendees: 0 to exercise the zero-attendee guard
 * in PrepareModal (requirement 3.3).
 *
 * @typedef {{ id: string, name: string, totalAttendees: number, status: 'not_prepared' | 'prepared' | 'live' | null }} Event
 */

/** @type {Event[]} */
export const mockEvents = [
  {
    id: 'evt_001',
    name: 'Summer Music Festival 2025',
    totalAttendees: 1580,
    status: 'not_prepared',
  },
  {
    id: 'evt_002',
    name: 'Tech Conference 2025',
    totalAttendees: 450,
    status: 'prepared',
  },
  {
    id: 'evt_003',
    name: 'Jazz Night Live',
    totalAttendees: 300,
    status: 'live',
  },
  {
    id: 'evt_004',
    name: 'Community Gathering',
    totalAttendees: 0,
    status: 'not_prepared',
  },
  {
    id: 'evt_005',
    name: 'Mystery Event',
    totalAttendees: 200,
    status: null,
  },
];

export default mockEvents;
