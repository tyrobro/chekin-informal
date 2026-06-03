/**
 * Property-based tests for mockPrepareCheckin
 *
 * Property 6: Mock API progress is monotonically increasing and terminates
 *             with a success payload
 *   Validates: Requirements 4.3, 4.4, 4.7
 *
 * Property 7: Mock API error fires between 30% and 70% of total when
 *             simulateError is true
 *   Validates: Requirements 4.6
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import { mockPrepareCheckin } from './mockCheckinApi.js';

// ---------------------------------------------------------------------------
// Helper: run mockPrepareCheckin to completion under fake timers and collect
// all emitted payloads.
//
// Each tick schedules the *next* tick, so a single vi.runAllTimers() only
// advances one level.  We call it in a loop until the callbacks array stops
// growing (i.e., no more ticks are pending).
// ---------------------------------------------------------------------------
function collectPayloads(totalAttendees, options = {}) {
  const payloads = [];
  mockPrepareCheckin(
    'evt_test',
    'both',
    totalAttendees,
    (payload) => payloads.push(payload),
    options,
  );

  // Advance through every chained setTimeout until the sequence terminates.
  let prevLen = -1;
  while (payloads.length !== prevLen) {
    prevLen = payloads.length;
    vi.runAllTimers();
  }

  return payloads;
}

// ---------------------------------------------------------------------------

describe('mockPrepareCheckin — property tests', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // Property 6: Mock API progress is monotonically increasing and terminates
  //             with a success payload
  //   **Validates: Requirements 4.3, 4.4, 4.7**
  // -------------------------------------------------------------------------
  it(
    'Property 6: synced values never decrease between callbacks and the final callback is status:"success" with synced===total',
    () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 500 }),
          (totalAttendees) => {
            const payloads = collectPayloads(totalAttendees, { simulateError: false });

            // Must have emitted at least one callback
            expect(payloads.length).toBeGreaterThan(0);

            // --- Monotonicity: synced never decreases ---
            for (let i = 1; i < payloads.length; i++) {
              expect(payloads[i].synced).toBeGreaterThanOrEqual(payloads[i - 1].synced);
            }

            // --- Terminal callback is success with synced === total ---
            const last = payloads[payloads.length - 1];
            expect(last.status).toBe('success');
            expect(last.synced).toBe(totalAttendees);
            expect(last.total).toBe(totalAttendees);
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  // -------------------------------------------------------------------------
  // Property 7: Mock API error fires between 30% and 70% of total when
  //             simulateError is true
  //   **Validates: Requirements 4.6**
  // -------------------------------------------------------------------------
  it(
    'Property 7: when simulateError is true, the terminal callback is status:"error" and 0.30*total <= synced <= 0.70*total',
    () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 500 }),
          (totalAttendees) => {
            const payloads = collectPayloads(totalAttendees, { simulateError: true });

            // Must have emitted at least one callback
            expect(payloads.length).toBeGreaterThan(0);

            // --- Terminal callback must be an error ---
            const last = payloads[payloads.length - 1];
            expect(last.status).toBe('error');

            // --- Error must fire within the 30–70% window ---
            const lowerBound = 0.3 * totalAttendees;
            const upperBound = 0.7 * totalAttendees;
            expect(last.synced).toBeGreaterThanOrEqual(lowerBound);
            expect(last.synced).toBeLessThanOrEqual(upperBound);

            // --- total field is preserved correctly ---
            expect(last.total).toBe(totalAttendees);
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});
