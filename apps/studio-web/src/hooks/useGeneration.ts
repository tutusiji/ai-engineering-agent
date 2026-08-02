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

import { useState, useCallback, useRef } from 'react';
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
  const [codeRefining, setCodeRefining] = useState(false);
  const [archLoading, setArchLoading] = useState(false);
  const [archRefining, setArchRefining] = useState(false);
  // 代码生成/精炼状态
  const [codePhaseId, setCodePhaseId] = useState<string | undefined>(undefined);
  const [codeProgress, setCodeProgress] = useState<{ files: string[]; current: string | null }>({ files: [], current: null });
  const [codeWarning, setCodeWarning] = useState<string | null>(null);
  // 当前流式请求的 AbortController,用于取消
  const abortRef = useRef<AbortController | null>(null);

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

  // ── 生成可交互 UI 预览草稿 ────────────────────────────────
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
          studio.setDesignDraft(data.htmlContent);
          studio.setDesignDraftMeta({ design: data.design, model: data.model });
          studio.setDesignHtml(null);
          studio.setActiveDesignId(null);
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

  // ── 保存 UI 预览到数据库 ────────────────────────────────────
  const saveDesign = useCallback(async (): Promise<boolean> => {
    if (!activeSessionId || !studio.designDraft || !studio.designDraftMeta) return false;
    try {
      const res = await fetch(`${API}/sessions/${activeSessionId}/designs/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          design: studio.designDraftMeta.design,
          htmlContent: studio.designDraft,
          model: studio.designDraftMeta.model,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        studio.setDesignHtml(studio.designDraft);
        studio.setDesignDraft(null);
        studio.setDesignDraftMeta(null);
        return true;
      }
      return false;
    } catch {
      console.error('保存失败');
      return false;
    }
  }, [activeSessionId, studio]);

  // ── 生成全栈代码 ──────────────────────────────────────────
  const generateCode = useCallback(
    async (phaseId?: string, onComplete?: () => void): Promise<boolean> => {
      if (!activeSessionId) return false;
      // 创建本次流式请求的取消控制器
      const controller = new AbortController();
      abortRef.current = controller;
      setCodeLoading(true);
      setCodeProgress({ files: [], current: null });
      setCodeWarning(null);
      try {
        const res = await fetch(`${API}/generate/code/stream`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          signal: controller.signal,
          body: JSON.stringify({
            sessionId: activeSessionId,
            profileId: profileId || undefined,
            phaseId: phaseId ?? codePhaseId,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
          console.error(errData.error || '生成失败');
          return false;
        }

        const reader = res.body?.getReader();
        if (!reader) return false;
        const decoder = new TextDecoder();
        let buffer = '';
        let success = false;

        let eventType = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (line.startsWith('event: ')) {
              eventType = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
              try {
                const evt = JSON.parse(line.slice(6));
                switch (eventType) {
                  case 'progress':
                    // 进度事件:更新已生成的文件路径与当前文件
                    setCodeProgress({
                      files: Array.isArray(evt.files) ? evt.files : [],
                      current: evt.current ?? null,
                    });
                    break;
                  case 'warning':
                    setCodeWarning(evt.message ?? '⚠️ 响应可能不完整');
                    break;
                  case 'files':
                    if (Array.isArray(evt.files)) {
                      studio.setGeneratedFiles(evt.files);
                      success = true;
                    }
                    break;
                  case 'error':
                    console.error(evt.error);
                    break;
                  case 'done':
                  case 'end':
                    // 流结束标记,无需额外处理
                    break;
                }
              } catch {
                // skip parse errors
              }
            }
          }
        }

        if (success) onComplete?.();
        return success;
      } catch (err) {
        // 用户主动取消时不当作错误处理
        if ((err as Error)?.name === 'AbortError') {
          return false;
        }
        console.error('请求失败');
        return false;
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        setCodeLoading(false);
      }
    },
    [activeSessionId, profileId, studio, codePhaseId],
  );

  // ── SSE 流式代码精炼 ──────────────────────────────────────
  const refineCode = useCallback(
    async (feedback: string): Promise<boolean> => {
      if (!activeSessionId || !studio.generatedFiles.length || !feedback.trim()) return false;
      const controller = new AbortController();
      abortRef.current = controller;
      setCodeRefining(true);
      setCodeProgress({ files: [], current: null });
      setCodeWarning(null);
      try {
        const res = await fetch(`${API}/generate/code/refine`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          signal: controller.signal,
          body: JSON.stringify({
            sessionId: activeSessionId,
            currentFiles: studio.generatedFiles,
            feedback,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
          console.error(errData.error || '精炼失败');
          return false;
        }

        const reader = res.body?.getReader();
        if (!reader) return false;
        const decoder = new TextDecoder();
        let buffer = '';
        let success = false;
        let eventType2 = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (line.startsWith('event: ')) {
              eventType2 = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
              try {
                const evt = JSON.parse(line.slice(6));
                switch (eventType2) {
                  case 'progress':
                    setCodeProgress({
                      files: Array.isArray(evt.files) ? evt.files : [],
                      current: evt.current ?? null,
                    });
                    break;
                  case 'warning':
                    setCodeWarning(evt.message ?? '⚠️ 响应可能不完整');
                    break;
                  case 'files':
                    if (Array.isArray(evt.files) && evt.files.length > 0) {
                      const patches = evt.patches as Array<{ target: string; action: string }> | undefined;
                      if (patches?.length) {
                        const updatedPaths = new Set(evt.files.map((f: { path: string }) => f.path));
                        const merged = [
                          ...studio.generatedFiles.filter(f => !updatedPaths.has(f.path)),
                          ...evt.files,
                        ];
                        studio.setGeneratedFiles(merged);
                      } else {
                        studio.setGeneratedFiles(evt.files);
                      }
                      success = true;
                    }
                    break;
                  case 'error':
                    console.error(evt.error);
                    break;
                  case 'done':
                  case 'end':
                    break;
                }
              } catch {
                // skip parse errors
              }
            }
          }
        }

        return success;
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') {
          return false;
        }
        console.error('精炼请求失败');
        return false;
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        setCodeRefining(false);
      }
    },
    [activeSessionId, studio],
  );

  // ── 取消当前流式生成/精炼 ──────────────────────────────────
  const abortCodeGeneration = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return {
    // 加载状态
    designLoading,
    codeLoading,
    codeRefining,
    codePhaseId,
    setCodePhaseId,
    codeProgress,
    codeWarning,
    archLoading,
    archRefining,
    // 操作
    generateArchitecture,
    saveArchitecture,
    refineArchitecture,
    generateDesign,
    saveDesign,
    generateCode,
    refineCode,
    abortCodeGeneration,
  };
}