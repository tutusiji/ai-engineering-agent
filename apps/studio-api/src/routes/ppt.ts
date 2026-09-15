/**
 * ppt — PPT 生成路由：主题列表 / 模板上传解析 / 模板删除 / 素材上传
 *
 * 挂载于 /api/ppt；requireAuth 已在 server.ts 的 /api 全局挂载，
 * 路由内 req.user 可用（Express Request 扩展见 middleware/auth.ts）。
 */

import express, { type Router } from 'express';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { ArtifactStore, PptTemplateStore } from '@ai-engineering-agent/persistence';
import { parseTemplate } from '@ai-engineering-agent/pptx-core';

/** /templates 与 /uploads 共用的请求体形状（字段来自用户输入，先做类型与非空校验再使用） */
interface UploadBody {
  name?: unknown;
  fileBase64?: unknown;
}

/** 创建 /api/ppt 路由 */
export function createPptRouter(): Router {
  const router = express.Router();
  const templateStore = new PptTemplateStore();
  const artifactStore = new ArtifactStore();

  // 预设主题 + 当前用户上传模板（theme JSON 本身即含色板预览数据）
  router.get('/themes', async (req, res) => {
    try {
      const userId = req.user?.id ?? null;
      const all = await templateStore.listByOwner(userId);
      res.json({
        builtin: all.filter((t) => t.source === 'builtin'),
        uploaded: all.filter((t) => t.source === 'uploaded'),
      });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // 上传模板：上传即解析，解析失败当场 400 不入库
  router.post('/templates', async (req, res) => {
    const { name, fileBase64 } = (req.body ?? {}) as UploadBody;
    if (typeof name !== 'string' || !name || typeof fileBase64 !== 'string' || !fileBase64 || !req.user) {
      return res.status(400).json({ error: '缺少 name、fileBase64 或未认证' });
    }
    // name 来自带认证的用户输入，basename 归一防路径穿越（与 runs.ts 遍历守卫同标准）
    const safeName = path.basename(name);
    if (!safeName) return res.status(400).json({ error: '非法的模板名称' });
    const tmpDir = mkdtempSync(path.join(tmpdir(), 'aiea-ppt-'));
    try {
      const filePath = path.join(tmpDir, 'template.pptx');
      writeFileSync(filePath, Buffer.from(fileBase64, 'base64'));
      const parsed = await parseTemplate(filePath); // 非 OOXML/加密 pptx 在此抛错
      // 模板资产（logo/背景图）落 ArtifactStore：runId='templates'，filePath=<templateId>/assets/<资产名>
      const templateId = randomUUID();
      const assetRelDir = `templates/${templateId}/assets`;
      for (const [assetName, buf] of Object.entries(parsed.assets)) {
        artifactStore.saveBinary('templates', `${templateId}/assets/${assetName}`, buf);
      }
      const row = await templateStore.create({
        ownerId: req.user.id, // ownerId 非空（req.user 已校验），否则 listByOwner 中不可见
        name: safeName,
        source: 'uploaded',
        theme: { ...parsed.theme, assetBasePath: `${artifactStore.getBaseDir()}/${assetRelDir}` },
        assetPaths: Object.fromEntries(Object.keys(parsed.assets).map((k) => [k, `${assetRelDir}/${k}`])),
      });
      res.json(row);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : '仅支持未加密的 .pptx 模板' });
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // 删除模板（仅本人 uploaded；builtin 拒删）
  router.delete('/templates/:id', async (req, res) => {
    try {
      const userId = req.user?.id ?? '';
      const row = await templateStore.get(req.params.id);
      if (!row) return res.status(404).json({ error: '模板不存在' });
      if (row.source === 'builtin' || row.ownerId !== userId) {
        return res.status(403).json({ error: '仅能删除本人上传的模板' });
      }
      await templateStore.delete(req.params.id, userId);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // 素材文件上传：落 ArtifactStore uploads/<uuid>/<name>，返回 file 来源 source 对象（工作流输入直接可用）
  router.post('/uploads', async (req, res) => {
    const { name, fileBase64 } = (req.body ?? {}) as UploadBody;
    if (typeof name !== 'string' || !name || typeof fileBase64 !== 'string' || !fileBase64) {
      return res.status(400).json({ error: '缺少 name 或 fileBase64' });
    }
    // name 来自带认证的用户输入，basename 归一防路径穿越
    const safeName = path.basename(name);
    if (!safeName) return res.status(400).json({ error: '非法的文件名' });
    try {
      const uploadId = randomUUID();
      const filePath = artifactStore.saveBinary(`uploads/${uploadId}`, safeName, Buffer.from(fileBase64, 'base64'));
      res.json({ source: { sourceType: 'file', filePath } });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  return router;
}
