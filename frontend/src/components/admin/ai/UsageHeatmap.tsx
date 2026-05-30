/**
 * GitHub-style contribution heatmap for AI Token spend.
 *
 * Rows: 周一 … 周日 (Mon → Sun). Columns: each represents one calendar
 * week, leftmost = oldest, rightmost = newest (today). Cell shade encodes
 * the daily ``estimated_usd`` value on a 5-level palette derived from
 * ``--jz-accent`` via ``color-mix``, so all four themes (light / dark /
 * starry / deepsea) get a coherent look without per-theme overrides.
 *
 * Hover surfaces an AntD ``Tooltip`` with the precise day, call count,
 * input/output tokens, and dollar estimate. Empty days render as a faint
 * outline so the calendar grid stays legible during slow weeks.
 *
 * The component is pure SVG — no chart libs, no canvas. For a 365-day
 * window this is 53×7 = 371 ``<rect>`` nodes, well within the budget where
 * the browser can re-paint on resize/theme-swap without a noticeable
 * stutter.
 */
import { useMemo, type CSSProperties } from 'react';
import { Empty, Tooltip } from 'antd';
import dayjs from 'dayjs';

export interface UsageHeatmapDay {
  day: string;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  estimated_usd: number;
}

interface Props {
  days: UsageHeatmapDay[];
  /** Window length in days — controls how many week columns we render. */
  windowDays: number;
}

/** Day-of-week the cell sits on, 0 = Mon … 6 = Sun. Aligns with the
 *  conventional Chinese calendar week opener. */
function rowFor(date: dayjs.Dayjs): number {
  // dayjs.day(): 0 = Sun, 1 = Mon … 6 = Sat. We want Mon=0 … Sun=6.
  const d = date.day();
  return (d + 6) % 7;
}

/** Bucket the day list by ISO date for O(1) lookup while we walk the grid. */
function indexByDay(rows: UsageHeatmapDay[]): Map<string, UsageHeatmapDay> {
  const m = new Map<string, UsageHeatmapDay>();
  for (const r of rows) m.set(r.day, r);
  return m;
}

/** Build the (col, row) grid spanning ``windowDays`` ending on today. */
function buildGrid(windowDays: number, dayMap: Map<string, UsageHeatmapDay>) {
  const today = dayjs().startOf('day');
  // Anchor the right edge on Sunday of the current week so each column is a
  // full Mon–Sun strip. Empty future days render but with no data.
  const rightEdge = today.add(6 - rowFor(today), 'day');
  const leftEdge = rightEdge.subtract(windowDays - 1, 'day');
  // Round leftEdge down to its Monday so every column starts on Monday.
  const leftMon = leftEdge.subtract(rowFor(leftEdge), 'day');
  const totalWeeks = Math.ceil(rightEdge.diff(leftMon, 'day') / 7) + 1;
  const cells: Array<{
    col: number;
    row: number;
    date: dayjs.Dayjs;
    data: UsageHeatmapDay | undefined;
    isFuture: boolean;
  }> = [];
  for (let week = 0; week < totalWeeks; week++) {
    for (let row = 0; row < 7; row++) {
      const date = leftMon.add(week * 7 + row, 'day');
      const iso = date.format('YYYY-MM-DD');
      cells.push({
        col: week,
        row,
        date,
        data: dayMap.get(iso),
        isFuture: date.isAfter(today),
      });
    }
  }
  return { cells, totalWeeks };
}

/** Compute the 0–4 shade index based on daily USD spend.
 *
 *  Steps are exponential so a single Opus call ($0.50–2) lands on level 2,
 *  a heavy day ($5–15) lands on 4, and the typical light-use day on 1–2.
 *  Adjust if the user base shifts toward Haiku-only traffic — empty days
 *  always stay at 0. */
function shadeFor(usd: number): 0 | 1 | 2 | 3 | 4 {
  if (usd <= 0) return 0;
  if (usd < 0.1) return 1;
  if (usd < 0.5) return 2;
  if (usd < 2) return 3;
  return 4;
}

const CELL = 12;
const GAP = 3;
const ROW_LABELS = ['一', '二', '三', '四', '五', '六', '日'];
const MONTH_LABEL_HEIGHT = 18;
const ROW_LABEL_WIDTH = 18;

export default function UsageHeatmap({ days, windowDays }: Props) {
  const dayMap = useMemo(() => indexByDay(days), [days]);
  const { cells, totalWeeks } = useMemo(
    () => buildGrid(windowDays, dayMap),
    [windowDays, dayMap],
  );

  const totalUsd = useMemo(
    () => days.reduce((acc, d) => acc + d.estimated_usd, 0),
    [days],
  );
  const totalCalls = useMemo(() => days.reduce((acc, d) => acc + d.calls, 0), [days]);
  const totalTokens = useMemo(
    () => days.reduce((acc, d) => acc + d.input_tokens + d.output_tokens, 0),
    [days],
  );

  if (!days.length) {
    return <Empty description="该窗口内无数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
  }

  // ── Month labels: render the month abbreviation above the column whose
  //    first day is the 1st of a month (or the first column of the grid).
  const monthLabels: Array<{ col: number; label: string }> = [];
  let lastMonth = -1;
  for (let col = 0; col < totalWeeks; col++) {
    const sampleCell = cells.find((c) => c.col === col);
    if (!sampleCell) continue;
    const m = sampleCell.date.month();
    if (m !== lastMonth) {
      monthLabels.push({ col, label: `${m + 1}月` });
      lastMonth = m;
    }
  }

  const gridWidth = ROW_LABEL_WIDTH + totalWeeks * (CELL + GAP);
  const gridHeight = MONTH_LABEL_HEIGHT + 7 * (CELL + GAP);

  return (
    <div className="jz-usage-heatmap">
      <div className="jz-usage-heatmap-summary">
        <span className="jz-usage-heatmap-stat">
          <strong>{totalCalls.toLocaleString()}</strong> 次调用
        </span>
        <span className="jz-usage-heatmap-stat">
          <strong>{(totalTokens / 1000).toFixed(1)}K</strong> token
        </span>
        <span className="jz-usage-heatmap-stat jz-usage-heatmap-usd">
          ≈ ${totalUsd.toFixed(2)}
        </span>
      </div>
      <div className="jz-usage-heatmap-wrap" style={{ overflowX: 'auto' }}>
        <svg
          width={gridWidth}
          height={gridHeight}
          viewBox={`0 0 ${gridWidth} ${gridHeight}`}
          className="jz-usage-heatmap-svg"
          role="img"
          aria-label="AI Token 花费日历热图"
        >
          {/* Month label band */}
          {monthLabels.map(({ col, label }) => (
            <text
              key={col}
              x={ROW_LABEL_WIDTH + col * (CELL + GAP)}
              y={12}
              fontSize={10}
              fill="var(--jz-text-muted)"
            >
              {label}
            </text>
          ))}
          {/* Row labels (Mon–Sun) — odd rows only so they don't crowd the grid */}
          {ROW_LABELS.map((lbl, row) =>
            row % 2 === 0 ? (
              <text
                key={lbl}
                x={0}
                y={MONTH_LABEL_HEIGHT + row * (CELL + GAP) + CELL - 2}
                fontSize={10}
                fill="var(--jz-text-muted)"
              >
                {lbl}
              </text>
            ) : null,
          )}
          {/* Cells */}
          {cells.map(({ col, row, date, data, isFuture }) => {
            const x = ROW_LABEL_WIDTH + col * (CELL + GAP);
            const y = MONTH_LABEL_HEIGHT + row * (CELL + GAP);
            const usd = data?.estimated_usd ?? 0;
            const shade = shadeFor(usd);
            // Future days inside the displayed grid render as outlines only
            // so the calendar shape stays consistent week-to-week.
            const cellClass =
              `jz-usage-heatmap-cell jz-usage-heatmap-shade-${shade}` +
              (isFuture ? ' is-future' : '');
            const tooltip = isFuture ? (
              <span>{date.format('YYYY-MM-DD')}</span>
            ) : (
              <div style={{ minWidth: 160 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>
                  {date.format('YYYY-MM-DD (ddd)')}
                </div>
                {data ? (
                  <>
                    <div>调用：{data.calls}</div>
                    <div>
                      Token：{(data.input_tokens + data.output_tokens).toLocaleString()}
                      <span style={{ color: 'var(--jz-text-muted)' }}>
                        {' '}
                        ({data.input_tokens} / {data.output_tokens})
                      </span>
                    </div>
                    <div style={{ marginTop: 4, color: 'var(--jz-accent)' }}>
                      <strong>≈ ${data.estimated_usd.toFixed(4)}</strong>
                    </div>
                  </>
                ) : (
                  <div style={{ color: 'var(--jz-text-muted)' }}>无调用</div>
                )}
              </div>
            );
            return (
              <Tooltip key={`${col}-${row}`} title={tooltip} mouseEnterDelay={0.05}>
                <rect
                  x={x}
                  y={y}
                  width={CELL}
                  height={CELL}
                  rx={2}
                  ry={2}
                  className={cellClass}
                />
              </Tooltip>
            );
          })}
        </svg>
      </div>
      <Legend />
    </div>
  );
}

function Legend() {
  const style: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 11,
    color: 'var(--jz-text-muted)',
    marginTop: 4,
  };
  return (
    <div style={style}>
      <span>较少</span>
      <svg width={70} height={12}>
        {[0, 1, 2, 3, 4].map((s, i) => (
          <rect
            key={s}
            x={i * 14}
            y={0}
            width={CELL}
            height={CELL}
            rx={2}
            ry={2}
            className={`jz-usage-heatmap-cell jz-usage-heatmap-shade-${s}`}
          />
        ))}
      </svg>
      <span>较多</span>
    </div>
  );
}
