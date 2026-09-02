import { Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import {
  CheckOutlined,
  ClockCircleOutlined,
  DownOutlined,
  MoonOutlined,
  StarOutlined,
  SunOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useThemeStore, type ThemeMode } from '@/stores/theme';
import { JzThemeDropIcon, JzThemeSnowIcon, JzThemeWaveIcon } from '@/components/common/JzIconKit';
import { moonPhaseName } from '@/utils/moonPhase';
import { setMotionLevel, useMotionLevel, type MotionLevel } from '@/utils/motionPref';

/** Each theme carries a signature hue so the menu reads at a glance and the
 * trigger echoes the active theme. starry/deepsea mirror the colorPrimary set
 * in main.tsx; light/dark use legible mid-tones that work on either menu bg. */
const THEME_TINT: Record<ThemeMode, string> = {
  light: '#f0a020', // 暖金 · 日
  dark: '#7b8bd4', // 靛蓝 · 月
  starry: '#c79bff', // 紫 · 星
  deepsea: '#2bc3ad', // 青 · 浪
  springwater: '#12b8a0', // 青 · 春水
  wintersnow: '#6a93cf', // 冰蓝 · 冬雪
};

const FOLLOW_KEY = 'follow-clock';

/** 动效档位（HarmonyOS 式用户主观三档，叠加在自动降质与系统 reduce 之上）：
 * 足量=默认全开；适中=氛围 canvas 钉最低质量档 + 关指针光斑/交互粒子；
 * 精简=等同系统 reduced-motion（canvas 静帧、主题切换瞬切、进场即位）。 */
const MOTION_PREFIX = 'motion:';
const MOTION_OPTIONS: ReadonlyArray<{ value: MotionLevel; label: string; hint: string }> = [
  { value: 'full', label: '动效 · 足量', hint: '全部动效与氛围' },
  { value: 'medium', label: '动效 · 适中', hint: '氛围降质、关装饰光效' },
  { value: 'min', label: '动效 · 精简', hint: '接近无动画' },
];

const MODE_OPTIONS = [
  { value: 'light',       label: '亮色',   icon: <SunOutlined /> },
  { value: 'dark',        label: '暗色',   icon: <MoonOutlined /> },
  { value: 'starry',      label: '星空',   icon: <StarOutlined /> },
  { value: 'deepsea',     label: '深海',   icon: <JzThemeWaveIcon /> },
  { value: 'springwater', label: '春水',   icon: <JzThemeDropIcon /> },
  { value: 'wintersnow',  label: '冬雪',   icon: <JzThemeSnowIcon /> },
] as const;

export default function ThemeSwitcher() {
  const { mode, setMode, followClock, setFollowClock } = useThemeStore();
  const motionLevel = useMotionLevel();
  const current = MODE_OPTIONS.find((o) => o.value === mode) ?? MODE_OPTIONS[0];
  // starry nights get tonight's real phase in the tooltip (drawn on canvas too)
  const title = mode === 'starry' ? `主题 · 今夜${moonPhaseName(new Date())}` : '主题';

  const items: MenuProps['items'] = [
    ...MODE_OPTIONS.map((o) => ({
      key: o.value as string,
      icon: (
        <span style={{ color: THEME_TINT[o.value], display: 'inline-flex', fontSize: 15 }}>
          {o.icon}
        </span>
      ),
      label: (
        <span className="jz-theme-item">
          <span>{o.label}</span>
          {o.value === mode && <CheckOutlined className="jz-theme-check" />}
        </span>
      ),
    })),
    { type: 'divider' as const },
    {
      key: FOLLOW_KEY,
      icon: (
        <span
          style={{
            color: followClock ? 'var(--jz-accent)' : 'var(--jz-text-muted, #888)',
            display: 'inline-flex',
            fontSize: 15,
          }}
        >
          <ClockCircleOutlined />
        </span>
      ),
      label: (
        <span className="jz-theme-item">
          {/* 随朝暮：昼取宣纸、夜落星河（resolveClockMode，6–18 时为昼） */}
          <span>随朝暮</span>
          {followClock && <CheckOutlined className="jz-theme-check" />}
        </span>
      ),
    },
    { type: 'divider' as const },
    ...MOTION_OPTIONS.map((o) => ({
      key: `${MOTION_PREFIX}${o.value}`,
      icon: (
        <span
          style={{
            color: o.value === motionLevel ? 'var(--jz-accent)' : 'var(--jz-text-muted, #888)',
            display: 'inline-flex',
            fontSize: 15,
          }}
        >
          <ThunderboltOutlined />
        </span>
      ),
      label: (
        <span className="jz-theme-item" title={o.hint}>
          <span>{o.label}</span>
          {o.value === motionLevel && <CheckOutlined className="jz-theme-check" />}
        </span>
      ),
    })),
  ];

  return (
    <Dropdown
      trigger={['click']}
      placement="bottomRight"
      overlayClassName="jz-theme-menu"
      menu={{
        items,
        selectable: true,
        selectedKeys: [
          mode,
          ...(followClock ? [FOLLOW_KEY] : []),
          `${MOTION_PREFIX}${motionLevel}`,
        ],
        onClick: ({ key, domEvent }) => {
          if (key === FOLLOW_KEY) {
            setFollowClock(!followClock);
            return;
          }
          if (key.startsWith(MOTION_PREFIX)) {
            setMotionLevel(key.slice(MOTION_PREFIX.length) as MotionLevel);
            return;
          }
          // click origin drives the circular reveal view-transition
          const e = domEvent as React.MouseEvent;
          const origin =
            typeof e.clientX === 'number' && (e.clientX || e.clientY)
              ? { x: e.clientX, y: e.clientY }
              : undefined;
          setMode(key as ThemeMode, origin);
        },
      }}
    >
      <button type="button" className="jz-theme-switch" aria-label="主题" title={title}>
        <span className="jz-theme-switch__ico" style={{ color: THEME_TINT[current.value] }}>
          {current.icon}
        </span>
        <span className="jz-theme-switch__txt">主题</span>
        <DownOutlined className="jz-theme-switch__caret" />
      </button>
    </Dropdown>
  );
}
