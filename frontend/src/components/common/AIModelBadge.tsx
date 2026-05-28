import { useEffect, useState } from 'react';
import { Tag, Tooltip } from 'antd';
import { JzAiIcon } from '@/components/common/JzIcon';
import { getCapabilities } from '@/api/ai';
import { isModelConfigured, resolveAIModel } from '@/utils/aiModel';

/**
 * Tiny status pill: "AI: Claude Opus 4.7". Lives in the AdminLayout header so
 * the user always sees which model is being used + whether AI is configured
 * at all. Updates when localStorage changes (model picker writes there).
 *
 * Three displayable states:
 *   1. No provider configured at all → grey "AI 未配置"
 *   2. AI globally disabled by admin → orange "AI 已禁用"
 *   3. Effective model's provider missing its key → orange warning (the model
 *      is in the whitelist but calls will fail at runtime — surface that
 *      preemptively so the user can switch before clicking ✨)
 *   4. All good → blue with model label
 */
export function AIModelBadge() {
  const [label, setLabel] = useState<string>('');
  const [modelOk, setModelOk] = useState<boolean | null>(null);
  const [anyConfigured, setAnyConfigured] = useState<boolean | null>(null);
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        const cap = await getCapabilities();
        if (cancelled) return;
        setAnyConfigured(cap.configured);
        setEnabled(cap.enabled ?? true);
        const id = resolveAIModel(cap);
        const found = cap.models.find((m) => m.id === id);
        setLabel(found?.label || id);
        setModelOk(isModelConfigured(cap, id));
      } catch {
        if (!cancelled) {
          setAnyConfigured(false);
          setModelOk(false);
        }
      }
    }

    void refresh();
    const onStorage = () => void refresh();
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', onStorage);
    window.addEventListener('jz-ai-model-changed', onStorage);
    return () => {
      cancelled = true;
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', onStorage);
      window.removeEventListener('jz-ai-model-changed', onStorage);
    };
  }, []);

  if (anyConfigured === null) return null;
  if (!anyConfigured) {
    return (
      <Tooltip title="AI 助手未配置 — 在 backend/.env 设置 ANTHROPIC_API_KEY 或 DASHSCOPE_API_KEY">
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
  if (modelOk === false) {
    return (
      <Tooltip title={`当前模型「${label}」所属供应商未配置 API KEY — 调用会失败,请切换到其他模型`}>
        <Tag icon={<JzAiIcon size={12} />} color="warning" style={{ marginRight: 0 }}>
          {label || 'AI'} · 未配置
        </Tag>
      </Tooltip>
    );
  }
  return (
    <Tooltip title="当前使用的 AI 模型(在 AI 助手页设置)">
      <Tag icon={<JzAiIcon size={12} />} color="blue" style={{ marginRight: 0 }}>
        {label || 'AI'}
      </Tag>
    </Tooltip>
  );
}
