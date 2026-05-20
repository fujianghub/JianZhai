import { useMemo, useState } from 'react';
import { diff_match_patch, type Diff } from 'diff-match-patch';
import { Segmented, Typography } from 'antd';

const { Text } = Typography;

interface Props {
  a: string;
  b: string;
  /** Labels for the two sides (e.g. version ids). */
  labelA?: string;
  labelB?: string;
}

type Granularity = 'char' | 'line';
type ViewMode = 'inline' | 'split';

interface DiffStats {
  additions: number;
  deletions: number;
  totalChanges: number;
}

function countDisplayLines(text: string): number {
  // Count the lines as they will visually render. Trailing empty segment after
  // a final \n is ignored so "foo\n" counts as 1 line, not 2.
  const parts = text.split('\n');
  if (parts.length > 1 && parts[parts.length - 1] === '') parts.pop();
  return parts.length;
}

function computeLineStats(diffs: Diff[]): DiffStats {
  let additions = 0;
  let deletions = 0;
  for (const [op, text] of diffs) {
    const lines = countDisplayLines(text);
    if (op === 1) additions += lines;
    else if (op === -1) deletions += lines;
  }
  return { additions, deletions, totalChanges: additions + deletions };
}

/**
 * Visual diff of two text snapshots.
 * - char: classic diff-match-patch char-level diff with semantic cleanup
 * - line: per-line diff (each unchanged line shown once, deleted lines highlighted red, inserted green)
 */
export default function DiffView({ a, b, labelA = 'A', labelB = 'B' }: Props) {
  const [granularity, setGranularity] = useState<Granularity>('line');
  const [viewMode, setViewMode] = useState<ViewMode>('inline');

  const charDiffs = useMemo(() => buildCharDiff(a, b), [a, b]);
  const lineDiffs = useMemo(() => buildLineDiff(a, b), [a, b]);
  const stats = useMemo(() => computeLineStats(lineDiffs), [lineDiffs]);

  return (
    <div>
      <div
        style={{
          display: 'flex',
          gap: 12,
          marginBottom: 12,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <Text type="secondary">
          {labelA} → {labelB}
        </Text>
        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <span style={{ color: '#52c41a', fontSize: 13 }}>+{stats.additions}</span>
          <span style={{ color: '#ff4d4f', fontSize: 13 }}>−{stats.deletions}</span>
          <Text type="secondary" style={{ fontSize: 12 }}>
            共 {stats.totalChanges} 行变更
          </Text>
        </span>
        <span style={{ flex: 1 }} />
        <Segmented
          size="small"
          value={granularity}
          onChange={(v) => setGranularity(v as Granularity)}
          options={[
            { label: '行级', value: 'line' },
            { label: '字符级', value: 'char' },
          ]}
        />
        <Segmented
          size="small"
          value={viewMode}
          onChange={(v) => setViewMode(v as ViewMode)}
          options={[
            { label: '内联', value: 'inline' },
            { label: '并排', value: 'split' },
          ]}
          disabled={granularity === 'char'}
        />
      </div>
      {viewMode === 'split' && granularity === 'line' ? (
        <SplitView diffs={lineDiffs} labelA={labelA} labelB={labelB} />
      ) : (
        <pre className="diff-view">
          {granularity === 'char'
            ? charDiffs.map((d, i) => <DiffSpan key={i} op={d[0]} text={d[1]} />)
            : lineDiffs.map((d, i) => <LineRow key={i} op={d[0]} text={d[1]} />)}
        </pre>
      )}
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
            {marker}
            {line}
          </span>
        );
      })}
    </>
  );
}

function SplitView({ diffs, labelA, labelB }: { diffs: Diff[]; labelA: string; labelB: string }) {
  // For each segment, push rows onto left/right columns. Equal segments
  // duplicate to both sides; deletes only fill the left, inserts only the right.
  // A trailing blank pad fills the opposite side so consecutive add/del still
  // line up vertically per-row.
  const leftRows: { text: string; cls: string }[] = [];
  const rightRows: { text: string; cls: string }[] = [];

  function splitLines(text: string): string[] {
    const parts = text.split('\n');
    if (parts.length > 1 && parts[parts.length - 1] === '') parts.pop();
    return parts;
  }

  for (const [op, text] of diffs) {
    const lines = splitLines(text);
    if (op === 0) {
      for (const line of lines) {
        leftRows.push({ text: line, cls: 'diff-line-eq' });
        rightRows.push({ text: line, cls: 'diff-line-eq' });
      }
    } else if (op === -1) {
      for (const line of lines) {
        leftRows.push({ text: line, cls: 'diff-line-del' });
        rightRows.push({ text: '', cls: 'diff-line-pad' });
      }
    } else if (op === 1) {
      for (const line of lines) {
        leftRows.push({ text: '', cls: 'diff-line-pad' });
        rightRows.push({ text: line, cls: 'diff-line-add' });
      }
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
      <div>
        <div
          style={{
            padding: '4px 8px',
            fontSize: 12,
            color: 'var(--jz-text-muted)',
            borderBottom: '1px solid var(--jz-border)',
          }}
        >
          {labelA}
        </div>
        <pre className="diff-view">
          {leftRows.map((r, i) => (
            <span key={i} className={r.cls}>
              {r.cls === 'diff-line-del' ? '- ' : '  '}
              {r.text}
              {'\n'}
            </span>
          ))}
        </pre>
      </div>
      <div>
        <div
          style={{
            padding: '4px 8px',
            fontSize: 12,
            color: 'var(--jz-text-muted)',
            borderBottom: '1px solid var(--jz-border)',
          }}
        >
          {labelB}
        </div>
        <pre className="diff-view">
          {rightRows.map((r, i) => (
            <span key={i} className={r.cls}>
              {r.cls === 'diff-line-add' ? '+ ' : '  '}
              {r.text}
              {'\n'}
            </span>
          ))}
        </pre>
      </div>
    </div>
  );
}
