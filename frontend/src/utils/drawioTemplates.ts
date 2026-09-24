/**
 * drawio画板 起手模板（新建画板时的选择面板）。
 *
 * 只用 draw.io 内置基础形状（圆角矩形 / 菱形 / 椭圆 / 云 / 圆柱 / swimlane），
 * 不依赖任何扩展形状库——形状库保持 draw.io 默认（用户决策 2026-09-24）。
 * 配色取 draw.io 自带的柔和色板（蓝 #dae8fc / 绿 #d5e8d4 / 红 #f8cecc /
 * 黄 #fff2cc / 紫 #e1d5e7），导出时经 light-dark() 自动适配暗色主题。
 */
import { BLANK_DRAWIO_XML } from './drawioEmbed';

export interface DrawioTemplate {
  id: 'blank' | 'flowchart' | 'network' | 'layers';
  title: string;
  description: string;
  xml: string;
}

interface V { id: string; label: string; style: string; x: number; y: number; w: number; h: number }
interface E { id: string; from: string; to: string; label?: string; style?: string }

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const BOX = 'rounded=1;whiteSpace=wrap;html=1;arcSize=14;';
const BLUE = 'fillColor=#dae8fc;strokeColor=#6c8ebf;';
const GREEN = 'fillColor=#d5e8d4;strokeColor=#82b366;';
const RED = 'fillColor=#f8cecc;strokeColor=#b85450;';
const YELLOW = 'fillColor=#fff2cc;strokeColor=#d6b656;';
const PURPLE = 'fillColor=#e1d5e7;strokeColor=#9673a6;';
const EDGE = 'edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;endArrow=block;endFill=1;';

function mxfile(name: string, vs: V[], es: E[]): string {
  let cells = '';
  for (const v of vs) {
    cells +=
      `<mxCell id="${v.id}" value="${esc(v.label)}" style="${v.style}" vertex="1" parent="1">` +
      `<mxGeometry x="${v.x}" y="${v.y}" width="${v.w}" height="${v.h}" as="geometry"/></mxCell>`;
  }
  for (const e of es) {
    cells +=
      `<mxCell id="${e.id}" value="${esc(e.label ?? '')}" style="${e.style ?? EDGE}" edge="1" parent="1" source="${e.from}" target="${e.to}">` +
      '<mxGeometry relative="1" as="geometry"/></mxCell>';
  }
  return (
    `<mxfile><diagram id="jz-${name}" name="第 1 页"><mxGraphModel grid="1" gridSize="10" page="0"><root>` +
    `<mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel></diagram></mxfile>`
  );
}

const FLOWCHART = mxfile(
  'flow',
  [
    { id: 's', label: '开始', style: 'ellipse;whiteSpace=wrap;html=1;' + GREEN, x: 170, y: 20, w: 120, h: 44 },
    { id: 'a', label: '处理步骤', style: BOX + BLUE, x: 160, y: 104, w: 140, h: 50 },
    { id: 'd', label: '条件判断？', style: 'rhombus;whiteSpace=wrap;html=1;' + YELLOW, x: 160, y: 194, w: 140, h: 80 },
    { id: 'b', label: '分支处理', style: BOX + BLUE, x: 360, y: 209, w: 130, h: 50 },
    { id: 'e', label: '结束', style: 'ellipse;whiteSpace=wrap;html=1;' + RED, x: 170, y: 314, w: 120, h: 44 },
  ],
  [
    { id: 'e1', from: 's', to: 'a' },
    { id: 'e2', from: 'a', to: 'd' },
    { id: 'e3', from: 'd', to: 'e', label: '是' },
    { id: 'e4', from: 'd', to: 'b', label: '否' },
    { id: 'e5', from: 'b', to: 'a', style: EDGE + 'exitX=0.5;exitY=0;entryX=1;entryY=0.5;' },
  ],
);

const NETWORK = mxfile(
  'net',
  [
    { id: 'wan', label: '互联网', style: 'ellipse;shape=cloud;whiteSpace=wrap;html=1;' + PURPLE, x: 250, y: 10, w: 140, h: 80 },
    { id: 'fw', label: '防火墙', style: BOX + RED, x: 250, y: 130, w: 140, h: 46 },
    { id: 'core', label: '核心交换机', style: BOX + BLUE, x: 250, y: 216, w: 140, h: 46 },
    { id: 'acc1', label: '接入交换机 A', style: BOX + GREEN, x: 80, y: 312, w: 140, h: 46 },
    { id: 'acc2', label: '接入交换机 B', style: BOX + GREEN, x: 420, y: 312, w: 140, h: 46 },
    { id: 'srv', label: '服务器区', style: 'shape=cylinder3;whiteSpace=wrap;html=1;boundedLbl=1;size=10;' + YELLOW, x: 270, y: 300, w: 100, h: 70 },
  ],
  [
    { id: 'n1', from: 'wan', to: 'fw', style: EDGE + 'endArrow=none;' },
    { id: 'n2', from: 'fw', to: 'core', style: EDGE + 'endArrow=none;' },
    { id: 'n3', from: 'core', to: 'acc1', style: EDGE + 'endArrow=none;' },
    { id: 'n4', from: 'core', to: 'acc2', style: EDGE + 'endArrow=none;' },
    { id: 'n5', from: 'core', to: 'srv', style: EDGE + 'endArrow=none;' },
  ],
);

const LANE = 'swimlane;horizontal=0;whiteSpace=wrap;html=1;startSize=36;rounded=1;arcSize=6;';
const LAYERS = mxfile(
  'layers',
  [
    { id: 'l1', label: '表现层', style: LANE + BLUE, x: 20, y: 20, w: 520, h: 90 },
    { id: 'l2', label: '业务层', style: LANE + GREEN, x: 20, y: 130, w: 520, h: 90 },
    { id: 'l3', label: '数据层', style: LANE + YELLOW, x: 20, y: 240, w: 520, h: 90 },
    { id: 'c1', label: 'Web 前端', style: BOX, x: 90, y: 45, w: 130, h: 40 },
    { id: 'c2', label: '移动端', style: BOX, x: 250, y: 45, w: 130, h: 40 },
    { id: 'c3', label: '服务 A', style: BOX, x: 90, y: 155, w: 130, h: 40 },
    { id: 'c4', label: '服务 B', style: BOX, x: 250, y: 155, w: 130, h: 40 },
    { id: 'c5', label: '数据库', style: 'shape=cylinder3;whiteSpace=wrap;html=1;boundedLbl=1;size=8;', x: 110, y: 257, w: 90, h: 56 },
    { id: 'c6', label: '缓存', style: BOX, x: 250, y: 265, w: 130, h: 40 },
  ],
  [
    { id: 'k1', from: 'c1', to: 'c3' },
    { id: 'k2', from: 'c2', to: 'c4' },
    { id: 'k3', from: 'c3', to: 'c5' },
    { id: 'k4', from: 'c4', to: 'c6' },
  ],
);

export const DRAWIO_TEMPLATES: DrawioTemplate[] = [
  { id: 'blank', title: '空白画板', description: '从零开始', xml: BLANK_DRAWIO_XML },
  { id: 'flowchart', title: '流程图', description: '开始 · 步骤 · 判断 · 结束', xml: FLOWCHART },
  { id: 'network', title: '网络拓扑', description: '互联网 · 防火墙 · 核心 · 接入', xml: NETWORK },
  { id: 'layers', title: '分层架构', description: '表现 · 业务 · 数据三层', xml: LAYERS },
];
