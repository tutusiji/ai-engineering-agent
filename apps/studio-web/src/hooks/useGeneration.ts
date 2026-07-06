/**
 * useGeneration — 架构/设计/代码生成 + 架构精炼
 *
 * 封装原 App.tsx 中的 5 个生成 handler：
 * - handleGenerateArchitecture: 生成架构方案草稿
 * - handleSaveArchitecture: 保存架构方案到数据库
 * - handleArchitectureRefine: 对话精炼架构方案
 * - handleGenerateDesign: 生成可交互 UI 预览
 * - handleGenerateCode: 生成全栈代码
 */

import { useState, useCallback } from 'react';
import type { useStudioState } from './useStudioState';
import type { useDocument } from './useDocument';

const API = '/api';

export function useGeneration(
  activeSessionId: string | null,
  profileId: string,
  studio: ReturnType<typeof useStudioState>,
  docHook: ReturnType<typeof useDocument>,
) {
  const [designLoading, setDesignLoading] = useState(false);
  const [codeLoading, setCodeLoading] = useState(false);
  const [archLoading, setArchLoading] = useState(false);
  const [archRefining, setArchRefining] = useState(false);

  // ── 生成架构方案草稿 ──────────────────────────────────────
  const generateArchitecture = useCallback(async (): Promise<boolean> => {
    if (!activeSessionId) return false;
    setArchLoading(true);
    try {
      const res = await fetch(`${API}/generate/architecture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ sessionId: activeSessionId, profileId: profileId || undefined }),
      });
      const data = await res.json();
      if (data.ok && data.markdown) {
        studio.setArchDraft(data.markdown);
        studio.setArchDraftMeta({ architecture: data.architecture, model: data.model });
        studio.setArchMarkdown(null);
        studio.setActiveArchId(null);
        return true;
      }
      console.error(data.error || '架构生成失败');
      return false;
    } catch {
      console.error('请求失败');
      return false;
    } finally {
      setArchLoading(false);
    }
  }, [activeSessionId, profileId, studio]);

  // ── 保存架构方案到数据库 ──────────────────────────────────
  const saveArchitecture = useCallback(async (): Promise<boolean> => {
    if (!activeSessionId || !studio.archDraft || !studio.archDraftMeta) return false;
    try {
      const res = await fetch(`${API}/sessions/${activeSessionId}/architectures/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          architecture: studio.archDraftMeta.architecture,
          markdown: studio.archDraft,
          model: studio.archDraftMeta.model,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        studio.setArchMarkdown(studio.archDraft);
        studio.setArchDraft(null);
        studio.setArchDraftMeta(null);
        return true;
      }
      return false;
    } catch {
      console.error('保存失败');
      return false;
    }
  }, [activeSessionId, studio]);

  // ── 对话精炼架构方案 ──────────────────────────────────────
  const refineArchitecture = useCallback(async (feedback: string): Promise<boolean> => {
    if (!activeSessionId || !feedback.trim()) return false;
    setArchRefining(true);
    try {
      const res = await fetch(`${API}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          sessionId: activeSessionId,
          profileId: profileId || undefined,
          userMessage: feedback,
          mode: 'architecture-refinement',
        }),
      });
      const data = await res.json();
      if (data.ok && data.markdown) {
        studio.setArchDraft(data.markdown);
        studio.setArchDraftMeta({ architecture: data.architecture, model: data.model });
        studio.setArchMarkdown(null);
        studio.setActiveArchId(null);
        return true;
      }
      console.error(data.error || '精炼失败');
      return false;
    } catch {
      console.error('请求失败');
      return false;
    } finally {
      setArchRefining(false);
    }
  }, [activeSessionId, profileId, studio]);

  // ── 生成可交互 UI 预览 ────────────────────────────────────
  const generateDesign = useCallback(
    async (onComplete?: () => void): Promise<boolean> => {
      if (!activeSessionId) return false;
      setDesignLoading(true);
      try {
        const res = await fetch(`${API}/generate/design`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ sessionId: activeSessionId, profileId: profileId || undefined }),
        });
        const data = await res.json();
        if (data.ok && data.htmlContent) {
          studio.setDesignHtml(data.htmlContent);
          onComplete?.();
          return true;
        }
        console.error(data.error || '生成失败');
        return false;
      } catch {
        console.error('请求失败');
        return false;
      } finally {
        setDesignLoading(false);
      }
    },
    [activeSessionId, profileId, studio],
  );

  // ── 生成全栈代码 ──────────────────────────────────────────
  const generateCode = useCallback(
    async (onComplete?: () => void): Promise<boolean> => {
      if (!activeSessionId) return false;
      setCodeLoading(true);
      try {
        const res = await fetch(`${API}/generate/code`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ sessionId: activeSessionId, profileId: profileId || undefined }),
        });
        const data = await res.json();
        if (data.ok && data.files) {
          studio.setGeneratedFiles(data.files);
          onComplete?.();
          return true;
        }
        console.error(data.error || '生成失败');
        return false;
      } catch {
        console.error('请求失败');
        return false;
      } finally {
        setCodeLoading(false);
      }
    },
    [activeSessionId, profileId, studio],
  );

  return {
    // 加载状态
    designLoading,
    codeLoading,
    archLoading,
    archRefining,
    // 操作
    generateArchitecture,
    saveArchitecture,
    refineArchitecture,
    generateDesign,
    generateCode,
  };
}
