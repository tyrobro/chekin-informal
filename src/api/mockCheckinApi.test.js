import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockPrepareCheckin } from './mockCheckinApi.js';

describe('mockPrepareCheckin', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Test 1: Cancel function prevents further callbacks after it is called
  // Requirements: 4.3, 4.4
  it('cancel function prevents further callbacks after it is called', () => {
    const onProgress = vi.fn();
    const cancel = mockPrepareCheckin('evt_001', 'both', 100, onProgress);

    // Cancel before any timers run
    cancel();

    // Advance through all pending timers — nothing should fire
    vi.runAllTimers();

    expect(onProgress).not.toHaveBeenCalled();
  });

  // Test 2: alreadySynced offset means first emitted synced value is >= alreadySynced
  // Requirements: 4.3, 4.8
  it('alreadySynced offset means first emitted synced value is >= alreadySynced', () => {
    const alreadySynced = 40;
    const total = 100;
    const payloads = [];

    mockPrepareCheckin('evt_002', 'both', total, (payload) => {
      payloads.push(payload);
    }, { alreadySynced });

    vi.runAllTimers();

    expect(payloads.length).toBeGreaterThan(0);
    // The first emitted synced value must be >= alreadySynced
    expect(payloads[0].synced).toBeGreaterThanOrEqual(alreadySynced);
  });

  // Test 3: Final payload always has synced === total on success path
  // Requirements: 4.4, 4.7
  it('final payload always has synced === total on success path', () => {
    const total = 150;
    const payloads = [];

    mockPrepareCheckin('evt_003', 'mode_a_only', total, (payload) => {
      payloads.push(payload);
    });

    vi.runAllTimers();

    expect(payloads.length).toBeGreaterThan(0);

    const lastPayload = payloads[payloads.length - 1];
    expect(lastPayload.status).toBe('success');
    expect(lastPayload.synced).toBe(total);
    expect(lastPayload.total).toBe(total);
  });
});
