/**
 * useModelSwitcher — 模型列表加载与切换
 *
 * 从 /api/models 获取可用模型列表，支持切换当前激活模型。
 * 封装了 models / currentModel / modelMenuOpen 状态。
 */

import { useState, useEffect, useCallback } from 'react';

const API = '/api';

export interface ModelOption {
  id: string;
  label: string;
  model: string;
  active: boolean;
}

export function useModelSwitcher() {
  const [models, setModels] = useState<ModelOption[]>([]);
  const [currentModel, setCurrentModel] = useState<string>('');
  const [modelMenuOpen, setModelMenuOpen] = useState(false);

  const fetchModels = useCallback(async () => {
    try {
      const res = await fetch(`${API}/models`, { credentials: 'include' });
      const data = await res.json();
      setModels(data);
      const active = data.find((m: ModelOption) => m.active);
      if (active) setCurrentModel(active.label);
    } catch {
      /* ignore — 模型列表加载失败不阻塞 UI */
    }
  }, []);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  const switchModel = useCallback(async (modelId: string) => {
    try {
      const res = await fetch(`${API}/models/switch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ modelId }),
      });
      const data = await res.json();
      if (data.ok) {
        setCurrentModel(data.label);
        setModels((prev) => prev.map((m) => ({ ...m, active: m.id === modelId })));
      }
    } catch {
      /* ignore — 切换失败保持当前模型 */
    }
    setModelMenuOpen(false);
  }, []);

  return {
    models,
    currentModel,
    modelMenuOpen,
    setModelMenuOpen,
    switchModel,
  };
}
