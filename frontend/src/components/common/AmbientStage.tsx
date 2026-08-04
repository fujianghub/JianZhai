import type { ComponentType } from 'react';
import { useThemeStore, type ThemeMode } from '@/stores/theme';
import { useSceneHandoff } from '@/hooks/useSceneHandoff';
import { prefersReducedMotion, useMotionLevel } from '@/utils/motionPref';
import StarryNight from './StarryNight';
import DeepSea from './DeepSea';
import SpringWater from './SpringWater';
import WinterSnow from './WinterSnow';

/** light/dark 无 canvas 场景（呼吸背景是纯 CSS），其余四主题各一幕 */
const SCENES: Partial<Record<ThemeMode, ComponentType<{ active: boolean }>>> = {
  starry: StarryNight,
  deepsea: DeepSea,
  springwater: SpringWater,
  wintersnow: WinterSnow,
};
const SCENE_KEYS = Object.keys(SCENES) as ThemeMode[];

/**
 * 环境背景的「舞台」：主题切换时新旧场景交叉溶解（旧场景保活淡出、新场景
 * 淡入交叠），随朝暮切换走 2.5s 慢溶解。场景组件自身不再读 theme store，
 * 由舞台统一调度 active / 退场时机。
 */
export default function AmbientStage() {
  const mode = useThemeStore((s) => s.mode);
  const slow = useThemeStore((s) => s.transitionKind === 'clock');
  // 档位切换（足量/适中/精简）时重挂场景：canvas 脚手架在 effect 初始化时
  // 读档位（reduce 静帧 / medium 质量地板），挂着的循环不会中途改判
  const motionLevel = useMotionLevel();
  const { current, exiting } = useSceneHandoff(mode, slow, prefersReducedMotion());
  return (
    <>
      {SCENE_KEYS.map((key) => {
        const isCurrent = key === current;
        const isExiting = key === exiting;
        if (!isCurrent && !isExiting) return null;
        const Scene = SCENES[key]!;
        const cls = [
          'jz-ambient-wrap',
          isExiting ? 'is-exiting' : '',
          slow ? 'is-slow' : '',
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <div key={`${key}:${motionLevel}`} aria-hidden className={cls}>
            <Scene active />
          </div>
        );
      })}
    </>
  );
}
