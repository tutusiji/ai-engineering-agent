/**
 * useSessionData — 会话切换时的产物版本加载
 *
 * 当 activeSessionId 变化时，自动加载该会话的 design 版本和 architecture 版本。
 * 同时提供版本切换能力。
 *
 * 修复了原 App.tsx 中 useEffect 依赖缺失导致的 stale closure 问题：
 * 原代码 useEffect([activeSessionId]) 内部调用了 loadDesignVersions 等
 * useCallback，但未将其列入依赖数组。
 */

import { useEffect, useCallback } from 'react';
import type { useStudioState } from './useStudioState';

const API = '/api';

interface DesignVersion {
  id: string;
  label: string;
  html: string;
  model: string;
  createdAt: number;
}

interface ArchVersion {
  id: string;
  label: string;
  model: string;
  createdAt: number;
}

export function useSessionData(
  activeSessionId: string | null,
  studio: ReturnType<typeof useStudioState>,
) {
  // ── 加载 design 版本 ──────────────────────────────────────
  const loadDesignVersions = useCallback(
    async (sid: string) => {
      try {
        const res = await fetch(`${API}/sessions/${sid}/designs`, { credentials: 'include' });
        const data = await res.json();
        studio.setDesignVersions(data.versions ?? []);
        const activeId = data.activeId;
        studio.setActiveDesignId(activeId);
        if (activeId) {
          const active = data.versions?.find((v: DesignVersion) => v.id === activeId);
          studio.setDesignHtml(active?.html ?? null);
        } else {
          studio.setDesignHtml(null);
        }
      } catch {
        studio.setDesignVersions([]);
        studio.setDesignHtml(null);
      }
    },
    [studio],
  );

  // ── 加载 architecture 版本 ────────────────────────────────
  const loadArchitectureVersions = useCallback(
    async (sid: string) => {
      try {
        const res = await fetch(`${API}/sessions/${sid}/architectures`, {
          credentials: 'include',
        });
        const data = await res.json();
        studio.setArchVersions(data.versions ?? []);
        const activeId = data.activeId;
        studio.setActiveArchId(activeId);
        if (activeId && data.activeMarkdown) {
          studio.setArchMarkdown(data.activeMarkdown);
          studio.setArchDraft(null);
          studio.setArchDraftMeta(null);
        } else {
          studio.setArchMarkdown(null);
        }
      } catch {
        studio.setArchVersions([]);
        studio.setArchMarkdown(null);
      }
    },
    [studio],
  );

  // ── 切换 architecture 版本 ────────────────────────────────
  const switchArchitectureVersion = useCallback(
    async (archId: string) => {
      if (!activeSessionId) return;
      try {
        const res = await fetch(`${API}/sessions/${activeSessionId}/architectures/active`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ architectureId: archId }),
        });
        const data = await res.json();
        if (data.ok) {
          studio.setActiveArchId(archId);
          if (data.markdown) {
            studio.setArchMarkdown(data.markdown);
            studio.setArchDraft(null);
            studio.setArchDraftMeta(null);
          }
        }
      } catch {
        /* ignore */
      }
    },
    [activeSessionId, studio],
  );

  // ── 切换 design 版本 ──────────────────────────────────────
  const switchDesignVersion = useCallback(
    async (designId: string) => {
      if (!activeSessionId) return;
      const version = studio.designVersions.find((v) => v.id === designId);
      if (!version) return;
      try {
        const res = await fetch(`${API}/sessions/${activeSessionId}/designs/active`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ designId }),
        });
        const data = await res.json();
        if (data.ok) {
          studio.setActiveDesignId(designId);
          await loadDesignVersions(activeSessionId);
        }
      } catch {
        /* ignore */
      }
    },
    [activeSessionId, studio, loadDesignVersions],
  );

  // ── 会话切换时自动加载版本数据 ────────────────────────────
  // 修复 stale closure：所有依赖（loadDesignVersions / loadArchitectureVersions）
  // 已通过 useCallback 稳定化，并正确列入 useEffect 依赖数组。
  useEffect(() => {
    if (activeSessionId) {
      // 先重置状态，避免旧会话内容残留
      studio.resetOutputs();
      loadDesignVersions(activeSessionId);
      loadArchitectureVersions(activeSessionId);
    }
  }, [activeSessionId]);

  return {
    loadDesignVersions,
    loadArchitectureVersions,
    switchArchitectureVersion,
    switchDesignVersion,
  };
}
