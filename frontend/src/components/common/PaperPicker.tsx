import { Popover, Space, Tooltip } from 'antd';
import { BgColorsOutlined } from '@ant-design/icons';
import { PAPER_STYLES } from '@/utils/paper';

interface Props {
  value: string;
  onChange: (key: string) => void;
}

/** Small floating picker that lets the reader switch paper style for a post. */
export default function PaperPicker({ value, onChange }: Props) {
  const content = (
    <div style={{ width: 240 }}>
      <div style={{ color: 'var(--jz-text-muted)', fontSize: 12, marginBottom: 8 }}>
        阅读纸张
      </div>
      <Space wrap>
        {PAPER_STYLES.map((p) => (
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
    <Popover content={content} trigger="click" placement="bottomRight">
      <Tooltip title="纸张样式">
        <button
          type="button"
          className="paper-picker-btn"
          aria-label="纸张样式"
        >
          <BgColorsOutlined />
        </button>
      </Tooltip>
    </Popover>
  );
}
