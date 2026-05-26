import type { ReactNode } from 'react';
import type { AIOpDef } from './aiOps';
import { AI_OPS } from './aiOps';

interface Props {
  onSelect: (op: AIOpDef) => void;
  ops?: AIOpDef[];
  /** Extra rows after ops (e.g. free ask) */
  extraItems?: Array<{
    key: string;
    label: string;
    hint?: string;
    icon?: ReactNode;
    onClick: () => void;
  }>;
}

export default function AIMenuList({ onSelect, ops = AI_OPS, extraItems }: Props) {
  return (
    <div className="jz-ai-menu" role="menu">
      {ops.map((op) => (
        <button
          key={op.key}
          type="button"
          className="jz-ai-menu-item"
          role="menuitem"
          onClick={() => onSelect(op)}
        >
          <span className="jz-ai-menu-item-icon" aria-hidden>
            {op.icon}
          </span>
          <span className="jz-ai-menu-item-body">
            <span className="jz-ai-menu-item-title">{op.label}</span>
            <span className="jz-ai-menu-item-hint">{op.hint}</span>
          </span>
        </button>
      ))}
      {extraItems?.map((item) => (
        <div key={item.key}>
          <div className="jz-ai-menu-divider" />
          <button
            type="button"
            className="jz-ai-menu-item"
            role="menuitem"
            onClick={item.onClick}
          >
            {item.icon && (
              <span className="jz-ai-menu-item-icon" aria-hidden>
                {item.icon}
              </span>
            )}
            <span className="jz-ai-menu-item-body">
              <span className="jz-ai-menu-item-title">{item.label}</span>
              {item.hint && <span className="jz-ai-menu-item-hint">{item.hint}</span>}
            </span>
          </button>
        </div>
      ))}
    </div>
  );
}
