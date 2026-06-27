/**
 * architecture-markdown — 将架构设计 JSON 转换为可读 Markdown
 */

export function buildArchitectureMarkdown(arch: Record<string, unknown>): string {
  const lines: string[] = [];

  lines.push(`# ${arch.projectName ?? '架构设计方案'}`);
  lines.push('');
  lines.push(`> 生成时间: ${new Date().toISOString()}`);
  lines.push('');

  if (arch.overview) {
    lines.push('## 项目概述');
    lines.push('');
    lines.push(String(arch.overview));
    lines.push('');
  }

  const sysArch = arch.systemArchitecture as Record<string, unknown> | undefined;
  if (sysArch) {
    lines.push('## 系统架构');
    lines.push('');
    if (sysArch.diagram) lines.push(String(sysArch.diagram));
    lines.push('');
    const layers = sysArch.layers as Array<Record<string, unknown>> | undefined;
    if (layers) {
      for (const layer of layers) {
        lines.push(`### ${layer.name ?? ''}`);
        lines.push(`- 描述: ${layer.description ?? ''}`);
        lines.push(`- 技术: ${(layer.technologies as string[])?.join(', ') ?? ''}`);
        lines.push('');
      }
    }
  }

  const techStack = arch.techStack as Record<string, unknown> | undefined;
  if (techStack) {
    lines.push('## 技术栈');
    lines.push('');
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
    lines.push('## 模块划分');
    lines.push('');
    lines.push('| 模块 | 类型 | 描述 | 依赖 |');
    lines.push('|------|------|------|------|');
    for (const m of modules) {
      const deps = (m.dependsOn as string[])?.join(', ') ?? '-';
      lines.push(`| ${m.name ?? ''} | ${m.type ?? ''} | ${m.description ?? ''} | ${deps} |`);
    }
    lines.push('');
  }

  const dataFlow = arch.dataFlow as Record<string, unknown> | undefined;
  if (dataFlow) {
    lines.push('## 数据流设计');
    lines.push('');
    if (dataFlow.description) lines.push(String(dataFlow.description));
    const flows = dataFlow.flows as Array<Record<string, unknown>> | undefined;
    if (flows) {
      for (const flow of flows) {
        lines.push(`### ${flow.name ?? ''}`);
        const steps = flow.steps as string[] | undefined;
        if (steps) for (const s of steps) lines.push(`1. ${s}`);
        lines.push('');
      }
    }
  }

  const apiDesign = arch.apiDesignPrinciples as Record<string, unknown> | undefined;
  if (apiDesign) {
    lines.push('## API 设计原则');
    lines.push('');
    for (const [k, v] of Object.entries(apiDesign)) {
      lines.push(`- **${k}**: ${v}`);
    }
    lines.push('');
  }

  const dbDesign = arch.databaseDesign as Record<string, unknown> | undefined;
  if (dbDesign) {
    lines.push('## 数据库设计');
    lines.push('');
    if (dbDesign.strategy) lines.push(`策略: ${dbDesign.strategy}`);
    const dbEntities = dbDesign.entities as Array<Record<string, unknown>> | undefined;
    if (dbEntities) {
      for (const e of dbEntities) {
        lines.push(`- **${e.name ?? ''}**: ${e.description ?? ''}`);
      }
    }
    lines.push('');
  }

  const security = arch.securityConsiderations as string[] | undefined;
  if (security?.length) {
    lines.push('## 安全考虑');
    lines.push('');
    for (const s of security) lines.push(`- ${s}`);
    lines.push('');
  }

  const deploy = arch.deploymentArchitecture as Record<string, unknown> | undefined;
  if (deploy) {
    lines.push('## 部署架构');
    lines.push('');
    if (deploy.description) lines.push(String(deploy.description));
    const comps = deploy.components as Array<Record<string, unknown>> | undefined;
    if (comps) {
      for (const c of comps) {
        lines.push(`- **${c.name ?? ''}** (port ${c.port ?? '-'}): ${c.role ?? ''}`);
      }
    }
    lines.push('');
  }

  const phases = arch.developmentPhases as Array<Record<string, unknown>> | undefined;
  if (phases?.length) {
    lines.push('## 开发阶段');
    lines.push('');
    for (const p of phases) {
      lines.push(`### ${p.phase ?? ''} — ${p.name ?? ''}`);
      lines.push(`目标: ${p.goal ?? ''}`);
      const deliverables = p.deliverables as string[] | undefined;
      if (deliverables) for (const d of deliverables) lines.push(`- ${d}`);
      lines.push('');
    }
  }

  const risks = arch.risksAndMitigations as Array<Record<string, unknown>> | undefined;
  if (risks?.length) {
    lines.push('## 风险与缓解');
    lines.push('');
    lines.push('| 风险 | 影响 | 缓解措施 |');
    lines.push('|------|------|----------|');
    for (const r of risks) {
      lines.push(`| ${r.risk ?? ''} | ${r.impact ?? ''} | ${r.mitigation ?? ''} |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
