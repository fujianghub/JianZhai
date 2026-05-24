import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { Typography } from 'antd';

const { Title } = Typography;

export interface AdminBackButtonProps {
  /** Router path — uses `<Link>` when set. */
  backTo?: string;
  /** Click handler — used when `backTo` is absent. */
  onBack?: () => void;
  backLabel: string;
  /** Tooltip / aria label override. */
  backTitle?: string;
  size?: 'default' | 'compact';
}

/** Glass pill back button shared across admin secondary pages. */
export function AdminBackButton({
  backTo,
  onBack,
  backLabel,
  backTitle,
  size = 'default',
}: AdminBackButtonProps) {
  const cls = 'jz-admin-back-btn' + (size === 'compact' ? ' is-compact' : '');
  const label = backTitle ?? backLabel;

  if (backTo) {
    return (
      <Link to={backTo} className={cls} aria-label={label}>
        <ArrowLeftOutlined aria-hidden />
        <span className="jz-admin-back-btn-label">{backLabel}</span>
      </Link>
    );
  }

  return (
    <button type="button" className={cls} aria-label={label} onClick={onBack}>
      <ArrowLeftOutlined aria-hidden />
      <span className="jz-admin-back-btn-label">{backLabel}</span>
    </button>
  );
}

export interface AdminPageHeaderProps {
  backTo?: string;
  onBack?: () => void;
  backLabel: string;
  backTitle?: string;
  title: ReactNode;
  /** KB accent — drives left stripe / title dot via CSS var. */
  accentColor?: string | null;
  meta?: ReactNode;
  actions?: ReactNode;
  /** When true, skip the outer glass card chrome (inline variant). */
  bare?: boolean;
}

/**
 * Admin secondary-page header: pill back nav + title + meta + actions.
 * Doc editor sticky bar uses {@link AdminBackButton} directly.
 */
export default function AdminPageHeader({
  backTo,
  onBack,
  backLabel,
  backTitle,
  title,
  accentColor,
  meta,
  actions,
  bare = false,
}: AdminPageHeaderProps) {
  const accentStyle = accentColor
    ? ({ ['--jz-kb-accent' as string]: accentColor } as CSSProperties)
    : undefined;

  const inner = (
    <>
      <div className="jz-admin-page-header-main">
        <AdminBackButton
          backTo={backTo}
          onBack={onBack}
          backLabel={backLabel}
          backTitle={backTitle ?? backLabel}
        />
        <div className="jz-admin-page-header-body">
          <div className="jz-admin-page-header-title-row">
            {accentColor && (
              <span
                className="jz-admin-page-header-accent-dot"
                style={{ background: accentColor }}
                aria-hidden
              />
            )}
            <Title level={3} className="jz-admin-page-header-title">
              {title}
            </Title>
          </div>
          {meta && <div className="jz-admin-page-header-meta">{meta}</div>}
        </div>
      </div>
      {actions && <div className="jz-admin-page-header-actions">{actions}</div>}
    </>
  );

  if (bare) {
    return (
      <div className="jz-admin-page-header is-bare" style={accentStyle}>
        {inner}
      </div>
    );
  }

  return (
    <header className="jz-admin-page-header" style={accentStyle}>
      {inner}
    </header>
  );
}
