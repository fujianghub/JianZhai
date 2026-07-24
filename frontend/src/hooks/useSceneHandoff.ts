import { useEffect, useState } from 'react';
import type { ThemeMode } from '@/stores/theme';

/** 普通切换：旧场景保活淡出约 1.1s（CSS transition 1.05s，稍短于卸载计时） */
export const SCENE_HANDOFF_MS = 1150;
/** 随朝暮：日落/日出慢溶解（CSS 2.5s） */
export const SCENE_HANDOFF_SLOW_MS = 2600;

export interface SceneHandoff {
  current: ThemeMode;
  /** 正在淡出的上一场景（保活渲染中）；reduced-motion 恒为 null */
  exiting: ThemeMode | null;
}

/**
 * 主题切换时 canvas 背景的「交叉溶解」交接：旧场景不立即卸载，而是继续
 * 逐帧绘制并淡出，与新场景的淡入交叠——电影 dissolve，而非硬切空一拍。
 * 状态调整放在 render 阶段（React「adjusting state during render」范式），
 * 使新旧场景在同一次提交里交接，不多等一帧。
 */
export function useSceneHandoff(mode: ThemeMode, slow: boolean, reducedMotion: boolean): SceneHandoff {
  const [current, setCurrent] = useState<ThemeMode>(mode);
  const [exiting, setExiting] = useState<ThemeMode | null>(null);

  if (mode !== current) {
    setCurrent(mode);
    setExiting(reducedMotion ? null : current);
  }

  useEffect(() => {
    if (!exiting) return;
    const t = window.setTimeout(
      () => setExiting(null),
      slow ? SCENE_HANDOFF_SLOW_MS : SCENE_HANDOFF_MS,
    );
    return () => window.clearTimeout(t);
  }, [exiting, slow]);

  return { current, exiting };
}
