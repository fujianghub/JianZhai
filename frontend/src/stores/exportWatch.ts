import { create } from 'zustand';
import * as exportsApi from '@/api/exports';
import type { ExportTask } from '@/api/exports';

/**
 * 导出任务「实况胶囊」的观察池（借鉴 HarmonyOS 实况窗：长任务离开页面
 * 也能看到进度）。ExportDialog 创建任务后 watchExport() 注册进来，
 * App 级 <ExportCapsule /> 渲染；pending/running 任务以单一 interval 轮询
 * getExport，全部到达终态即自动停表。done 任务停留 DONE_LINGER_MS 后自动
 * 消失（点「下载」或 × 立即消失）；failed 停留到用户关闭。
 */
export const POLL_MS = 2500;
export const DONE_LINGER_MS = 60_000;

interface ExportWatchState {
  tasks: ExportTask[];
  watch: (t: ExportTask) => void;
  dismiss: (id: number) => void;
  /** 轮询结果合并（同 id 覆盖）；不存在的 id 忽略（已被用户关闭） */
  merge: (updated: ExportTask[]) => void;
}

export const useExportWatchStore = create<ExportWatchState>((set) => ({
  tasks: [],
  watch(t) {
    set((s) => ({ tasks: [...s.tasks.filter((x) => x.id !== t.id), t] }));
    ensurePolling();
  },
  dismiss(id) {
    set((s) => ({ tasks: s.tasks.filter((x) => x.id !== id) }));
  },
  merge(updated) {
    set((s) => ({
      tasks: s.tasks.map((t) => updated.find((u) => u.id === t.id) ?? t),
    }));
  },
}));

/** 非 hook 入口，供 ExportDialog 等事件处理器直接调用 */
export function watchExport(task: ExportTask) {
  useExportWatchStore.getState().watch(task);
}

const isActive = (t: ExportTask) => t.status === 'pending' || t.status === 'running';

let timer: number | null = null;
const lingerTimers = new Map<number, number>();

function ensurePolling() {
  if (typeof window === 'undefined' || timer != null) return;
  timer = window.setInterval(() => void tick(), POLL_MS);
}

async function tick() {
  const store = useExportWatchStore.getState();
  const active = store.tasks.filter(isActive);
  if (active.length === 0) {
    if (timer != null) {
      window.clearInterval(timer);
      timer = null;
    }
    return;
  }
  const results = await Promise.all(
    active.map((t) => exportsApi.getExport(t.id).catch(() => null)),
  );
  const updated = results.filter((t): t is ExportTask => t != null);
  if (updated.length === 0) return;
  useExportWatchStore.getState().merge(updated);
  // 新到达 done 的任务：停留一段时间后自动消失
  for (const t of updated) {
    if (t.status === 'done' && !lingerTimers.has(t.id)) {
      lingerTimers.set(
        t.id,
        window.setTimeout(() => {
          lingerTimers.delete(t.id);
          useExportWatchStore.getState().dismiss(t.id);
        }, DONE_LINGER_MS),
      );
    }
  }
}
