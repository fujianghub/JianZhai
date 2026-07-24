# 简斋权限管理清单 v1.0

> 四角色 RBAC 权威依据。后端是唯一安全边界，前端按 `role` 收口仅为体验。
> 图例：✅允许 / ❌禁止 / —不适用。
> 最后更新：2026-07-24（新增第八节：读者可见性两道闸——内容侧受众 + 用户侧阅读授权白名单）

---

## 一、角色定义（单一事实来源）

| 角色 | 判定方式 | 定位 |
|---|---|---|
| **匿名 anon** | 未登录 | 访客 |
| **普通用户 user** | 已登录，`is_staff=False` 且 `is_superuser=False` | 读者 / 友邻 |
| **管理员 admin** | `is_staff=True`、`is_superuser=False` | 作者 |
| **根 root** | `is_superuser=True` 且 `username==ROOT_ADMIN_USERNAME` | 主人 |

后端 `apps/accounts/permissions.py` 的 `get_role(user)` 是全系统唯一判定入口。
`is_staff` 即「作者」（涵盖 admin + root，因为 root 也是 staff）；`IsRoot` 即 `is_root_admin`。

## 二、内容空间模型

**作者共享单一内容池**：admin 与 root 共同维护同一批知识库 / 文档，互相可见可编辑。
普通用户不持有也访问不到任何创作内容，只能在博客端浏览 `visibility=public` 的部分。

| 数据 | 隔离方式 |
|---|---|
| KB / 大类 / 文件夹 / 文档 / 标签 / 附件 / 评论 / 版本 / 链接 | **作者共享**（按角色，非 owner） |
| AI 对话历史 / AI 自定义模板 / 收藏 / 个人资料 | **按 user 个人隔离**（作者之间也不互通） |

## 三、完整能力矩阵

### 1. 博客 / 公开浏览
| 能力 | anon | user | admin | root |
|---|:--:|:--:|:--:|:--:|
| 浏览公开文章 / KB / 归档 / 标签云 / RSS | ✅\* | ✅ | ✅ | ✅ |
| 首页题记浏览 | ✅\* | ✅ | ✅ | ✅ |

\* 受**友邻闸门**约束：`SITE_REQUIRE_LOGIN=true` 时匿名需登录。

### 2. 读者能力（所有登录用户）
| 能力 | user | admin | root |
|---|:--:|:--:|:--:|
| 收藏 / 取消收藏文章 | ✅ | ✅ | ✅ |
| 查看自己的收藏 | ✅ | ✅ | ✅ |
| 发表评论（文档级 / 段落级） | ✅ | ✅ | ✅ |
| 删除**自己**的评论 | ✅ | ✅ | ✅ |
| 删除**他人**评论（版主） | ❌ | ✅ | ✅ |
| 个人资料自服务（改密码 / 邮箱 / 用户名 / 头像） | ✅ | ✅ | ✅ |
| 链接卡片元数据（`GET /link-preview/`，OG 抓取） | ✅ | ✅ | ✅ |

### 3. 内容创作（知识库）
| 能力 | user | admin | root |
|---|:--:|:--:|:--:|
| 浏览 / 进入创作后台内容 | ❌ | ✅ | ✅ |
| 新建 / 编辑 知识库 | ❌ | ✅ | ✅ |
| 新建 / 编辑 知识库大类 | ❌ | ✅ | ✅ |
| 新建 / 编辑 文件夹 | ❌ | ✅ | ✅ |
| 新建 / 编辑 / 发布 / 撤回 文档 | ❌ | ✅ | ✅ |
| 置顶 / 排序 / 内容收藏 / 树拖拽 | ❌ | ✅ | ✅ |
| 上传 / 导入（Word/MD/ZIP）/ 媒体库 | ❌ | ✅ | ✅ |
| 全文搜索（后台 ⌘K，搜内容池） | ❌ | ✅ | ✅ |
| 版本历史 查看 / diff / 回滚 | ❌ | ✅ | ✅ |
| 双向链接 / 反链 / 知识图谱 | ❌ | ✅ | ✅ |
| 标签 CRUD | ❌ | ✅ | ✅ |
| 导出（md/html/pdf/docx/site） | ❌ | ✅ | ✅ |

### 4. 删除分级（核心）
| 动作 | 端点 | user | admin | root |
|---|---|:--:|:--:|:--:|
| 软删**文档**（移回收站，可恢复） | `documents DELETE` | ❌ | ✅ | ✅ |
| 软删**文件夹**（移回收站，可恢复） | `folders DELETE` | ❌ | ✅ | ✅ |
| 回收站**还原** | `trash/*/restore` | ❌ | ✅ | ✅ |
| 查看回收站 | `trash/` | ❌ | ✅ | ✅ |
| 删除**知识库** | `kbs DELETE` | ❌ | ❌ | ✅ |
| 删除**知识库大类** | `categories DELETE` | ❌ | ❌ | ✅ |
| **永久删除**文档 / KB | `trash/*/purge`、`batch-purge` | ❌ | ❌ | ✅ |
| **清空回收站** | `trash/empty` | ❌ | ❌ | ✅ |

### 5. AI 助手
| 能力 | user | admin | root |
|---|:--:|:--:|:--:|
| 使用 AI（续写/润色/对话/视觉…） | ❌† | ✅ | ✅ |
| AI 自定义模板 / 对话历史（个人） | ❌† | ✅(自己) | ✅(自己) |
| 查看**自己**的 AI 用量 | ❌† | ✅ | ✅ |
| 查看**全员** AI 用量 + CSV 导出 | ❌ | ✅ | ✅ |
| AI 全局设置（默认模型 / 预算 / 降级…） | ❌ | ✅ | ✅ |
| 绕过 AI 日预算 | ❌ | ✅ | ✅ |

† AI 是创作工具，默认仅作者可用。若放开读者使用阅读端 AI 需单独评估（预算成本）。

### 6. 题记 / 系统
| 能力 | anon | user | admin | root |
|---|:--:|:--:|:--:|:--:|
| 题记管理（`/admin/hero` CRUD + 批量导入） | ❌ | ❌ | ✅ | ✅ |
| 系统总览 / 架构总览（`/system-info`） | ❌ | ❌ | ❌ | ✅ |

系统总览展示全租户统计，归 root（改模型后 admin 不再是 superuser，自然只剩 root）。

### 7. 用户管理（详见第四节）
| 能力 | user | admin | root |
|---|:--:|:--:|:--:|
| 进入用户管理 | ❌ | ✅ | ✅ |
| 看到的用户范围 | — | 自己 + 普通用户 | **全部** |
| 可管理对象 | — | 仅普通用户 | 所有人 |

## 四、用户管理专项规则

**可见范围（`UserViewSet.get_queryset`）**
- root → 全部用户
- admin → `filter(is_staff=False, is_superuser=False)` 并入自己（看不到根和其他管理员）
- user → 无权进入

**可管理对象（`can_manage_user`）**
- admin 的操作目标必须是**纯普通用户**（`not is_staff and not is_superuser`）——禁用 / 重置密码 / 编辑 / 删除均如此；管理员之间互不可管。
- root 可操作所有人。

**创建 / 提拔**
- admin 新建账号强制 `is_staff=False`，**只能创建普通用户**。
- 授予 / 撤销「管理员」身份（写 `is_staff`）= **root 专属**。
- `is_superuser` 不经 API 授予（序列化器 read-only），仅 Django shell / 根。

**自我操作**
- 任何人不能在用户管理里改自己的状态（防自我降权 / 自禁用）；改自己走**个人资料自服务**。
- admin 在列表里能看到自己，但状态变更走自服务。

**根账号保护**
- 根不可被禁用 / 删除；只能本人编辑；密码只能本人重置。

## 五、后端端点 → 权限映射

| 权限类 | 含义 | 挂载端点 |
|---|---|---|
| `PublicOrLoginGated` | 匿名或登录（友邻闸门） | `/public/*`、`feed.xml`、`link-preview/`（2026-07-20 自 `IsContentAuthor` 放宽，供阅读端链接卡片水合；独立限流 `link_preview` 30/min 防外呼滥用，SSRF 守卫不变） |
| `IsAuthenticated` | 任意登录用户 | 收藏、评论、`/auth/me/*` 自服务 |
| `IsContentAuthor`（=`is_staff`） | 作者(admin+root) | KB/folder/doc 建改、软删 doc/folder、上传/导入、标签、导出、版本、链接、图谱、搜索、AI 使用、`trash/`、`trash/*/restore`、题记管理、AI 设置、全员用量、用户管理入口 |
| `IsRoot`（=`is_root_admin`） | 仅根 | `kbs DELETE`、`categories DELETE`、`trash/*/purge`、`trash/empty`、`system-info` |
| 行级规则 | 端点内判定 | `can_manage_user`（用户管理动作）、`UserViewSet.get_queryset`（可见范围）、评论删除（本人 / 版主） |

## 六、防御纵深

1. **后端是唯一安全边界**：每条限制都靠权限类 / 行级校验返回 403，普通用户直接打 API 也越不过。
2. **前端按 `role` 收口**（仅体验）：`me` 接口加 `role` 字段；`AdminLayout` 普通用户**只渲染「收藏」「个人资料」**两项；作者专属路由加 `RequireAuthor` 守卫；删除按钮（KB / 大类 / 清空回收站）对非根隐藏。

## 七、迁移 / 运维

1. **降级历史超管**：现有用 `createsuperuser` 建的非根账号是 `is_superuser=True`，需降为 `is_staff=True`，否则仍能跨内容池越权。
2. **排查存量普通用户内容**：若有普通用户曾建过 KB / 文档，改规则后将无法访问，需决定迁移或转交作者。

## 八、读者可见性两道闸（2026-07-24）

读者（user / anon）能在博客端看到哪些内容，由 `apps/knowledge/audience.py` 的
`visible_kbs / visible_categories / visible_documents` **唯一收口**执行两道闸，
**取 AND**（两道都过才可见）。所有读者入口（blog `_published_qs`、公开 KB/大类/树、
backlinks、评论 `_commentable_doc`、收藏 `_readable_doc`）都必须经这三个函数；
新增读者入口同样必须接入，否则直链泄露。**作者（`is_staff`）一律绕过两道闸。**

### 闸一：内容侧受众（朋友圈式，存在 KB / 大类上）

- KB 与大类各有 `audience_mode`（`all` 全员 / `exclude` 黑名单 / `include` 白名单，默认 `all`）
  + `audience_users`（按用户）+ `audience_tags`（按 `UserTag` 用户标签）。
- 文档可见 ⇔ 其 KB 受众可见 且（无大类 或 大类受众可见）。
- 匿名：白名单不可见、黑名单可见（匿名无身份无标签，永远不被定向）。
- 序列化器拒绝把作者加入受众名单（`validate_audience_user_ids` → 400）。

### 闸二：用户侧阅读授权白名单（`accounts.ReadGrant`，存在用户上）

- 用户管理里给**普通用户**配置授权条目，每条恰好指向一个目标（DB CheckConstraint）：
  **整个 KB** / **整个大类** / **某文件夹（含全部子文件夹）** / **单篇文档**。
- **无任何条目 = 不受限**（向后兼容，走闸一即可）；**有条目 = 白名单**，
  只有命中至少一条授权的内容可读，未命中的 KB 名 / 大类名 / 文件夹名 / 文档均不出现。
- folder / 文档级授权的**宿主 KB 及其大类保持可导航**（否则有权却无入口），
  但其下未授权的兄弟内容仍被文档级过滤挡住。
- 管理员（staff）不受限也不可被授权：序列化器拒绝给 staff 设授权（400）；
  用户后被提拔为管理员时残留条目自动失效（inert）。
- 软删目标 **fail-closed**：授权条目保留（用户仍算受限），但软删内容自身不可见；
  UI 显示「（已删除）」由作者手动移除。硬删目标时条目 CASCADE 清除。
- 编辑入口（三处）：用户管理新建用户 Modal「阅读权限」区块 / 用户行眼睛按钮 /
  「阅读范围」列点击直达，均为同一 `ReadGrantControl`（知识库**可多选批量整库授权**；
  恰好选中单个知识库时展开目录树，精细到文件夹 / 文档）。写入 `read_grant_items`
  全量替换；传 `[]` 清空恢复不受限；权限沿用 `IsStaffUser` + `can_manage_user`。
- `UserSerializer.create()` 全程 `transaction.atomic`：建用户任一步失败（profile
  信号 / 标签 / 授权）整体回滚，不留半成品用户。
- 测试：`apps/accounts/tests/test_read_grants.py`（模型约束 + API）、
  `apps/knowledge/tests/test_read_grants_visibility.py`（四粒度 + AND 叠加 + 端到端防泄露）。
