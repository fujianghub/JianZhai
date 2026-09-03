/**
 * Pin (author) + favorite (any reader) toggles for a document row / card /
 * reading page. One component everywhere — the admin KB tree, the blog
 * directory tree, KB page rows & cards and the article toolbar all render
 * this, so the star pop, the tilted pin and the hover-reveal behave alike.
 *
 * - Icons are the two-tone Jz glyphs (``JzStarIcon`` / ``JzPinIcon``: faint
 *   tint + stroke at rest, solid gold star / solid tilted pin when on) so the
 *   state reads at a glance; they stay visible in rows (``reveal`` is opt-in).
 * - The favorite handler is expected to fire the ink burst itself
 *   (``burstAtPointer``) so the celebration stays with the API result.
 */
import { Tooltip } from 'antd';
import { JzPinIcon, JzStarIcon } from './JzIcon';
import IconButton, { type IconButtonSize } from './IconButton';

interface DocPinFavorite {
  id: number;
  is_pinned?: boolean;
  is_favorited?: boolean;
}

interface Props<T extends DocPinFavorite> {
  doc: T;
  /** xs buttons for dense tree rows. */
  compact?: boolean;
  size?: IconButtonSize;
  /** Hover-reveal inside the host row. Off by default — the icons are the
   * row's status badge and stay visible (user call, 2026-09-03). */
  reveal?: boolean;
  onTogglePin?: (doc: T) => void;
  onToggleFavorite?: (doc: T) => void;
}

export default function DocPinFavoriteButtons<T extends DocPinFavorite>({
  doc,
  compact = false,
  size,
  reveal = false,
  onTogglePin,
  onToggleFavorite,
}: Props<T>) {
  const btnSize: IconButtonSize = size ?? (compact ? 'xs' : 'sm');
  const anyOn = !!doc.is_pinned || !!doc.is_favorited;
  return (
    <span
      className={'jz-doc-actions' + (reveal ? ' is-reveal' : '') + (anyOn ? ' has-on' : '')}
      onClick={(e) => e.preventDefault()}
    >
      {onTogglePin && (
        <Tooltip title={doc.is_pinned ? '取消置顶' : '置顶'}>
          <IconButton
            size={btnSize}
            className="jz-pin-btn"
            active={!!doc.is_pinned}
            icon={<JzPinIcon on={!!doc.is_pinned} />}
            aria-label={doc.is_pinned ? '取消置顶' : '置顶'}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onTogglePin(doc);
            }}
          />
        </Tooltip>
      )}
      {onToggleFavorite && (
        <Tooltip title={doc.is_favorited ? '取消收藏' : '收藏'}>
          <IconButton
            size={btnSize}
            className="jz-fav-btn"
            tone="gold"
            active={!!doc.is_favorited}
            icon={<JzStarIcon on={!!doc.is_favorited} />}
            aria-label={doc.is_favorited ? '取消收藏' : '收藏'}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onToggleFavorite(doc);
            }}
          />
        </Tooltip>
      )}
    </span>
  );
}
