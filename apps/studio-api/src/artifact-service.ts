import type { Response } from 'express';
import JSZip from 'jszip';
import type { ArtifactItem, SessionArtifactRun } from '@ai-engineering-agent/shared-types';
import type { ArtifactStore } from '@ai-engineering-agent/persistence';
import type { Session } from '@ai-engineering-agent/persistence';

const CATEGORY_ORDER: Record<string, number> = {
  requirement: 0,
  architecture: 1,
  design: 2,
  code: 3,
  intermediate: 4,
};

export function generateRequirementMarkdown(doc: Record<string, unknown>): string {
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

export function buildSessionArtifacts(
  session: Session,
  sessionId: string,
  artifactStore: ArtifactStore,
  designHtml: string | null,
): ArtifactItem[] {
  const now = Date.now();
  const artifacts: ArtifactItem[] = [];
  const doc = session.document ?? {};

  // Session-state: requirement markdown
  if (doc.featureName !== undefined || doc.businessGoal !== undefined) {
    const md = generateRequirementMarkdown(doc);
    artifacts.push({
      id: 'req-md',
      category: 'requirement',
      label: `${(doc.featureName as string) || '需求文档'}.md`,
      size: Buffer.byteLength(md, 'utf-8'),
      updatedAt: (doc.updatedAt as number) ?? session.updatedAt ?? now,
      source: 'session-state',
      content: md,
    });
  }

  // Session-state: architecture design
  const archVersions = (doc._architectureVersions as Array<Record<string, unknown>>) ?? [];
  const activeArchId = doc._activeArchitectureId as string | undefined;
  const activeArch = archVersions.find(v => v.id === activeArchId) ?? archVersions[archVersions.length - 1];
  if (activeArch?.architecture) {
    const archDoc = activeArch.architecture as Record<string, unknown>;
    const archMd = buildArchitectureMdServer(archDoc);
    const archJson = JSON.stringify(archDoc, null, 2);
    artifacts.push({
      id: 'arch-md',
      category: 'architecture',
      label: '架构设计方案.md',
      size: Buffer.byteLength(archMd, 'utf-8'),
      updatedAt: (activeArch.createdAt as number) ?? now,
      source: 'session-state',
      content: archMd,
    });
    artifacts.push({
      id: 'arch-json',
      category: 'architecture',
      label: '架构设计方案.json',
      size: Buffer.byteLength(archJson, 'utf-8'),
      updatedAt: (activeArch.createdAt as number) ?? now,
      source: 'session-state',
      content: archJson,
    });
  }

  // Session-state: design html
  if (designHtml) {
    artifacts.push({
      id: 'design-html',
      category: 'design',
      label: '可交互预览.html',
      size: Buffer.byteLength(designHtml, 'utf-8'),
      updatedAt: session.updatedAt ?? now,
      source: 'session-state',
      content: designHtml,
    });
  }

  // Artifact runs
  const runs = (doc._artifactRuns as SessionArtifactRun[] | undefined) ?? [];
  for (const run of runs) {
    const files = artifactStore.list(run.runId);
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    const category = run.type === 'code' ? 'code' : run.type === 'design' ? 'design' : 'intermediate';
    const label = run.type === 'code' ? '代码包.zip' : run.type === 'design' ? 'UI预览.zip' : `${run.runId}.zip`;
    artifacts.push({
      id: `${category}-zip:${run.runId}`,
      category,
      label,
      size: totalSize,
      updatedAt: run.createdAt,
      source: 'artifact-run',
      downloadUrl: `/api/sessions/${sessionId}/artifacts/download?id=${category}-zip:${run.runId}`,
    });
  }

  // Sort by category order, then updatedAt desc
  artifacts.sort((a, b) => {
    const orderDiff = (CATEGORY_ORDER[a.category] ?? 99) - (CATEGORY_ORDER[b.category] ?? 99);
    if (orderDiff !== 0) return orderDiff;
    return b.updatedAt - a.updatedAt;
  });

  return artifacts;
}

async function addArtifactToZip(
  zip: JSZip,
  session: Session,
  artifactStore: ArtifactStore,
  designHtml: string | null,
  id: string,
): Promise<void> {
  if (id === 'req-md') {
    const md = generateRequirementMarkdown(session.document ?? {});
    zip.file('需求文档.md', md);
    return;
  }
  if (id === 'arch-md' || id === 'arch-json') {
    const doc = session.document ?? {};
    const archVersions = (doc._architectureVersions as Array<Record<string, unknown>>) ?? [];
    const activeArchId = doc._activeArchitectureId as string | undefined;
    const activeArch = archVersions.find(v => v.id === activeArchId) ?? archVersions[archVersions.length - 1];
    if (!activeArch?.architecture) throw new Error('architecture not available');
    const archDoc = activeArch.architecture as Record<string, unknown>;
    if (id === 'arch-md') {
      zip.file('架构设计方案.md', buildArchitectureMdServer(archDoc));
    } else {
      zip.file('架构设计方案.json', JSON.stringify(archDoc, null, 2));
    }
    return;
  }
  if (id === 'design-html') {
    if (!designHtml) throw new Error('design-html not available');
    zip.file('可交互预览.html', designHtml);
    return;
  }

  const match = id.match(/^(design|code|intermediate)-zip:(.+)$/);
  if (!match) throw new Error(`Unknown artifact id: ${id}`);
  const [, category, runId] = match;
  const files = artifactStore.list(runId);
  if (files.length === 0) throw new Error(`No files for run: ${runId}`);
  for (const file of files) {
    const content = artifactStore.read(runId, file.path);
    if (content === undefined) continue;
    zip.file(`${category}/${file.path}`, content);
  }
}

export async function buildArtifactZip(
  session: Session,
  artifactStore: ArtifactStore,
  designHtml: string | null,
  ids: string[],
): Promise<Buffer> {
  const zip = new JSZip();
  for (const id of ids) {
    await addArtifactToZip(zip, session, artifactStore, designHtml, id);
  }
  return zip.generateAsync({ type: 'nodebuffer' });
}

function buildArchitectureMdServer(arch: Record<string, unknown>): string {
  const lines: string[] = [];
  lines.push(`# ${arch.projectName ?? '架构设计方案'}`);
  lines.push('', `> 生成时间: ${new Date().toISOString()}`, '');
  if (arch.overview) lines.push('## 概述', '', String(arch.overview), '');
  const techStack = arch.techStack as Record<string, unknown> | undefined;
  if (techStack) {
    lines.push('## 技术栈', '');
    for (const [key, val] of Object.entries(techStack)) {
      if (typeof val === 'object' && val !== null) {
        lines.push(`### ${key}`);
        for (const [k, v] of Object.entries(val as Record<string, unknown>)) lines.push(`- **${k}**: ${v}`);
        lines.push('');
      }
    }
  }
  const modules = arch.moduleBreakdown as Array<Record<string, unknown>> | undefined;
  if (modules?.length) {
    lines.push('## 模块划分', '');
    for (const m of modules) lines.push(`- **${m.name ?? ''}** [${m.type ?? ''}]: ${m.description ?? ''}`);
    lines.push('');
  }
  const phases = arch.developmentPhases as Array<Record<string, unknown>> | undefined;
  if (phases?.length) {
    lines.push('## 开发阶段', '');
    for (const p of phases) {
      lines.push(`### ${p.phase ?? ''} — ${p.name ?? ''}`, String(p.goal ?? ''));
      const deliverables = p.deliverables as string[] | undefined;
      if (deliverables) for (const d of deliverables) lines.push(`- ${d}`);
      lines.push('');
    }
  }
  return lines.join('\n');
}

export async function sendArtifactResponse(
  res: Response,
  session: Session,
  artifactStore: ArtifactStore,
  designHtml: string | null,
  id: string,
): Promise<void> {
  if (id === 'req-md') {
    const md = generateRequirementMarkdown(session.document ?? {});
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="需求文档.md"');
    res.send(md);
    return;
  }
  if (id === 'arch-md') {
    const doc = session.document ?? {};
    const archVersions = (doc._architectureVersions as Array<Record<string, unknown>>) ?? [];
    const activeArchId = doc._activeArchitectureId as string | undefined;
    const activeArch = archVersions.find(v => v.id === activeArchId) ?? archVersions[archVersions.length - 1];
    if (!activeArch?.architecture) throw new Error('architecture not available');
    const archDoc = activeArch.architecture as Record<string, unknown>;
    const archMd = buildArchitectureMdServer(archDoc);
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="架构设计方案.md"');
    res.send(archMd);
    return;
  }
  if (id === 'arch-json') {
    const doc = session.document ?? {};
    const archVersions = (doc._architectureVersions as Array<Record<string, unknown>>) ?? [];
    const activeArchId = doc._activeArchitectureId as string | undefined;
    const activeArch = archVersions.find(v => v.id === activeArchId) ?? archVersions[archVersions.length - 1];
    if (!activeArch?.architecture) throw new Error('architecture not available');
    const archDoc = activeArch.architecture as Record<string, unknown>;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="架构设计方案.json"');
    res.send(JSON.stringify(archDoc, null, 2));
    return;
  }
  if (id === 'design-html') {
    if (!designHtml) throw new Error('design-html not available');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="可交互预览.html"');
    res.send(designHtml);
    return;
  }

  const match = id.match(/^(design|code|intermediate)-zip:(.+)$/);
  if (!match) throw new Error(`Unknown artifact id: ${id}`);
  const [, category, runId] = match;
  const files = artifactStore.list(runId);
  if (files.length === 0) throw new Error(`No files for run: ${runId}`);

  const zip = new JSZip();
  for (const file of files) {
    const content = artifactStore.read(runId, file.path);
    if (content === undefined) continue;
    zip.file(file.path, content);
  }

  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  const label = category === 'design' ? 'UI预览' : category === 'code' ? '代码包' : runId;
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${label}.zip"`);
  res.send(buffer);
}
