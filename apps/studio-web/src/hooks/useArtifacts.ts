import { useState, useEffect, useCallback, useMemo } from 'react';
import type { ArtifactItem } from '@ai-engineering-agent/shared-types';
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

function generateArchitectureMarkdown(arch: Record<string, unknown>): string {
  const projectName = (arch.projectName as string) || '架构方案';
  const lines: string[] = [`# ${projectName} — 架构设计方案`, ''];

  if (arch.overview) {
    lines.push('## 概述', '', String(arch.overview), '');
  }

  const techStack = arch.techStack as Record<string, unknown> | undefined;
  if (techStack) {
    lines.push('## 技术栈', '');
    for (const [key, val] of Object.entries(techStack)) {
      if (typeof val === 'object' && val !== null) {
        lines.push(`### ${key}`);
        for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
          lines.push(`- **${k}**: ${v}`);
        }
        lines.push('');
      }
    }
  }

  const modules = arch.moduleBreakdown as Array<Record<string, unknown>> | undefined;
  if (modules?.length) {
    lines.push('## 模块划分', '');
    for (const m of modules) {
      const deps = (m.dependsOn as string[])?.join(', ') ?? '-';
      lines.push(`- **${m.name ?? ''}** [${m.type ?? ''}]: ${m.description ?? ''} (依赖: ${deps})`);
    }
    lines.push('');
  }

  const phases = arch.developmentPhases as Array<Record<string, unknown>> | undefined;
  if (phases?.length) {
    lines.push('## 开发阶段', '');
    for (const p of phases) {
      lines.push(`### ${p.phase ?? ''} — ${p.name ?? ''}`);
      lines.push(`${p.goal ?? ''}`);
      const deliverables = p.deliverables as string[] | undefined;
      if (deliverables) for (const d of deliverables) lines.push(`- ${d}`);
      lines.push('');
    }
  }

  const risks = arch.risksAndMitigations as Array<Record<string, unknown>> | undefined;
  if (risks?.length) {
    lines.push('## 风险与缓解', '');
    for (const r of risks) {
      lines.push(`- **${r.risk ?? ''}** (${r.impact ?? 'medium'}): ${r.mitigation ?? ''}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function deriveSessionArtifacts(
  document: Record<string, unknown> | null,
  designHtml: string | null,
): ArtifactItem[] {
  const now = Date.now();
  const artifacts: ArtifactItem[] = [];

  // 1. Requirement document
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

  // 2. Architecture design document (from session)
  const archVersions = document?._architectureVersions as Array<Record<string, unknown>> | undefined;
  const activeArchId = document?._activeArchitectureId as string | undefined;
  const activeArch = archVersions?.find(v => v.id === activeArchId) ?? archVersions?.[archVersions.length - 1];
  if (activeArch?.architecture) {
    const archMd = generateArchitectureMarkdown(activeArch.architecture as Record<string, unknown>);
    artifacts.push({
      id: 'arch-md',
      category: 'architecture',
      label: '架构设计方案.md',
      size: new Blob([archMd]).size,
      updatedAt: (activeArch.createdAt as number) ?? now,
      source: 'session-state',
      content: archMd,
    });
    artifacts.push({
      id: 'arch-json',
      category: 'architecture',
      label: '架构设计方案.json',
      size: new Blob([JSON.stringify(activeArch.architecture, null, 2)]).size,
      updatedAt: (activeArch.createdAt as number) ?? now,
      source: 'session-state',
      content: JSON.stringify(activeArch.architecture, null, 2),
    });
  }

  // 3. Interactive UI preview
  if (designHtml) {
    artifacts.push({
      id: 'design-html',
      category: 'design',
      label: '可交互预览.html',
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
