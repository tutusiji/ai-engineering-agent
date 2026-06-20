import { useState, useEffect, useCallback, useMemo } from 'react';
import type { ArtifactItem } from '@ai-frontend-engineering-agent/shared-types';
import type { RequirementDocument } from './useChat';

const API = '/api';

interface UseArtifactsInput {
  sessionId: string | null;
  document: RequirementDocument | null;
  designHtml: string | null;
  generatedFiles: Array<{ path: string; kind: string; content?: string }>;
}

interface UseArtifactsOutput {
  artifacts: ArtifactItem[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  downloadOne: (id: string) => Promise<void>;
  downloadAll: () => Promise<void>;
}

function generateRequirementMarkdown(doc: Record<string, unknown>): string {
  const featureName = (doc.featureName as string) || '需求文档';
  const lines: string[] = [`# ${featureName}`, ''];
  if (doc.completeness) {
    lines.push(`> 需求完整度: ${doc.completeness}%`, '');
  }
  if (doc.businessGoal) {
    lines.push('## 业务目标', String(doc.businessGoal), '');
  }
  return lines.join('\n');
}

function deriveSessionArtifacts(
  document: Record<string, unknown> | null,
  designHtml: string | null,
): ArtifactItem[] {
  const now = Date.now();
  const artifacts: ArtifactItem[] = [];

  if (document && (document.featureName !== undefined || document.businessGoal !== undefined)) {
    const md = generateRequirementMarkdown(document);
    artifacts.push({
      id: 'req-md',
      category: 'requirement',
      label: `${(document.featureName as string) || '需求文档'}.md`,
      size: new Blob([md]).size,
      updatedAt: (document.updatedAt as number) ?? now,
      source: 'session-state',
      content: md,
    });
  }

  if (designHtml) {
    artifacts.push({
      id: 'design-html',
      category: 'design',
      label: 'UI预览.html',
      size: new Blob([designHtml]).size,
      updatedAt: now,
      source: 'session-state',
      content: designHtml,
    });
  }

  return artifacts;
}

function triggerDownload(url: string, filename?: string) {
  const a = document.createElement('a');
  a.href = url;
  if (filename) a.download = filename;
  a.click();
}

export function useArtifacts(input: UseArtifactsInput): UseArtifactsOutput {
  const { sessionId, document, designHtml, generatedFiles } = input;
  const [backendArtifacts, setBackendArtifacts] = useState<ArtifactItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sessionArtifacts = useMemo(
    () => deriveSessionArtifacts(document as Record<string, unknown> | null, designHtml),
    [document, designHtml]
  );

  const fetchArtifacts = useCallback(async () => {
    if (!sessionId) {
      setBackendArtifacts([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/sessions/${sessionId}/artifacts`);
      if (!res.ok) throw new Error(`Failed to fetch artifacts: ${res.status}`);
      const data = await res.json();
      setBackendArtifacts((data.artifacts as ArtifactItem[]) ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    fetchArtifacts();
  }, [fetchArtifacts]);

  const artifacts = useMemo(() => {
    const backendOnly = backendArtifacts.filter(b => b.source === 'artifact-run');
    return [...sessionArtifacts, ...backendOnly];
  }, [sessionArtifacts, backendArtifacts]);

  const downloadOne = useCallback(async (id: string) => {
    const artifact = artifacts.find(a => a.id === id);
    if (!artifact) return;

    if (artifact.source === 'session-state' && artifact.content) {
      const blob = new Blob([artifact.content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      triggerDownload(url, artifact.label);
      URL.revokeObjectURL(url);
      return;
    }

    if (artifact.downloadUrl) {
      triggerDownload(artifact.downloadUrl, artifact.label);
    }
  }, [artifacts]);

  const downloadAll = useCallback(async () => {
    if (!sessionId || artifacts.length === 0) return;
    const ids = artifacts.map(a => a.id).join(',');
    triggerDownload(`${API}/sessions/${sessionId}/artifacts/download?ids=${ids}`, `session-${sessionId}-artifacts.zip`);
  }, [sessionId, artifacts]);

  return {
    artifacts,
    loading,
    error,
    refresh: fetchArtifacts,
    downloadOne,
    downloadAll,
  };
}
