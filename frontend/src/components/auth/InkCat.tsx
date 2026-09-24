import { useId, useRef } from 'react';
import type { LoginMood } from './loginMood';
import type { CatBehavior } from './inkcat/catEngine';
import { useCatEngine } from './inkcat/useCatEngine';

/**
 * 登录页水墨猫（2026-09-24 二期）：精致插画 + 水墨笔意。
 *
 * 花色借《相猫经》：浅色主题「乌云盖雪」（墨背、白胸白爪白口鼻），
 * 暗色主题「雪里拖枪」（雪身、墨尾、鸳鸯眼）——CSS 按 [data-theme] 换令牌。
 *
 * 结构（变换分层，JS 变量与 CSS 关键帧各占一层，互不覆盖）：
 *   .jz-cat-mover ×2（JS：身体倾 transform；CSS：跳 translate / 翻肚 rotate）
 *     后层：尾 / 身（呼吸）；中间：静止的线装书；
 *     前层：.jz-cat-head（JS：歪头+平移）› .jz-cat-headpose（CSS：睡垂/摇头/哈欠）› 前爪（CSS：捂眼/偷看/舔爪/翻肚）
 * 目光与行为运行时见 inkcat/useCatEngine；姿态规则见 styles/login.css「水墨猫」。
 *
 * variant='peek'：手机端探头猫——只有头与搭在卡片沿上的两只爪。
 */
export default function InkCat({
  mood,
  captchaProgress,
  typingProgress = 0.5,
  keyPulse = NO_PULSE,
  variant = 'full',
  onBehavior,
}: {
  mood: LoginMood;
  captchaProgress: number | null;
  typingProgress?: number;
  keyPulse?: { tick: number; del: boolean };
  variant?: 'full' | 'peek';
  onBehavior?: (b: CatBehavior) => void;
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
      viewBox={full ? '0 0 300 340' : '46 44 208 196'}
      role="presentation"
      aria-hidden
      focusable="false"
    >
      <defs>
        {/* 墨色：背脊浓、四周淡（墨分五色）；userSpaceOnUse 让眼睑与脸同一张渐变无缝 */}
        <radialGradient
          id={id('coat')}
          gradientUnits="userSpaceOnUse"
          cx="150"
          cy="150"
          r="150"
          fx="150"
          fy="118"
        >
          <stop offset="0" className="jz-cat-s-main-a" />
          <stop offset="0.55" className="jz-cat-s-main-a" />
          <stop offset="1" className="jz-cat-s-main-b" />
        </radialGradient>
        <linearGradient
          id={id('patch')}
          gradientUnits="userSpaceOnUse"
          x1="0"
          y1="150"
          x2="0"
          y2="292"
        >
          <stop offset="0" className="jz-cat-s-patch-a" />
          <stop offset="1" className="jz-cat-s-patch-b" />
        </linearGradient>
        {/* 前腿横向明暗：外侧受光、内侧（贴胸）一线暗，白腿与白胸才分得开 */}
        <linearGradient id={id('leg-l')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" className="jz-cat-s-patch-a" />
          <stop offset="0.6" className="jz-cat-s-patch-a" />
          <stop offset="1" className="jz-cat-s-leg-shade" />
        </linearGradient>
        <linearGradient id={id('leg-r')} x1="1" y1="0" x2="0" y2="0">
          <stop offset="0" className="jz-cat-s-patch-a" />
          <stop offset="0.6" className="jz-cat-s-patch-a" />
          <stop offset="1" className="jz-cat-s-leg-shade" />
        </linearGradient>
        <linearGradient id={id('tail')} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" className="jz-cat-s-tail-b" />
          <stop offset="1" className="jz-cat-s-tail-a" />
        </linearGradient>
        {(['l', 'r'] as const).map((s) => (
          <radialGradient key={s} id={id(`iris-${s}`)} cx="0.5" cy="0.4" r="0.62">
            <stop offset="0" className={`jz-cat-s-iris-${s}-a`} />
            <stop offset="0.72" className={`jz-cat-s-iris-${s}-b`} />
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
        {/* 墨晕：噪声位移出笔触边 → 轻模糊去锯齿 → 叠一圈淡淡洇开的墨 */}
        <filter
          id={id('ink')}
          x="-15%"
          y="-15%"
          width="130%"
          height="130%"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.07"
            numOctaves="2"
            seed="4"
            result="n"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="n"
            scale="4"
            xChannelSelector="R"
            yChannelSelector="G"
            result="d"
          />
          <feGaussianBlur in="d" stdDeviation="2.4" result="b" />
          <feColorMatrix
            in="b"
            type="matrix"
            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.42 0"
            result="bleed"
          />
          <feGaussianBlur in="d" stdDeviation="0.45" result="soft" />
          <feMerge>
            <feMergeNode in="bleed" />
            <feMergeNode in="soft" />
          </feMerge>
        </filter>
        <clipPath id={id('eye-l')}>
          <ellipse cx="124" cy="150" rx="14.5" ry="15" />
        </clipPath>
        <clipPath id={id('eye-r')}>
          <ellipse cx="176" cy="150" rx="14.5" ry="15" />
        </clipPath>
      </defs>

      {full && <ellipse cx="150" cy="324" rx="128" ry="9" fill={url('ground')} />}

      {full && (
        <g className="jz-cat-mover" {...petProps}>
          {/* 尾：藏在后腿后起笔，一笔卷上 */}
          <g className="jz-cat-tail">
            <g className="jz-cat-tail-pose">
              <path className="jz-cat-tail-rim" d={TAIL_D} />
              <path className="jz-cat-tail-stroke" d={TAIL_D} stroke={url('tail')} />
            </g>
          </g>

          <g className="jz-cat-body">
            <g filter={url('ink')}>
              <path
                d="M104 282 C96 252 100 222 120 206 C132 198 168 198 180 206 C200 222 204 252 196 282 Z"
                fill={url('coat')}
              />
              <ellipse cx="106" cy="262" rx="22" ry="20" fill={url('coat')} />
              <ellipse cx="194" cy="262" rx="22" ry="20" fill={url('coat')} />
            </g>
            {/* 白胸（乌云盖雪的「雪」） */}
            <path
              d="M130 204 C138 214 162 214 170 204 C180 228 178 258 170 282 L130 282 C122 258 120 228 130 204 Z"
              fill={url('patch')}
              filter={url('ink')}
            />
            <ellipse className="jz-cat-ripple" cx="150" cy="238" rx="30" ry="22" />
            <ellipse className="jz-cat-ripple jz-cat-ripple--2" cx="150" cy="238" rx="30" ry="22" />
          </g>
        </g>
      )}
      {full && (
        <>
          {/* 线装书两册 + 书根题字 + 成功时的朱砂印 */}
          <g className="jz-cat-books">
            <rect
              className="jz-cat-cover jz-cat-cover--low"
              x="44"
              y="296"
              width="212"
              height="4"
              rx="1.5"
            />
            <rect className="jz-cat-paper" x="45" y="300" width="210" height="18" />
            <path className="jz-cat-paper-line" d="M45 305 H255 M45 310 H255 M45 315 H255" />
            <rect
              className="jz-cat-cover jz-cat-cover--low"
              x="44"
              y="318"
              width="212"
              height="4"
              rx="1.5"
            />
            <rect
              className="jz-cat-cover jz-cat-cover--top"
              x="62"
              y="272"
              width="176"
              height="4"
              rx="1.5"
            />
            <rect className="jz-cat-paper" x="63" y="276" width="174" height="16" />
            <path className="jz-cat-paper-line" d="M63 281 H237 M63 286 H237" />
            <rect
              className="jz-cat-cover jz-cat-cover--top"
              x="62"
              y="292"
              width="176"
              height="4"
              rx="1.5"
            />
            <path
              className="jz-cat-thread"
              d="M70 272 V296 M76 272 V296 M52 296 V322 M58 296 V322"
            />
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
        </>
      )}

      <g className="jz-cat-mover" {...petProps}>
        <g className="jz-cat-head">
          <g className="jz-cat-headpose">
            <g className="jz-cat-ear jz-cat-ear--l">
              <path
                d="M100 134 C96 110 94 86 98 68 Q100 61 107 66 C121 76 134 88 142 102 Z"
                fill={url('coat')}
                filter={url('ink')}
              />
              <path
                className="jz-cat-ear-in"
                d="M107 118 C105 102 105 88 107 78 C116 86 125 95 131 104 Z"
              />
            </g>
            <g className="jz-cat-ear jz-cat-ear--r">
              <path
                d="M200 134 C204 110 206 86 202 68 Q200 61 193 66 C179 76 166 88 158 102 Z"
                fill={url('coat')}
                filter={url('ink')}
              />
              <path
                className="jz-cat-ear-in"
                d="M193 118 C195 102 195 88 193 78 C184 86 175 95 169 104 Z"
              />
            </g>
            <path
              d="M90 166 C86 136 100 110 128 102 C142 98 158 98 172 102 C200 110 214 136 210 166 C206 194 182 210 150 210 C118 210 94 194 90 166 Z"
              fill={url('coat')}
              filter={url('ink')}
            />
            {/* 白口鼻 + 鼻梁一线白 */}
            <path
              d="M150 160 C134 160 124 172 126 184 C128 198 140 207 150 207 C160 207 172 198 174 184 C176 172 166 160 150 160 Z M150 161 C146 150 146 137 150 127 C154 137 154 150 150 161 Z"
              fill={url('patch')}
            />
            <circle ref={anchorRef} cx="150" cy="152" r="1" fill="none" />
            <ellipse
              className="jz-cat-blush"
              cx="109"
              cy="178"
              rx="11"
              ry="6"
              fill={url('blush')}
            />
            <ellipse
              className="jz-cat-blush"
              cx="191"
              cy="178"
              rx="11"
              ry="6"
              fill={url('blush')}
            />

            <g className="jz-cat-eyes">
              {(['l', 'r'] as const).map((s) => {
                const cx = s === 'l' ? 124 : 176;
                return (
                  <g key={s} clipPath={url(`eye-${s}`)}>
                    <ellipse className="jz-cat-socket" cx={cx} cy="150" rx="14.5" ry="15" />
                    <ellipse cx={cx} cy="150" rx="12.6" ry="13.6" fill={url(`iris-${s}`)} />
                    <g className="jz-cat-pupil">
                      <ellipse className="jz-cat-pupil-core" cx={cx} cy="150" rx="4" ry="10.5" />
                      <circle className="jz-cat-glint" cx={cx + 4} cy="144.5" r="2.8" />
                      <circle
                        className="jz-cat-glint jz-cat-glint--sm"
                        cx={cx - 3.5}
                        cy="155.5"
                        r="1.2"
                      />
                    </g>
                    <g className={`jz-cat-lid jz-cat-lid--${s}`}>
                      <path
                        d={`M${cx - 18} 102 H${cx + 18} V133 Q${cx} 138 ${cx - 18} 133 Z`}
                        fill={url('coat')}
                      />
                      <path
                        className="jz-cat-lash"
                        d={`M${cx - 18} 133 Q${cx} 138 ${cx + 18} 133`}
                      />
                    </g>
                  </g>
                );
              })}
            </g>
            <g className="jz-cat-eyes-closed">
              <path d="M111 151 Q124 160 137 151" />
              <path d="M163 151 Q176 160 189 151" />
            </g>
            <g className="jz-cat-eyes-happy">
              <path d="M112 153 Q124 140 136 153" />
              <path d="M164 153 Q176 140 188 153" />
            </g>

            <path
              className="jz-cat-nose"
              d="M144.5 168 Q150 165.5 155.5 168 Q153 173 150 175 Q147 173 144.5 168 Z"
            />
            <path
              className="jz-cat-mouth"
              d="M150 175 V179 M150 179 Q145 185 139 181 M150 179 Q155 185 161 181"
            />
            <path className="jz-cat-mouth-sad" d="M141 187 Q150 180 159 187" />
            <g className="jz-cat-yawn">
              <ellipse className="jz-cat-yawn-in" cx="150" cy="186" rx="7" ry="8" />
              <ellipse className="jz-cat-tongue" cx="150" cy="191" rx="4.5" ry="3" />
            </g>
            <ellipse
              className="jz-cat-tongue jz-cat-tongue--lick"
              cx="150"
              cy="184"
              rx="3.6"
              ry="3.2"
            />
            <g className="jz-cat-whisker">
              <path d="M128 175 Q100 170 68 169 Q100 172.5 128 177.5 Z M128 180 Q100 181 70 186 Q100 183.5 128 182 Z" />
              <path d="M172 175 Q200 170 232 169 Q200 172.5 172 177.5 Z M172 180 Q200 181 230 186 Q200 183.5 172 182 Z" />
            </g>
          </g>
        </g>

        {full ? (
          <>
            <g transform="translate(118 214)">
              <g className="jz-cat-arm jz-cat-arm--l">
                <Leg side={-1} fill={url('leg-l')} />
              </g>
            </g>
            <g transform="translate(182 214)">
              <g className="jz-cat-arm jz-cat-arm--r">
                <Leg side={1} fill={url('leg-r')} />
              </g>
            </g>
          </>
        ) : (
          <>
            <g className="jz-cat-edgepaw jz-cat-edgepaw--l">
              <Paw cx={120} cy={216} fill={url('leg-l')} />
            </g>
            <g className="jz-cat-edgepaw jz-cat-edgepaw--r">
              <Paw cx={180} cy={216} fill={url('leg-r')} />
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
          <text x="214" y="104" fontSize="11">
            z
          </text>
          <text x="226" y="90" fontSize="14">
            z
          </text>
          <text x="239" y="73" fontSize="17">
            Z
          </text>
        </g>
      </g>
    </svg>
  );
}

const NO_PULSE = { tick: 0, del: false };
const TAIL_D = 'M204 270 C238 276 262 250 256 218 C252 198 244 186 252 172';
const HEARTS: Array<[number, number]> = [
  [132, 96],
  [148, 84],
  [166, 98],
];

function heartPath(x: number, y: number): string {
  return (
    `M${x} ${y + 3} C${x} ${y - 1} ${x + 5} ${y - 1} ${x + 5} ${y + 2} ` +
    `C${x + 5} ${y - 1} ${x + 10} ${y - 1} ${x + 10} ${y + 3} ` +
    `C${x + 10} ${y + 6} ${x + 5} ${y + 9} ${x + 5} ${y + 10} ` +
    `C${x + 5} ${y + 9} ${x} ${y + 6} ${x} ${y + 3} Z`
  );
}

/** 前腿（肩为原点）：白袜 + 爪 + 肉垫（肉垫仅在翻爪姿态显出） */
function Leg({ side, fill }: { side: -1 | 1; fill: string }) {
  // 路径按「向左伸」书写：左腿 s=1，右腿镜像
  const s = -side;
  return (
    <>
      <path
        className="jz-cat-leg"
        d={`M${-7 * s} 2 C${-11 * s} 20 ${-15 * s} 40 ${-16 * s} 58 L${1 * s} 60 C${2 * s} 42 ${4 * s} 22 ${7 * s} 3 Z`}
        fill={fill}
      />
      <Paw cx={-7 * s} cy={64} fill={fill} />
    </>
  );
}

function Paw({ cx, cy, fill }: { cx: number; cy: number; fill: string }) {
  return (
    <g className="jz-cat-paw">
      <ellipse className="jz-cat-paw-pad" cx={cx} cy={cy} rx="16.5" ry="13.5" fill={fill} />
      <path
        className="jz-cat-toe"
        d={`M${cx - 6} ${cy + 5} V${cy + 10} M${cx} ${cy + 6} V${cy + 11} M${cx + 6} ${cy + 5} V${cy + 10}`}
      />
      <g className="jz-cat-beans">
        <ellipse cx={cx} cy={cy + 3} rx="5.5" ry="4.2" />
        <circle cx={cx - 7} cy={cy - 4} r="2.6" />
        <circle cx={cx} cy={cy - 7} r="2.6" />
        <circle cx={cx + 7} cy={cy - 4} r="2.6" />
      </g>
    </g>
  );
}
