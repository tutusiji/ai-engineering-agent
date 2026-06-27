/**
 * skill-context — 创建 Skill 运行时上下文
 */

import path from 'node:path';
import { FileSchemaRegistry } from '@ai-engineering-agent/contract-schema';
import { FilePolicyRegistry } from '@ai-engineering-agent/policy-engine';
import type { SkillContext } from '@ai-engineering-agent/skill-sdk';
import type { JsonObject } from '@ai-engineering-agent/shared-types';
import { repoRoot } from './config.js';

export const schemas = new FileSchemaRegistry({ contractsDir: path.join(repoRoot, 'contracts') });
export const policies = new FilePolicyRegistry({
  policiesDir: path.join(repoRoot, 'policies'),
  targetPoliciesDir: path.join(repoRoot, 'policies/targets'),
});

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createSkillContext(profileId?: string, architectureDesign?: JsonObject): SkillContext {
  const resolved = profileId ? policies.getTargetProfile(profileId) : undefined;
  return {
    runId: `web-${Date.now()}`,
    nodeId: 'web-api',
    targetProfile: profileId ? { id: profileId } : undefined,
    resolvedTargetProfile: resolved as JsonObject ?? undefined,
    architectureDesign,
    schemas: schemas as unknown as SkillContext['schemas'],
    policies: policies as unknown as SkillContext['policies'],
    artifacts: [],
    logger: {
      info: (msg) => console.log(`[INFO] ${msg}`),
      warn: (msg) => console.warn(`[WARN] ${msg}`),
      error: (msg) => console.error(`[ERROR] ${msg}`),
    },
  };
}

/** 从会话 document 中提取当前激活的架构设计 */
export function getActiveArchitecture(session: { document?: Record<string, unknown> | null } | null): JsonObject | undefined {
  if (!session?.document) return undefined;
  const doc = session.document;
  const archVersions = doc._architectureVersions as Array<Record<string, unknown>> | undefined;
  const activeArchId = doc._activeArchitectureId as string | undefined;
  const activeArch = archVersions?.find(v => v.id === activeArchId) ?? archVersions?.[archVersions.length - 1];
  return (activeArch?.architecture as JsonObject) ?? undefined;
}
