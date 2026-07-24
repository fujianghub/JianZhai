import { Button, Tooltip } from 'antd';
import {
  PushpinFilled,
  PushpinOutlined,
  StarFilled,
  StarOutlined,
} from '@ant-design/icons';

interface DocPinFavorite {
  id: number;
  is_pinned?: boolean;
  is_favorited?: boolean;
}

interface Props {
  doc: DocPinFavorite;
  compact?: boolean;
  onTogglePin?: (doc: DocPinFavorite) => void;
  onToggleFavorite?: (doc: DocPinFavorite) => void;
}

export default function DocPinFavoriteButtons({
  doc,
  compact = false,
  onTogglePin,
  onToggleFavorite,
}: Props) {
  const size = compact ? 20 : 22;
  return (
    <span
      style={{ display: 'inline-flex', alignItems: 'center', gap: 2, flexShrink: 0 }}
      onClick={(e) => e.preventDefault()}
    >
      {onTogglePin && (
        <Tooltip title={doc.is_pinned ? '取消置顶' : '置顶'}>
          <Button
            type="text"
            size="small"
            icon={
              doc.is_pinned ? (
                <PushpinFilled style={{ color: 'var(--jz-accent)' }} />
              ) : (
                <PushpinOutlined />
              )
            }
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onTogglePin(doc);
            }}
            style={{ width: size, height: size, minWidth: size, padding: 0 }}
          />
        </Tooltip>
      )}
      {onToggleFavorite && (
        <Tooltip title={doc.is_favorited ? '取消收藏' : '收藏'}>
          <Button
            type="text"
            size="small"
            icon={
              doc.is_favorited ? (
                <StarFilled style={{ color: 'var(--jz-gold, #d4a017)' }} />
              ) : (
                <StarOutlined />
              )
            }
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onToggleFavorite(doc);
            }}
            style={{ width: size, height: size, minWidth: size, padding: 0 }}
          />
        </Tooltip>
      )}
    </span>
  );
}
