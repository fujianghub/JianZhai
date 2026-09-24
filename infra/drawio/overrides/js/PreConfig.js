/**
 * 简斋 draw.io 自托管 PreConfig（infra/drawio/overrides/js/PreConfig.js）。
 *
 * bootstrap.js 在非 draw.io 域名下先加载本文件再加载 app.min.js（PostConfig 在
 * app 之后），因此这里是「不重编译即可定制」的第一入口：全局 URL、默认 URL
 * 参数、DRAWIO_CONFIG。上游原文件只设了 EXPORT_URL=null 与 BASE_URL=null（→
 * 退回 app.diagrams.net），其余都是本项目的选择，升级 draw.io 无需改动。
 */

// ── 全局地址：全部指向自身，杜绝任何 diagrams.net 回连 ──────────────────
window.DRAWIO_PUBLIC_BUILD = true;
// 无导出服务器：PDF 走打印对话框；PNG/SVG 在客户端 canvas 生成，不受影响。
window.EXPORT_URL = null;
(function () {
  // 部署基址从当前路径推导（/drawio/index.html → /drawio），换挂载点不用改。
  var base = location.pathname.replace(/\/[^\/]*$/, '');
  var origin = location.protocol + '//' + location.host;
  window.DRAWIO_BASE_URL = origin + base;
  window.DRAWIO_LIGHTBOX_URL = origin + base;
  window.DRAWIO_VIEWER_URL = origin + base + '/js/viewer-static.min.js';
})();
window.DRAW_MATH_URL = 'math4/es5';

// ── 默认 URL 参数（调用方未显式给出时生效）────────────────────────────────
// offline/stealth：关掉全部云存储、协作、模板对话框、插件；pwa=0 不注册
// service worker；math=0 省下 MathJax 2 MB（需要时由嵌入方传 math=1）；
// isGoogleFontsEnabled=0 去掉 Google 字体入口（国内不可达且泄露外联）。
(function () {
  var defaults = {
    offline: '1',
    stealth: '1',
    plugins: '0',
    pwa: '0',
    math: '0',
    isGoogleFontsEnabled: '0',
    lang: 'zh',
    sync: 'manual'
  };
  for (var k in defaults) {
    if (urlParams[k] == null) {
      urlParams[k] = defaults[k];
    }
  }
})();

// ── Editor.configure 配置 ─────────────────────────────────────────────────
// 字体：draw.io 导出的 SVG 经 <img> 显示时无法加载页面 @font-face，字形由读者
// 系统字体决定，故默认字体表只列常见系统字体（含中文），与阅读端令牌无关。
window.DRAWIO_CONFIG = {
  defaultFonts: [
    'Helvetica', 'Arial', 'Verdana', 'Tahoma', 'Georgia', 'Times New Roman', 'Courier New',
    'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', 'Source Han Sans SC',
    'SimSun', 'SimHei', 'KaiTi', 'FangSong'
  ],
  // 保存 XML 不压缩 <diagram>（注意：embed 的 export 仍会压缩内层 payload，
  // SVG content 属性里外层 <mxfile> 明文、整体可回读）。
  compressXml: false,
  enableAi: false,
  // 配置版本：改默认样式 / 菜单时递增，否则浏览器里已存的 mxSettings 会盖掉新默认。
  version: 'jz-1',
  // 形状库保持 draw.io 默认（用户决策 2026-09-24），这里不设 defaultLibraries。
  // 连线默认：正交 + 圆角拐点 + 实心箭头（draw.io 原默认无圆角）。
  defaultEdgeStyle: {
    edgeStyle: 'orthogonalEdgeStyle',
    rounded: '1',
    jettySize: 'auto',
    orthogonalLoop: '1',
    endArrow: 'block',
    endFill: '1'
  },
  // 嵌入场景用不上 / 会外联的菜单项（min 主题左上角「绘图」菜单与「插入」菜单）。
  hideMenuItems: [
    'embed', 'help', 'configuration', 'generate',
    'exportAnimatedGif', 'exportJson', 'exportUrl'
  ],
  // 页脚存储模式图标（kennedy）与标签栏的 jgraph/drawio 外链图标（min）在嵌入
  // 场景无意义且是外链——隐藏。
  css:
    '.geFooterContainer { display: none !important; }' +
    // title 在 <img> 上（不在外层 <a> 上）；亮/暗两种图标都带同一个 title。
    '.geTabContainer img[title="jgraph/drawio"],' +
    '.geTabContainer a:has(> img[title="jgraph/drawio"]) { display: none !important; }'
};
