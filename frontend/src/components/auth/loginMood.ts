/**
 * 登录页水墨猫的「心境」状态机（2026-09-24，思路参考 animatedlogin 的优先级链）。
 *
 * 纯函数：输入表单瞬时状态，输出唯一心境；姿态（爪子/耳朵/嘴）由 CSS 按
 * `data-mood` 切换，目光（瞳孔偏移/歪头）由 `gazeFor` 给出。
 *
 * 优先级：success > error > cover > peek > captcha > scout / typing > idle
 * - scout = 聚焦用户名：探身、手搭凉棚「偷看这是谁」（2026-09-25）；typing = 聚焦邮箱。
 * - error 对所有失败原因一致（登录三因子不泄露哪一项错）。
 * - cover = 密码框聚焦且密码隐藏（爪子捂眼）；peek = 密码明文显示且非空（爪缝偷看）。
 */

export type LoginMood =
  | 'idle'
  | 'typing'
  | 'scout'
  | 'cover'
  | 'peek'
  | 'captcha'
  | 'error'
  | 'success';
export type LoginField = 'username' | 'email' | 'password';

export interface MoodInputs {
  focus: LoginField | null;
  passwordVisible: boolean;
  passwordFilled: boolean;
  /** 拼图拖动进度 0–1；null = 未在拖动 */
  captchaProgress: number | null;
  error: boolean;
  success: boolean;
}

export function resolveMood(i: MoodInputs): LoginMood {
  if (i.success) return 'success';
  if (i.error) return 'error';
  if (i.focus === 'password' && !i.passwordVisible) return 'cover';
  if (i.passwordVisible && i.passwordFilled) return 'peek';
  if (i.captchaProgress !== null) return 'captcha';
  if (i.focus === 'username') return 'scout';
  if (i.focus) return 'typing';
  return 'idle';
}

export interface Gaze {
  /** 瞳孔偏移（SVG 用户单位） */
  px: number;
  py: number;
  /** 歪头角度（deg） */
  tilt: number;
}

export const PUPIL_MAX_X = 4.5;
export const PUPIL_MAX_Y = 3.5;
const TILT_MAX = 5;

/** 跟随指针：极坐标限幅（瞳孔）+ 线性限幅（歪头）；dx/dy 为指针相对猫脸中心的屏幕像素 */
export function followGaze(dx: number, dy: number): Gaze {
  const dist = Math.hypot(dx, dy);
  const reach = Math.min(1, dist / 240);
  const a = Math.atan2(dy, dx);
  return {
    px: round(Math.cos(a) * PUPIL_MAX_X * reach),
    py: round(Math.sin(a) * PUPIL_MAX_Y * reach),
    tilt: round(Math.max(-TILT_MAX, Math.min(TILT_MAX, dx / 60))),
  };
}

/** 非跟随心境的固定目光；idle 返回 null（交给指针跟随） */
export function gazeFor(
  mood: LoginMood,
  captchaProgress: number | null,
  typingProgress = 0.5,
): Gaze | null {
  switch (mood) {
    case 'typing': {
      // 目光随光标：字越长看得越靠右（表单在右栏，整体偏右）
      const t = Math.max(0, Math.min(1, typingProgress));
      return { px: round(-1 + t * (PUPIL_MAX_X + 1)), py: 1.5, tilt: round(1 + t * 4) };
    }
    case 'scout': {
      // 探身张望：目光钉在右上方的用户名框，字越多歪头越狠
      const t = Math.max(0, Math.min(1, typingProgress));
      return { px: PUPIL_MAX_X, py: -1, tilt: round(7 + t * 4) };
    }
    case 'captcha': {
      const p = Math.max(0, Math.min(1, captchaProgress ?? 0));
      return { px: round(-PUPIL_MAX_X + p * PUPIL_MAX_X * 2), py: PUPIL_MAX_Y, tilt: round(-2 + p * 6) };
    }
    case 'peek':
      return { px: PUPIL_MAX_X, py: 0.5, tilt: 6 };
    case 'error':
      return { px: -1.5, py: PUPIL_MAX_Y, tilt: -3 };
    case 'cover':
    case 'success':
      return { px: 0, py: 0, tilt: 0 };
    default:
      return null;
  }
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
