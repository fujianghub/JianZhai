import { ColorPicker } from 'antd';
import type { Color } from 'antd/es/color-picker';

/**
 * Preset accent palette shown as quick swatches in the picker. Colors mirror the
 * project's visual system (朱砂 / 翡翠 / AntD 蓝 / 暗金 / 青蓝 / 紫罗兰 / 橙 …).
 */
const ACCENT_PRESETS = [
  {
    label: '常用主题色',
    colors: [
      '#b94a3b', // 朱砂
      '#10b981', // 翡翠
      '#1677ff', // AntD 蓝
      '#0ea5e9', // 青蓝
      '#6366f1', // 靛蓝
      '#8b5cf6', // 紫罗兰
      '#d97706', // 暗金
      '#f97316', // 橙
      '#e11d48', // 玫红
      '#0d9488', // 青绿
      '#64748b', // 石板灰
      '#111827', // 玄黑
    ],
  },
];

interface Props {
  /** Hex color string (form value). */
  value?: string;
  /** Always emits a hex string so form values stay strings. */
  onChange?: (hex: string) => void;
}

/**
 * Form-friendly color picker. Shows a live swatch + hex text and a preset
 * palette, while keeping the bound form value a plain hex string (AntD's
 * ColorPicker otherwise hands back a Color object). Drop-in for `<Input />`
 * inside a `<Form.Item name="accent_color">`.
 *
 * `disabledAlpha`: accent colors are stored as 6-digit hex, and dropping the
 * alpha slider keeps the popup panel short enough to fit low viewports
 * (theme.css additionally caps the popup at half the viewport height).
 */
export default function ColorField({ value, onChange }: Props) {
  return (
    <ColorPicker
      value={value || '#1677ff'}
      onChange={(c: Color) => onChange?.(c.toHexString())}
      presets={ACCENT_PRESETS}
      format="hex"
      showText
      allowClear
      disabledAlpha
    />
  );
}
