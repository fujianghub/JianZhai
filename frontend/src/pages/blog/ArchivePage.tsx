import { useEffect, useState } from 'react';
import { Empty, Spin, Typography } from 'antd';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import { getArchive, type ArchiveBucket } from '@/api/archive';

const { Text } = Typography;

const MONTH_NAMES = [
  '', '正月', '二月', '三月', '四月', '五月', '六月',
  '七月', '八月', '九月', '十月', '冬月', '腊月',
];
const MONTH_ALIAS = [
  '', '岁首', '杏月', '桃月', '槐月', '榴月', '荷月',
  '兰月', '桂月', '菊月', '阳月', '葭月', '蜡尾',
];

/** 19 → 十九, 31 → 三十一 (1–31) */
function dayCn(n: number): string {
  const cn = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  if (n < 10) return cn[n];
  if (n === 10) return '十';
  if (n < 20) return '十' + cn[n - 10];
  if (n === 20) return '二十';
  if (n < 30) return '二十' + cn[n - 20];
  if (n === 30) return '三十';
  return '三十' + cn[n - 30];
}
const yearCn = (y: number) =>
  y.toString().split('').map((c) => ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'][Number(c)] ?? c).join('');

export default function ArchivePage() {
  const [buckets, setBuckets] = useState<ArchiveBucket[] | null>(null);

  useEffect(() => {
    void getArchive().then(setBuckets);
  }, []);

  if (buckets === null) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: 300 }}>
        <Spin />
      </div>
    );
  }

  if (buckets.length === 0) {
    return <Empty description="还没有发布的文章" />;
  }

  // Group buckets by year so we can render a year header once.
  const byYear = new Map<number, ArchiveBucket[]>();
  for (const b of buckets) {
    if (!byYear.has(b.year)) byYear.set(b.year, []);
    byYear.get(b.year)!.push(b);
  }

  return (
    <div className="jz-archive">
      <section className="jz-hero" aria-label="题记">
        <div className="jz-hero-quote" style={{ fontSize: 'clamp(1.4rem, 3vw, 2rem)' }}>
          <span>编 年 纪 事</span>
        </div>
        <div className="jz-hero-attr">
          <span className="jz-hero-attr-rule" aria-hidden />
          <span>以时为序 · 翻检故卷</span>
          <span className="jz-hero-attr-rule" aria-hidden />
        </div>
      </section>

      <div className="jz-archive-scroll">
        {[...byYear.entries()].map(([year, monthBuckets]) => (
          <section className="jz-archive-year" key={year}>
            <header className="jz-archive-year-head">
              <span className="jz-archive-year-text">{yearCn(year)}年</span>
              <span className="jz-archive-year-rule" aria-hidden />
              <Text type="secondary" style={{ fontSize: 12, letterSpacing: 1 }}>
                {monthBuckets.reduce((a, b) => a + b.count, 0)} 卷
              </Text>
            </header>

            <ol className="jz-archive-months">
              {monthBuckets.map((b) => (
                <li key={`${b.year}-${b.month}`} className="jz-archive-month">
                  <div className="jz-archive-month-head">
                    <span className="jz-archive-month-dot" aria-hidden />
                    <span className="jz-archive-month-name">{MONTH_NAMES[b.month]}</span>
                    <span className="jz-archive-month-alias">{MONTH_ALIAS[b.month]}</span>
                    <span className="jz-archive-month-count">{b.count} 篇</span>
                  </div>
                  <ul className="jz-archive-posts">
                    {b.posts.map((p) => {
                      const d = dayjs(p.published_at);
                      return (
                        <li key={p.id} className="jz-archive-post">
                          <span className="jz-archive-date" title={d.format('YYYY-MM-DD HH:mm')}>
                            {dayCn(d.date())}日
                          </span>
                          <Link to={`/posts/${encodeURIComponent(p.slug)}`} className="jz-archive-title">
                            {p.title}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </div>
  );
}
