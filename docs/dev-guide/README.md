# 简斋·开发指南 — 内容源

本目录是公开知识库「简斋·开发指南」（`slug=dev-guide`）的**唯一正文与架构图源**。

## 文件说明

| 文件 | 用途 |
|------|------|
| `simple.md` | 简单版文档（上手） |
| `detailed.md` | 详细版文档（深入） |
| `diagrams/simple-arch.mmd` | 简单架构图（与后台架构总览「简单版」同源） |
| `diagrams/save-flow.mmd` | 自动保存时序图 |
| `diagrams/detailed-arch.mmd` | 四层详细架构图（公开可读，对应后台 SVG 语义） |

## 维护流程

1. 编辑 `simple.md` / `detailed.md` 或 `diagrams/*.mmd`
2. 在 Markdown 中用 `{{diagram:文件名}}` 嵌入图（不含 `.mmd` 后缀）
3. 刷新数据库：

```bash
cd backend && python manage.py seed_architecture_kb
```

4. 后台「架构总览」中的简单版 / 自动保存图通过 `frontend` 直接 import 同目录下的 `.mmd` 文件，**请勿在 TS 里再复制一份**。

## 占位符

`{{diagram:simple-arch}}` → 展开为 fenced `mermaid` 代码块，内容由 `diagrams/simple-arch.mmd` 提供。
