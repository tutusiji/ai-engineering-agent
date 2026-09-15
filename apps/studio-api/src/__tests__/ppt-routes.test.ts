/**
 * ppt-routes — /api/ppt 四端点路由测试
 *
 * 认证写法对齐 routing.test.ts：自建 express app + requireAuth + Bearer token；
 * 连接 localhost:5432 开发库（vitest.setup.ts 负责 initPool/closePool）。
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { PptTemplateStore } from '@ai-engineering-agent/persistence';
import { createPptRouter } from '../routes/ppt.js';
import { requireAuth, getJwtSecret } from '../middleware/auth.js';

const JWT_SECRET = getJwtSecret();

/** 签发测试用 JWT（与 middleware/auth 的 requireAuth 校验逻辑配套） */
function tokenFor(userId: string): string {
  return jwt.sign({ id: userId, username: userId }, JWT_SECRET, { expiresIn: '1h' });
}

describe('ppt routes', () => {
  let app: express.Express;
  const templateStore = new PptTemplateStore();
  // 测试用用户 id（owner_id 为 TEXT 无外键，测试结束清理其名下行）
  const userA = 'ppt-routes-user-a';
  const userB = 'ppt-routes-user-b';
  // 测试期间创建的模板行 id（按归属人记录，afterAll 清理）
  const createdIds: Array<{ id: string; ownerId: string }> = [];
  // 测试期间落盘的上传目录（afterAll 清理）
  const createdDirs: string[] = [];

  beforeAll(() => {
    app = express();
    app.use(express.json());
    // Apply auth middleware like server.ts does
    app.use('/api', requireAuth);
    app.use('/api/ppt', createPptRouter());
  });

  afterAll(async () => {
    for (const { id, ownerId } of createdIds) {
      await templateStore.delete(id, ownerId);
    }
    for (const dir of createdDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('GET /themes 返回 3 套 builtin 主题（含色板）', async () => {
    const res = await request(app)
      .get('/api/ppt/themes')
      .set('Authorization', `Bearer ${tokenFor(userA)}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.builtin)).toBe(true);
    const builtinIds = res.body.builtin.map((t: { id: string }) => t.id);
    for (const id of ['theme-business-blue', 'theme-tech-dark', 'theme-minimal-light']) {
      expect(builtinIds).toContain(id);
    }
    for (const t of res.body.builtin) {
      expect(t.source).toBe('builtin');
      // theme JSON 即色板预览数据
      expect(typeof t.theme.colors.primary).toBe('string');
    }
  });

  it('GET /themes 不含他人 uploaded 模板', async () => {
    const row = await templateStore.create({
      ownerId: userB,
      name: 'B 的私有模板',
      source: 'uploaded',
      theme: { name: 'b-private' },
    });
    createdIds.push({ id: row.id, ownerId: userB });
    const res = await request(app)
      .get('/api/ppt/themes')
      .set('Authorization', `Bearer ${tokenFor(userA)}`);
    expect(res.status).toBe(200);
    const uploadedIds = res.body.uploaded.map((t: { id: string }) => t.id);
    expect(uploadedIds).not.toContain(row.id);
  });

  it('DELETE /templates/:id 不存在 → 404', async () => {
    const res = await request(app)
      .delete('/api/ppt/templates/ppt-routes-no-such-template')
      .set('Authorization', `Bearer ${tokenFor(userA)}`);
    expect(res.status).toBe(404);
  });

  it('DELETE builtin 模板 → 403 且未被删除', async () => {
    const res = await request(app)
      .delete('/api/ppt/templates/theme-tech-dark')
      .set('Authorization', `Bearer ${tokenFor(userA)}`);
    expect(res.status).toBe(403);
    // builtin 拒删：行仍存在
    expect(await templateStore.get('theme-tech-dark')).toBeDefined();
  });

  it('DELETE 他人 uploaded 模板 → 403 且未被删除', async () => {
    const row = await templateStore.create({
      ownerId: userB,
      name: 'B 的模板',
      source: 'uploaded',
      theme: { name: 'b-row' },
    });
    createdIds.push({ id: row.id, ownerId: userB });
    const res = await request(app)
      .delete(`/api/ppt/templates/${row.id}`)
      .set('Authorization', `Bearer ${tokenFor(userA)}`);
    expect(res.status).toBe(403);
    expect(await templateStore.get(row.id)).toBeDefined();
  });

  it('DELETE 本人 uploaded 模板 → 200 且删除成功', async () => {
    const row = await templateStore.create({
      ownerId: userA,
      name: 'A 的模板',
      source: 'uploaded',
      theme: { name: 'a-row' },
    });
    const res = await request(app)
      .delete(`/api/ppt/templates/${row.id}`)
      .set('Authorization', `Bearer ${tokenFor(userA)}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(await templateStore.get(row.id)).toBeUndefined();
  });

  it('POST /templates 非法 base64（非 pptx）→ 400 且不入库', async () => {
    const before = (await templateStore.listByOwner(userA)).filter((t) => t.source === 'uploaded').length;
    const res = await request(app)
      .post('/api/ppt/templates')
      .set('Authorization', `Bearer ${tokenFor(userA)}`)
      .send({ name: '坏模板', fileBase64: Buffer.from('this is not a pptx file').toString('base64') });
    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe('string');
    const after = (await templateStore.listByOwner(userA)).filter((t) => t.source === 'uploaded').length;
    expect(after).toBe(before);
  });

  it('POST /templates 缺少字段 → 400', async () => {
    const res = await request(app)
      .post('/api/ppt/templates')
      .set('Authorization', `Bearer ${tokenFor(userA)}`)
      .send({ name: '只有名字' });
    expect(res.status).toBe(400);
  });

  it('POST /uploads 素材落盘可读（往返）', async () => {
    const content = Buffer.from('hello uploads 素材内容');
    const res = await request(app)
      .post('/api/ppt/uploads')
      .set('Authorization', `Bearer ${tokenFor(userA)}`)
      .send({ name: '素材.txt', fileBase64: content.toString('base64') });
    expect(res.status).toBe(200);
    expect(res.body.source.sourceType).toBe('file');
    const filePath: string = res.body.source.filePath;
    expect(readFileSync(filePath)).toEqual(content);
    // 落盘位置应为 uploads/<uuid>/<name>
    expect(filePath.split(path.sep).slice(-3, -2)[0]).toBe('uploads');
    createdDirs.push(path.dirname(filePath));
  });

  it('POST /uploads name 带路径穿越 → basename 归一', async () => {
    const res = await request(app)
      .post('/api/ppt/uploads')
      .set('Authorization', `Bearer ${tokenFor(userA)}`)
      .send({ name: '../../ppt-routes-evil.txt', fileBase64: Buffer.from('x').toString('base64') });
    expect(res.status).toBe(200);
    const filePath: string = res.body.source.filePath;
    // 归一后文件名不带 ..，且仍在 uploads/ 目录内
    expect(path.basename(filePath)).toBe('ppt-routes-evil.txt');
    expect(filePath.split(path.sep).slice(-3, -2)[0]).toBe('uploads');
    createdDirs.push(path.dirname(filePath));
  });

  it('POST /uploads name 归一后为空 → 400', async () => {
    const res = await request(app)
      .post('/api/ppt/uploads')
      .set('Authorization', `Bearer ${tokenFor(userA)}`)
      .send({ name: '/', fileBase64: Buffer.from('x').toString('base64') });
    expect(res.status).toBe(400);
  });
});
