import { Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import {
  CheckOutlined,
  DownOutlined,
  MoonOutlined,
  StarOutlined,
  SunOutlined,
} from '@ant-design/icons';
import { useThemeStore, type ThemeMode } from '@/stores/theme';

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
};

const MODE_OPTIONS = [
  { value: 'light',   label: '亮色',   icon: <SunOutlined /> },
  { value: 'dark',    label: '暗色',   icon: <MoonOutlined /> },
  { value: 'starry',  label: '星空',   icon: <StarOutlined /> },
  { value: 'deepsea', label: '深海',   icon: <WaveIcon /> },
] as const;

export default function ThemeSwitcher() {
  const { mode, setMode } = useThemeStore();
  const current = MODE_OPTIONS.find((o) => o.value === mode) ?? MODE_OPTIONS[0];

  const items: MenuProps['items'] = MODE_OPTIONS.map((o) => ({
    key: o.value,
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
  }));

  return (
    <Dropdown
      trigger={['click']}
      placement="bottomRight"
      overlayClassName="jz-theme-menu"
      menu={{
        items,
        selectable: true,
        selectedKeys: [mode],
        onClick: ({ key }) => setMode(key as ThemeMode),
      }}
    >
      <button type="button" className="jz-theme-switch" aria-label="主题" title="主题">
        <span className="jz-theme-switch__ico" style={{ color: THEME_TINT[current.value] }}>
          {current.icon}
        </span>
        <span className="jz-theme-switch__txt">主题</span>
        <DownOutlined className="jz-theme-switch__caret" />
      </button>
    </Dropdown>
  );
}
