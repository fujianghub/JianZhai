/**
 * 「簡」品牌方印——博客顶栏 / 后台侧栏 / 登录页共用（2026-09-02 收编）。
 *
 * 此前三处各写一套 CSS（顶栏 `::before content:'簡'` 28/r5/700、后台 42/r12/800、
 * 登录 56/r14/800），圆角比例与字重互不一致；favicon.svg 另有第四份。现在只有
 * `.jz-seal` 一组规则 + 三档尺寸，悬停旋转由宿主 `.jz-seal-host:hover` 触发。
 * 题记落款 `.jz-hero-seal` 是内容元素（竖排「简斋」手盖印），不在此列。
 */
export type BrandSealSize = 'xs' | 'md' | 'lg';

export default function BrandSeal({
  size = 'md',
  text = '簡',
  className,
}: {
  size?: BrandSealSize;
  text?: string;
  className?: string;
}) {
  return (
    <span className={['jz-seal', `jz-seal--${size}`, className].filter(Boolean).join(' ')} aria-hidden>
      {text}
    </span>
  );
}
