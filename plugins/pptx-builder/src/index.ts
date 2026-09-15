/**
 * pptx-builder — PPT 构建发布 plugin
 *
 * 接收美化内容（PptContent）与主题（PptTheme）：
 * 1. computeFitting 逐页比对字数预算（pptx-core 的 getSlideBudget，skill 与渲染共用同一预算表）
 * 2. 警告超过 2 处 → ok:false 携带逐条告警，触发工作流 retryTarget 回到大纲规划
 * 3. buildPptx 生成 .pptx 二进制，写入 run 目录并发布 artifact
 */

import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import type { JsonObject, ValidationIssue } from '@ai-engineering-agent/shared-types';
import type { PluginContext, PluginDefinition, PluginResult } from '@ai-engineering-agent/plugin-sdk';
import { buildPptx, getSlideBudget, type PptContent, type PptTheme } from '@ai-engineering-agent/pptx-core';

/** fitting 警告阈值 — 超过该数量说明多处超预算，应回大纲重新规划而非硬排 */
const FITTING_WARNING_LIMIT = 2;

/**
 * 逐页比对字数预算，返回警告列表（空数组 = 全部达标）。
 * 警告格式「第 N 页：要点 6 条超出预算 5 条」——含页码供 LLM 重试时定位。
 * @param content 美化后的 PPT 内容
 * @param theme 主题（layoutDensity 决定预算档位）
 * @returns 警告列表
 */
export function computeFitting(content: PptContent, theme: PptTheme): string[] {
  const warnings: string[] = [];
  for (const slide of content.slides) {
    // 按页面类型 + 密度查询该页字数预算
    const b = getSlideBudget(slide.pageType, theme.layoutDensity);
    const bullets = slide.polishedBullets ?? [];
    // 封面/结尾等版式不排要点：出现要点即告警
    if (b.bulletCount === 0 && bullets.length > 0) {
      warnings.push(`第 ${slide.pageNo} 页：${slide.pageType} 页不应有要点`);
    }
    if (bullets.length > b.bulletCount) {
      warnings.push(`第 ${slide.pageNo} 页：要点 ${bullets.length} 条超出预算 ${b.bulletCount} 条`);
    }
    for (const line of bullets) {
      if (line.length > b.bulletChars) {
        warnings.push(`第 ${slide.pageNo} 页：单条要点 ${line.length} 字超出预算 ${b.bulletChars} 字`);
        break; // 每页最多记一条单条超长警告
      }
    }
  }
  return warnings;
}

/**
 * plugin 定义 — content + theme → 构建 .pptx 并发布 artifact。
 * fitting 警告超过 2 处时返回 ok:false（携带逐条告警），触发工作流 retryTarget 回到大纲规划。
 */
export const pptxBuilderPlugin: PluginDefinition = {
  name: 'pptx-builder',
  version: '0.1.0',
  description: '依据美化内容与主题构建 .pptx 并发布 artifact',
  outputSchema: { name: 'generation-report' },
  sideEffect: 'repo-write',
  async execute(ctx: PluginContext, input: JsonObject): Promise<PluginResult> {
    // 上游内容与主题（工作流 JSON 边界处无类型保证，结构正确性由 plugin-runner 与上游合约保证）
    const content = (input.content ?? {}) as unknown as PptContent;
    const theme = (input.theme ?? {}) as unknown as PptTheme;
    // 1) 预算比对：警告 > 2 处 → 拒绝构建，逐条告警转为 validation issues
    const warnings = computeFitting(content, theme);
    if (warnings.length > FITTING_WARNING_LIMIT) {
      // 用 shared-types 的统一 ValidationIssue 形状（category/severity/message），前端与 run result 直接展示
      const issues: ValidationIssue[] = warnings.map((message) => ({
        category: 'rule',
        severity: 'high',
        message,
      }));
      return {
        ok: false,
        validation: { passed: false, issues },
      };
    }
    // 2) 构建二进制
    const buffer = await buildPptx(content, theme);
    // 3) 写入 run 目录（workspaceRoot/artifacts-ppt/<runId>.pptx）
    const outDir = path.join(ctx.workspaceRoot ?? process.cwd(), 'artifacts-ppt');
    await mkdir(outDir, { recursive: true });
    const outPath = path.join(outDir, `${ctx.runId}.pptx`);
    await writeFile(outPath, buffer);
    // 4) 发布 artifact
    const artifact = await ctx.artifacts.publish({
      kind: 'pptx',
      path: outPath,
      metadata: { pageCount: content.slides.length, sizeBytes: buffer.length },
    });
    return {
      ok: true,
      output: { ok: true, artifactId: artifact.id, path: outPath, pageCount: content.slides.length },
      artifacts: [artifact],
    };
  },
};
