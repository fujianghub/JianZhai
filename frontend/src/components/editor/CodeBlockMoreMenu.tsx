import type { ReactNode } from 'react';
import { Switch } from 'antd';
import { RightOutlined } from '@ant-design/icons';
import {
  FONT_PRESETS,
  INDENT_WIDTHS,
  LINE_HEIGHT_PRESETS,
  type CodeBlockPrefs,
  type IndentMode,
} from '@/utils/codeBlockPrefs';

export interface CodeBlockMoreMenuProps {
  prefs: CodeBlockPrefs;
  onPrefsChange: (partial: Partial<CodeBlockPrefs>) => void;
  onAutoIndent: () => void;
  onSyncStyle: () => void;
  onSyncStyleAndLang: () => void;
  isDiagram?: boolean;
  showPreview?: boolean;
  onTogglePreview?: () => void;
}

/** Yuque-style settings panel (图1) — used inside Dropdown dropdownRender. */
export default function CodeBlockMoreMenu({
  prefs,
  onPrefsChange,
  onAutoIndent,
  onSyncStyle,
  onSyncStyleAndLang,
  isDiagram,
  showPreview,
  onTogglePreview,
}: CodeBlockMoreMenuProps) {
  return (
    <div className="jz-code-settings-panel" onClick={(e) => e.stopPropagation()}>
      <SubMenuRow label="字号">
        <div className="jz-code-settings-sub">
          {FONT_PRESETS.map((size) => (
            <button
              key={size}
              type="button"
              className={
                'jz-code-settings-sub-item' + (prefs.fontSize === size ? ' is-active' : '')
              }
              onClick={() => onPrefsChange({ fontSize: size })}
            >
              {size}px
            </button>
          ))}
        </div>
      </SubMenuRow>

      <SubMenuRow label="行距">
        <div className="jz-code-settings-sub">
          {LINE_HEIGHT_PRESETS.map((lh) => (
            <button
              key={lh}
              type="button"
              className={
                'jz-code-settings-sub-item' + (prefs.lineHeight === lh ? ' is-active' : '')
              }
              onClick={() => onPrefsChange({ lineHeight: lh })}
            >
              {lh}
            </button>
          ))}
        </div>
      </SubMenuRow>

      <SubMenuRow label="缩进模式">
        <div className="jz-code-settings-sub">
          {(
            [
              ['tab', 'Tab'],
              ['spaces', '空格'],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              className={
                'jz-code-settings-sub-item' + (prefs.indentMode === mode ? ' is-active' : '')
              }
              onClick={() => onPrefsChange({ indentMode: mode as IndentMode })}
            >
              {label}
            </button>
          ))}
        </div>
      </SubMenuRow>

      <SubMenuRow label="缩进宽度">
        <div className="jz-code-settings-sub">
          {INDENT_WIDTHS.map((w) => (
            <button
              key={w}
              type="button"
              className={
                'jz-code-settings-sub-item' + (prefs.indentWidth === w ? ' is-active' : '')
              }
              onClick={() => onPrefsChange({ indentWidth: w })}
            >
              {w}
            </button>
          ))}
        </div>
      </SubMenuRow>

      <div className="jz-code-settings-divider" />

      <div className="jz-code-settings-item jz-code-settings-switch-row">
        <span>自动换行</span>
        <Switch size="small" checked={prefs.wrap} onChange={(wrap) => onPrefsChange({ wrap })} />
      </div>
      <div className="jz-code-settings-item jz-code-settings-switch-row">
        <span>行号</span>
        <Switch
          size="small"
          checked={prefs.lineNumbers}
          onChange={(lineNumbers) => onPrefsChange({ lineNumbers })}
        />
      </div>

      <button type="button" className="jz-code-settings-item jz-code-settings-kbd-row" onClick={onAutoIndent}>
        <span>自动缩进</span>
        <kbd className="jz-code-settings-kbd">Ctrl+Shift+F</kbd>
      </button>

      {isDiagram && onTogglePreview && (
        <>
          <div className="jz-code-settings-divider" />
          <button type="button" className="jz-code-settings-item" onClick={onTogglePreview}>
            {showPreview ? '收起图表预览' : '显示图表预览'}
          </button>
        </>
      )}

      <div className="jz-code-settings-divider" />

      <button type="button" className="jz-code-settings-item" onClick={onSyncStyle}>
        同步样式到全文
      </button>
      <button type="button" className="jz-code-settings-item" onClick={onSyncStyleAndLang}>
        同步样式与语言到全文
      </button>
      <button
        type="button"
        className="jz-code-settings-item"
        onClick={() => onPrefsChange({ hideAllTitleBars: !prefs.hideAllTitleBars })}
      >
        {prefs.hideAllTitleBars ? '显示全文代码块标题栏' : '隐藏全文代码块标题栏'}
      </button>
    </div>
  );
}

function SubMenuRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="jz-code-settings-submenu">
      <div className="jz-code-settings-item jz-code-settings-submenu-trigger">
        <span>{label}</span>
        <RightOutlined className="jz-code-settings-chevron" />
      </div>
      {children}
    </div>
  );
}
