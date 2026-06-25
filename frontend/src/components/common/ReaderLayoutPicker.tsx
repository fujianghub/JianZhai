import type { ReactNode } from 'react';
import { Button, Divider, Popover, Segmented, Tooltip } from 'antd';
import {
  ControlOutlined,
  MinusOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import {
  FONT_SCALE_STEPS,
  LINE_HEIGHT_OPTIONS,
  MEASURE_OPTIONS,
  stepFontScale,
  type ReaderLayout,
} from '@/utils/readerLayout';

interface Props {
  layout: ReaderLayout;
  /** Apply + persist a layout change. */
  onChange: (next: ReaderLayout) => void;
  /** Reset *all* reader prefs (layout + paper + font) back to default. */
  onReset: () => void;
}

/** Floating typography panel: body font-size / line-height / content width,
 *  plus a one-click reset. Mirrors the paper + font pickers; the parent owns
 *  state and persistence via the callbacks. */
export default function ReaderLayoutPicker({ layout, onChange, onReset }: Props) {
  const minScale = FONT_SCALE_STEPS[0];
  const maxScale = FONT_SCALE_STEPS[FONT_SCALE_STEPS.length - 1];
  const pct = Math.round(layout.fontScale * 100);

  const content = (
    <div style={{ width: 248 }} className="jz-reader-layout-pop">
      <Section title="字号">
        <div className="jz-rl-stepper">
          <Button
            size="small"
            shape="circle"
            icon={<MinusOutlined />}
            disabled={layout.fontScale <= minScale + 1e-6}
            onClick={() =>
              onChange({ ...layout, fontScale: stepFontScale(layout.fontScale, -1) })
            }
            aria-label="减小字号"
          />
          <span className="jz-rl-pct">{pct}%</span>
          <Button
            size="small"
            shape="circle"
            icon={<PlusOutlined />}
            disabled={layout.fontScale >= maxScale - 1e-6}
            onClick={() =>
              onChange({ ...layout, fontScale: stepFontScale(layout.fontScale, 1) })
            }
            aria-label="增大字号"
          />
        </div>
      </Section>

      <Section title="行距">
        <Segmented
          block
          size="small"
          value={layout.lineHeight}
          onChange={(v) => onChange({ ...layout, lineHeight: v as number })}
          options={LINE_HEIGHT_OPTIONS.map((o) => ({ label: o.label, value: o.value }))}
        />
      </Section>

      <Section title="版心宽度">
        <Segmented
          block
          size="small"
          value={layout.measure}
          onChange={(v) => onChange({ ...layout, measure: v as string })}
          options={MEASURE_OPTIONS.map((o) => ({ label: o.label, value: o.value }))}
        />
      </Section>

      <Divider style={{ margin: '10px 0 8px' }} />
      <Button
        size="small"
        type="text"
        block
        icon={<ReloadOutlined />}
        onClick={onReset}
        className="jz-rl-reset"
      >
        恢复默认排版
      </Button>
    </div>
  );

  return (
    <Popover
      content={content}
      trigger="click"
      placement="bottomRight"
      overlayClassName="jz-glass-popover"
    >
      <Tooltip title="排版（字号 / 行距 / 宽度）">
        <button
          type="button"
          className="jz-reader-control-btn paper-picker-btn"
          aria-label="排版设置"
        >
          <ControlOutlined />
        </button>
      </Tooltip>
    </Popover>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="jz-rl-section">
      <div className="jz-rl-label">{title}</div>
      {children}
    </div>
  );
}
