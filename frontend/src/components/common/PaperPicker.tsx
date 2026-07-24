import { Popover, Space, Tooltip } from 'antd';
import { FileOutlined } from '@ant-design/icons';
import { PAPER_STYLES } from '@/utils/paper';

interface Props {
  value: string;
  onChange: (key: string) => void;
  /** Preset keys to hide — e.g. the warm papers that ``.jz-blog-glass``
   * neutralizes to the same plain surface, where the swatch preview would
   * promise a texture the page can't deliver. The currently-selected key is
   * always kept so an existing choice stays visible/deselectable. */
  hiddenKeys?: string[];
}

/** Small floating picker that lets the reader switch paper style for a post. */
export default function PaperPicker({ value, onChange, hiddenKeys }: Props) {
  const visible = hiddenKeys?.length
    ? PAPER_STYLES.filter((p) => p.key === value || !hiddenKeys.includes(p.key))
    : PAPER_STYLES;
  const content = (
    <div style={{ width: 240 }}>
      <div
        style={{
          color: 'var(--glass-text-muted, var(--jz-text-muted))',
          fontSize: 12,
          marginBottom: 8,
        }}
      >
        阅读纸张
      </div>
      <Space wrap>
        {visible.map((p) => (
          <Tooltip key={p.key} title={`${p.label}${p.hint ? '：' + p.hint : ''}`}>
            <button
              type="button"
              onClick={() => onChange(p.key)}
              className={'paper-swatch ' + p.className + (value === p.key ? ' is-active' : '')}
              aria-label={p.label}
            >
              <span className="paper-swatch-label">{p.label}</span>
            </button>
          </Tooltip>
        ))}
      </Space>
    </div>
  );
  return (
    <Popover
      content={content}
      trigger="click"
      placement="bottomRight"
      overlayClassName="jz-glass-popover"
    >
      <Tooltip title="纸张样式">
        <button
          type="button"
          className="jz-reader-control-btn paper-picker-btn"
          aria-label="纸张样式"
        >
          <FileOutlined />
        </button>
      </Tooltip>
    </Popover>
  );
}
