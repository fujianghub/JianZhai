import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Spin } from 'antd';
import { CheckOutlined, ReloadOutlined } from '@ant-design/icons';
import Chevron from '../common/Chevron';
import IconButton from '../common/IconButton';
import { getCaptcha, type CaptchaPuzzle } from '@/api/auth';
import { message } from '@/utils/notify';
import { formatApiError } from '@/api/client';
import {
  captchaLayout,
  clampX,
  handleToImageX,
  imageXToHandle,
  imageXToPiece,
} from './captchaGeometry';

const HANDLE_W = 44;

interface Props {
  /** Called when the user finishes a drag — parent submits (id, x) with login. */
  onSolved: (id: string, x: number) => void;
  /** Called whenever the current solve becomes invalid (new puzzle / reset). */
  onReset: () => void;
  /** Increment to force a fresh puzzle (e.g. after a failed login attempt). */
  resetSignal?: number;
  /** 拖动进度 0–1（null = 未在拖动），供登录页角色目光追随拼块。 */
  onDragProgress?: (progress: number | null) => void;
}

/** Server-verified jigsaw slider. The canvas scales to the container width;
 *  all pixel conversions live in `captchaGeometry` and the submitted x is
 *  always in image pixels. */
export default function SliderCaptcha({ onSolved, onReset, resetSignal = 0, onDragProgress }: Props) {
  const [puzzle, setPuzzle] = useState<CaptchaPuzzle | null>(null);
  const [loading, setLoading] = useState(true);
  const [x, setX] = useState(0); // image px
  const [solved, setSolved] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [containerW, setContainerW] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startClientX: number; startHandle: number } | null>(null);
  const progressRef = useRef(onDragProgress);
  progressRef.current = onDragProgress;

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

  // 容器宽度 → 缩放比；卡片随视口变窄时实时重算
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setContainerW(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [loading]);

  const layout = puzzle ? captchaLayout(puzzle, containerW, HANDLE_W) : null;

  function commit(nx: number) {
    if (!puzzle) return;
    setSolved(true);
    onSolved(puzzle.id, Math.round(nx));
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!layout) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { startClientX: e.clientX, startHandle: imageXToHandle(x, layout) };
    setDragging(true);
    if (solved) {
      setSolved(false);
      onReset();
    }
    progressRef.current?.(x / layout.maxX);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current || !layout) return;
    const nx = handleToImageX(drag.current.startHandle + (e.clientX - drag.current.startClientX), layout);
    setX(nx);
    progressRef.current?.(nx / layout.maxX);
  }
  function endDrag(cancelled: boolean) {
    if (!drag.current) return;
    drag.current = null;
    setDragging(false);
    progressRef.current?.(null);
    if (!cancelled || x > 0) commit(x);
  }
  function onKeyDown(e: React.KeyboardEvent) {
    if (!layout) return;
    const step = e.shiftKey ? 10 : 1;
    let nx: number | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') nx = x + step;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') nx = x - step;
    else if (e.key === 'Home') nx = 0;
    else if (e.key === 'End') nx = layout.maxX;
    if (nx !== null) {
      e.preventDefault();
      nx = clampX(nx, layout.maxX);
      setX(nx);
      if (solved) setSolved(false);
      commit(nx);
    }
  }

  if (loading || !puzzle) {
    return (
      <div className="jz-captcha jz-captcha--loading" ref={boxRef}>
        <Spin />
      </div>
    );
  }

  const l = layout!;
  const handleLeft = imageXToHandle(x, l);
  const cls = ['jz-captcha', solved ? 'is-solved' : '', dragging ? 'is-dragging' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <div className={cls} ref={boxRef}>
      <div className="jz-captcha-canvas" style={{ height: l.boxH }}>
        <img
          className="jz-captcha-bg"
          src={puzzle.background}
          width={l.boxW}
          height={l.boxH}
          alt="验证码背景"
          draggable={false}
        />
        <img
          className="jz-captcha-piece"
          src={puzzle.piece}
          alt=""
          draggable={false}
          style={{
            left: imageXToPiece(x, l),
            top: l.pieceTop,
            width: l.pieceSize,
            height: l.pieceSize,
          }}
        />
        <IconButton
          className="jz-captcha-reload"
          size="sm"
          icon={<ReloadOutlined />}
          aria-label="换一张"
          tooltip="换一张"
          onClick={load}
        />
      </div>

      <div className="jz-captcha-track" style={{ height: HANDLE_W }}>
        <div className="jz-captcha-fill" style={{ width: handleLeft + HANDLE_W }} />
        <span className="jz-captcha-hint">
          {solved ? '拼块已就位，可登录' : '拖动滑块，把拼块移入缺口'}
        </span>
        <div
          className="jz-captcha-handle"
          role="slider"
          tabIndex={0}
          aria-label="拼图滑块"
          aria-valuemin={0}
          aria-valuemax={l.maxX}
          aria-valuenow={Math.round(x)}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => endDrag(false)}
          onPointerCancel={() => endDrag(true)}
          onKeyDown={onKeyDown}
          style={{ left: handleLeft, width: HANDLE_W, height: HANDLE_W }}
        >
          {solved ? <CheckOutlined /> : <Chevron direction="right" double />}
        </div>
      </div>
    </div>
  );
}
