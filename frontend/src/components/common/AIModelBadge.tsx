import { useEffect, useState } from 'react';
import { Tag, Tooltip } from 'antd';
import { JzAiIcon } from '@/components/common/JzIcon';
import { getCapabilities } from '@/api/ai';

/**
 * Tiny status pill: "AI: Claude Opus 4.7". Lives in the AdminLayout header so
 * the user always sees which model is being used + whether AI is configured
 * at all. Updates when localStorage changes (model picker writes there).
 */
export function AIModelBadge() {
  const [label, setLabel] = useState<string>('');
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        const cap = await getCapabilities();
        if (cancelled) return;
        setConfigured(cap.configured);
        setEnabled(cap.enabled ?? true);
        const userPick = localStorage.getItem('jz-ai-model') || '';
        const id = userPick && cap.models.some((m) => m.id === userPick) ? userPick : cap.default_model;
        const found = cap.models.find((m) => m.id === id);
        setLabel(found?.label || id);
      } catch {
        if (!cancelled) setConfigured(false);
      }
    }

    void refresh();
    // Refresh whenever any tab writes to `jz-ai-model`. Storage event only
    // fires for OTHER tabs, so we also poll on focus to catch self-changes.
    const onStorage = () => void refresh();
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', onStorage);
    // Custom event: AIAssistant fires this when the user picks a model
    window.addEventListener('jz-ai-model-changed', onStorage);
    return () => {
      cancelled = true;
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', onStorage);
      window.removeEventListener('jz-ai-model-changed', onStorage);
    };
  }, []);

  if (configured === null) return null;
  if (!configured) {
    return (
      <Tooltip title="后端未配置 ANTHROPIC_API_KEY">
        <Tag icon={<JzAiIcon size={12} />} color="default">
          AI 未配置
        </Tag>
      </Tooltip>
    );
  }
  if (!enabled) {
    return (
      <Tooltip title="管理员已关闭 AI 功能">
        <Tag icon={<JzAiIcon size={12} />} color="warning">
          AI 已禁用
        </Tag>
      </Tooltip>
    );
  }
  return (
    <Tooltip title="当前使用的 AI 模型（在文档工具栏可切换）">
      <Tag icon={<JzAiIcon size={12} />} color="blue" style={{ marginRight: 0 }}>
        {label || 'AI'}
      </Tag>
    </Tooltip>
  );
}
