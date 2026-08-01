/**
 * baselines — 视觉基线管理路由集成测试
 *
 * 验证：
 * 1. 列出基线（含截图/diff 关联标记）
 * 2. 读取基线图 / 最新截图 / diff 图
 * 3. 用最新截图更新基线
 * 4. 删除基线
 * 5. 非法文件名被拒绝（防路径遍历）
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createBaselinesRouter } from '../routes/baselines.js';

/** 生成一个最小合法 PNG 文件（PNG 魔数 + 任意数据） */
async function writePng(filePath: string): Promise<void> {
  // 1x1 透明 PNG
  const png = Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63fcffff3f030005fe02fea73f4d470000000049454e44ae426082',
    'hex',
  );
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, png);
}

describe('baselines endpoints', () => {
  let app: express.Express;
  let projectDir: string;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/baselines', createBaselinesRouter());

    // 构造临时项目目录与基线产物
    projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'baselines-test-'));
    const baselineDir = path.join(projectDir, 'artifacts', 'visual-baseline');
    const screenshotDir = path.join(projectDir, 'artifacts', 'screenshots');
    await writePng(path.join(baselineDir, 'home.png'));
    await writePng(path.join(screenshotDir, 'home.png'));
    await writePng(path.join(screenshotDir, 'home.diff.png'));
    await writePng(path.join(baselineDir, 'login.png'));
  });

  afterAll(async () => {
    await fs.rm(projectDir, { recursive: true, force: true });
  });

  it('列出基线并标记截图/diff 关联', async () => {
    const res = await request(app).get('/api/baselines').query({ project: projectDir });
    expect(res.status).toBe(200);
    expect(res.body.baselineDir).toContain('visual-baseline');
    const names = (res.body.baselines as Array<{ name: string }>).map((b) => b.name);
    expect(names).toContain('home.png');
    expect(names).toContain('login.png');

    const home = (res.body.baselines as Array<{ name: string; hasScreenshot: boolean; hasDiff: boolean }>).find(
      (b) => b.name === 'home.png',
    );
    expect(home?.hasScreenshot).toBe(true);
    expect(home?.hasDiff).toBe(true);

    const login = (res.body.baselines as Array<{ name: string; hasScreenshot: boolean; hasDiff: boolean }>).find(
      (b) => b.name === 'login.png',
    );
    expect(login?.hasScreenshot).toBe(false);
    expect(login?.hasDiff).toBe(false);
  });

  it('读取基线图 / 截图 / diff 图', async () => {
    const image = await request(app).get('/api/baselines/home.png/image').query({ project: projectDir });
    expect(image.status).toBe(200);
    expect(image.headers['content-type']).toContain('image/png');

    const shot = await request(app).get('/api/baselines/home.png/screenshot').query({ project: projectDir });
    expect(shot.status).toBe(200);

    const diff = await request(app).get('/api/baselines/home.png/diff').query({ project: projectDir });
    expect(diff.status).toBe(200);
  });

  it('缺失图片返回 404', async () => {
    const res = await request(app).get('/api/baselines/nonexist.png/image').query({ project: projectDir });
    expect(res.status).toBe(404);
  });

  it('非法文件名被拒绝（防路径遍历）', async () => {
    const traversal = await request(app)
      .get('/api/baselines/..%2F..%2Fetc%2Fpasswd.png/image')
      .query({ project: projectDir });
    expect(traversal.status).toBe(400);

    const badName = await request(app).get('/api/baselines/%2e%2e%2fsecret.png/image').query({ project: projectDir });
    expect(badName.status).toBe(400);
  });

  it('用最新截图更新基线', async () => {
    // 先改截图内容，确保覆盖生效
    const screenshotPath = path.join(projectDir, 'artifacts', 'screenshots', 'home.png');
    await fs.writeFile(screenshotPath, Buffer.from('new-screenshot-data'));

    const res = await request(app).post('/api/baselines/home.png/update').query({ project: projectDir });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const baselineContent = await fs.readFile(path.join(projectDir, 'artifacts', 'visual-baseline', 'home.png'));
    expect(baselineContent.toString()).toBe('new-screenshot-data');
  });

  it('删除基线', async () => {
    const res = await request(app).delete('/api/baselines/login.png').query({ project: projectDir });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const check = await request(app).get('/api/baselines').query({ project: projectDir });
    const names = (check.body.baselines as Array<{ name: string }>).map((b) => b.name);
    expect(names).not.toContain('login.png');
  });
});
