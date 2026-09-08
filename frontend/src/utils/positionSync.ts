/**
 * Cross-device reading position: pure helpers shared by the four readers.
 *
 * Every reader keeps its localStorage memory as the fast path (works logged
 * out, survives the network) and mirrors it to ``apps.reading.ReadingPosition``
 * when signed in. On open the two candidates are merged by time — the local
 * record carries ``t`` (ms), the server row ``updated_at`` (ISO) — and the
 * newer one wins. A local record wins ties and anything within one second:
 * the client's own push always lands a little after its local stamp, and
 * treating that echo as "newer" would make the same device look like it was
 * resumed from elsewhere.
 */

export interface LocalStamped {
  t: number;
}

export interface RemoteStamped {
  updated_at: string;
}

export const REMOTE_SLACK_MS = 1000;

export function remoteTime(rec: RemoteStamped | null | undefined): number {
  if (!rec || !rec.updated_at) return 0;
  const ms = Date.parse(rec.updated_at);
  return Number.isFinite(ms) ? ms : 0;
}

export type Pick<L, R> = { source: 'local'; value: L } | { source: 'remote'; value: R } | null;

/** Which memory to resume from: the newer of the two, local on ties. */
export function pickNewer<L extends LocalStamped, R extends RemoteStamped>(local: L | null | undefined, remote: R | null | undefined): Pick<L, R> {
  if (local && remote) {
    return remoteTime(remote) > (local.t || 0) + REMOTE_SLACK_MS ? { source: 'remote', value: remote } : { source: 'local', value: local };
  }
  if (local) return { source: 'local', value: local };
  if (remote) return { source: 'remote', value: remote };
  return null;
}

export interface DebouncedPusher<T extends object> {
  /** Merge `body` into the pending write and (re)start the timer. */
  push: (body: T) => void;
  /** Send whatever is pending right now (`keepalive` for unload paths). */
  flush: (keepalive?: boolean) => void;
  /** Flush (keepalive) and stop the timer — for unmount. */
  dispose: () => void;
  /** Test hook. */
  pending: () => T | null;
}

/** Coalesce position writes: many pushes → one request `delayMs` after the
 * last one. `send` failures are the caller's business (usually ignored — the
 * local memory still holds the position). */
export function createDebouncedPusher<T extends object>(
  send: (body: T, keepalive: boolean) => unknown,
  delayMs = 5000,
  // Arrow wrappers: passing the bare globals and calling them as `timers.set`
  // invokes window.setTimeout with the wrong `this` → "Illegal invocation".
  timers: { set: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>; clear: (id: ReturnType<typeof setTimeout>) => void } = {
    set: (fn, ms) => setTimeout(fn, ms),
    clear: (id) => clearTimeout(id),
  },
): DebouncedPusher<T> {
  let pending: T | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const clear = () => {
    if (timer != null) timers.clear(timer);
    timer = null;
  };
  const flush = (keepalive = false) => {
    clear();
    if (!pending) return;
    const body = pending;
    pending = null;
    try {
      void send(body, keepalive);
    } catch {
      /* caller handles */
    }
  };
  return {
    push(body) {
      pending = pending ? { ...pending, ...body } : { ...body };
      clear();
      timer = timers.set(() => flush(false), delayMs);
    },
    flush,
    dispose() {
      flush(true);
    },
    pending: () => pending,
  };
}
