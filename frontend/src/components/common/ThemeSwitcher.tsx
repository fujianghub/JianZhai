import { Popover, Segmented, Space, Tooltip } from 'antd';
import { BgColorsOutlined } from '@ant-design/icons';
import {
  JzThemeDarkIcon,
  JzThemeDeepseaIcon,
  JzThemeLightIcon,
  JzThemeStarryIcon,
} from '@/components/common/JzIconKit';
import { ACCENT_PRESETS, useThemeStore, type ThemeMode } from '@/stores/theme';

const MODE_OPTIONS = [
  { value: 'light',   label: '亮色',   icon: <JzThemeLightIcon size={16} /> },
  { value: 'dark',    label: '暗色',   icon: <JzThemeDarkIcon size={16} /> },
  { value: 'starry',  label: '星空',   icon: <JzThemeStarryIcon size={16} /> },
  { value: 'deepsea', label: '深海',   icon: <JzThemeDeepseaIcon size={16} /> },
] as const;

export default function ThemeSwitcher() {
  const { mode, accent, setMode, setAccent } = useThemeStore();

  const palette = (
    <div style={{ width: 220 }}>
      <div style={{ marginBottom: 8, color: 'var(--jz-text-muted)', fontSize: 12 }}>主题色</div>
      <Space wrap>
        {ACCENT_PRESETS.map((p) => (
          <Tooltip key={p.key} title={p.label}>
            <button
              type="button"
              onClick={() => setAccent(p.key)}
              aria-label={p.label}
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                border:
                  accent.key === p.key ? '2px solid var(--jz-accent)' : '2px solid transparent',
                background: p.color,
                cursor: 'pointer',
                padding: 0,
                outline: 'none',
                boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
              }}
            />
          </Tooltip>
        ))}
      </Space>
    </div>
  );

  return (
    <Space size={8} align="center">
      <Segmented
        size="small"
        value={mode}
        onChange={(v) => setMode(v as ThemeMode)}
        options={MODE_OPTIONS.map((o) => ({
          value: o.value,
          label: (
            <Tooltip title={o.label}>
              <span style={{ display: 'inline-flex', padding: '0 2px', fontSize: 14 }}>
                {o.icon}
              </span>
            </Tooltip>
          ),
        }))}
      />
      <Popover content={palette} trigger="click" placement="bottomRight">
        <Tooltip title="主题色">
          <button
            type="button"
            aria-label="主题色"
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              border: '1px solid var(--jz-border)',
              background: 'transparent',
              color: 'var(--jz-text-muted)',
              cursor: 'pointer',
              display: 'inline-grid',
              placeItems: 'center',
            }}
          >
            <BgColorsOutlined />
          </button>
        </Tooltip>
      </Popover>
    </Space>
  );
}
