/**
 * Simulates POST /internal/checkin/prepare/{event_id}
 *
 * @param {string} eventId
 * @param {string} policy - VerificationPolicy ('mode_a_only' | 'mode_b_only' | 'both' | 'qr_only')
 * @param {number} totalAttendees
 * @param {function} onProgress - called with each payload { status, synced, total }
 * @param {object} options
 * @param {boolean} [options.simulateError=false] - trigger a simulated error mid-sync
 * @param {number}  [options.alreadySynced=0]     - start offset for retry resumption
 * @returns {function} cancel - call to abort the in-flight simulation
 */
export function mockPrepareCheckin(eventId, policy, totalAttendees, onProgress, options = {}) {
  const { alreadySynced = 0 } = options;
  const simulateError = !window.hasFailedOnce;
  if (simulateError) window.hasFailedOnce = true;
  let currentSynced = alreadySynced;
  let timeoutId = null;
  let cancelled = false;

  // Handle zero-attendee edge case: emit success immediately (nothing to sync)
  if (totalAttendees === 0) {
    const delay = 200 + Math.random() * 600;
    timeoutId = setTimeout(() => {
      if (!cancelled) {
        onProgress({ status: 'success', synced: 0, total: 0 });
      }
    }, delay);

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }

  // Determine error threshold: random point between 30% and 70% of total
  const errorAt = simulateError
    ? Math.floor((0.3 + Math.random() * 0.4) * totalAttendees)
    : Infinity;

  const tick = () => {
    if (cancelled) return;

    const batchSize = Math.ceil(Math.random() * Math.ceil(totalAttendees / 10));
    const effectiveMax = simulateError ? Math.min(errorAt, totalAttendees) : totalAttendees;
    currentSynced = Math.min(currentSynced + batchSize, effectiveMax);

    if (simulateError && currentSynced >= errorAt) {
      onProgress({ status: 'error', synced: currentSynced, total: totalAttendees });
      return;
    }

    if (currentSynced >= totalAttendees) {
      onProgress({ status: 'success', synced: totalAttendees, total: totalAttendees });
      return;
    }

    onProgress({ status: 'progress', synced: currentSynced, total: totalAttendees });
    const delay = 200 + Math.random() * 600;
    timeoutId = setTimeout(tick, delay);
  };

  const delay = 200 + Math.random() * 600;
  timeoutId = setTimeout(tick, delay);

  return () => {
    cancelled = true;
    if (timeoutId) clearTimeout(timeoutId);
  };
}
