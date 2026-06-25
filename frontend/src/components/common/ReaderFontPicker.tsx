import { Popover, Tooltip } from 'antd';
import { FontColorsOutlined } from '@ant-design/icons';
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
      <div
        style={{
          color: 'var(--glass-text-muted, var(--jz-text-muted))',
          fontSize: 12,
          marginBottom: 6,
          padding: '0 8px',
        }}
      >
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
              className={'jz-font-picker-item' + (active ? ' is-active' : '')}
              style={{ fontFamily: p.stack }}
            >
              {p.label}
            </button>
          );
        })}
      </div>
    </div>
  );
  return (
    <Popover
      content={content}
      trigger="click"
      placement="bottomRight"
      overlayClassName="jz-glass-popover"
    >
      <Tooltip title="正文字体">
        <button
          type="button"
          className="jz-reader-control-btn paper-picker-btn"
          aria-label="正文字体"
        >
          <FontColorsOutlined />
        </button>
      </Tooltip>
    </Popover>
  );
}
