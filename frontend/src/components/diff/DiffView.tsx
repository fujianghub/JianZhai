import { useMemo } from 'react';
import { diff_match_patch, type Diff } from 'diff-match-patch';
import { Segmented, Space, Typography } from 'antd';
import { useState } from 'react';

const { Text } = Typography;

interface Props {
  a: string;
  b: string;
  /** Labels for the two sides (e.g. version ids). */
  labelA?: string;
  labelB?: string;
}

type Granularity = 'char' | 'line';

/**
 * Visual diff of two text snapshots.
 * - char: classic diff-match-patch char-level diff with semantic cleanup
 * - line: per-line diff (each unchanged line shown once, deleted lines highlighted red, inserted green)
 */
export default function DiffView({ a, b, labelA = 'A', labelB = 'B' }: Props) {
  const [granularity, setGranularity] = useState<Granularity>('char');

  const charDiffs = useMemo(() => buildCharDiff(a, b), [a, b]);
  const lineDiffs = useMemo(() => buildLineDiff(a, b), [a, b]);

  return (
    <div>
      <Space style={{ marginBottom: 12 }}>
        <Text type="secondary">{labelA} → {labelB}</Text>
        <Segmented
          size="small"
          value={granularity}
          onChange={(v) => setGranularity(v as Granularity)}
          options={[
            { label: '行级', value: 'line' },
            { label: '字符级', value: 'char' },
          ]}
        />
      </Space>
      <pre className="diff-view">
        {granularity === 'char'
          ? charDiffs.map((d, i) => <DiffSpan key={i} op={d[0]} text={d[1]} />)
          : lineDiffs.map((d, i) => <LineRow key={i} op={d[0]} text={d[1]} />)}
      </pre>
    </div>
  );
}

function buildCharDiff(a: string, b: string): Diff[] {
  const dmp = new diff_match_patch();
  const diffs = dmp.diff_main(a, b);
  dmp.diff_cleanupSemantic(diffs);
  return diffs;
}

function buildLineDiff(a: string, b: string): Diff[] {
  const dmp = new diff_match_patch();
  // diff_linesToChars compresses each line to a single Unicode code point
  // so diff_main works in line-mode efficiently.
  const lt = dmp.diff_linesToChars_(a, b);
  const diffs = dmp.diff_main(lt.chars1, lt.chars2, false);
  dmp.diff_charsToLines_(diffs, lt.lineArray);
  return diffs;
}

function DiffSpan({ op, text }: { op: number; text: string }) {
  if (op === 0) return <span>{text}</span>;
  if (op === 1) return <ins>{text}</ins>;
  return <del>{text}</del>;
}

function LineRow({ op, text }: { op: number; text: string }) {
  const lines = text.split(/(?<=\n)/);
  return (
    <>
      {lines.map((line, idx) => {
        if (!line) return null;
        const marker = op === 1 ? '+ ' : op === -1 ? '- ' : '  ';
        const className = op === 1 ? 'diff-line-add' : op === -1 ? 'diff-line-del' : 'diff-line-eq';
        return (
          <span key={idx} className={className}>
            {marker}{line}
          </span>
        );
      })}
    </>
  );
}
