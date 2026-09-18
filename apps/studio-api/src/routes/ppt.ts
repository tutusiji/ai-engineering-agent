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
import { parseTemplate, type ParsedTemplate } from '@ai-engineering-agent/pptx-core';

/** /templates 与 /uploads 共用的请求体形状（字段来自用户输入，先做类型与非空校验再使用） */
interface UploadBody {
  name?: unknown;
  fileBase64?: unknown;
}

/**
 * 文件名清洗 — basename 归一后拒绝空名与路径段（'.'/'..'）
 * @param name 用户输入的原始文件名
 * @returns 清洗后的安全文件名；非法时返回空串
 */
function sanitizeFileName(name: string): string {
  const base = path.basename(name);
  if (!base || base === '.' || base === '..') return '';
  return base;
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
      // 500 通用文案防内部错误泄露，原始错误仅记录到服务端日志
      console.error('获取主题列表失败:', err);
      res.status(500).json({ error: '主题列表加载失败，请稍后重试' });
    }
  });

  // 模板资产读取（主题卡片封面预览等）：单文件名清洗 + 归属校验；
  // builtin 全员可读，uploaded 仅本人可读
  router.get('/themes/:id/assets/:name', async (req, res) => {
    try {
      const row = await templateStore.get(req.params.id);
      if (!row) return res.status(404).json({ error: '模板不存在' });
      if (row.source === 'uploaded' && row.ownerId !== req.user?.id) {
        return res.status(403).json({ error: '无权访问该模板资产' });
      }
      // 资产名按单段文件名清洗（basename 归一 + 拒绝 '.'/'..'），配合 readBinary 的固定
      // 前缀 templates/<id>/assets/ 双重防穿越
      const name = sanitizeFileName(req.params.name);
      if (!name || !path.extname(name)) {
        return res.status(400).json({ error: '非法的资产名' });
      }
      const buf = artifactStore.readBinary('templates', `${row.id}/assets/${name}`);
      if (!buf) return res.status(404).json({ error: '资产不存在' });
      const mimeByExt: Record<string, string> = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.bmp': 'image/bmp',
      };
      res.setHeader('Content-Type', mimeByExt[path.extname(name).toLowerCase()] ?? 'application/octet-stream');
      // 资产内容不可变（删除模板即清理目录），允许浏览器短缓存
      res.setHeader('Cache-Control', 'private, max-age=3600');
      res.send(buf);
    } catch (err) {
      // 500 通用文案防内部错误泄露，原始错误仅记录到服务端日志
      console.error('读取模板资产失败:', err);
      res.status(500).json({ error: '模板资产读取失败，请稍后重试' });
    }
  });

  // 上传模板：上传即解析（失败 400 不入库）；资产落盘/入库失败返回 500（不透出内部错误）
  router.post('/templates', async (req, res) => {
    const { name, fileBase64 } = (req.body ?? {}) as UploadBody;
    if (typeof name !== 'string' || !name || typeof fileBase64 !== 'string' || !fileBase64 || !req.user) {
      return res.status(400).json({ error: '缺少 name、fileBase64 或未认证' });
    }
    // name 来自带认证的用户输入，basename 归一 + 路径段拒绝（'..' 会经 saveBinary 的 join 逃逸到父目录）
    const safeName = sanitizeFileName(name);
    if (!safeName) return res.status(400).json({ error: '非法的模板名称' });
    const tmpDir = mkdtempSync(path.join(tmpdir(), 'aiea-ppt-'));
    try {
      // ── 第一段：解析。失败属客户端输入问题（非 OOXML/加密 pptx），返回 400 不入库 ──
      const filePath = path.join(tmpDir, 'template.pptx');
      writeFileSync(filePath, Buffer.from(fileBase64, 'base64'));
      let parsed: ParsedTemplate;
      try {
        parsed = await parseTemplate(filePath);
      } catch (err) {
        return res.status(400).json({ error: err instanceof Error ? err.message : '仅支持未加密的 .pptx 模板' });
      }

      // ── 第二段：资产落盘 + 入库。失败属服务端问题，返回 500 通用文案 ──
      const templateId = randomUUID();
      const assetRelDir = `templates/${templateId}/assets`;
      try {
        // 模板资产（logo/背景图）落 ArtifactStore：runId='templates'，filePath=<templateId>/assets/<资产名>
        for (const [assetName, buf] of Object.entries(parsed.assets)) {
          artifactStore.saveBinary('templates', `${templateId}/assets/${assetName}`, buf);
        }
        const row = await templateStore.create({
          // theme.name 覆盖 — parseTemplate 取的是临时文件名（恒为 'template'），必须用上传文件名重建，
          // 否则所有上传模板在主题选择器里同名不可区分，且污染 LLM prompt 中的主题描述。
          // assetBasePath 不入库（合约约定为运行时注入字段）：绝对路径会经 GET /themes 下发浏览器
          // 并被 JSON.stringify 进 LLM prompt；构建时由 plugin-runner 按 themeId 从 assetPaths 解析
          theme: {
            ...parsed.theme,
            name: safeName.replace(/\.pptx$/i, '') || '我的模板',
          },
          ownerId: req.user.id, // ownerId 非空（req.user 已校验），否则 listByOwner 中不可见
          name: safeName,
          source: 'uploaded',
          assetPaths: Object.fromEntries(Object.keys(parsed.assets).map((k) => [k, `${assetRelDir}/${k}`])),
        });
        res.json(row);
      } catch {
        // 入库失败时清理已落盘资产，避免孤儿目录（templates/<templateId>/）
        rmSync(path.join(artifactStore.getBaseDir(), 'templates', templateId), { recursive: true, force: true });
        res.status(500).json({ error: '模板保存失败，请稍后重试' });
      }
    } catch {
      // 临时文件写入等意外失败：同样按服务端错误处理
      res.status(500).json({ error: '模板保存失败，请稍后重试' });
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
      // 清理该模板的资产目录（templates/<templateId>/），防止 ArtifactStore 中遗留孤儿目录
      try {
        rmSync(path.join(artifactStore.getBaseDir(), 'templates', req.params.id), { recursive: true, force: true });
      } catch (cleanupErr) {
        // 资产清理失败不应让已成功的删除回滚为 500，仅记录告警
        console.warn(`清理模板资产目录失败（templateId=${req.params.id}）:`, cleanupErr);
      }
      res.json({ ok: true });
    } catch (err) {
      // 500 通用文案防内部错误泄露，原始错误仅记录到服务端日志
      console.error('删除模板失败:', err);
      res.status(500).json({ error: '模板删除失败，请稍后重试' });
    }
  });

  // 素材文件上传：落 ArtifactStore uploads/<uuid>/<name>，返回 file 来源 source 对象（工作流输入直接可用）
  router.post('/uploads', async (req, res) => {
    const { name, fileBase64 } = (req.body ?? {}) as UploadBody;
    if (typeof name !== 'string' || !name || typeof fileBase64 !== 'string' || !fileBase64 || !req.user) {
      return res.status(400).json({ error: '缺少 name、fileBase64 或未认证' });
    }
    // name 来自带上传接口的用户输入，basename 归一 + 路径段拒绝
    const safeName = sanitizeFileName(name);
    if (!safeName) return res.status(400).json({ error: '非法的文件名' });
    try {
      const uploadId = randomUUID();
      const filePath = artifactStore.saveBinary(`uploads/${uploadId}`, safeName, Buffer.from(fileBase64, 'base64'));
      res.json({ source: { sourceType: 'file', filePath } });
    } catch (err) {
      // 500 通用文案防内部错误泄露，原始错误仅记录到服务端日志
      console.error('素材上传失败:', err);
      res.status(500).json({ error: '素材上传失败，请稍后重试' });
    }
  });

  return router;
}
