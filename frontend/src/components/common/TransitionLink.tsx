import { forwardRef } from 'react';
import { Link, useNavigate, type LinkProps } from 'react-router-dom';
import { isPlainLeftClick, navigateWithTransition } from '@/utils/routeTransition';

/**
 * <Link> 的连续性版本：左键同窗导航包进 View Transition（页面间交叉溶解，
 * 与主题切换同一动效语言）。修饰键/中键/target=_blank 交还浏览器默认行为；
 * 无 API / reduced-motion / 档位「精简」在 navigateWithTransition 入口瞬切。
 * 目标页首帧提交由 BlogLayout 按 location 集中 signalRouteReady。
 * 需要共享元素（如首页书卡→KB 页头）的场合仍手写 onClick 传 shared 参数。
 */
const TransitionLink = forwardRef<HTMLAnchorElement, LinkProps>(function TransitionLink(
  { onClick, to, state, replace, target, ...rest },
  ref,
) {
  const navigate = useNavigate();
  return (
    <Link
      ref={ref}
      to={to}
      state={state}
      replace={replace}
      target={target}
      {...rest}
      onClick={(e) => {
        onClick?.(e);
        if (target && target !== '_self') return;
        if (!isPlainLeftClick(e.nativeEvent)) return;
        e.preventDefault();
        navigateWithTransition(() => navigate(to, { state, replace }));
      }}
    />
  );
});

export default TransitionLink;
