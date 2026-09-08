/**
 * Toolbar popover for the PDF / PPT paper colour (shared preference, same
 * five swatches as the EPUB reader).
 */
import { Popover, Segmented, Tooltip } from 'antd';
import { BgColorsOutlined } from '@ant-design/icons';
import IconButton from './IconButton';
import { READER_PAPERS, useReaderPaper, type ReaderPaperKey } from '@/utils/readerPaper';

interface Props {
  /** Fullscreen containers must host their own popups. */
  popupContainer?: () => HTMLElement;
}

export default function ReaderPaperPicker({ popupContainer }: Props) {
  const [paper, setPaper] = useReaderPaper();
  return (
    <Popover
      trigger="click"
      placement="bottomRight"
      getPopupContainer={popupContainer}
      content={
        <Segmented
          size="small"
          value={paper.key}
          onChange={(v) => setPaper(v as ReaderPaperKey)}
          options={READER_PAPERS.map((p) => ({
            value: p.key,
            label: (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span
                  aria-hidden
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    border: '1px solid var(--jz-border)',
                    background: p.bg ?? 'var(--jz-surface)',
                  }}
                />
                {p.label}
              </span>
            ),
          }))}
        />
      }
    >
      <Tooltip title={`纸色：${paper.label}`}>
        <IconButton icon={<BgColorsOutlined />} aria-label="纸色" active={paper.key !== 'theme'} />
      </Tooltip>
    </Popover>
  );
}
