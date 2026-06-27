/**
 * useStudioState — 集中管理 Studio 右侧产物与设计状态
 */

import { useState, useCallback } from 'react';

export interface DesignVersion {
  id: string;
  label: string;
  model: string;
  createdAt: number;
}

export interface ArchVersion {
  id: string;
  label: string;
  model: string;
  createdAt: number;
}

export function useStudioState() {
  const [designHtml, setDesignHtml] = useState<string | null>(null);
  const [designVersions, setDesignVersions] = useState<DesignVersion[]>([]);
  const [activeDesignId, setActiveDesignId] = useState<string | null>(null);
  const [generatedFiles, setGeneratedFiles] = useState<Array<{ path: string; kind: string; content?: string }>>([]);
  const [archMarkdown, setArchMarkdown] = useState<string | null>(null);
  const [archVersions, setArchVersions] = useState<ArchVersion[]>([]);
  const [activeArchId, setActiveArchId] = useState<string | null>(null);
  const [archDraft, setArchDraft] = useState<string | null>(null);
  const [archDraftMeta, setArchDraftMeta] = useState<{ architecture: unknown; model: string } | null>(null);

  const resetOutputs = useCallback(() => {
    setDesignHtml(null);
    setDesignVersions([]);
    setActiveDesignId(null);
    setGeneratedFiles([]);
    setArchMarkdown(null);
    setArchVersions([]);
    setActiveArchId(null);
    setArchDraft(null);
    setArchDraftMeta(null);
  }, []);

  return {
    designHtml,
    setDesignHtml,
    designVersions,
    setDesignVersions,
    activeDesignId,
    setActiveDesignId,
    generatedFiles,
    setGeneratedFiles,
    archMarkdown,
    setArchMarkdown,
    archVersions,
    setArchVersions,
    activeArchId,
    setActiveArchId,
    archDraft,
    setArchDraft,
    archDraftMeta,
    setArchDraftMeta,
    resetOutputs,
  };
}
