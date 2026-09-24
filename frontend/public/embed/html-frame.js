/* 简斋 HTML 沙箱宿主脚本 — 与 html-frame.html 成对，ES5、无构建。
 *
 * 协议（父页 ↔ 本页，均 targetOrigin '*'：本页在 sandbox 下是不透明源）：
 *   本页 → 父页  {type:'jz-html-frame-ready'}          监听就绪
 *   父页 → 本页  {type:'jz-html-frame', html:'…'}       整份 HTML（已注入 <base> 与 bootstrap）
 * 收到 HTML 后 document.open/write/close 覆写自身，之后本脚本不再存在；
 * 父页需要换内容时重新挂载 iframe（SandboxedHtmlFrame 以 key 重建）。
 * 只接受来自 window.parent 的消息——其它窗口 postMessage 到本页一律忽略。
 */
(function () {
  'use strict';
  var done = false;

  function onMessage(e) {
    if (done) return;
    if (e.source !== window.parent) return;
    var d = e.data;
    if (!d || typeof d !== 'object' || d.type !== 'jz-html-frame' || typeof d.html !== 'string') return;
    done = true;
    window.removeEventListener('message', onMessage);
    document.open();
    document.write(d.html);
    document.close();
  }

  function ready() {
    try {
      window.parent.postMessage({ type: 'jz-html-frame-ready' }, '*');
    } catch (err) {
      /* 顶层直开本页时没有父窗口，静默 */
    }
  }

  window.addEventListener('message', onMessage);
  ready();
  // 父页监听器晚于本页加载（缓存命中时本页几毫秒就绪）也不丢：每 150ms 重发
  // ready，最多约 6s，收到 HTML 即停。
  var tries = 0;
  var timer = window.setInterval(function () {
    if (done || ++tries > 40) {
      window.clearInterval(timer);
      return;
    }
    ready();
  }, 150);
})();
