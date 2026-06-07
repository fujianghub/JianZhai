import { useEffect, useRef, useState } from 'react';
import { Button, Input, Modal } from 'antd';
import katex from 'katex';
import 'katex/dist/katex.min.css';

/** KaTeX 渲染到目标元素；返回错误信息（空串=成功）。 */
export function renderLatex(target: HTMLElement, latex: string, displayMode: boolean): string {
  try {
    katex.render(latex || ' ', target, { throwOnError: false, displayMode });
    return '';
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/**
 * 可视化公式编辑 Modal（LaTeX 输入 + KaTeX 实时预览）。
 * 富文本 MathNode 与 MD 编辑器共用 —— 与编辑器内核零耦合。
 */
export default function MathEditorModal({
  open,
  initial,
  displayMode,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  initial: string;
  displayMode: boolean;
  onCancel: () => void;
  onSubmit: (next: string) => void;
}) {
  const [draft, setDraft] = useState(initial);
  const previewRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(initial);
  }, [open, initial]);

  useEffect(() => {
    if (!open || !previewRef.current) return;
    renderLatex(previewRef.current, draft, displayMode);
  }, [draft, open, displayMode]);

  return (
    <Modal
      open={open}
      title={displayMode ? '编辑公式（块级）' : '编辑公式（行内）'}
      onCancel={onCancel}
      width={560}
      destroyOnClose
      footer={[
        <Button key="cancel" onClick={onCancel}>取消</Button>,
        <Button key="ok" type="primary" onClick={() => onSubmit(draft)}>
          确定
        </Button>,
      ]}
    >
      <Input.TextArea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        autoSize={{ minRows: 4, maxRows: 12 }}
        placeholder="输入 LaTeX，如 \\frac{a}{b} 或 \\sum_{i=1}^{n} i"
      />
      <div style={{ marginTop: 12, fontSize: 12, color: 'var(--jz-text-muted)' }}>实时预览：</div>
      <div
        ref={previewRef}
        style={{
          marginTop: 6,
          padding: '12px 16px',
          minHeight: 60,
          background: 'var(--jz-surface-2, #fafafa)',
          border: '1px solid var(--jz-border)',
          borderRadius: 4,
          textAlign: 'center',
        }}
      />
    </Modal>
  );
}
