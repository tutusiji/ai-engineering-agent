/**
 * ppt-seed — 内置主题启动种子例程
 *
 * 在 runMigrations 之后执行：把 SEED_PPT_TEMPLATES 清单幂等注入 ppt_templates 表，
 * 并把背景资产落盘到 ArtifactStore 的 templates/<id>/assets/（无条件覆盖写，
 * 兼具自修复——「数据库行已存在但资产文件缺失」的场景会在每次启动时被补齐）。
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ArtifactStore, PptTemplateStore } from '@ai-engineering-agent/persistence';
import { SEED_PPT_TEMPLATES } from './ppt-seed-templates.js';
import { repoRoot } from './config.js';

/** 种子例程所需的模板存储最小接口（真实 PptTemplateStore 结构化兼容，测试可注入假实现） */
export interface PptSeedTemplateStore {
  /** 按 id 查模板行 */
  get(id: string): Promise<{ id: string } | undefined>;
  /** 新建模板行 */
  create(input: {
    id?: string;
    ownerId: string | null;
    name: string;
    source: 'builtin' | 'uploaded';
    theme: unknown;
    assetPaths?: Record<string, string>;
  }): Promise<unknown>;
}

/** 种子例程所需的资产存储最小接口 */
export interface PptSeedArtifactStore {
  /** 保存二进制资产文件 */
  saveBinary(runId: string, filePath: string, content: Buffer): unknown;
}

/** 依赖注入（缺省用真实存储与仓库根路径） */
export interface PptSeedDeps {
  templateStore?: PptSeedTemplateStore;
  artifactStore?: PptSeedArtifactStore;
  /** 仓库根（资产源文件相对路径的解析基准） */
  repoRoot?: string;
}

/**
 * 幂等注入内置种子主题
 * @param deps 可注入依赖
 * @returns 本次新入库的主题 id 列表（已存在的仅补资产、不重复入库）
 */
export async function seedBuiltinPptTemplates(deps: PptSeedDeps = {}): Promise<string[]> {
  const store = deps.templateStore ?? new PptTemplateStore();
  const artifacts = deps.artifactStore ?? new ArtifactStore();
  const root = deps.repoRoot ?? repoRoot;
  const seeded: string[] = [];

  for (const entry of SEED_PPT_TEMPLATES) {
    // 资产落盘：覆盖写（幂等 + 缺文件自修复）；源文件缺失只告警不阻断启动（构建侧走纯色兜底）
    for (const [assetName, relFile] of Object.entries(entry.assetFiles)) {
      const src = path.join(root, relFile);
      if (!existsSync(src)) {
        console.warn(`⚠️ PPT 种子资产缺失，跳过落盘: ${src}`);
        continue;
      }
      artifacts.saveBinary('templates', `${entry.id}/assets/${assetName}`, readFileSync(src));
    }

    const existing = await store.get(entry.id);
    if (existing) continue;

    // assetPaths 与上传路由同构：资产名 -> templates/<id>/assets/<名>
    const assetPaths = Object.fromEntries(
      Object.keys(entry.assetFiles).map((k) => [k, `templates/${entry.id}/assets/${k}`])
    );
    await store.create({
      id: entry.id,
      ownerId: null,
      name: entry.name,
      source: 'builtin',
      theme: entry.theme,
      assetPaths,
    });
    seeded.push(entry.id);
  }
  return seeded;
}
