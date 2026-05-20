import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Card, Empty, Space, Spin, Tag, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import ForceGraph2D from 'react-force-graph-2d';
import { getKnowledgeGraph, type GraphNode, type GraphResponse } from '@/api/graph';
import { formatApiError } from '@/api/client';

const { Title, Text, Paragraph } = Typography;

/**
 * 知识图谱：把 ``DocumentLink`` 表里的双向链接关系画成网络图，节点 = 文档、
 * 边 = ``@mention``。布局用 ``react-force-graph-2d`` 跑物理力学迭代；按 KB 着色，
 * 节点半径随入度变化；点击直达文档编辑器。
 */
export default function KnowledgeGraphPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<GraphResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });

  // 加载图数据
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const d = await getKnowledgeGraph();
      setData(d);
      setError(null);
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // 容器尺寸跟随窗口
  useEffect(() => {
    function update() {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setSize({ w: Math.max(400, rect.width), h: Math.max(400, rect.height) });
    }
    update();
    const ro = new ResizeObserver(update);
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  // 按 KB 上色：同库节点同色，方便一眼看出聚类
  const kbColors = useMemo(() => {
    if (!data) return new Map<number, string>();
    const palette = [
      '#b94a3b', '#3a6ea5', '#6b8e23', '#c0392b', '#7a4dbf',
      '#1f8a70', '#d4a017', '#5d6d7e', '#a93226', '#117864',
    ];
    const map = new Map<number, string>();
    const kbIds = Array.from(new Set(data.nodes.map((n) => n.kb_id)));
    kbIds.forEach((kid, i) => map.set(kid, palette[i % palette.length]));
    return map;
  }, [data]);

  // react-force-graph 需要每个 node 的入度信息来调整圆点大小
  const graphData = useMemo(() => {
    if (!data) return { nodes: [], links: [] };
    const inDegree = new Map<number, number>();
    for (const e of data.edges) {
      inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
    }
    const nodes = data.nodes.map((n) => ({
      ...n,
      val: 1 + (inDegree.get(n.id) ?? 0) * 0.6,
      color: kbColors.get(n.kb_id) ?? '#999',
    }));
    const links = data.edges.map((e) => ({ source: e.source, target: e.target }));
    return { nodes, links };
  }, [data, kbColors]);

  function handleNodeClick(node: GraphNode) {
    if (!node) return;
    navigate(`/admin/kbs/${node.kb_id}/docs/${node.id}`);
  }

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card>
        <Space style={{ justifyContent: 'space-between', width: '100%' }} wrap>
          <div>
            <Title level={3} style={{ marginTop: 0, marginBottom: 4 }}>
              知识图谱
            </Title>
            <Paragraph type="secondary" style={{ marginBottom: 0 }}>
              文档之间通过 <code>@提及</code> 形成的引用网络。点击节点直达文档；
              拖拽空白处平移，滚轮缩放，按 KB 自动着色。
            </Paragraph>
          </div>
          <Space>
            {data && (
              <>
                <Tag>节点 {data.stats.node_count}</Tag>
                <Tag>边 {data.stats.edge_count}</Tag>
                <Tag color={data.stats.orphan_count > 0 ? 'orange' : 'default'}>
                  孤岛 {data.stats.orphan_count}
                </Tag>
              </>
            )}
            <Button
              icon={<ReloadOutlined />}
              onClick={() => void refresh()}
              loading={loading}
            >
              刷新
            </Button>
          </Space>
        </Space>
      </Card>

      {error && <Alert type="error" showIcon message="加载失败" description={error} />}

      <Card
        styles={{ body: { padding: 0 } }}
        style={{ overflow: 'hidden' }}
      >
        <div
          ref={containerRef}
          style={{ width: '100%', height: 'min(75vh, 720px)', position: 'relative' }}
        >
          {loading && !data ? (
            <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
              <Spin />
            </div>
          ) : data && data.nodes.length === 0 ? (
            <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
              <Empty description="还没有可见的文档" />
            </div>
          ) : data ? (
            <ForceGraph2D
              graphData={graphData}
              width={size.w}
              height={size.h}
              nodeLabel={(n) => {
                const node = n as GraphNode;
                return `${node.title}<br/><small style="opacity:0.6">${node.kb_name}</small>`;
              }}
              linkColor={() =>
                getComputedStyle(document.documentElement)
                  .getPropertyValue('--jz-text-muted')
                  .trim() || '#888'
              }
              linkWidth={1}
              linkDirectionalArrowLength={4}
              linkDirectionalArrowRelPos={1}
              cooldownTicks={120}
              nodeCanvasObject={(n, ctx, scale) => {
                const node = n as GraphNode & { x: number; y: number; val: number; color: string };
                const r = Math.sqrt(node.val) * 4;
                ctx.beginPath();
                ctx.arc(node.x, node.y, r, 0, 2 * Math.PI, false);
                ctx.fillStyle = node.color;
                ctx.fill();
                // 标签：只在缩放到一定程度才显示，避免远看一堆糊字
                if (scale > 1.4) {
                  ctx.font = `${10 / scale + 4}px sans-serif`;
                  ctx.fillStyle =
                    getComputedStyle(document.documentElement)
                      .getPropertyValue('--jz-text')
                      .trim() || '#222';
                  ctx.textAlign = 'center';
                  ctx.textBaseline = 'top';
                  const label = node.title.length > 18 ? node.title.slice(0, 17) + '…' : node.title;
                  ctx.fillText(label, node.x, node.y + r + 2);
                }
              }}
              onNodeClick={(n) => handleNodeClick(n as GraphNode)}
            />
          ) : null}
        </div>
      </Card>

      {data && data.nodes.length > 0 && (
        <Card title="知识库色板" size="small">
          <Space wrap size={[12, 8]}>
            {Array.from(kbColors.entries()).map(([kbId, color]) => {
              const sample = data.nodes.find((n) => n.kb_id === kbId);
              return (
                <Space key={kbId} size={6}>
                  <span
                    style={{
                      display: 'inline-block',
                      width: 14,
                      height: 14,
                      borderRadius: '50%',
                      background: color,
                      border: '1px solid var(--jz-border)',
                    }}
                  />
                  <Text>{sample?.kb_name ?? `KB #${kbId}`}</Text>
                </Space>
              );
            })}
          </Space>
        </Card>
      )}
    </Space>
  );
}
