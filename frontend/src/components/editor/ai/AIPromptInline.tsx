import { useState } from 'react';
import { Button, Input } from 'antd';

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (prompt: string) => void;
  placeholder?: string;
}

/** Inline prompt instead of window.prompt for AI generate. */
export default function AIPromptInline({
  open,
  onClose,
  onSubmit,
  placeholder = '描述要生成的内容…',
}: Props) {
  const [value, setValue] = useState('');

  if (!open) return null;

  return (
    <div className="jz-ai-prompt-popover">
      <Input.TextArea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        autoSize={{ minRows: 2, maxRows: 4 }}
        autoFocus
      />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
        <Button size="small" onClick={onClose}>
          取消
        </Button>
        <Button
          size="small"
          type="primary"
          className="jz-ai-btn-primary"
          disabled={!value.trim()}
          onClick={() => {
            onSubmit(value.trim());
            setValue('');
            onClose();
          }}
        >
          生成
        </Button>
      </div>
    </div>
  );
}
