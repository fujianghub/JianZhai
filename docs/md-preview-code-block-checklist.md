# Markdown 预览与代码块样式 — 人工核对清单

对照设计参考（Yuque 风顶栏 + One Dark Pro 语法着色 + 左侧行号）在下列入口逐项勾选。发现问题请记：入口、浏览器、主题偏好、Markdown 片段、截图。

## 入口与环境

| 入口 | DOM 容器 / 备注 |
|------|-----------------|
| Markdown 分栏 — `LivePreviewPane` | `.jz-doc-live-preview` + `CodeBlockEnhancer` |
| Markdown 分栏 — `MarkdownEditor` 内预览 | `.jz-md-editor-preview` + `CodeBlockEnhancer` |
| 公开博客正文 `PostDetail` | `.jz-post-article` + `CodeBlockEnhancer` |
| 公开附件内联 Markdown | `.jz-att-md` + `CodeBlockEnhancer` |
| 后台附件弹窗 Markdown | `.jz-file-preview-md` + `CodeBlockEnhancer` |
| 富文本 `RichTextEditor` 代码块 | Tiptap `CodeBlockView`，共用 `.jz-code-block` + `markdown.css` |

## 工具栏（`jz-code-toolbar`）

- [ ] 左侧标题区：默认形如「Python · 代码块」（`语言label · 代码块`）
- [ ] 右侧语言：`jz-code-lang` 与 fence 一致
- [ ] 主题名：`jz-code-theme-label` 与「更多」中选中的主题一致（默认 One Dark Pro）
- [ ] 复制按钮可点，复制为纯源码（无行号前缀）
- [ ] 「更多」可改主题 / 自动换行 / 字号 / 行号，`bindKey` 更新后预览刷新表现正确

## 正文与着色

- [ ] 暗色背景、圆角边框与 [`frontend/src/styles/markdown.css`] 一致
- [ ] 行号与 `.jz-code-line` 对齐；关闭行号偏好后 gutter 隐藏
- [ ] Python：`def`/`return` 等着色；`# 中文` 注释为斜体灰色
- [ ] `mermaid` / `plantuml`：仅在已挂 `CodeBlockEnhancer` 的页面可渲染；可切换源码

## 边界

- [ ] Inline HTML → 经 DOMPurify 后不破坏代码围栏
- [ ] 导出 HTML/PDF：离线样式见 [`backend/apps/exporter/static/export-markdown.css`]（与编辑器 hljs 细粒度不要求像素一致）

## 自动化回归

运行：`pnpm --dir frontend test` — 包含 `markdown.codeblock.test.ts` 对围栏外壳与默认主题的断言。
