import { useEffect, useState } from 'react';
import { Empty, Spin, Tooltip } from 'antd';
import { Link } from 'react-router-dom';
import { publicTagCloud, type PublicTag } from '@/api/tags';

/** Subtle per-tag rotation so the印章 wall looks stamped, not stenciled. */
function seedRotation(id: number): number {
  // Deterministic ±3.5° from id
  const r = ((id * 2654435761) >>> 0) % 700;
  return (r / 100) - 3.5;
}

export default function TagCloudPage() {
  const [tags, setTags] = useState<PublicTag[] | null>(null);

  useEffect(() => {
    void publicTagCloud().then(setTags);
  }, []);

  if (tags === null) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: 300 }}>
        <Spin />
      </div>
    );
  }
  if (tags.length === 0) {
    return <Empty description="还没有公开标签" />;
  }

  const maxCount = Math.max(...tags.map((t) => t.count));

  return (
    <div className="jz-tagcloud">
      <section className="jz-hero" aria-label="题记">
        <div className="jz-hero-quote" style={{ fontSize: 'clamp(1.4rem, 3vw, 2rem)' }}>
          <span>百 名 印 谱</span>
        </div>
        <div className="jz-hero-attr">
          <span className="jz-hero-attr-rule" aria-hidden />
          <span>按类索文 · 一印一题</span>
          <span className="jz-hero-attr-rule" aria-hidden />
        </div>
      </section>

      <div className="jz-tagcloud-wall">
        {tags.map((t) => {
          // Size scales with use count — most used tags become bigger 印章.
          const w = 0.6 + (t.count / Math.max(maxCount, 1)) * 0.7; // 0.6 .. 1.3
          const fontSize = Math.round(16 + w * 8);  // 22 .. 27 px
          const pad = Math.round(6 + w * 4);
          const rot = seedRotation(t.id);
          return (
            <Tooltip key={t.id} title={`${t.count} 篇`}>
              <Link
                to={`/tags#${encodeURIComponent(t.name)}`}
                className="jz-seal-link"
                aria-label={`${t.name}（${t.count} 篇）`}
              >
                <span
                  className="jz-seal-stamp"
                  style={{
                    fontSize,
                    padding: `${pad}px ${pad + 4}px`,
                    rotate: `${rot}deg`,
                  }}
                >
                  <span className="jz-seal-text">{t.name}</span>
                  <span className="jz-seal-count" aria-hidden>{t.count}</span>
                </span>
              </Link>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}
