import { useEffect, useMemo, useState } from 'react';
import { Tooltip } from 'antd';
import { getDocumentActivity, type ActivityBucket } from '@/api/docs';

const CELL = 12; // px
const GAP = 3; // px
const CELL_STRIDE = CELL + GAP;

/** Choose a heatmap "level" 0..4 from the day's edit count. The thresholds
 *  pick a sensible curve for personal usage: 1, 3, 6, 10+. */
function levelFor(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0;
  if (count < 3) return 1;
  if (count < 6) return 2;
  if (count < 10) return 3;
  return 4;
}

const LEVEL_BG: Record<number, string> = {
  0: 'color-mix(in srgb, var(--jz-text-muted) 14%, transparent)',
  1: 'color-mix(in srgb, var(--jz-accent) 28%, transparent)',
  2: 'color-mix(in srgb, var(--jz-accent) 50%, transparent)',
  3: 'color-mix(in srgb, var(--jz-accent) 72%, transparent)',
  4: 'var(--jz-accent)',
};

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];
const MONTH_LABELS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

interface Cell {
  date: string;     // YYYY-MM-DD
  weekday: number;  // 0..6 (Sun..Sat)
  weekCol: number;  // 0..52
  count: number;
}

function buildCells(buckets: ActivityBucket[], days: number): { cells: Cell[]; weeks: number; monthMarks: { col: number; label: string }[] } {
  const byDate = new Map<string, number>();
  for (const b of buckets) byDate.set(b.date, b.count);

  // End on today, start `days-1` days earlier; pad backwards to the prior
  // Sunday so the grid aligns into clean week columns.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today);
  start.setDate(start.getDate() - (days - 1));
  // Walk back to Sunday (weekday 0) so column 0 is a full week.
  while (start.getDay() !== 0) start.setDate(start.getDate() - 1);

  const cells: Cell[] = [];
  const monthMarks: { col: number; label: string }[] = [];
  let lastMonth = -1;
  const cursor = new Date(start);
  let col = 0;
  while (cursor <= today) {
    const y = cursor.getFullYear();
    const m = String(cursor.getMonth() + 1).padStart(2, '0');
    const d = String(cursor.getDate()).padStart(2, '0');
    const date = `${y}-${m}-${d}`;
    const weekday = cursor.getDay();
    if (weekday === 0 && cursor.getMonth() !== lastMonth) {
      monthMarks.push({ col, label: MONTH_LABELS[cursor.getMonth()] });
      lastMonth = cursor.getMonth();
    }
    cells.push({ date, weekday, weekCol: col, count: byDate.get(date) ?? 0 });
    cursor.setDate(cursor.getDate() + 1);
    if (cursor.getDay() === 0) col += 1;
  }
  return { cells, weeks: col + 1, monthMarks };
}

export default function WritingHeatmap({ days = 365 }: { days?: number }) {
  const [data, setData] = useState<ActivityBucket[] | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getDocumentActivity(days)
      .then((r) => !cancelled && setData(r.buckets))
      .catch(() => !cancelled && setErr(true));
    return () => { cancelled = true; };
  }, [days]);

  const { cells, weeks, monthMarks, total, activeDays, longestStreak } = useMemo(() => {
    if (!data) return { cells: [] as Cell[], weeks: 0, monthMarks: [] as { col: number; label: string }[], total: 0, activeDays: 0, longestStreak: 0 };
    const { cells, weeks, monthMarks } = buildCells(data, days);
    let total = 0;
    let activeDays = 0;
    let longestStreak = 0;
    let cur = 0;
    for (const c of cells) {
      total += c.count;
      if (c.count > 0) {
        activeDays += 1;
        cur += 1;
        if (cur > longestStreak) longestStreak = cur;
      } else {
        cur = 0;
      }
    }
    return { cells, weeks, monthMarks, total, activeDays, longestStreak };
  }, [data, days]);

  const ROW_LABEL_W = 18;
  const TOP_PAD = 14;
  const width = ROW_LABEL_W + weeks * CELL_STRIDE;
  const height = TOP_PAD + 7 * CELL_STRIDE;

  if (err) {
    return (
      <div className="jz-admin-panel" style={{ color: 'var(--jz-text-muted)' }}>
        活动数据加载失败
      </div>
    );
  }

  return (
    <div className="jz-admin-panel">
      <div className="jz-heatmap-header">
        <div className="jz-heatmap-title">
          写作日历
          <span className="jz-heatmap-window">近 {days} 天</span>
        </div>
        {data === null ? (
          <div style={{ fontSize: 12, color: 'var(--jz-text-muted)' }}>加载中…</div>
        ) : total === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--jz-text-muted)' }}>
            还没有写作记录——这片空白等你点亮
          </div>
        ) : (
          <div className="jz-heatmap-stats">
            <span className="jz-heatmap-stat">
              <strong>{activeDays}</strong> 天活跃
            </span>
            <span className="jz-heatmap-stat">
              <strong>{total}</strong> 次编辑
            </span>
            <span className="jz-heatmap-stat">
              最长 <strong>{longestStreak}</strong> 天连续
            </span>
          </div>
        )}
      </div>
      <div className="jz-heatmap-scroll">
      <svg width={width} height={height} role="img" aria-label={`过去 ${days} 天的文档编辑活动`}>
        {/* Weekday labels — render every other one to save space. */}
        {WEEKDAY_LABELS.map((w, i) => (
          (i === 1 || i === 3 || i === 5) ? (
            <text
              key={w}
              x={0}
              y={TOP_PAD + i * CELL_STRIDE + CELL - 2}
              fontSize={10}
              fill="var(--jz-text-muted)"
            >
              {w}
            </text>
          ) : null
        ))}
        {/* Month labels along the top */}
        {monthMarks.map((m) => (
          <text
            key={`${m.col}-${m.label}`}
            x={ROW_LABEL_W + m.col * CELL_STRIDE}
            y={10}
            fontSize={10}
            fill="var(--jz-text-muted)"
          >
            {m.label}
          </text>
        ))}
        {/* Cells */}
        {cells.map((c) => {
          const x = ROW_LABEL_W + c.weekCol * CELL_STRIDE;
          const y = TOP_PAD + c.weekday * CELL_STRIDE;
          const lvl = levelFor(c.count);
          const rect = (
            <rect
              key={c.date}
              x={x}
              y={y}
              width={CELL}
              height={CELL}
              rx={2}
              ry={2}
              fill={LEVEL_BG[lvl]}
              stroke={lvl === 0 ? 'transparent' : 'color-mix(in srgb, var(--jz-accent) 25%, transparent)'}
              strokeWidth={lvl === 0 ? 0 : 0.5}
            />
          );
          return c.count > 0 ? (
            <Tooltip key={c.date} title={`${c.date}：编辑 ${c.count} 次`}>
              {rect}
            </Tooltip>
          ) : (
            rect
          );
        })}
      </svg>
      </div>
      {/* Legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 11, color: 'var(--jz-text-muted)', justifyContent: 'flex-end' }}>
        少
        {[0, 1, 2, 3, 4].map((l) => (
          <span
            key={l}
            style={{
              display: 'inline-block',
              width: 10,
              height: 10,
              borderRadius: 2,
              background: LEVEL_BG[l],
            }}
          />
        ))}
        多
      </div>
    </div>
  );
}
