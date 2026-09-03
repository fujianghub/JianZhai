/**
 * IconButton — the one icon-only button for the whole site (2026-09-03).
 *
 * A thin wrapper over AntD ``Button type="text"`` that carries a stable class
 * (`.jz-icon-btn`) so theme.css can give every icon button the same square
 * hit area, radius token, hover / pressed / focus-visible states and a
 * ``[data-motion='min']`` companion — instead of 60+ ad-hoc ``type="text"
 * size="small"`` buttons with inline pixel sizes.
 *
 * - ``size``: xs 22 / sm 26 (default) / md 30 / lg 36 px square.
 * - ``tone``: colour used when ``active`` — accent (default) / gold / danger.
 * - ``active``: pressed state (``aria-pressed`` + `.is-on`).
 * - ``tooltip``: wraps in a Tooltip only when given (callers that already
 *   wrap their own Tooltip keep doing so). Always pass ``aria-label``.
 *
 * ``iconButtonDiscipline.test`` forbids new bare ``<Button type="text" icon
 * … />`` usages so the surface keeps converging here.
 */
import { forwardRef, type ReactNode } from 'react';
import { Button, Tooltip, type ButtonProps } from 'antd';

export type IconButtonSize = 'xs' | 'sm' | 'md' | 'lg';
export type IconButtonTone = 'accent' | 'gold' | 'danger';

export interface IconButtonProps extends Omit<ButtonProps, 'type' | 'size' | 'shape' | 'icon'> {
  icon: ReactNode;
  size?: IconButtonSize;
  tone?: IconButtonTone;
  active?: boolean;
  /** Optional tooltip; ``aria-label`` stays the accessible name. */
  tooltip?: ReactNode;
}

const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, size = 'sm', tone = 'accent', active, tooltip, className, ...rest },
  ref,
) {
  const cls =
    'jz-icon-btn is-' + size + (active ? ' is-on' : '') + (className ? ' ' + className : '');
  const btn = (
    <Button
      ref={ref}
      type="text"
      className={cls}
      data-tone={tone}
      aria-pressed={active === undefined ? undefined : active}
      icon={icon}
      {...rest}
    />
  );
  return tooltip ? <Tooltip title={tooltip}>{btn}</Tooltip> : btn;
});

export default IconButton;
