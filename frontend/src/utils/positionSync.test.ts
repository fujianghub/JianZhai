import { describe, it, expect, vi } from 'vitest';
import { createDebouncedPusher, pickNewer, remoteTime } from './positionSync';

describe('positionSync', () => {
  it('parses the server stamp and tolerates garbage', () => {
    expect(remoteTime({ updated_at: '2026-09-08T10:00:00Z' })).toBe(Date.parse('2026-09-08T10:00:00Z'));
    expect(remoteTime({ updated_at: 'nope' })).toBe(0);
    expect(remoteTime(null)).toBe(0);
  });

  it('picks the newer memory, local on ties and within the echo slack', () => {
    const t = Date.parse('2026-09-08T10:00:00Z');
    const local = { t, page: 3 };
    expect(pickNewer(local, { updated_at: '2026-09-08T09:00:00Z', page: 9 })).toEqual({ source: 'local', value: local });
    // The client's own push echoes back a few hundred ms later — still local.
    expect(pickNewer(local, { updated_at: new Date(t + 600).toISOString(), page: 9 })?.source).toBe('local');
    const remote = { updated_at: new Date(t + 5000).toISOString(), page: 9 };
    expect(pickNewer(local, remote)).toEqual({ source: 'remote', value: remote });
    expect(pickNewer(null, remote)).toEqual({ source: 'remote', value: remote });
    expect(pickNewer(local, null)).toEqual({ source: 'local', value: local });
    expect(pickNewer(null, null)).toBeNull();
  });

  it('coalesces pushes into one send after the delay, merging fields', () => {
    vi.useFakeTimers();
    const send = vi.fn();
    const p = createDebouncedPusher<{ page?: number; offset?: number }>(send, 5000);
    p.push({ page: 2 });
    p.push({ offset: 0.5 });
    p.push({ page: 4 });
    vi.advanceTimersByTime(4999);
    expect(send).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({ page: 4, offset: 0.5 }, false);
    expect(p.pending()).toBeNull();
    // flush / dispose send the pending body immediately with keepalive.
    p.push({ page: 7 });
    p.dispose();
    expect(send).toHaveBeenLastCalledWith({ page: 7 }, true);
    vi.advanceTimersByTime(10000);
    expect(send).toHaveBeenCalledTimes(2);
    p.flush();
    expect(send).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
