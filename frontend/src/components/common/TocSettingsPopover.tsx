/**
 * 目录设置 — the one settings form for every TOC surface (article right
 * rail, PDF outline, KB tree, EPUB sidebar) and the admin defaults page.
 *
 * ``TocPrefsControls`` is the bare form (Segmented rows + switches);
 * ``TocSettingsPopover`` wraps it in the gear button used inside the rails
 * and adds the「跟随站点设置」reset when local overrides exist.
 */
import type { ReactNode } from 'react';
import { Button, Popover, Segmented, Select, Switch, Tooltip } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import { TOC_FONT_OPTIONS, type TocDepth, type TocFont, type TocPrefs } from '@/utils/tocPrefs';
import IconButton from '@/components/common/IconButton';

export interface TocPrefsFeatures {
  /** KB tree: doc-count badges. */
  counts?: boolean;
  /** Article TOC: heading depth + numbering. */
  depth?: boolean;
  numbers?: boolean;
  /** EPUB: estimated page numbers (owned by the EPUB prefs blob). */
  pages?: boolean;
  /** Caption for the `reader` font option's preview span. */
  readerFontStack?: string;
}

interface ControlsProps {
  prefs: TocPrefs;
  onChange: (patch: Partial<TocPrefs>) => void;
  features?: TocPrefsFeatures;
  /** Extra rows rendered after the switches (EPUB's 页码 switch lives here). */
  extra?: ReactNode;
}

/** Font dropdown with each option previewed in its own face. */
export function TocFontSelect({
  value,
  onChange,
  readerFontStack,
  size = 'small',
}: {
  value: TocFont;
  onChange: (v: TocFont) => void;
  readerFontStack?: string;
  size?: 'small' | 'middle';
}) {
  return (
    <Select<TocFont>
      size={size}
      value={value}
      onChange={onChange}
      style={{ width: '100%' }}
      popupMatchSelectWidth={false}
      aria-label="目录字体"
      options={TOC_FONT_OPTIONS.map((o) => ({
        value: o.key,
        label: (
          <span
            title={o.title}
            style={{ fontFamily: o.key === 'reader' && readerFontStack ? readerFontStack : o.family }}
          >
            {o.label}
            <span style={{ opacity: 0.55, marginLeft: 6, fontSize: '0.86em' }}>{o.title}</span>
          </span>
        ),
      }))}
    />
  );
}

export function TocPrefsControls({ prefs, onChange, features = {}, extra }: ControlsProps) {
  return (
    <>
      <div className="jz-rl-section">
        <div className="jz-rl-label">间距</div>
        <Segmented
          block
          size="small"
          value={prefs.density}
          onChange={(v) => onChange({ density: v as TocPrefs['density'] })}
          options={[
            { label: '紧凑', value: 'compact' },
            { label: '标准', value: 'normal' },
            { label: '宽松', value: 'loose' },
          ]}
        />
      </div>
      <div className="jz-rl-section">
        <div className="jz-rl-label">字号</div>
        <Segmented
          block
          size="small"
          value={prefs.size}
          onChange={(v) => onChange({ size: v as TocPrefs['size'] })}
          options={[
            { label: '小', value: 's' },
            { label: '中', value: 'm' },
            { label: '大', value: 'l' },
          ]}
        />
      </div>
      <div className="jz-rl-section">
        <div className="jz-rl-label">字重</div>
        <Segmented
          block
          size="small"
          value={prefs.weight}
          onChange={(v) => onChange({ weight: v as TocPrefs['weight'] })}
          options={[
            { label: <span style={{ fontWeight: 400 }}>细</span>, value: 'light', title: '各层级整体减一档' },
            { label: <span style={{ fontWeight: 500 }}>标准</span>, value: 'normal', title: '一级 600 / 二级 500 / 其余 400' },
            { label: <span style={{ fontWeight: 700 }}>粗</span>, value: 'bold', title: '各层级整体加一档（文楷仅 400 字重会合成加粗）' },
          ]}
        />
      </div>
      <div className="jz-rl-section">
        <div className="jz-rl-label">字体</div>
        <TocFontSelect value={prefs.font} onChange={(font) => onChange({ font })} readerFontStack={features.readerFontStack} />
      </div>
      <div className="jz-rl-section">
        <div className="jz-rl-label">颜色</div>
        <Segmented
          block
          size="small"
          value={prefs.color}
          onChange={(v) => onChange({ color: v as TocPrefs['color'] })}
          options={[
            { label: '正文色', value: 'text', title: '所有层级同正文色' },
            { label: '淡显', value: 'muted', title: '全部淡色，当前项高亮' },
            { label: '分层', value: 'layered', title: '上层淡显，下层正文色' },
          ]}
        />
      </div>
      {features.depth && (
        <div className="jz-rl-section">
          <div className="jz-rl-label">层级</div>
          <Segmented
            block
            size="small"
            value={prefs.depth}
            onChange={(v) => onChange({ depth: Number(v) as TocDepth })}
            options={[
              { label: '2 层', value: 2 },
              { label: '3 层', value: 3 },
              { label: '4 层', value: 4 },
              { label: '全部', value: 6 },
            ]}
          />
        </div>
      )}
      <div className="jz-rl-section jz-epub-toc-switches">
        <label>
          <span>长标题换行</span>
          <Switch size="small" checked={prefs.wrap} onChange={(v) => onChange({ wrap: v })} />
        </label>
        {features.numbers && (
          <label>
            <span>显示章节编号</span>
            <Switch size="small" checked={prefs.numbers} onChange={(v) => onChange({ numbers: v })} />
          </label>
        )}
        {features.counts && (
          <label>
            <span>显示篇数</span>
            <Switch size="small" checked={prefs.counts} onChange={(v) => onChange({ counts: v })} />
          </label>
        )}
        {extra}
      </div>
    </>
  );
}

interface PopoverProps extends ControlsProps {
  /** Present when local overrides exist → shows「跟随站点设置」. */
  onReset?: () => void;
  overridden?: boolean;
  tooltip?: string;
}

export default function TocSettingsPopover({ prefs, onChange, features, extra, onReset, overridden, tooltip }: PopoverProps) {
  const content = (
    <div className="jz-reader-layout-pop jz-epub-toc-settings" style={{ width: 240 }}>
      <TocPrefsControls prefs={prefs} onChange={onChange} features={features} extra={extra} />
      {onReset && (
        <div className="jz-rl-section jz-epub-toc-reset">
          <Button size="small" type="link" onClick={onReset} disabled={!overridden} style={{ padding: 0 }}>
            {overridden ? '跟随站点设置' : '当前即站点设置'}
          </Button>
        </div>
      )}
    </div>
  );
  return (
    <Popover content={content} trigger="click" placement="bottomRight">
      <Tooltip title={tooltip ?? '目录设置：间距 / 字号 / 字体 / 颜色 / 换行'}>
        <IconButton
          className={'jz-epub-toc-tool' + (overridden ? ' is-overridden' : '')}
          icon={<SettingOutlined />}
          aria-label="目录设置"
        />
      </Tooltip>
    </Popover>
  );
}
