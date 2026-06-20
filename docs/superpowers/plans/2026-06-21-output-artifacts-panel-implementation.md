# 输出产物面板实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Studio 右侧边栏顶部新增一个固定的输出产物面板，汇总当前 Session 的可下载产物并提供单文件/批量下载能力。

**Architecture:** 前端根据当前状态即时生成 `.md`/`.html` 等文本产物，后端用 `jszip` 打包 `design`/`code` 产物；Session document 记录产物 run 关联，新增 `/api/sessions/:id/artifacts` 系列接口统一暴露。

**Tech Stack:** React 19 + TypeScript + Tailwind CSS + HeroUI（前端）；Express + TypeScript + jszip（后端）；PostgreSQL + 文件系统 ArtifactStore（存储）。

## Global Constraints

- 产物数据围绕当前 `sessionId` 组织，切换 Session 自动刷新。
- 简单文本产物由前端即时生成；`.zip` 打包由后端完成。
- 旧 Session 无产物记录时仍展示前端可派生的基础产物。
- 产物列表排序：category 固定顺序（`requirement` → `architecture` → `design` → `code` → `intermediate`），同 category 内按 `updatedAt` 倒序。
- 架构设计 `.md` 首期与需求文档合并展示，统一归类为 `requirement`。

---

## File Structure

| 文件 | 职责 |
|------|------|
| `packages/shared-types/src/index.ts` | 新增 `ArtifactCategory`、`ArtifactSource`、`ArtifactItem`、`SessionArtifactRun` 等共享类型 |
| `packages/persistence/src/sessions.ts` | 扩展 `Session` 类型，新增 `addArtifactRun` 方法 |
| `apps/studio-api/package.json` | 新增 `jszip` 依赖 |
| `apps/studio-api/src/artifact-service.ts` | 新建：产物元数据构建、zip 打包、下载响应辅助函数 |
| `apps/studio-api/src/server.ts` | 新增 `/api/sessions/:id/artifacts` 与 `/download`，并在 `/generate/design` 和 `/generate/code` 中记录产物 run |
| `apps/studio-web/src/hooks/useArtifacts.ts` | 新建：合并 session-state 产物 + 拉取后端产物 + 下载逻辑 |
| `apps/studio-web/src/components/ArtifactsPanel.tsx` | 新建：产物面板 UI |
| `apps/studio-web/src/App.tsx` | 在右侧边栏顶部集成 `ArtifactsPanel` |
| `apps/studio-web/vitest.config.ts` | 新增 Vitest 配置 |
| `apps/studio-web/package.json` | 新增 Vitest 与 testing-library 依赖 |
| `apps/studio-web/src/hooks/__tests__/useArtifacts.test.ts` | 测试 `useArtifacts` |
| `apps/studio-web/src/components/__tests__/ArtifactsPanel.test.tsx` | 测试 `ArtifactsPanel` |

---

### Task 1: 设置 Vitest 测试基础设施

**Files:**
- Create: `apps/studio-web/vitest.config.ts`
- Create: `apps/studio-web/src/test/setup.ts`
- Modify: `apps/studio-web/package.json`
- Test: `apps/studio-web/src/components/__tests__/Smoke.test.tsx`

**Interfaces:**
- Consumes: 无
- Produces: `pnpm test` 命令可运行 Vitest

- [ ] **Step 1: 安装依赖**

在 `apps/studio-web` 目录下运行：

```bash
pnpm add -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom @testing-library/dom
```

- [ ] **Step 2: 新增 test 脚本**

修改 `apps/studio-web/package.json`：

```json
{
  "scripts": {
    "dev": "vite --port 4400",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest"
  }
}
```

- [ ] **Step 3: 创建 Vitest 配置**

创建 `apps/studio-web/vitest.config.ts`：

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
});
```

- [ ] **Step 4: 创建测试 setup 文件**

创建 `apps/studio-web/src/test/setup.ts`：

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 5: 编写并运行冒烟测试**

创建 `apps/studio-web/src/components/__tests__/Smoke.test.tsx`：

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

describe('vitest setup', () => {
  it('renders a simple component', () => {
    render(<div data-testid="smoke">ok</div>);
    expect(screen.getByTestId('smoke')).toHaveTextContent('ok');
  });
});
```

运行：

```bash
cd apps/studio-web && pnpm test -- --run
```

Expected: 1 test passes.

- [ ] **Step 6: Commit**

```bash
git add apps/studio-web/package.json apps/studio-web/vitest.config.ts apps/studio-web/src/test/setup.ts apps/studio-web/src/components/__tests__/Smoke.test.tsx pnpm-lock.yaml
git commit -m "chore(studio-web): add Vitest and testing-library setup

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: 新增共享产物类型

**Files:**
- Modify: `packages/shared-types/src/index.ts`
- Test: `apps/studio-web/src/hooks/__tests__/artifact-types.test.ts`

**Interfaces:**
- Consumes: 无
- Produces: `ArtifactCategory`, `ArtifactSource`, `ArtifactItem`, `SessionArtifactRun`

- [ ] **Step 1: 编写类型测试**

创建 `apps/studio-web/src/hooks/__tests__/artifact-types.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import type { ArtifactItem, SessionArtifactRun } from '@ai-frontend-engineering-agent/shared-types';

describe('artifact types compile', () => {
  it('accepts a valid artifact item', () => {
    const item: ArtifactItem = {
      id: 'req-md',
      category: 'requirement',
      label: '需求文档.md',
      size: 1024,
      updatedAt: Date.now(),
      source: 'session-state',
      content: '# title',
    };
    expect(item.id).toBe('req-md');
  });

  it('accepts a valid artifact run', () => {
    const run: SessionArtifactRun = {
      runId: 'design-abc',
      type: 'design',
      createdAt: Date.now(),
    };
    expect(run.type).toBe('design');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd apps/studio-web && pnpm test -- --run artifact-types
```

Expected: FAIL，类型未定义或测试文件编译错误。

- [ ] **Step 3: 在 shared-types 中添加类型**

修改 `packages/shared-types/src/index.ts`，追加：

```ts
export type ArtifactCategory =
  | 'requirement'
  | 'architecture'
  | 'design'
  | 'code'
  | 'intermediate';

export type ArtifactSource = 'session-state' | 'artifact-run';

export interface ArtifactItem {
  id: string;
  category: ArtifactCategory;
  label: string;
  size?: number;
  updatedAt: number;
  source: ArtifactSource;
  downloadUrl?: string;
  content?: string;
}

export interface SessionArtifactRun {
  runId: string;
  type: 'design' | 'code' | 'workflow';
  createdAt: number;
  label?: string;
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd apps/studio-web && pnpm test -- --run artifact-types
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared-types/src/index.ts apps/studio-web/src/hooks/__tests__/artifact-types.test.ts
git commit -m "feat(shared-types): add artifact item and session artifact run types

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: 扩展 SessionStore 支持产物 Run 记录

**Files:**
- Modify: `packages/persistence/src/sessions.ts`
- Modify: `packages/persistence/src/index.ts`
- Test: `packages/persistence/src/__tests__/sessions.test.ts`

**Interfaces:**
- Consumes: `SessionArtifactRun` from shared-types
- Produces: `SessionStore.addArtifactRun(sessionId, run)` 方法；`Session` 类型包含 `document._artifactRuns`

> **Note:** `packages/persistence` 的测试需要本地 PostgreSQL 运行（`DATABASE_URL` 或默认 `postgresql://studio:studio2026@localhost:5432/studio`）。执行前请确认数据库可用。

- [ ] **Step 1: 安装 persistence 测试依赖**

在 `packages/persistence` 目录下运行：

```bash
pnpm add -D vitest @types/node
```

并在 `packages/persistence/package.json` 的 `scripts` 中新增：

```json
{
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest"
  }
}
```

创建 `packages/persistence/vitest.config.ts`：

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
  },
});
```

- [ ] **Step 2: 编写失败测试**

创建 `packages/persistence/src/__tests__/sessions.test.ts`：

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SessionStore, initPool, closePool } from '../index.js';

describe('SessionStore.addArtifactRun', () => {
  beforeAll(async () => {
    initPool();
  });

  afterAll(async () => {
    await closePool();
  });

  it('records an artifact run in session document', async () => {
    const store = new SessionStore();
    const session = await store.create('test-session-add-run');
    await store.addArtifactRun(session.id, {
      runId: 'design-123',
      type: 'design',
      createdAt: Date.now(),
    });

    const updated = await store.get(session.id);
    const runs = (updated?.document?._artifactRuns ?? []) as Array<{ runId: string; type: string }>;
    expect(runs).toHaveLength(1);
    expect(runs[0].runId).toBe('design-123');
    expect(runs[0].type).toBe('design');
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

```bash
cd packages/persistence && pnpm test -- --run
```

Expected: FAIL，`addArtifactRun` 不存在。

- [ ] **Step 4: 实现 addArtifactRun**

修改 `packages/persistence/src/sessions.ts`：

1. 在文件顶部新增导入：

```ts
import type { SessionArtifactRun } from '@ai-frontend-engineering-agent/shared-types';
```

2. 在 `SessionStore` 类中添加方法：

```ts
async addArtifactRun(id: string, run: SessionArtifactRun): Promise<Session | undefined> {
  const session = await this.get(id);
  if (!session) return undefined;
  const doc = session.document ?? {};
  const runs = (doc._artifactRuns as SessionArtifactRun[] | undefined) ?? [];
  runs.push(run);
  doc._artifactRuns = runs;
  return this.updateDocument(id, doc, session.completeness);
}
```

3. 导出 `SessionArtifactRun` 类型（通过 index.ts 已自动暴露 shared-types 类型，无需额外导出）。

- [ ] **Step 5: 运行测试确认通过**

```bash
cd packages/persistence && pnpm test -- --run
```

Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add packages/persistence/src/sessions.ts packages/persistence/src/__tests__/sessions.test.ts packages/persistence/package.json packages/persistence/vitest.config.ts pnpm-lock.yaml
git commit -m "feat(persistence): add SessionStore.addArtifactRun to track artifact runs

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: 后端产物服务与 zip 打包

**Files:**
- Create: `apps/studio-api/src/artifact-service.ts`
- Modify: `apps/studio-api/package.json`
- Test: `apps/studio-api/src/__tests__/artifact-service.test.ts`

**Interfaces:**
- Consumes: `ArtifactItem`, `SessionArtifactRun` from shared-types；`ArtifactStore`
- Produces: `buildSessionArtifacts(session, artifactStore)`, `buildArtifactZip(session, artifactStore, ids)`, `sendArtifactResponse(res, session, artifactStore, id)`

- [ ] **Step 1: 安装 jszip 和测试依赖**

在 `apps/studio-api` 目录下运行：

```bash
pnpm add jszip
pnpm add -D vitest @types/node
```

在 `apps/studio-api/package.json` 的 `scripts` 中新增：

```json
{
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "start": "tsx src/server.ts",
    "test": "vitest"
  }
}
```

创建 `apps/studio-api/vitest.config.ts`：

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
  },
});
```

- [ ] **Step 2: 编写失败测试**

创建 `apps/studio-api/src/__tests__/artifact-service.test.ts`：

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ArtifactStore } from '@ai-frontend-engineering-agent/persistence';
import { buildSessionArtifacts } from '../artifact-service.js';

describe('buildSessionArtifacts', () => {
  let baseDir: string;
  let store: ArtifactStore;

  beforeEach(() => {
    baseDir = join(tmpdir(), `artifact-test-${Date.now()}`);
    mkdirSync(baseDir, { recursive: true });
    store = new ArtifactStore(baseDir);
  });

  afterEach(() => {
    rmSync(baseDir, { recursive: true, force: true });
  });

  it('builds session-state artifacts from document and designHtml', () => {
    const session = {
      id: 's1',
      name: 'test',
      messages: [],
      completeness: 0,
      pinned: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      document: {
        featureName: '登录',
        businessGoal: '支持用户登录',
        completeness: 60,
      },
    };

    const artifacts = buildSessionArtifacts(session as any, 's1', store, '<html></html>');
    expect(artifacts.some(a => a.id === 'req-md' && a.category === 'requirement')).toBe(true);
    expect(artifacts.some(a => a.id === 'design-html' && a.category === 'design')).toBe(true);
  });

  it('includes artifact-run items from _artifactRuns', () => {
    store.save('design-123', 'index.html', '<html></html>');
    const session = {
      id: 's1',
      name: 'test',
      messages: [],
      completeness: 0,
      pinned: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      document: {
        _artifactRuns: [{ runId: 'design-123', type: 'design', createdAt: Date.now() }],
      },
    };

    const artifacts = buildSessionArtifacts(session as any, 's1', store, null);
    expect(artifacts.some(a => a.id === 'design-zip:design-123' && a.category === 'design')).toBe(true);
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

```bash
cd apps/studio-api && pnpm test -- --run artifact-service
```

Expected: FAIL，`artifact-service.js` 不存在。

- [ ] **Step 4: 实现 artifact-service.ts**

创建 `apps/studio-api/src/artifact-service.ts`：

```ts
import type { Response } from 'express';
import JSZip from 'jszip';
import type { ArtifactItem, SessionArtifactRun } from '@ai-frontend-engineering-agent/shared-types';
import type { ArtifactStore } from '@ai-frontend-engineering-agent/persistence';
import type { Session } from '@ai-frontend-engineering-agent/persistence';

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

  // Session-state: design html
  if (designHtml) {
    artifacts.push({
      id: 'design-html',
      category: 'design',
      label: 'UI预览.html',
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
  if (id === 'design-html') {
    if (!designHtml) throw new Error('design-html not available');
    zip.file('UI预览.html', designHtml);
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
  if (id === 'design-html') {
    if (!designHtml) throw new Error('design-html not available');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="UI预览.html"');
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
```

- [ ] **Step 5: 运行测试确认通过**

```bash
cd apps/studio-api && pnpm test -- --run artifact-service
```

Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add apps/studio-api/src/artifact-service.ts apps/studio-api/src/__tests__/artifact-service.test.ts apps/studio-api/package.json apps/studio-api/vitest.config.ts pnpm-lock.yaml
git commit -m "feat(studio-api): add artifact service for listing and zip packaging

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: 新增后端 Session 产物接口

**Files:**
- Modify: `apps/studio-api/src/server.ts`
- Test: `apps/studio-api/src/__tests__/server-artifacts.test.ts`

**Interfaces:**
- Consumes: `buildSessionArtifacts`, `buildArtifactZip`, `sendArtifactResponse` from `artifact-service.js`
- Produces: `GET /api/sessions/:id/artifacts`, `GET /api/sessions/:id/artifacts/download`

- [ ] **Step 1: 导入 artifact service**

在 `apps/studio-api/src/server.ts` 顶部新增：

```ts
import { buildSessionArtifacts, buildArtifactZip, sendArtifactResponse } from './artifact-service.js';
```

- [ ] **Step 2: 在 generate/design 中保存 designHtml 到 session document**

找到 `/api/generate/design` 处理逻辑中保存 `_designVersions` 的代码块，在更新 session document 时把当前 HTML 也写入 `_activeDesignHtml`：

```ts
await sessionStore.update(sessionId, {
  ...session,
  document: {
    ...doc,
    _designVersions: versions,
    _activeDesignId: versionId,
    _activeDesignHtml: htmlFile?.content ?? null,
  },
});
```

- [ ] **Step 3: 新增产物接口**

在 `apps/studio-api/src/server.ts` 的 Artifact endpoints 区域新增：

```ts
// GET /api/sessions/:id/artifacts
app.get('/api/sessions/:id/artifacts', async (req, res) => {
  const session = await sessionStore.get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const doc = (session.document ?? {}) as Record<string, unknown>;
  const designHtml = (doc._activeDesignHtml as string | null) ?? null;
  const artifacts = buildSessionArtifacts(session, req.params.id, artifactStore, designHtml);
  res.json({ artifacts });
});

// GET /api/sessions/:id/artifacts/download
app.get('/api/sessions/:id/artifacts/download', async (req, res) => {
  const session = await sessionStore.get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const { id, ids } = req.query as { id?: string; ids?: string };
  const requestedIds = ids ? ids.split(',').filter(Boolean) : id ? [id] : [];
  if (requestedIds.length === 0) {
    return res.status(400).json({ error: 'id or ids required' });
  }

  const doc = (session.document ?? {}) as Record<string, unknown>;
  const designHtml = (doc._activeDesignHtml as string | null) ?? null;

  try {
    if (requestedIds.length === 1) {
      await sendArtifactResponse(res, session, artifactStore, designHtml, requestedIds[0]);
      return;
    }

    const buffer = await buildArtifactZip(session, artifactStore, designHtml, requestedIds);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="session-${req.params.id}-artifacts.zip"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
```

- [ ] **Step 4: 添加接口冒烟测试**

创建 `apps/studio-api/src/__tests__/server-artifacts.test.ts`：

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { SessionStore, ArtifactStore, initPool, closePool } from '@ai-frontend-engineering-agent/persistence';
import { buildSessionArtifacts, sendArtifactResponse } from '../artifact-service.js';

describe('session artifact endpoints', () => {
  let app: express.Express;

  beforeAll(() => {
    initPool();
    app = express();
    const sessionStore = new SessionStore();
    const artifactStore = new ArtifactStore();

    app.get('/api/sessions/:id/artifacts', async (req, res) => {
      const session = await sessionStore.get(req.params.id);
      if (!session) return res.status(404).json({ error: 'Session not found' });
      const doc = session.document ?? {};
      const designHtml = (doc._activeDesignHtml as string | null) ?? null;
      res.json({ artifacts: buildSessionArtifacts(session, req.params.id, artifactStore, designHtml) });
    });

    app.get('/api/sessions/:id/artifacts/download', async (req, res) => {
      const session = await sessionStore.get(req.params.id);
      if (!session) return res.status(404).json({ error: 'Session not found' });
      const id = (req.query.id as string) ?? '';
      const doc = session.document ?? {};
      const designHtml = (doc._activeDesignHtml as string | null) ?? null;
      await sendArtifactResponse(res, session, artifactStore, designHtml, id);
    });
  });

  afterAll(async () => {
    await closePool();
  });

  it('returns empty artifacts for new session', async () => {
    const store = new SessionStore();
    const session = await store.create('test-empty-artifacts');
    const res = await request(app).get(`/api/sessions/${session.id}/artifacts`);
    expect(res.status).toBe(200);
    expect(res.body.artifacts).toEqual([]);
  });
});
```

- [ ] **Step 5: 安装 supertest 并运行测试**

```bash
cd apps/studio-api && pnpm add -D supertest @types/supertest
pnpm test -- --run server-artifacts
```

Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add apps/studio-api/src/server.ts apps/studio-api/src/__tests__/server-artifacts.test.ts apps/studio-api/package.json pnpm-lock.yaml
git commit -m "feat(studio-api): add session-scoped artifact list and download endpoints

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: 在设计/代码生成端点记录产物 Run

**Files:**
- Modify: `apps/studio-api/src/server.ts`

**Interfaces:**
- Consumes: `sessionStore.addArtifactRun`
- Produces: 每次 `/generate/design` 和 `/generate/code` 成功后，session document 中新增 `_artifactRuns` 记录

- [ ] **Step 1: 在 /generate/design 中记录 run**

在 `/api/generate/design` 处理成功后、返回响应前，找到 `artifactRunId` 变量，添加：

```ts
if (artifactRunId) {
  await sessionStore.addArtifactRun(sessionId, {
    runId: artifactRunId,
    type: 'design',
    createdAt: Date.now(),
  });
}
```

- [ ] **Step 2: 在 /generate/code 中记录 run**

在 `/api/generate/code` 处理成功后、返回响应前，添加：

```ts
if (artifactRunId) {
  await sessionStore.addArtifactRun(sessionId, {
    runId: artifactRunId,
    type: 'code',
    createdAt: Date.now(),
  });
}
```

- [ ] **Step 3: 验证产物记录**

手动验证：

1. 启动 API：`pnpm studio:api`
2. 创建一个 session 并生成 design。
3. 调用 `GET /api/sessions/:id/artifacts`，确认返回 `design-zip:<runId>`。

- [ ] **Step 4: Commit**

```bash
git add apps/studio-api/src/server.ts
git commit -m "feat(studio-api): record design/code artifact runs on generation

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: 前端 useArtifacts Hook

**Files:**
- Create: `apps/studio-web/src/hooks/useArtifacts.ts`
- Create: `apps/studio-web/src/hooks/__tests__/useArtifacts.test.tsx`
- Modify: `apps/studio-web/src/hooks/useChat.ts`（如有需要，确认 RequirementDocument 类型可导入）

**Interfaces:**
- Consumes: `ArtifactItem` from shared-types；`/api/sessions/:id/artifacts`
- Produces: `useArtifacts(input)` → `{ artifacts, loading, error, refresh, downloadOne, downloadAll }`

- [ ] **Step 1: 编写失败测试**

创建 `apps/studio-web/src/hooks/__tests__/useArtifacts.test.tsx`：

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useArtifacts } from '../useArtifacts';

describe('useArtifacts', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('derives requirement artifact from document', () => {
    const { result } = renderHook(() =>
      useArtifacts({
        sessionId: null,
        document: { featureName: '登录', businessGoal: '支持登录', completeness: 80 } as any,
        designHtml: null,
        generatedFiles: [],
      })
    );

    const req = result.current.artifacts.find(a => a.id === 'req-md');
    expect(req).toBeDefined();
    expect(req?.category).toBe('requirement');
  });

  it('fetches backend artifacts when sessionId is present', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        artifacts: [
          { id: 'design-zip:run-1', category: 'design', label: 'UI预览.zip', size: 100, updatedAt: Date.now(), source: 'artifact-run', downloadUrl: '/download' },
        ],
      }),
    });

    const { result } = renderHook(() =>
      useArtifacts({
        sessionId: 's1',
        document: null,
        designHtml: null,
        generatedFiles: [],
      })
    );

    await waitFor(() => {
      expect(result.current.artifacts).toHaveLength(1);
    });
    expect(result.current.artifacts[0].id).toBe('design-zip:run-1');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd apps/studio-web && pnpm test -- --run useArtifacts
```

Expected: FAIL，`useArtifacts` 未定义。

- [ ] **Step 3: 实现 useArtifacts**

创建 `apps/studio-web/src/hooks/useArtifacts.ts`：

```ts
import { useState, useEffect, useCallback, useMemo } from 'react';
import type { ArtifactItem } from '@ai-frontend-engineering-agent/shared-types';
import type { RequirementDocument } from './useChat';

const API = '/api';

interface UseArtifactsInput {
  sessionId: string | null;
  document: RequirementDocument | null;
  designHtml: string | null;
  generatedFiles: Array<{ path: string; kind: string; content?: string }>;
}

interface UseArtifactsOutput {
  artifacts: ArtifactItem[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  downloadOne: (id: string) => Promise<void>;
  downloadAll: () => Promise<void>;
}

function generateRequirementMarkdown(doc: Record<string, unknown>): string {
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

function deriveSessionArtifacts(
  document: Record<string, unknown> | null,
  designHtml: string | null,
): ArtifactItem[] {
  const now = Date.now();
  const artifacts: ArtifactItem[] = [];

  if (document && (document.featureName !== undefined || document.businessGoal !== undefined)) {
    const md = generateRequirementMarkdown(document);
    artifacts.push({
      id: 'req-md',
      category: 'requirement',
      label: `${(document.featureName as string) || '需求文档'}.md`,
      size: new Blob([md]).size,
      updatedAt: (document.updatedAt as number) ?? now,
      source: 'session-state',
      content: md,
    });
  }

  if (designHtml) {
    artifacts.push({
      id: 'design-html',
      category: 'design',
      label: 'UI预览.html',
      size: new Blob([designHtml]).size,
      updatedAt: now,
      source: 'session-state',
      content: designHtml,
    });
  }

  return artifacts;
}

function triggerDownload(url: string, filename?: string) {
  const a = document.createElement('a');
  a.href = url;
  if (filename) a.download = filename;
  a.click();
}

export function useArtifacts(input: UseArtifactsInput): UseArtifactsOutput {
  const { sessionId, document, designHtml, generatedFiles } = input;
  const [backendArtifacts, setBackendArtifacts] = useState<ArtifactItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sessionArtifacts = useMemo(
    () => deriveSessionArtifacts(document as Record<string, unknown> | null, designHtml),
    [document, designHtml]
  );

  const fetchArtifacts = useCallback(async () => {
    if (!sessionId) {
      setBackendArtifacts([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/sessions/${sessionId}/artifacts`);
      if (!res.ok) throw new Error(`Failed to fetch artifacts: ${res.status}`);
      const data = await res.json();
      setBackendArtifacts((data.artifacts as ArtifactItem[]) ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    fetchArtifacts();
  }, [fetchArtifacts]);

  const artifacts = useMemo(() => {
    const backendOnly = backendArtifacts.filter(b => b.source === 'artifact-run');
    return [...sessionArtifacts, ...backendOnly];
  }, [sessionArtifacts, backendArtifacts]);

  const downloadOne = useCallback(async (id: string) => {
    const artifact = artifacts.find(a => a.id === id);
    if (!artifact) return;

    if (artifact.source === 'session-state' && artifact.content) {
      const blob = new Blob([artifact.content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      triggerDownload(url, artifact.label);
      URL.revokeObjectURL(url);
      return;
    }

    if (artifact.downloadUrl) {
      triggerDownload(artifact.downloadUrl, artifact.label);
    }
  }, [artifacts]);

  const downloadAll = useCallback(async () => {
    if (!sessionId || artifacts.length === 0) return;
    const ids = artifacts.map(a => a.id).join(',');
    triggerDownload(`${API}/sessions/${sessionId}/artifacts/download?ids=${ids}`, `session-${sessionId}-artifacts.zip`);
  }, [sessionId, artifacts]);

  return {
    artifacts,
    loading,
    error,
    refresh: fetchArtifacts,
    downloadOne,
    downloadAll,
  };
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd apps/studio-web && pnpm test -- --run useArtifacts
```

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add apps/studio-web/src/hooks/useArtifacts.ts apps/studio-web/src/hooks/__tests__/useArtifacts.test.tsx
git commit -m "feat(studio-web): add useArtifacts hook

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 8: 前端 ArtifactsPanel 组件

**Files:**
- Create: `apps/studio-web/src/components/ArtifactsPanel.tsx`
- Create: `apps/studio-web/src/components/__tests__/ArtifactsPanel.test.tsx`

**Interfaces:**
- Consumes: `ArtifactItem[]`, `loading`, `onDownloadOne(id)`, `onDownloadAll()`
- Produces: 渲染产物列表、单文件下载按钮、全部下载按钮

- [ ] **Step 1: 编写失败测试**

创建 `apps/studio-web/src/components/__tests__/ArtifactsPanel.test.tsx`：

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ArtifactsPanel } from '../ArtifactsPanel';

describe('ArtifactsPanel', () => {
  it('renders empty state', () => {
    render(<ArtifactsPanel artifacts={[]} loading={false} onDownloadOne={vi.fn()} onDownloadAll={vi.fn()} />);
    expect(screen.getByText(/暂无输出产物/)).toBeInTheDocument();
  });

  it('triggers single download', () => {
    const onDownloadOne = vi.fn();
    render(
      <ArtifactsPanel
        artifacts={[{ id: 'req-md', category: 'requirement', label: '需求文档.md', updatedAt: Date.now(), source: 'session-state' }]}
        loading={false}
        onDownloadOne={onDownloadOne}
        onDownloadAll={vi.fn()}
      />
    );
    fireEvent.click(screen.getByTitle('下载'));
    expect(onDownloadOne).toHaveBeenCalledWith('req-md');
  });

  it('triggers download all', () => {
    const onDownloadAll = vi.fn();
    render(
      <ArtifactsPanel
        artifacts={[{ id: 'req-md', category: 'requirement', label: '需求文档.md', updatedAt: Date.now(), source: 'session-state' }]}
        loading={false}
        onDownloadOne={vi.fn()}
        onDownloadAll={onDownloadAll}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /打包下载全部/ }));
    expect(onDownloadAll).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd apps/studio-web && pnpm test -- --run ArtifactsPanel
```

Expected: FAIL。

- [ ] **Step 3: 实现 ArtifactsPanel**

创建 `apps/studio-web/src/components/ArtifactsPanel.tsx`：

```tsx
import { Package, FileText, Image, Code, Layers, Download, Loader2 } from 'lucide-react';
import type { ArtifactItem, ArtifactCategory } from '@ai-frontend-engineering-agent/shared-types';

interface ArtifactsPanelProps {
  artifacts: ArtifactItem[];
  loading: boolean;
  onDownloadOne: (id: string) => void;
  onDownloadAll: () => void;
}

const CATEGORY_ICONS: Record<ArtifactCategory, typeof FileText> = {
  requirement: FileText,
  architecture: Layers,
  design: Image,
  code: Code,
  intermediate: Package,
};

const CATEGORY_LABELS: Record<ArtifactCategory, string> = {
  requirement: '需求',
  architecture: '架构',
  design: 'UI 预览',
  code: '代码',
  intermediate: '中间产物',
};

function formatSize(bytes?: number): string {
  if (bytes === undefined) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ArtifactsPanel({ artifacts, loading, onDownloadOne, onDownloadAll }: ArtifactsPanelProps) {
  const grouped = artifacts.reduce<Record<string, ArtifactItem[]>>((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {});

  const categories = Object.keys(grouped) as ArtifactCategory[];

  return (
    <div className="shrink-0 bg-white border-b border-gray-200 flex flex-col" style={{ maxHeight: 220 }}>
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
        <h5 className="text-sm font-semibold text-gray-800">输出产物</h5>
        <button
          onClick={onDownloadAll}
          disabled={loading || artifacts.length === 0}
          className="flex items-center gap-1 px-2 py-1 rounded-md bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
          打包下载全部
        </button>
      </div>

      <div className="flex-1 overflow-auto p-2">
        {artifacts.length === 0 && !loading && (
          <p className="text-xs text-gray-400 text-center py-4">暂无输出产物，开始生成后会自动汇总</p>
        )}

        {categories.map(category => {
          const Icon = CATEGORY_ICONS[category];
          return (
            <div key={category} className="mb-2 last:mb-0">
              <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-medium text-gray-500 uppercase tracking-wider">
                <Icon className="w-3 h-3" />
                {CATEGORY_LABELS[category]}
              </div>
              <div className="space-y-0.5">
                {grouped[category].map(item => (
                  <div
                    key={item.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 group"
                  >
                    <Icon className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-700 truncate">{item.label}</p>
                      {item.size !== undefined && (
                        <p className="text-[10px] text-gray-400">{formatSize(item.size)}</p>
                      )}
                    </div>
                    <button
                      onClick={() => onDownloadOne(item.id)}
                      aria-label="下载"
                      className="p-1 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50 opacity-0 group-hover:opacity-100 transition"
                      title="下载"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd apps/studio-web && pnpm test -- --run ArtifactsPanel
```

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add apps/studio-web/src/components/ArtifactsPanel.tsx apps/studio-web/src/components/__tests__/ArtifactsPanel.test.tsx
git commit -m "feat(studio-web): add ArtifactsPanel component

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 9: 在 App.tsx 中集成产物面板

**Files:**
- Modify: `apps/studio-web/src/App.tsx`

**Interfaces:**
- Consumes: `useArtifacts` hook, `ArtifactsPanel` component
- Produces: 右侧边栏顶部显示产物面板

- [ ] **Step 1: 导入 hook 与组件**

在 `apps/studio-web/src/App.tsx` 顶部新增：

```ts
import { useArtifacts } from './hooks/useArtifacts';
import { ArtifactsPanel } from './components/ArtifactsPanel';
```

- [ ] **Step 2: 调用 useArtifacts**

在 `App` 组件内，紧接 `docHook` 声明后添加：

```ts
const artifactHook = useArtifacts({
  sessionId: activeSessionId,
  document: docHook.document,
  designHtml,
  generatedFiles,
});
```

- [ ] **Step 3: 修改右侧边栏布局**

把当前右侧 `<aside>`：

```tsx
{activeNav === 'chat' && (
  <aside className="w-[360px] shrink-0 bg-white border-l border-divider overflow-auto h-full">
    <DocumentPanel ... />
  </aside>
)}
```

改为：

```tsx
{activeNav === 'chat' && (
  <aside className="w-[360px] shrink-0 bg-white border-l border-divider h-full flex flex-col">
    <ArtifactsPanel
      artifacts={artifactHook.artifacts}
      loading={artifactHook.loading}
      onDownloadOne={artifactHook.downloadOne}
      onDownloadAll={artifactHook.downloadAll}
    />
    <div className="flex-1 overflow-auto min-h-0">
      <DocumentPanel
        document={docHook.document}
        sessionId={activeSessionId}
        generating={docHook.generating}
        optimizingModule={docHook.optimizingModule}
        onGenerate={docHook.generate}
        onOptimize={docHook.optimize}
        onSend={chat.send}
        loading={chat.loading}
        profileId={profileId}
        onProfileChange={setProfileId}
      />
    </div>
  </aside>
)}
```

- [ ] **Step 4: 刷新产物列表时机**

在 `handleGenerateDesign` 和 `handleGenerateCode` 成功后调用 `artifactHook.refresh()`：

```ts
await loadDesignVersions(activeSessionId);
artifactHook.refresh();
```

以及：

```ts
setGeneratedFiles(data.files);
setActiveChatTab('code');
artifactHook.refresh();
```

- [ ] **Step 5: 类型检查与手动验证**

```bash
pnpm typecheck
```

Expected: 无类型错误。

启动前后端，手动验证：

1. 选择一个 session，确认产物面板显示需求文档 `.md`。
2. 生成 UI 预览，确认产物面板新增 `UI预览.zip`。
3. 点击单文件下载与打包下载全部，文件内容正确。

- [ ] **Step 6: Commit**

```bash
git add apps/studio-web/src/App.tsx
git commit -m "feat(studio-web): integrate ArtifactsPanel into right sidebar

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Self-Review

### Spec Coverage

- ✅ 右侧边栏顶部固定产物面板 → Task 9
- ✅ 产物列表、文件大小、单文件/批量下载 → Task 8
- ✅ 需求文档 `.md` 即时生成 → Task 7
- ✅ UI 预览打包下载 → Task 4 + Task 6
- ✅ 代码包下载 → Task 4 + Task 6
- ✅ 中间产物保留 → Task 4 + Task 6（workflow 类型为 intermediate）
- ✅ 产物较多时内部滚动 → Task 8 CSS
- ✅ Session 级产物、切换刷新 → Task 7 useArtifacts

### Placeholder Scan

- 无 TBD/TODO
- 无 "add appropriate error handling" 等模糊描述
- 每个步骤包含实际代码或命令

### Type Consistency

- `ArtifactItem` / `SessionArtifactRun` 在 shared-types 中统一定义，前后端一致
- `useArtifacts` 输入/输出类型与 `ArtifactsPanel` props 匹配
- artifact id 约定 `req-md`、`design-html`、`design-zip:<runId>`、`code-zip:<runId>` 前后端一致

### Gap Identified & Fixed

- 原 spec 未明确测试框架；本计划在 Task 1 中新增 Vitest，确保 TDD 可行。
- `generatedFiles` 后端未完整实现；本计划在前端做防御性处理（只展示后端返回的 artifact-run 代码包，不依赖 `generatedFiles` 内容）。

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-21-output-artifacts-panel-implementation.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints for review

**Which approach?**
