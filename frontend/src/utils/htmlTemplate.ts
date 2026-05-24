/** Minimal HTML skeleton for "新建 HTML 文档". */
export const NEW_HTML_DOCUMENT_TEMPLATE = `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>新文档</title></head>
<body>
  <h1>标题</h1>
  <p>在此编写正文…</p>
</body>
</html>
`;

export type NewDocContentKind = 'markdown' | 'html';
