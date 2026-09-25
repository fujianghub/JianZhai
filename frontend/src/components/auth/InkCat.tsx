import { useId, useRef } from 'react';
import type { LoginMood } from './loginMood';
import type { CatBehavior } from './inkcat/catEngine';
import { useCatEngine } from './inkcat/useCatEngine';
import { earGeometry, earTransform, poseFor, tailPath } from './inkcat/catRig';
import type { CoatId } from './inkcat/coats';

/**
 * 登录页小猫（2026-09-25 六期：往「可爱」走）。
 *
 * 可爱化依据「婴儿图式」：大圆年糕脸、眼睛更大且在脸中线以下、瞳孔默认圆而大、
 * 口鼻小而聚在下方、腮红常驻、圆耳尖、团子身 + 短胖腿、蓬松粗尾、柔和勾线（无噪声毛边）。
 * 毛色只有两种：浅色主题黑猫（黑身 + 白口鼻 + 白爪），暗色主题纯白猫（双蓝眼）——
 * 色值在 login.css `[data-coat]`，映射在 inkcat/coats。脖子上一只铃铛项圈，项圈跟主题主色。
 *
 * 结构（变换分层，JS 与 CSS 关键帧各占一层，互不覆盖）：
 *   .jz-cat-mover ×2（JS：身体倾 transform；CSS：跳 translate / 翻肚 rotate）
 *     后层：尾 / 身（呼吸）/ 项圈 + 铃铛（JS 摆动）；中间：静止的线装书；
 *     前层：.jz-cat-head（JS：歪头+平移）› .jz-cat-headpose（CSS：睡垂/摇头/哈欠）› 前爪（CSS）
 * 耳朵/尾巴/眉毛/铃铛是软体，由 inkcat/useCatEngine 每帧驱动（几何在 inkcat/catRig）；
 * 嘴/眼/漫符/前爪/头部关键帧走 styles/login.css「小猫」。
 *
 * variant='peek'：手机端探头猫——只有头与搭在卡片沿上的两只爪。
 */
export default function InkCat({
  mood,
  captchaProgress,
  typingProgress = 0.5,
  keyPulse = NO_PULSE,
  variant = 'full',
  coat = 'black',
  onBehavior,
  onHover,
}: {
  mood: LoginMood;
  captchaProgress: number | null;
  typingProgress?: number;
  keyPulse?: { tick: number; del: boolean };
  variant?: 'full' | 'peek';
  /** 毛色：黑 / 白（inkcat/coats；色值在 login.css `[data-coat]`） */
  coat?: CoatId;
  onBehavior?: (b: CatBehavior) => void;
  onHover?: (hovering: boolean) => void;
}) {
  const rootRef = useRef<SVGSVGElement>(null);
  const anchorRef = useRef<SVGCircleElement>(null);
  const full = variant === 'full';
  const { onPointerEnter, onPointerLeave, onPet } = useCatEngine(rootRef, anchorRef, {
    mood,
    captchaProgress,
    typingProgress,
    keyPulse,
    withBody: full,
    onBehavior,
    onHover,
  });
  const uid = useId().replace(/:/g, '');
  const id = (k: string) => `jz-cat-${k}-${uid}`;
  const url = (k: string) => `url(#${id(k)})`;
  const petProps = { onPointerEnter, onPointerLeave, onPointerDown: onPet };

  return (
    <svg
      ref={rootRef}
      className={`jz-inkcat jz-inkcat--${variant}`}
      data-mood={mood}
      data-behavior="none"
      data-coat={coat}
      viewBox={full ? '0 0 300 340' : '36 30 228 216'}
      role="presentation"
      aria-hidden
      focusable="false"
    >
      <defs>
        {/* 毛色：头顶略浓、四周略淡；userSpaceOnUse 让眼睑与脸同一张渐变无缝 */}
        <radialGradient
          id={id('coat')}
          gradientUnits="userSpaceOnUse"
          cx="150"
          cy="150"
          r="160"
          fx="150"
          fy="118"
        >
          <stop offset="0" className="jz-cat-s-main-a" />
          <stop offset="0.6" className="jz-cat-s-main-a" />
          <stop offset="1" className="jz-cat-s-main-b" />
        </radialGradient>
        <linearGradient id={id('patch')} gradientUnits="userSpaceOnUse" x1="0" y1="184" x2="0" y2="220">
          <stop offset="0" className="jz-cat-s-patch-a" />
          <stop offset="1" className="jz-cat-s-patch-b" />
        </linearGradient>
        {/* 白爪：外侧受光、内侧一线暗 */}
        {(['l', 'r'] as const).map((s) => (
          <linearGradient key={s} id={id(`paw-${s}`)} x1={s === 'l' ? 0 : 1} y1="0" x2={s === 'l' ? 1 : 0} y2="0">
            <stop offset="0" className="jz-cat-s-patch-a" />
            <stop offset="0.62" className="jz-cat-s-patch-a" />
            <stop offset="1" className="jz-cat-s-paw-shade" />
          </linearGradient>
        ))}
        <linearGradient id={id('tail')} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" className="jz-cat-s-tail-b" />
          <stop offset="1" className="jz-cat-s-tail-a" />
        </linearGradient>
        {(['l', 'r'] as const).map((s) => (
          <radialGradient key={s} id={id(`iris-${s}`)} cx="0.5" cy="0.36" r="0.66">
            <stop offset="0" className={`jz-cat-s-iris-${s}-a`} />
            <stop offset="0.7" className={`jz-cat-s-iris-${s}-b`} />
            <stop offset="1" className={`jz-cat-s-iris-${s}-c`} />
          </radialGradient>
        ))}
        <radialGradient id={id('blush')}>
          <stop offset="0" className="jz-cat-s-blush" />
          <stop offset="1" className="jz-cat-s-blush" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={id('ground')}>
          <stop offset="0" className="jz-cat-s-ground" />
          <stop offset="1" className="jz-cat-s-ground" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={id('bell')} cx="0.38" cy="0.32" r="0.75">
          <stop offset="0" stopColor="#fff6cf" />
          <stop offset="0.45" stopColor="#f6c64e" />
          <stop offset="1" stopColor="#b8861c" />
        </radialGradient>
        {(['l', 'r'] as const).map((s) => (
          <clipPath key={s} id={id(`eye-${s}`)}>
            <ellipse cx={EYE[s]} cy={EY} rx="20" ry="22" />
          </clipPath>
        ))}
        {/* 眼睑裁剪比眼窝外扩 1.6：盖住眼窝边缘的抗锯齿（否则闭眼会漏一圈眼眶）；
            外扩那圈与脸同一张 userSpaceOnUse 渐变，看不出来 */}
        {(['l', 'r'] as const).map((s) => (
          <clipPath key={s} id={id(`lid-${s}`)}>
            <ellipse cx={EYE[s]} cy={EY} rx="21.6" ry="23.6" />
          </clipPath>
        ))}
      </defs>

      {full && <ellipse cx="150" cy="324" rx="124" ry="9" fill={url('ground')} />}

      {full && (
        <g className="jz-cat-mover" {...petProps}>
          {/* 尾：藏在后腿后起笔，一笔卷上（粗而蓬松） */}
          <g className="jz-cat-tail">
            <g className="jz-cat-tail-pose">
              <path className="jz-cat-tail-rim" d={TAIL_D} strokeWidth={POSE0.tail.puff + 4} />
              <path
                className="jz-cat-tail-stroke"
                d={TAIL_D}
                stroke={url('tail')}
                strokeWidth={POSE0.tail.puff}
              />
            </g>
          </g>

          <g className="jz-cat-body">
            {/* 团子身 + 两团后腿 */}
            <g className="jz-cat-outline">
              <path
                d="M110 288 C102 262 108 236 124 226 C136 219 164 219 176 226 C192 236 198 262 190 288 Z"
                fill={url('coat')}
              />
              <ellipse cx="113" cy="273" rx="20" ry="16" fill={url('coat')} />
              <ellipse cx="187" cy="273" rx="20" ry="16" fill={url('coat')} />
            </g>
            <ellipse className="jz-cat-chin-shade" cx="150" cy="226" rx="34" ry="7" />
            {/* 铃铛项圈：项圈跟主题主色，铃铛由引擎按身体晃动驱动摆动 */}
            <path className="jz-cat-collar-o" d={COLLAR_D} />
            <path className="jz-cat-collar" d={COLLAR_D} />
            <g className="jz-cat-bell">
              <ellipse className="jz-cat-bell-loop" cx="150" cy="236.6" rx="2.3" ry="1.8" />
              <circle className="jz-cat-bell-ball" cx="150" cy="243.2" r="6.3" fill={url('bell')} />
              <path className="jz-cat-bell-band" d="M144 241.4 Q150 243.7 156 241.4" />
              <circle className="jz-cat-bell-hole" cx="150" cy="245.8" r="1.3" />
              <path className="jz-cat-bell-slit" d="M150 246.7 V249.3" />
            </g>
            <ellipse className="jz-cat-ripple" cx="150" cy="250" rx="24" ry="18" />
            <ellipse className="jz-cat-ripple jz-cat-ripple--2" cx="150" cy="250" rx="24" ry="18" />
          </g>
        </g>
      )}

      {full && (
        <g className="jz-cat-books">
          {/* 线装书两册 + 书根题字 + 成功时的朱砂印 */}
          <rect className="jz-cat-cover jz-cat-cover--low" x="44" y="296" width="212" height="4" rx="1.5" />
          <rect className="jz-cat-paper" x="45" y="300" width="210" height="18" />
          <path className="jz-cat-paper-line" d="M45 305 H255 M45 310 H255 M45 315 H255" />
          <rect className="jz-cat-cover jz-cat-cover--low" x="44" y="318" width="212" height="4" rx="1.5" />
          <rect className="jz-cat-cover jz-cat-cover--top" x="62" y="272" width="176" height="4" rx="1.5" />
          <rect className="jz-cat-paper" x="63" y="276" width="174" height="16" />
          <path className="jz-cat-paper-line" d="M63 281 H237 M63 286 H237" />
          <rect className="jz-cat-cover jz-cat-cover--top" x="62" y="292" width="176" height="4" rx="1.5" />
          <path className="jz-cat-thread" d="M70 272 V296 M76 272 V296 M52 296 V322 M58 296 V322" />
          <text className="jz-cat-shugen" x="220" y="288" fontSize="8.5" textAnchor="middle">
            简斋
          </text>
          <g className="jz-cat-seal">
            <rect x="222" y="299" width="19" height="19" rx="2" />
            <text x="231.5" y="313.2" fontSize="13" textAnchor="middle">
              准
            </text>
          </g>
        </g>
      )}

      <g className="jz-cat-mover" {...petProps}>
        <g className="jz-cat-head">
          <g className="jz-cat-headpose">
            {/* 软体耳（圆耳尖）：路径由 inkcat/catRig 每帧生成（此处为首帧） */}
            {(['l', 'r'] as const).map((side) => {
              const geo = side === 'l' ? EAR0_L : EAR0_R;
              return (
                <g key={side} className={`jz-cat-ear jz-cat-ear--${side}`} transform={earTransform(side, 0)}>
                  <path className="jz-cat-ear-out jz-cat-outline" d={geo.outer} fill={url('coat')} />
                  <path className="jz-cat-ear-in" d={geo.inner} opacity={geo.innerOpacity} />
                </g>
              );
            })}
            {/* 大圆年糕脸：最宽处在中线偏下（腮帮鼓） */}
            <path
              className="jz-cat-outline"
              d="M68 162 C66 120 102 86 150 86 C198 86 234 120 232 162 C230 202 196 226 150 226 C104 226 70 202 68 162 Z"
              fill={url('coat')}
            />
            {/* 小白口鼻 */}
            <path
              className="jz-cat-muzzle"
              d="M150 184 C137 184 128 192 129 202 C130 212 140 218 150 218 C160 218 170 212 171 202 C172 192 163 184 150 184 Z"
              fill={url('patch')}
            />
            <circle ref={anchorRef} cx="150" cy={EY} r="1" fill="none" />

            {/* 腮红（常驻）+ 害羞斜线 */}
            {(['l', 'r'] as const).map((s) => {
              const cx = s === 'l' ? 96 : 204;
              return (
                <g key={s} className="jz-cat-blush">
                  <ellipse cx={cx} cy="197" rx="13" ry="7.5" fill={url('blush')} />
                  <path
                    className="jz-cat-hatch"
                    d={`M${cx - 7} 200.5 L${cx - 3} 193 M${cx - 1.5} 200.5 L${cx + 2.5} 193 M${cx + 4} 200.5 L${cx + 8} 193`}
                  />
                </g>
              );
            })}

            {/* 大眼：眼窝 + 渐变虹膜 + 圆瞳（可放大）+ 三颗高光 + 泪光 + 眼睑 */}
            <g className="jz-cat-eyes">
              {(['l', 'r'] as const).map((s) => {
                const cx = EYE[s];
                return (
                  <g key={s} className={`jz-cat-eye jz-cat-eye--${s}`}>
                    <g clipPath={url(`eye-${s}`)}>
                      <ellipse className="jz-cat-socket" cx={cx} cy={EY} rx="20" ry="22" />
                      <ellipse cx={cx} cy={EY + 0.5} rx="18.2" ry="20.3" fill={url(`iris-${s}`)} />
                      <g className="jz-cat-pupil">
                        <ellipse className="jz-cat-pupil-core" cx={cx} cy={EY + 1} rx="6" ry="14.5" />
                        <circle className="jz-cat-glint" cx={cx + 6.5} cy={EY - 9} r="5.6" />
                        <circle className="jz-cat-glint jz-cat-glint--sm" cx={cx - 5.5} cy={EY + 9} r="2.6" />
                        <circle className="jz-cat-glint jz-cat-glint--xs" cx={cx + 9} cy={EY + 4} r="1.4" />
                      </g>
                      <ellipse className="jz-cat-tear" cx={cx} cy={EY + 15} rx="17" ry="8" />
                    </g>
                    <g clipPath={url(`lid-${s}`)}>
                      <g className={`jz-cat-lid jz-cat-lid--${s}`}>
                        <path d={`M${cx - 24} 96 H${cx + 24} V141 Q${cx} 147 ${cx - 24} 141 Z`} fill={url('coat')} />
                        <path className="jz-cat-lash" d={`M${cx - 24} 141 Q${cx} 147 ${cx + 24} 141`} />
                      </g>
                    </g>
                  </g>
                );
              })}
            </g>
            {/* 眯眼 ^ ^（开心/眨眼）与闭眼 ‿ ‿（打盹） */}
            <g className="jz-cat-eyes-happy">
              <path className="jz-cat-arc-l" d={`M${EYE.l - 17} 165 Q${EYE.l} 150 ${EYE.l + 17} 165`} />
              <path className="jz-cat-arc-r" d={`M${EYE.r - 17} 165 Q${EYE.r} 150 ${EYE.r + 17} 165`} />
            </g>
            <g className="jz-cat-eyes-closed">
              <path d={`M${EYE.l - 18} 162 Q${EYE.l} 174 ${EYE.l + 18} 162`} />
              <path d={`M${EYE.r - 18} 162 Q${EYE.r} 174 ${EYE.r + 18} 162`} />
            </g>
            {/* 豆豆眉 */}
            <ellipse className="jz-cat-brow jz-cat-brow--l" cx="112" cy="128" rx="6.6" ry="3.7" />
            <ellipse className="jz-cat-brow jz-cat-brow--r" cx="188" cy="128" rx="6.6" ry="3.7" />

            <path className="jz-cat-nose" d="M146 189.5 Q150 187.5 154 189.5 Q152.5 193.5 150 195 Q147.5 193.5 146 189.5 Z" />
            {/* 嘴：ω+小虎牙 / 吐舌 / 害羞波浪 / 惊讶 o / 委屈发抖 */}
            <g className="jz-cat-mouth">
              <path className="jz-cat-line" d="M150 195 V198 M150 198 Q146 203 141 200 M150 198 Q154 203 159 200" />
            </g>
            <path className="jz-cat-fang" d="M153.6 200.5 L155.3 204.8 L157 200 Z" />
            <g className="jz-cat-blep">
              <path d="M146.3 200.6 Q146.3 208.5 150 208.5 Q153.7 208.5 153.7 200.6 Z" />
              <path className="jz-cat-blep-crease" d="M150 202 V205.5" />
            </g>
            <path className="jz-cat-mouth-shy jz-cat-line" d="M140 201 q2.5 -2.8 5 0 t5 0 t5 0 t5 0" />
            <ellipse className="jz-cat-mouth-oh" cx="150" cy="202" rx="3.4" ry="4.3" />
            <path className="jz-cat-mouth-sad jz-cat-line" d="M140.5 204 q2.4 -3 4.8 0 t4.8 0 t4.8 0 t4.8 0" />
            <g className="jz-cat-yawn">
              <ellipse className="jz-cat-yawn-in" cx="150" cy="204" rx="6.5" ry="7.5" />
              <ellipse className="jz-cat-tongue" cx="150" cy="209" rx="4" ry="2.8" />
            </g>
            <ellipse className="jz-cat-tongue jz-cat-tongue--lick" cx="150" cy="202" rx="3.4" ry="3" />
            <g className="jz-cat-whisker">
              <path d="M76 190 Q64 186 52 187 M77 198 Q65 199 54 203" />
              <path d="M224 190 Q236 186 248 187 M223 198 Q235 199 246 203" />
            </g>

            {/* 漫符 */}
            <g className="jz-cat-fx jz-cat-sweat">
              <path d="M224 108 C220 116 218 120 218 123.5 C218 127 220.8 129.5 224 129.5 C227.2 129.5 230 127 230 123.5 C230 120 228 116 224 108 Z" />
              <ellipse className="jz-cat-sweat-hi" cx="222" cy="123" rx="1.4" ry="2.4" />
            </g>
            {/* 泪珠：泪汪汪时从左眼角滚下 */}
            <path
              className="jz-cat-fx jz-cat-teardrop"
              d="M101 182 C98.5 187 97 190 97 192.5 C97 195 98.8 197 101 197 C103.2 197 105 195 105 192.5 C105 190 103.5 187 101 182 Z"
            />
            <g className="jz-cat-fx jz-cat-steam">
              {STEAM.map(([x, y], i) => (
                <g key={i} className="jz-cat-puff" style={{ animationDelay: `${i * 160}ms` }}>
                  <circle cx={x - 5} cy={y + 1} r="4.5" />
                  <circle cx={x} cy={y - 2} r="5.5" />
                  <circle cx={x + 5} cy={y + 1} r="4.5" />
                </g>
              ))}
            </g>
            <g className="jz-cat-fx jz-cat-sparkle">
              {SPARKLES.map(([x, y, r], i) => (
                <path key={i} style={{ animationDelay: `${i * 140}ms` }} d={star(x, y, r)} />
              ))}
            </g>
            <text className="jz-cat-fx jz-cat-bang" x="228" y="100" fontSize="24" textAnchor="middle">
              !
            </text>
            <text className="jz-cat-fx jz-cat-huh" x="228" y="100" fontSize="22" textAnchor="middle">
              ?
            </text>
            <text className="jz-cat-fx jz-cat-note" x="232" y="108" fontSize="18" textAnchor="middle">
              ♪
            </text>
          </g>
        </g>

        {full ? (
          <>
            <g transform="translate(128 230)">
              <g className="jz-cat-arm jz-cat-arm--l">
                <Leg side={-1} paw={url('paw-l')} />
              </g>
            </g>
            <g transform="translate(172 230)">
              <g className="jz-cat-arm jz-cat-arm--r">
                <Leg side={1} paw={url('paw-r')} />
              </g>
            </g>
          </>
        ) : (
          <>
            <g className="jz-cat-edgepaw jz-cat-edgepaw--l">
              <Paw cx={122} cy={230} fill={url('paw-l')} />
            </g>
            <g className="jz-cat-edgepaw jz-cat-edgepaw--r">
              <Paw cx={178} cy={230} fill={url('paw-r')} />
            </g>
          </>
        )}

        <g className="jz-cat-hearts">
          {HEARTS.map(([x, y], i) => (
            <path
              key={i}
              className="jz-cat-heart"
              style={{ animationDelay: `${i * 120}ms` }}
              d={heartPath(x, y)}
            />
          ))}
        </g>
        <g className="jz-cat-zzz">
          <text x="218" y="98" fontSize="11">
            z
          </text>
          <text x="230" y="84" fontSize="14">
            z
          </text>
          <text x="243" y="67" fontSize="17">
            Z
          </text>
        </g>
      </g>
    </svg>
  );
}

const NO_PULSE = { tick: 0, del: false };
const EYE = { l: 118, r: 182 } as const;
const EY = 162;
const POSE0 = poseFor('idle', 'none', false);
const TAIL_D = tailPath(POSE0.tail);
const EAR0_L = earGeometry(POSE0.earL);
const EAR0_R = earGeometry(POSE0.earR, true);
/** 细绳项圈：贴着脖子，两端藏进下巴与前腿后（2026-09-25：7px 宽带像围巾，改 3px 细绳） */
const COLLAR_D = 'M123 229 Q150 244 177 229';
const HEARTS: Array<[number, number]> = [
  [126, 66],
  [144, 54],
  [164, 66],
];
const STEAM: Array<[number, number]> = [
  [114, 70],
  [150, 60],
  [186, 70],
];
const SPARKLES: Array<[number, number, number]> = [
  [218, 144, 7],
  [86, 132, 5],
  [228, 168, 4],
];

function heartPath(x: number, y: number): string {
  return (
    `M${x} ${y + 3} C${x} ${y - 1} ${x + 5} ${y - 1} ${x + 5} ${y + 2} ` +
    `C${x + 5} ${y - 1} ${x + 10} ${y - 1} ${x + 10} ${y + 3} ` +
    `C${x + 10} ${y + 6} ${x + 5} ${y + 9} ${x + 5} ${y + 10} ` +
    `C${x + 5} ${y + 9} ${x} ${y + 6} ${x} ${y + 3} Z`
  );
}

/** 漫画四角闪光 ✦ */
function star(cx: number, cy: number, r: number): string {
  return (
    `M${cx} ${cy - r} Q${cx} ${cy} ${cx + r} ${cy} Q${cx} ${cy} ${cx} ${cy + r} ` +
    `Q${cx} ${cy} ${cx - r} ${cy} Q${cx} ${cy} ${cx} ${cy - r} Z`
  );
}

/** 前腿（肩为原点，团子短胖腿）：毛色腿 + 白爪 + 肉垫（肉垫仅在翻爪姿态显出） */
function Leg({ side, paw }: { side: -1 | 1; paw: string }) {
  // 路径按「向左伸」书写：左腿 s=1，右腿镜像
  const s = -side;
  return (
    <>
      <path
        className="jz-cat-leg"
        d={`M${-7 * s} 0 C${-9 * s} 10 ${-11 * s} 22 ${-11 * s} 32 L${3 * s} 34 C${3.5 * s} 22 ${4.5 * s} 10 ${7 * s} 0 Z`}
      />
      <Paw cx={-4 * s} cy={39} fill={paw} />
    </>
  );
}

function Paw({ cx, cy, fill }: { cx: number; cy: number; fill: string }) {
  return (
    <g className="jz-cat-paw">
      <ellipse className="jz-cat-paw-pad" cx={cx} cy={cy} rx="14.5" ry="12" fill={fill} />
      <path
        className="jz-cat-toe"
        d={`M${cx - 5.5} ${cy + 4.5} V${cy + 9} M${cx} ${cy + 5.5} V${cy + 10} M${cx + 5.5} ${cy + 4.5} V${cy + 9}`}
      />
      <g className="jz-cat-beans">
        <ellipse cx={cx} cy={cy + 3} rx="5.2" ry="4" />
        <circle cx={cx - 6.5} cy={cy - 3.5} r="2.5" />
        <circle cx={cx} cy={cy - 6.5} r="2.5" />
        <circle cx={cx + 6.5} cy={cy - 3.5} r="2.5" />
      </g>
    </g>
  );
}
