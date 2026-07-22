import { Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import {
  CheckOutlined,
  ClockCircleOutlined,
  DownOutlined,
  MoonOutlined,
  StarOutlined,
  SunOutlined,
} from '@ant-design/icons';
import { useThemeStore, type ThemeMode } from '@/stores/theme';
import { moonPhaseName } from '@/utils/moonPhase';

/** Inline water-drop SVG — spring water (春水). */
function DropIcon() {
  return (
    <svg width="1em" height="1em" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 1.6c2.5 3 4.2 5 4.2 7.1A4.2 4.2 0 0 1 8 12.9a4.2 4.2 0 0 1-4.2-4.2C3.8 6.6 5.5 4.6 8 1.6Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path
        d="M6.2 9.1a1.9 1.9 0 0 0 1.9 1.9"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        opacity="0.6"
      />
    </svg>
  );
}

/** Inline snowflake SVG — winter snow (冬雪). */
function SnowIcon() {
  return (
    <svg width="1em" height="1em" viewBox="0 0 16 16" fill="none" aria-hidden>
      <g stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
        <path d="M8 1.5v13M2.37 4.75l11.26 6.5M13.63 4.75 2.37 11.25" />
        <path d="M8 1.5 6.6 3M8 1.5 9.4 3M8 14.5 6.6 13M8 14.5 9.4 13" opacity="0.75" />
        <path d="m2.37 4.75 .25 1.9M2.37 4.75l1.9-.25M13.63 11.25l-.25-1.9M13.63 11.25l-1.9.25" opacity="0.75" />
        <path d="m13.63 4.75-1.9-.25M13.63 4.75l-.25 1.9M2.37 11.25l1.9.25M2.37 11.25l.25-1.9" opacity="0.75" />
      </g>
    </svg>
  );
}

/** Inline wave SVG — antd has no first-class water/wave icon. */
function WaveIcon() {
  return (
    <svg width="1em" height="1em" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M1 5c1.5 0 1.5-1.6 3-1.6S5.5 5 7 5s1.5-1.6 3-1.6S11.5 5 13 5s1.5-1.6 3-1.6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M1 9c1.5 0 1.5-1.6 3-1.6S5.5 9 7 9s1.5-1.6 3-1.6S11.5 9 13 9s1.5-1.6 3-1.6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.65"
      />
      <path
        d="M1 13c1.5 0 1.5-1.6 3-1.6s1.5 1.6 3 1.6 1.5-1.6 3-1.6 1.5 1.6 3 1.6 1.5-1.6 3-1.6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.35"
      />
    </svg>
  );
}

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

const MODE_OPTIONS = [
  { value: 'light',       label: '亮色',   icon: <SunOutlined /> },
  { value: 'dark',        label: '暗色',   icon: <MoonOutlined /> },
  { value: 'starry',      label: '星空',   icon: <StarOutlined /> },
  { value: 'deepsea',     label: '深海',   icon: <WaveIcon /> },
  { value: 'springwater', label: '春水',   icon: <DropIcon /> },
  { value: 'wintersnow',  label: '冬雪',   icon: <SnowIcon /> },
] as const;

export default function ThemeSwitcher() {
  const { mode, setMode, followClock, setFollowClock } = useThemeStore();
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
  ];

  return (
    <Dropdown
      trigger={['click']}
      placement="bottomRight"
      overlayClassName="jz-theme-menu"
      menu={{
        items,
        selectable: true,
        selectedKeys: followClock ? [mode, FOLLOW_KEY] : [mode],
        onClick: ({ key, domEvent }) => {
          if (key === FOLLOW_KEY) {
            setFollowClock(!followClock);
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
