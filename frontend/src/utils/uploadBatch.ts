/**
 * 统一上传规则 + 分片批量导入管线（个人空间 KBWorkspace 与博客端 KBPostsPage 共用）。
 *
 * 规则（与后端 apps/editor/views.py 对齐）：
 * - 允许的扩展名 = 图片 + 文档 + 其他（共 18 种）
 * - 单文件 2GB 上限
 * - 文件夹遍历时跳过隐藏文件/目录（`.` 开头），不浪费上传流量等服务端报错
 *
 * 模式：
 * - 文件选择器（multiple）        → 单个或多个文件，落在目标目录下
 * - 文件夹选择器（webkitdirectory）→ 单个文件夹，按 webkitRelativePath 保留结构
 * - 拖拽                          → 文件 + 文件夹任意混合（多个文件夹即「文件夹批量」），
 *                                   递归遍历 webkitGetAsEntry 树并保留结构
 *
 * 大批量按 UPLOAD_CHUNK_SIZE 个文件一片顺序发送：服务端逐片响应，调用方可在
 * 每片完成后立即刷新列表（文档渐进出现），不再是一个挂几分钟的巨型请求。
 * 后端 _ensure_folder_path 幂等（先查后建），跨片重复路径不会建重复文件夹。
 */
import {
  importBatch,
  type BatchImportItem,
  type BatchImportResult,
  type ImportParseOptions,
} from '@/api/attachments';

export const UPLOAD_MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2 GiB

/** 与后端 ALLOWED_EXT 一一对应。 */
export const UPLOAD_ALLOWED_EXT = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg',
  '.pdf', '.doc', '.docx', '.ppt', '.pptx', '.html', '.htm', '.md', '.markdown', '.txt',
  '.zip', '.csv', '.json', '.xml',
]);

/** <input accept> 字符串，两端共用，避免再各自硬编码漂移。 */
export const UPLOAD_ACCEPT = [...UPLOAD_ALLOWED_EXT].join(',');

export const UPLOAD_CHUNK_SIZE = 8;

/**
 * 文本文档扩展名：这些文件可能用 `![](./images/x.png)` 引用同文件夹内的本地图片，
 * 服务端导入时需把图片当作该文档的附件并改写相对路径。改写依赖「文档与其图片在
 * 同一个 import_batch 请求里」，因此含此类文档的文件夹要整组发送（见 planUploadChunks）。
 */
const TEXT_DOC_EXT = new Set([
  '.md', '.markdown', '.html', '.htm', '.txt', '.docx',
]);

/** 顶层目录段（relativePath 的第一段）；散文件（无目录）归入 '' 组。 */
function topFolderKey(rel: string | undefined): string {
  const r = (rel || '').replace(/\\/g, '/');
  const i = r.indexOf('/');
  return i > 0 ? r.slice(0, i) : '';
}

/**
 * 规划分片：按顶层目录分组，**同时含文本文档与图片的组整组发送**（保证文档与其
 * 本地图片在同一请求里，服务端才能把 `./images/x.png` 改写为 `/media/…`）；其余
 * 组（纯文档 / 纯图片 / 散文件）按 chunkSize 切片，保留渐进刷新。
 */
export function planUploadChunks(
  items: BatchImportItem[],
  chunkSize: number = UPLOAD_CHUNK_SIZE
): BatchImportItem[][] {
  const groups = new Map<string, BatchImportItem[]>();
  const order: string[] = [];
  for (const it of items) {
    const key = topFolderKey(it.relativePath);
    let g = groups.get(key);
    if (!g) {
      g = [];
      groups.set(key, g);
      order.push(key);
    }
    g.push(it);
  }

  const chunks: BatchImportItem[][] = [];
  for (const key of order) {
    const g = groups.get(key)!;
    const hasText = g.some((it) => TEXT_DOC_EXT.has(extOf(it.file.name)));
    const hasImage = g.some((it) =>
      ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'].includes(extOf(it.file.name))
    );
    if (hasText && hasImage) {
      chunks.push(g); // 整组一个请求 → 文档与图片同到，改写才成立
    } else {
      for (let i = 0; i < g.length; i += chunkSize) chunks.push(g.slice(i, i + chunkSize));
    }
  }
  return chunks;
}

export interface CollectedUploads {
  items: BatchImportItem[];
  /** 客户端预过滤掉的文件 + 原因（人类可读）。 */
  skipped: string[];
}

function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i).toLowerCase() : '';
}

/** 单文件规则校验：返回跳过原因，可上传则返回 null。 */
export function checkUploadFile(file: File): string | null {
  if (!UPLOAD_ALLOWED_EXT.has(extOf(file.name))) {
    return `${file.name}（不支持的类型）`;
  }
  if (file.size > UPLOAD_MAX_FILE_SIZE) {
    return `${file.name}（超过 2GB 上限）`;
  }
  return null;
}

/** `.git/x.md`、`.DS_Store` 这类带隐藏段的路径一律跳过。 */
function hasHiddenSegment(path: string): boolean {
  return path
    .split('/')
    .some((seg) => seg.length > 1 && seg.startsWith('.'));
}

/**
 * 文件/文件夹选择器（<input type=file>）收集入口。
 * ``preserveTree`` 为 true 时按 webkitRelativePath 保留目录结构（文件夹选择器）。
 */
export function collectPickedFiles(
  files: ArrayLike<File>,
  preserveTree: boolean
): CollectedUploads {
  const out: CollectedUploads = { items: [], skipped: [] };
  for (const f of Array.from(files)) {
    const rel = preserveTree
      ? (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name
      : '';
    if (hasHiddenSegment(rel || f.name)) {
      out.skipped.push(`${rel || f.name}（隐藏文件）`);
      continue;
    }
    const reason = checkUploadFile(f);
    if (reason) {
      out.skipped.push(reason);
      continue;
    }
    out.items.push({ file: f, relativePath: rel });
  }
  return out;
}

// ── 拖拽收集（webkitGetAsEntry 递归遍历）──

function entryFile(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

/** readEntries 单次最多返回 ~100 条（Chrome），必须循环读到空为止。 */
async function readAllEntries(
  reader: FileSystemDirectoryReader
): Promise<FileSystemEntry[]> {
  const out: FileSystemEntry[] = [];
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
      reader.readEntries(resolve, reject)
    );
    if (batch.length === 0) return out;
    out.push(...batch);
  }
}

async function walkEntry(
  entry: FileSystemEntry,
  prefix: string,
  out: CollectedUploads
): Promise<void> {
  if (entry.name.length > 1 && entry.name.startsWith('.')) {
    out.skipped.push(`${prefix}${entry.name}（隐藏）`);
    return;
  }
  if (entry.isFile) {
    let f: File;
    try {
      f = await entryFile(entry as FileSystemFileEntry);
    } catch {
      out.skipped.push(`${prefix}${entry.name}（读取失败）`);
      return;
    }
    const reason = checkUploadFile(f);
    if (reason) {
      out.skipped.push(prefix ? `${prefix}${reason}` : reason);
      return;
    }
    // 顶层散文件 relativePath 留空 = 落在目标目录；文件夹内的带完整相对路径。
    out.items.push({ file: f, relativePath: prefix ? `${prefix}${f.name}` : '' });
    return;
  }
  if (entry.isDirectory) {
    const children = await readAllEntries(
      (entry as FileSystemDirectoryEntry).createReader()
    );
    for (const child of children) {
      await walkEntry(child, `${prefix}${entry.name}/`, out);
    }
  }
}

/**
 * 拖拽收集入口：支持多文件 + 多文件夹混合。
 * 注意：webkitGetAsEntry 必须在 drop 事件同步阶段取完（DataTransfer 随后失效），
 * 因此先同步抓 entry，再异步遍历。
 */
export async function collectDroppedItems(
  dt: DataTransfer
): Promise<CollectedUploads> {
  const out: CollectedUploads = { items: [], skipped: [] };
  const entries: FileSystemEntry[] = [];
  const plainFiles: File[] = [];
  for (const item of Array.from(dt.items)) {
    if (item.kind !== 'file') continue;
    const entry = item.webkitGetAsEntry?.();
    if (entry) {
      entries.push(entry);
    } else {
      const f = item.getAsFile();
      if (f) plainFiles.push(f);
    }
  }
  for (const f of plainFiles) {
    const reason = checkUploadFile(f);
    if (reason) out.skipped.push(reason);
    else out.items.push({ file: f, relativePath: '' });
  }
  for (const entry of entries) {
    await walkEntry(entry, '', out);
  }
  return out;
}

// ── 分片批量导入 ──

export interface ChunkedImportCallbacks {
  /** 跨片聚合的字节进度（最后一片字节传完后即 loaded >= total = 服务器解析中）。 */
  onProgress?: (loaded: number, total: number) => void;
  /** 每片服务端响应后回调（累计结果）——调用方在此刷新列表实现渐进出现。 */
  onChunkDone?: (sofar: BatchImportResult) => void | Promise<void>;
}

/**
 * 顺序分片调用 importBatch 并聚合结果。单片失败不中断整批：
 * 服务端 400 响应若带 created/errors 结构则按真实结果并入，
 * 否则该片所有文件记为失败，继续下一片。
 */
export async function runChunkedImport(
  items: BatchImportItem[],
  kbId: number,
  folderId: number | null,
  callbacks: ChunkedImportCallbacks = {},
  chunkSize: number = UPLOAD_CHUNK_SIZE,
  options?: ImportParseOptions
): Promise<BatchImportResult> {
  const total: BatchImportResult = { created: [], errors: [], folders_created: 0 };
  const totalBytes = items.reduce((s, it) => s + it.file.size, 0) || 1;
  let doneBytes = 0;
  const plan = planUploadChunks(items, chunkSize);
  for (const chunk of plan) {
    const chunkBytes = chunk.reduce((s, it) => s + it.file.size, 0);
    try {
      const r = await importBatch(chunk, kbId, folderId, (loaded, reqTotal) => {
        // axios 报的是含 multipart 边界的请求字节，按比例折算到本片份额。
        const frac = reqTotal > 0 ? Math.min(1, loaded / reqTotal) : 0;
        callbacks.onProgress?.(doneBytes + frac * chunkBytes, totalBytes);
      }, options);
      total.created.push(...r.created);
      total.errors.push(...r.errors);
      total.folders_created += r.folders_created;
    } catch (err) {
      const data = (err as { response?: { data?: Partial<BatchImportResult> } })
        ?.response?.data;
      if (data && Array.isArray(data.errors)) {
        total.created.push(...(data.created ?? []));
        total.errors.push(...data.errors);
        total.folders_created += data.folders_created ?? 0;
      } else {
        const detail = err instanceof Error ? err.message : String(err);
        total.errors.push(...chunk.map((it) => ({ name: it.file.name, detail })));
      }
    }
    doneBytes += chunkBytes;
    callbacks.onProgress?.(doneBytes, totalBytes);
    await callbacks.onChunkDone?.(total);
  }
  return total;
}

/** 汇总跳过提示文案（最多列 3 个名字）。 */
export function skippedSummary(skipped: string[]): string {
  const head = skipped.slice(0, 3).join('、');
  return `已跳过 ${skipped.length} 个文件：${head}${skipped.length > 3 ? ' …' : ''}`;
}
