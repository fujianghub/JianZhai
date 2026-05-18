import { Popover, Tooltip } from 'antd';
import { FontSizeOutlined } from '@ant-design/icons';
import { ARTICLE_FONT_PRESETS } from '@/utils/articleFont';

interface Props {
  value: string;
  onChange: (key: string) => void;
}

/** Small dropdown that lets the reader switch article-body font. Mirrors the
 *  paper-style picker; persists via the parent's onChange. */
export default function ReaderFontPicker({ value, onChange }: Props) {
  const content = (
    <div style={{ width: 220, padding: '4px 0' }}>
      <div style={{ color: 'var(--jz-text-muted)', fontSize: 12, marginBottom: 6, padding: '0 8px' }}>
        正文字体
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {ARTICLE_FONT_PRESETS.map((p) => {
          const active = p.key === value;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => onChange(p.key)}
              className="jz-font-picker-item"
              style={{
                display: 'block',
                width: '100%',
                padding: '7px 10px',
                background: active ? 'color-mix(in srgb, var(--jz-accent) 14%, transparent)' : 'transparent',
                color: active ? 'var(--jz-accent)' : 'var(--jz-text)',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                textAlign: 'left',
                fontSize: 14,
                fontFamily: p.stack,
                letterSpacing: 0.5,
                transition: 'background-color 120ms ease, color 120ms ease',
              }}
            >
              {p.label}
            </button>
          );
        })}
      </div>
    </div>
  );
  return (
    <Popover content={content} trigger="click" placement="bottomRight">
      <Tooltip title="正文字体">
        <button
          type="button"
          className="paper-picker-btn"
          aria-label="正文字体"
        >
          <FontSizeOutlined />
        </button>
      </Tooltip>
    </Popover>
  );
}
