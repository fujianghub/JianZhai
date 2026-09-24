/**
 * 简斋 draw.io 自托管 PostConfig（infra/drawio/overrides/js/PostConfig.js）。
 * app.min.js 加载完成后执行：运行时关掉依赖外部服务的功能。
 */
window.ICONSEARCH_PATH = null;
window.ICON_SERVICE_PATH = null;
if (window.Editor) {
  // 自定义字体对话框的 Google Fonts 加载入口（fonts.googleapis.com 外联）。
  window.Editor.enableWebFonts = false;
  // 文件保存不压缩 <diagram>（embed 的 export 路径无论如何都会 deflate+base64
  // 内层 payload——外层 <mxfile> 明文、可回读；此设置只影响 getFileData 默认）。
  window.Editor.compressXml = false;
  window.Editor.defaultCompressed = false;
  // 商标：运行时 updateDocumentTitle 会把标题改成「<文件名> - draw.io app」。
  window.Editor.prototype.appName = '简斋 · 画板';
}
// App 覆写了 EditorUi 的同名方法（offline 时追加 " app"），两层都钉死。
[window.EditorUi, window.App].forEach(function (cls) {
  if (cls && cls.prototype) {
    cls.prototype.updateDocumentTitle = function () {
      document.title = '简斋 · 画板';
    };
  }
});

// ── 界面配色贴合简斋（同源：直接读父页的 --jz-* 令牌，六套主题自动跟随）─────
// 只覆盖 draw.io 自己的 CSS 变量（styles/grapheditor.css :root），不碰画布内容。
(function () {
  var parentDoc;
  try {
    parentDoc = window.parent !== window ? window.parent.document : null;
  } catch (e) {
    parentDoc = null; // 非同源嵌入：保持 draw.io 原配色
  }
  if (!parentDoc) return;
  var cs = window.parent.getComputedStyle(parentDoc.documentElement);
  var accent = (cs.getPropertyValue('--jz-accent') || '').trim();
  var bg = (cs.getPropertyValue('--jz-bg-app') || '').trim();
  if (!accent) return;
  var mix = function (pct, base) {
    return 'color-mix(in srgb, ' + accent + ' ' + pct + '%, ' + base + ')';
  };
  var vars = {
    '--accent-text-color': 'color-mix(in srgb, ' + accent + ' 80%, #000)',
    '--accent-color': mix(12, '#ffffff'),
    '--accent-hover-color': mix(18, '#ffffff'),
    '--primary-color': mix(24, '#ffffff'),
    '--primary-hover-color': mix(34, '#ffffff'),
    '--dark-accent-text-color': accent,
    '--dark-accent-color': mix(26, '#121212'),
    '--dark-active-accent-color': mix(40, '#121212')
  };
  if (bg) {
    vars['--workspace-color'] = 'color-mix(in srgb, ' + bg + ' 70%, #ececec)';
  }
  var root = document.documentElement;
  for (var k in vars) {
    root.style.setProperty(k, vars[k]);
  }
})();
