/**
 * Shared streaming hook for AI assistant calls.
 *
 * Before v0.9.7 the three AI entry points (editor toolbar / SelectionAI /
 * DocAIPanel) each had their own ``await streamAI()`` plumbing duplicated:
 * ``setAnswer('')`` reset → ``setStreaming(true)`` → ``onDelta: d =>
 * setAnswer(prev => prev + d)`` → ``onDone`` / ``onError`` lifecycle. They
 * also all had subtly different error handling, abort semantics, and
 * model-resolution timing.
 *
 * This hook consolidates the pattern. Each call site supplies just the
 * payload (op + content + model + images / document_id / knowledge_base_id)
 * and reads ``state`` for rendering. The hook owns:
 *
 *   - an internal AbortController for "中止" buttons
 *   - typed error code routing → describeAIError() messages
 *   - automatic streamed text accumulation
 *   - "regenerate last call" support (stashes the most recent payload)
 *
 * The hook surface is intentionally narrow — no Antd / message coupling, so
 * the same hook works in admin pages, blog reader, and editor surfaces. The
 * caller decides how to render the error (toast / inline banner / etc).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type AIErrorPayload,
  type AIOperation,
  type AIStreamOptions,
  describeAIError,
  streamAI,
} from '@/api/ai';

export interface AIStreamState {
  /** True while a stream is in flight. */
  streaming: boolean;
  /** Accumulated text delivered so far. */
  text: string;
  /** Most recent error, or null. Cleared on next ``run``. */
  error: AIErrorPayload | null;
  /** Human-readable error title (computed from error code). */
  errorTitle: string;
  /** Human-readable error hint (computed). */
  errorHint: string;
}

export interface AIStreamApi extends AIStreamState {
  /** Start a fresh call. Cancels any in-flight stream first. */
  run: (
    operation: AIOperation,
    content: string,
    options?: Omit<AIStreamOptions, 'onDelta' | 'onDone' | 'onError' | 'signal'>,
  ) => void;
  /** Re-run the most recent call (same op, content, model, etc). No-op
   *  when no prior call exists. */
  regenerate: () => void;
  /** Abort the current stream if any. Always safe to call. */
  abort: () => void;
  /** Clear text + error and reset state to idle. */
  reset: () => void;
}

interface LastCall {
  operation: AIOperation;
  content: string;
  options?: Omit<AIStreamOptions, 'onDelta' | 'onDone' | 'onError' | 'signal'>;
}

export function useAIStream(): AIStreamApi {
  const [text, setText] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<AIErrorPayload | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastCallRef = useRef<LastCall | null>(null);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setText('');
    setStreaming(false);
    setError(null);
    lastCallRef.current = null;
  }, []);

  const run = useCallback(
    (
      operation: AIOperation,
      content: string,
      options?: Omit<AIStreamOptions, 'onDelta' | 'onDone' | 'onError' | 'signal'>,
    ) => {
      // Cancel any prior stream first.
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      lastCallRef.current = { operation, content, options };
      setText('');
      setError(null);
      setStreaming(true);
      void streamAI(operation, content, {
        ...options,
        signal: ctrl.signal,
        onDelta: (d) => setText((prev) => prev + d),
        onError: (err) => {
          setError(err);
          setStreaming(false);
        },
        onDone: () => setStreaming(false),
      });
    },
    [],
  );

  const regenerate = useCallback(() => {
    const last = lastCallRef.current;
    if (last) run(last.operation, last.content, last.options);
  }, [run]);

  // Cleanup on unmount — never leave an open stream.
  useEffect(() => () => abortRef.current?.abort(), []);

  const described = useMemo(
    () => (error ? describeAIError(error) : { title: '', hint: '' }),
    [error],
  );

  return {
    text,
    streaming,
    error,
    errorTitle: described.title,
    errorHint: described.hint,
    run,
    regenerate,
    abort,
    reset,
  };
}
