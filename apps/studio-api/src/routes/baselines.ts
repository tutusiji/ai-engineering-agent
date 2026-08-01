/**
 * baselines — 视觉基线管理路由
 *
 * 管理 <targetProject>/artifacts/visual-baseline/ 下的基线截图：
 * - 列出基线（名称、大小、更新时间、关联截图/diff 是否存在）
 * - 查看基线图、最新截图、diff 图
 * - 用最新截图覆盖基线（更新基线）
 * - 删除基线（危险操作，前端需二次确认）
 *
 * 安全：文件名白名单校验（仅 [a-zA-Z0-9_-].png），防路径遍历。
 */

import { Router } from 'express';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { repoRoot } from '../lib/config.js';
import { validateQuery } from '../middleware/validate-request.js';
import { BaselineQuerySchema } from '../lib/validate.js';

/** 基线文件名白名单正则（防路径遍历） */
const BASELINE_NAME_RE = /^[a-zA-Z0-9_-]+\.png$/;

/** 解析目标项目目录（默认 repoRoot，query 传入的 project 需是绝对路径） */
function resolveProjectDir(project?: string): string {
  if (!project) return repoRoot;
  // 仅允许绝对路径，且必须包含 artifacts 子目录结构，避免任意路径探测
  if (!path.isAbsolute(project)) return repoRoot;
  return path.normalize(project);
}

/** 校验基线文件名，非法时返回 null */
function validateBaselineName(name: string): boolean {
  return BASELINE_NAME_RE.test(name) && !name.includes('..') && !name.includes('/') && !name.includes('\\');
}

export function createBaselinesRouter() {
  const router = Router();

  // ── 列出所有基线 ────────────────────────────────────────────
  router.get('/', validateQuery(BaselineQuerySchema), async (req, res) => {
    try {
      const projectDir = resolveProjectDir(String(req.query.project ?? ''));
      const baselineDir = path.join(projectDir, 'artifacts', 'visual-baseline');
      const screenshotDir = path.join(projectDir, 'artifacts', 'screenshots');

      let files: string[] = [];
      try {
        files = (await fs.readdir(baselineDir)).filter((f) => BASELINE_NAME_RE.test(f));
      } catch {
        files = []; // 目录不存在 → 空列表
      }

      const items = await Promise.all(
        files.map(async (name) => {
          const stat = await fs.stat(path.join(baselineDir, name));
          const screenshotExists = await fs
            .access(path.join(screenshotDir, name))
            .then(() => true)
            .catch(() => false);
          const diffExists = await fs
            .access(path.join(screenshotDir, name.replace(/\.png$/, '.diff.png')))
            .then(() => true)
            .catch(() => false);
          return {
            name,
            size: stat.size,
            updatedAt: stat.mtimeMs,
            hasScreenshot: screenshotExists,
            hasDiff: diffExists,
          };
        }),
      );

      items.sort((a, b) => b.updatedAt - a.updatedAt);
      res.json({ baselines: items, baselineDir, screenshotDir });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // ── 读取基线图片 ────────────────────────────────────────────
  router.get('/:name/image', validateQuery(BaselineQuerySchema), async (req, res) => {
    try {
      const name = req.params.name ?? '';
      if (!validateBaselineName(name)) return res.status(400).json({ error: 'Invalid baseline name' });

      const projectDir = resolveProjectDir(String(req.query.project ?? ''));
      const filePath = path.join(projectDir, 'artifacts', 'visual-baseline', name);

      const content = await fs.readFile(filePath);
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'no-cache');
      res.send(content);
    } catch {
      res.status(404).json({ error: 'Baseline not found' });
    }
  });

  // ── 读取最新截图 ────────────────────────────────────────────
  router.get('/:name/screenshot', validateQuery(BaselineQuerySchema), async (req, res) => {
    try {
      const name = req.params.name ?? '';
      if (!validateBaselineName(name)) return res.status(400).json({ error: 'Invalid baseline name' });

      const projectDir = resolveProjectDir(String(req.query.project ?? ''));
      const filePath = path.join(projectDir, 'artifacts', 'screenshots', name);

      const content = await fs.readFile(filePath);
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'no-cache');
      res.send(content);
    } catch {
      res.status(404).json({ error: 'Screenshot not found' });
    }
  });

  // ── 读取 diff 图 ────────────────────────────────────────────
  router.get('/:name/diff', validateQuery(BaselineQuerySchema), async (req, res) => {
    try {
      const name = req.params.name ?? '';
      if (!validateBaselineName(name)) return res.status(400).json({ error: 'Invalid baseline name' });

      const projectDir = resolveProjectDir(String(req.query.project ?? ''));
      const diffName = name.replace(/\.png$/, '.diff.png');
      const filePath = path.join(projectDir, 'artifacts', 'screenshots', diffName);

      const content = await fs.readFile(filePath);
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'no-cache');
      res.send(content);
    } catch {
      res.status(404).json({ error: 'Diff image not found' });
    }
  });

  // ── 更新基线：用最新截图覆盖基线 ────────────────────────────
  router.post('/:name/update', validateQuery(BaselineQuerySchema), async (req, res) => {
    try {
      const name = req.params.name ?? '';
      if (!validateBaselineName(name)) return res.status(400).json({ error: 'Invalid baseline name' });

      const projectDir = resolveProjectDir(String(req.query.project ?? ''));
      const baselinePath = path.join(projectDir, 'artifacts', 'visual-baseline', name);
      const screenshotPath = path.join(projectDir, 'artifacts', 'screenshots', name);

      // 最新截图必须存在
      await fs.access(screenshotPath);

      await fs.mkdir(path.dirname(baselinePath), { recursive: true });
      await fs.copyFile(screenshotPath, baselinePath);
      res.json({ ok: true, name, action: 'updated' });
    } catch (err) {
      res.status(500).json({ error: `Update failed: ${err instanceof Error ? err.message : String(err)}` });
    }
  });

  // ── 删除基线 ────────────────────────────────────────────────
  router.delete('/:name', validateQuery(BaselineQuerySchema), async (req, res) => {
    try {
      const name = req.params.name ?? '';
      if (!validateBaselineName(name)) return res.status(400).json({ error: 'Invalid baseline name' });

      const projectDir = resolveProjectDir(String(req.query.project ?? ''));
      const baselinePath = path.join(projectDir, 'artifacts', 'visual-baseline', name);

      await fs.unlink(baselinePath);
      res.json({ ok: true, name, action: 'deleted' });
    } catch (err) {
      res.status(500).json({ error: `Delete failed: ${err instanceof Error ? err.message : String(err)}` });
    }
  });

  return router;
}
