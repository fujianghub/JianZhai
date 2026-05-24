import { useState } from 'react';
import { Dropdown } from 'antd';
import { CaretDownOutlined, CheckOutlined } from '@ant-design/icons';
import { CODE_THEMES, themeLabel, type CodeThemeId } from '@/utils/codeBlockPrefs';

export interface CodeBlockThemeSelectProps {
  value: CodeThemeId;
  onChange: (theme: CodeThemeId) => void;
  disabled?: boolean;
}

/** Yuque-style theme picker with checkmark on the active item. */
export default function CodeBlockThemeSelect({
  value,
  onChange,
  disabled,
}: CodeBlockThemeSelectProps) {
  const [open, setOpen] = useState(false);

  const menu = (
    <div className="jz-code-theme-menu" onClick={(e) => e.stopPropagation()}>
      {CODE_THEMES.map((t) => (
        <button
          key={t.id}
          type="button"
          className={'jz-code-theme-item' + (value === t.id ? ' is-active' : '')}
          onClick={() => {
            onChange(t.id);
            setOpen(false);
          }}
        >
          <span className="jz-code-theme-item-check" aria-hidden>
            <CheckOutlined />
          </span>
          <span>{t.label}</span>
        </button>
      ))}
    </div>
  );

  return (
    <Dropdown
      open={open}
      onOpenChange={setOpen}
      trigger={['click']}
      disabled={disabled}
      placement="bottomLeft"
      overlayClassName="jz-code-theme-dropdown"
      dropdownRender={() => menu}
    >
      <button
        type="button"
        className="jz-code-theme-trigger"
        disabled={disabled}
        onClick={(e) => e.stopPropagation()}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="jz-code-theme-trigger-label">{themeLabel(value)}</span>
        <CaretDownOutlined />
      </button>
    </Dropdown>
  );
}
