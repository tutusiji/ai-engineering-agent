# 结构化需求文档重构计划

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** 重构右侧结构化需求文档，使其成为独立的、可交互的需求管理面板——支持全量重新生成、增量合并（记忆功能）、单模块优化。

**Architecture:**
- 后端新增 2 个 API：全量生成 + 单模块优化
- 前端 DocumentPanel 从 ChatPanel.tsx 拆分为独立组件
- 采用"全量生成 + 增量合并"策略：首次全量生成，后续通过 diff/merge 保留已有内容
- 每个模块独立优化，互不影响

**Tech Stack:** React + HeroUI + TailwindCSS, Express SSE, Kimi K2.6 (推理模型)

---

## 设计决策

### 1. 记忆功能（增量合并）

**问题：** 每次全量重新生成，LLM 返回的内容会变化，导致已有确认的内容丢失。

**方案：** 采用"全量生成 + 三路合并"策略：
1. 用户触发"生成文档"时，发送所有对话历史 + 当前文档给 LLM
2. LLM 生成完整的结构化文档
3. 后端做三路合并：
   - **已有字段**（如 featureName、businessGoal）：仅当 LLM 返回的新值更详细时才更新
   - **数组字段**（如 pages、entities）：按 name 合并，新项追加，已有项保留
   - **新增字段**：直接添加
4. 合并后的文档保存到数据库，通过 SSE 推送给前端

### 2. 单模块优化

**方案：** 用户点击某模块的"优化"按钮 → 弹窗输入优化指令 → 只发送该模块上下文 + 用户指令给 LLM → 只更新该模块。

**模块列表：**
- businessGoal（业务目标）
- userRoles（用户角色）
- pages（页面列表）
- entities（数据实体）
- businessRules（业务规则）
- edgeCases（边界情况）
- nonFunctional（非功能需求）
- phases（阶段规划）

### 3. 触发时机

- **自动触发：** 每次对话结束后（现有逻辑，通过 SSE document 事件）
- **手动触发：** 点击"生成文档"按钮，全量重新生成
- **单模块优化：** 点击模块标题旁的"优化"按钮

---

## Task 1: 后端 — 新增全量文档生成 API

**Objective:** 创建 `POST /api/chat/document/generate` 端点，接收所有对话历史，调用 LLM 生成完整结构化文档。

**Files:**
- Modify: `apps/studio-api/src/server.ts`

**实现：**

在 server.ts 中添加新端点：

```typescript
// POST /api/chat/document/generate — 全量生成结构化文档
app.post('/api/chat/document/generate', async (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) return res.status(400).json({ error: 'sessionId required' });

  const session = await sessionStore.get(sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  try {
    const messages = session.messages ?? [];
    const currentDoc = session.document ?? {};

    // 构建对话摘要（取最近 20 条消息）
    const recentMsgs = messages.slice(-20);
    const conversationText = recentMsgs
      .map(m => {
        const c = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
        return `[${m.role}]: ${c.slice(0, 500)}`;
      })
      .join('\n');

    // 调用 LLM 生成完整文档
    const { generateFullDocument } = await import('@ai-frontend-engineering-agent/agent-runtime');
    const newDoc = await generateFullDocument(llmConfig, conversationText, currentDoc);

    // 三路合并
    const { mergeDocumentDeep } = await import('@ai-frontend-engineering-agent/agent-runtime');
    const merged = mergeDocumentDeep(currentDoc, newDoc);

    // 保存
    const completeness = (merged.completeness as number) ?? 0;
    await sessionStore.updateDocument(sessionId, merged, completeness);

    res.json({ ok: true, document: merged, completeness });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
```

**验证：**
```bash
curl -s -X POST http://localhost:4401/api/chat/document/generate \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"verify-fix"}' | python3 -m json.tool
```
期望：返回 `{ ok: true, document: {...}, completeness: N }`

---

## Task 2: 后端 — 新增单模块优化 API

**Objective:** 创建 `POST /api/chat/document/optimize` 端点，只优化文档中的指定模块。

**Files:**
- Modify: `apps/studio-api/src/server.ts`

**实现：**

```typescript
// POST /api/chat/document/optimize — 优化单个模块
app.post('/api/chat/document/optimize', async (req, res) => {
  const { sessionId, module, instruction } = req.body;
  if (!sessionId || !module || !instruction) {
    return res.status(400).json({ error: 'sessionId, module, instruction required' });
  }

  const session = await sessionStore.get(sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  try {
    const currentDoc = (session.document ?? {}) as Record<string, unknown>;
    const currentModuleValue = currentDoc[module];

    // 调用 LLM 优化单个模块
    const { optimizeModule } = await import('@ai-frontend-engineering-agent/agent-runtime');
    const optimizedValue = await optimizeModule(llmConfig, module, currentModuleValue, instruction, currentDoc);

    // 只更新该模块
    currentDoc[module] = optimizedValue;

    // 重新计算 completeness
    const { estimateCompleteness } = await import('@ai-frontend-engineering-agent/agent-runtime');
    const completeness = estimateCompleteness(currentDoc);
    currentDoc.completeness = completeness;

    await sessionStore.updateDocument(sessionId, currentDoc, completeness);

    res.json({ ok: true, document: currentDoc, module, completeness });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
```

**验证：**
```bash
curl -s -X POST http://localhost:4401/api/chat/document/optimize \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"verify-fix","module":"businessGoal","instruction":"补充目标用户画像"}' | python3 -m json.tool
```
期望：返回优化后的 document，只有 businessGoal 被更新

---

## Task 3: 后端 — 创建 LLM 文档生成/优化函数

**Objective:** 在 agent-runtime 中新增 `generateFullDocument`、`optimizeModule`、`mergeDocumentDeep`、`estimateCompleteness` 函数。

**Files:**
- Create: `packages/agent-runtime/src/document-generator.ts`
- Modify: `packages/agent-runtime/src/index.ts` (export)

**实现要点：**

### generateFullDocument
- 接收对话摘要 + 当前文档
- Prompt 要求 LLM 输出完整 JSON 文档
- 使用 `maxTokens: 16328`（Kimi 推理模型需要更多 token）
- 解析 JSON 返回

### optimizeModule
- 接收模块名、当前值、用户指令、整体文档上下文
- Prompt 只要求 LLM 输出该模块的新值
- 返回优化后的模块值

### mergeDocumentDeep
- 三路合并策略：
  - 字符串字段：新值更长则更新（更详细）
  - 数组字段（pages/entities/userRoles）：按 name 合并，保留已有的
  - 数组字段（businessRules/edgeCases/nonFunctional）：追加不重复项
  - completeness：取较大值

### estimateCompleteness
- 基于规则计算完整度：
  - featureName 有值 +10
  - businessGoal 有值 +10
  - userRoles 非空 +10
  - pages 非空 +15
  - entities 非空 +10
  - businessRules 非空 +10
  - edgeCases 非空 +5
  - nonFunctional 非空 +5
  - phases 非空 +5
  - uiLibrary 有值 +5
  - openQuestions 为空 +15（无待确认问题 = 已完整）

---

## Task 4: 前端 — 拆分 DocumentPanel 为独立组件文件

**Objective:** 将 DocumentPanel 从 ChatPanel.tsx 拆分到独立文件，添加文档生成/优化的 API 调用。

**Files:**
- Create: `apps/studio-web/src/components/DocumentPanel.tsx`
- Modify: `apps/studio-web/src/components/ChatPanel.tsx` (移除 DocumentPanel)
- Modify: `apps/studio-web/src/App.tsx` (更新 import)

**实现要点：**

DocumentPanel 组件需要：
- `document` — 当前文档
- `sessionId` — 当前会话 ID
- `loading` — 是否正在生成/优化
- `onDocumentUpdate` — 文档更新回调
- `onSend` — 发送消息回调（用于 openQuestions）

---

## Task 5: 前端 — DocumentPanel 主体重构

**Objective:** 重构 DocumentPanel 的布局和交互。

**Files:**
- Modify: `apps/studio-web/src/components/DocumentPanel.tsx`

**布局设计：**

```
┌─────────────────────────────────────┐
│ 📋 口语助理 App        [生成文档] 🔄 │
│ ████████░░░░ 35%                    │
├─────────────────────────────────────┤
│ 🎯 业务目标                    [优化]│
│ 面向外语学习者的安卓端口语助理...     │
│                                     │
│ 👥 用户角色                    [优化]│
│ • 外语学习者 — toC 多用户...         │
│                                     │
│ 📄 页面 (3)                    [优化]│
│ • 首页 (dashboard) — ...            │
│ • 练习页 (form) — ...               │
│                                     │
│ 📦 数据实体 (2)                [优化]│
│ • 用户 — 5 个字段                   │
│                                     │
│ 📏 业务规则 (8)                [优化]│
│ • 支持中英日多语言...               │
│                                     │
│ ❓ 待确认 (5)                        │
│ 1. AI Agent 的具体功能范围？         │
│ 2. ...                              │
│ [回答这些问题]                       │
└─────────────────────────────────────┘
```

**关键交互：**
1. **生成文档按钮** — 调用 `/api/chat/document/generate`，显示 loading，更新文档
2. **每个模块的优化按钮** — 点击后弹出 Modal，内有 TextArea + 提交按钮
3. **进度条** — 实时显示 completeness
4. **里程碑提示** — 80% 可生成设计稿，95% 可生成代码

---

## Task 6: 前端 — 实现模块优化弹窗组件

**Objective:** 创建可复用的 ModuleOptimizeModal 组件。

**Files:**
- Modify: `apps/studio-web/src/components/DocumentPanel.tsx`

**实现：**

```tsx
interface ModuleOptimizeModalProps {
  isOpen: boolean;
  onClose: () => void;
  moduleName: string;
  moduleLabel: string;
  currentValue: unknown;
  sessionId: string;
  onOptimized: (updatedDoc: RequirementDocument) => void;
}

function ModuleOptimizeModal({ ... }: ModuleOptimizeModalProps) {
  const [instruction, setInstruction] = useState('');
  const [loading, setLoading] = useState(false);

  const handleOptimize = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/chat/document/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, module: moduleName, instruction }),
      });
      const data = await res.json();
      if (data.ok) {
        onOptimized(data.document);
        onClose();
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <ModalContent>
        <ModalHeader>优化 {moduleLabel}</ModalHeader>
        <ModalBody>
          <p className="text-sm text-gray-500 mb-2">当前内容：</p>
          <pre className="text-xs bg-gray-50 p-2 rounded max-h-32 overflow-auto">
            {JSON.stringify(currentValue, null, 2)}
          </pre>
          <TextArea
            value={instruction}
            onChange={setInstruction}
            placeholder="描述你想要的修改，例如：补充目标用户画像、增加删除功能..."
            className="mt-3"
          />
        </ModalBody>
        <ModalFooter>
          <Button variant="light" onPress={onClose}>取消</Button>
          <Button variant="primary" onPress={handleOptimize} isDisabled={!instruction.trim() || loading}>
            {loading ? <Spinner size="sm" /> : '优化'}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
```

---

## Task 7: 前端 — 实现 useDocument hook

**Objective:** 将文档相关的 API 调用抽取为独立 hook。

**Files:**
- Create: `apps/studio-web/src/hooks/useDocument.ts`

**实现：**

```typescript
export function useDocument(sessionId: string | null) {
  const [document, setDocument] = useState<RequirementDocument | null>(null);
  const [generating, setGenerating] = useState(false);
  const [optimizing, setOptimizing] = useState(false);

  // 全量生成
  const generate = useCallback(async () => {
    if (!sessionId) return;
    setGenerating(true);
    try {
      const res = await fetch('/api/chat/document/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      const data = await res.json();
      if (data.ok) setDocument(data.document);
    } finally {
      setGenerating(false);
    }
  }, [sessionId]);

  // 单模块优化
  const optimize = useCallback(async (module: string, instruction: string) => {
    if (!sessionId) return null;
    setOptimizing(true);
    try {
      const res = await fetch('/api/chat/document/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, module, instruction }),
      });
      const data = await res.json();
      if (data.ok) {
        setDocument(data.document);
        return data.document;
      }
    } finally {
      setOptimizing(false);
    }
    return null;
  }, [sessionId]);

  // 从 SSE 事件更新
  const updateFromSSE = useCallback((doc: RequirementDocument) => {
    setDocument(doc);
  }, []);

  return { document, setDocument, generating, optimizing, generate, optimize, updateFromSSE };
}
```

---

## Task 8: 前端 — 集成 useChat 与 useDocument

**Objective:** 修改 useChat 和 App.tsx，将文档管理从 useChat 分离到 useDocument。

**Files:**
- Modify: `apps/studio-web/src/hooks/useChat.ts` — 移除 document state，添加 onDocument 回调
- Modify: `apps/studio-web/src/App.tsx` — 同时使用 useChat 和 useDocument

**关键变更：**

useChat.ts:
- 移除 `document` state 和 `setDocument`
- 添加 `onDocumentUpdate` 回调参数
- SSE 收到 `document` 事件时调用回调

App.tsx:
- 使用 `useDocument(activeSessionId)` 管理文档
- 将 `chat.onDocumentUpdate` 设置为 `documentHook.updateFromSSE`
- DocumentPanel 使用 documentHook 的数据和方法

---

## Task 9: 构建、重启、端到端验证

**Objective:** 构建前端，重启 API，验证完整流程。

**验证步骤：**

1. 启动 API 和前端
2. 打开 https://joox.cc:4399
3. 选择一个有对话历史的会话
4. 点击"生成文档"按钮 → 验证文档生成
5. 点击某模块的"优化"按钮 → 输入优化指令 → 验证只有该模块更新
6. 发送新对话消息 → 验证文档自动更新
7. 检查完成度进度条是否正确

---

## 文件变更总览

| 操作 | 文件 |
|------|------|
| Create | `packages/agent-runtime/src/document-generator.ts` |
| Modify | `packages/agent-runtime/src/index.ts` |
| Modify | `apps/studio-api/src/server.ts` |
| Create | `apps/studio-web/src/hooks/useDocument.ts` |
| Create | `apps/studio-web/src/components/DocumentPanel.tsx` |
| Modify | `apps/studio-web/src/components/ChatPanel.tsx` |
| Modify | `apps/studio-web/src/hooks/useChat.ts` |
| Modify | `apps/studio-web/src/App.tsx` |
