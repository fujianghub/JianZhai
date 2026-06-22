import { useCallback, useEffect, useRef, useState } from 'react';
import { Spin } from 'antd';
import { CheckCircleFilled, ReloadOutlined, RightOutlined } from '@ant-design/icons';
import { getCaptcha, type CaptchaPuzzle } from '@/api/auth';
import { message } from '@/utils/notify';
import { formatApiError } from '@/api/client';

const HANDLE_W = 44;

interface Props {
  /** Called when the user finishes a drag — parent submits (id, x) with login. */
  onSolved: (id: string, x: number) => void;
  /** Called whenever the current solve becomes invalid (new puzzle / reset). */
  onReset: () => void;
  /** Increment to force a fresh puzzle (e.g. after a failed login attempt). */
  resetSignal?: number;
}

/** Server-verified jigsaw slider. Renders the puzzle at native pixel size
 *  (1:1) so the dragged distance equals the piece's image-pixel x. */
export default function SliderCaptcha({ onSolved, onReset, resetSignal = 0 }: Props) {
  const [puzzle, setPuzzle] = useState<CaptchaPuzzle | null>(null);
  const [loading, setLoading] = useState(true);
  const [x, setX] = useState(0);
  const [solved, setSolved] = useState(false);
  const drag = useRef<{ startClientX: number; startX: number } | null>(null);

  const maxX = puzzle ? puzzle.width - puzzle.piece_width : 0;

  const load = useCallback(() => {
    setLoading(true);
    setSolved(false);
    setX(0);
    onReset();
    getCaptcha()
      .then(setPuzzle)
      .catch((err) => {
        message.error(formatApiError(err, '验证码加载失败'));
      })
      .finally(() => setLoading(false));
  }, [onReset]);

  useEffect(() => {
    load();
  }, [load, resetSignal]);

  function onPointerDown(e: React.PointerEvent) {
    if (solved || !puzzle) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { startClientX: e.clientX, startX: x };
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current || !puzzle) return;
    // 1:1 — no CSS scaling, so screen-px delta == image-px delta.
    let nx = drag.current.startX + (e.clientX - drag.current.startClientX);
    nx = Math.max(0, Math.min(maxX, nx));
    setX(nx);
  }
  function onPointerUp() {
    if (!drag.current || !puzzle) return;
    drag.current = null;
    setSolved(true);
    onSolved(puzzle.id, Math.round(x));
  }

  if (loading || !puzzle) {
    return (
      <div style={{ height: 200, display: 'grid', placeItems: 'center' }}>
        <Spin />
      </div>
    );
  }

  return (
    <div style={{ width: puzzle.width, maxWidth: '100%', marginBottom: 4 }}>
      {/* puzzle image with the draggable piece overlay */}
      <div style={{ position: 'relative', width: puzzle.width, height: puzzle.height, borderRadius: 8, overflow: 'hidden' }}>
        <img src={puzzle.background} width={puzzle.width} height={puzzle.height} alt="验证码背景" draggable={false} />
        <img
          src={puzzle.piece}
          alt="拼块"
          draggable={false}
          style={{ position: 'absolute', left: x, top: puzzle.y, width: puzzle.piece_width, height: puzzle.piece_width, pointerEvents: 'none' }}
        />
        <button
          type="button"
          onClick={load}
          title="换一张"
          style={{ position: 'absolute', top: 6, right: 6, border: 'none', background: 'rgba(0,0,0,0.35)', color: '#fff', borderRadius: 6, width: 26, height: 26, cursor: 'pointer' }}
        >
          <ReloadOutlined />
        </button>
      </div>

      {/* drag track + handle */}
      <div
        style={{
          position: 'relative',
          height: HANDLE_W,
          marginTop: 8,
          borderRadius: HANDLE_W / 2,
          background: solved ? 'rgba(82,196,26,0.18)' : 'var(--glass-surface, rgba(127,127,127,0.12))',
          border: '1px solid var(--glass-border, rgba(127,127,127,0.25))',
          userSelect: 'none',
        }}
      >
        {/* progress fill behind the handle */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            height: HANDLE_W,
            width: x + HANDLE_W,
            borderRadius: HANDLE_W / 2,
            background: solved
              ? 'linear-gradient(90deg, rgba(82,196,26,0.22), rgba(82,196,26,0.4))'
              : 'linear-gradient(90deg, var(--jz-accent-glow, rgba(2,179,119,0.2)), color-mix(in srgb, var(--jz-accent, #02b377) 42%, transparent))',
            pointerEvents: 'none',
          }}
        />
        <span
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            fontSize: 13,
            color: 'var(--glass-text-muted, #888)',
            pointerEvents: 'none',
          }}
        >
          {solved ? '验证完成，可登录' : '拖动滑块完成拼图'}
        </span>
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          style={{
            position: 'absolute',
            left: x,
            top: 0,
            width: HANDLE_W,
            height: HANDLE_W,
            borderRadius: HANDLE_W / 2,
            background: solved ? '#52c41a' : 'var(--jz-accent, #02b377)',
            color: '#fff',
            display: 'grid',
            placeItems: 'center',
            cursor: solved ? 'default' : 'grab',
            touchAction: 'none',
            transition: 'background 0.2s ease',
            boxShadow: '0 2px 8px var(--jz-accent-glow, rgba(0,0,0,0.25))',
          }}
        >
          {solved ? <CheckCircleFilled /> : <RightOutlined />}
        </div>
      </div>
    </div>
  );
}
