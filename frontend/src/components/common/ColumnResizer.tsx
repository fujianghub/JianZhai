interface Props {
  dragging?: boolean;
  ariaLabel: string;
  onMouseDown: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}

/** Vertical drag handle between grid columns (reuses `.jz-kb-resizer` styles). */
export default function ColumnResizer({
  dragging = false,
  ariaLabel,
  onMouseDown,
  onDoubleClick,
  onKeyDown,
}: Props) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={ariaLabel}
      tabIndex={0}
      className={'jz-kb-resizer jz-post-col-resizer' + (dragging ? ' is-dragging' : '')}
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
      onKeyDown={onKeyDown}
    />
  );
}
