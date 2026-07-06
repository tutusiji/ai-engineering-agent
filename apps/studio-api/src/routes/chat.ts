/**
 * chat — 对话与文档生成路由
 */

import { Router } from 'express';
import type { LlmConfig, SkillDefinition } from '@ai-engineering-agent/agent-runtime';
import { getSkill, runSkillThroughLlm } from '@ai-engineering-agent/agent-runtime';
import { SessionStore } from '@ai-engineering-agent/persistence';
import type { JsonObject } from '@ai-engineering-agent/shared-types';
import { ChatSchema, DocumentGenerateSchema, DocumentOptimizeSchema } from '../lib/validate.js';
import { validateBody } from '../middleware/validate-request.js';
import { createSkillContext, getActiveArchitecture } from '../lib/skill-context.js';
import { buildArchitectureMarkdown } from '../lib/architecture-markdown.js';
import { MODEL_PRESETS } from '../lib/models.js';

export function createChatRouter(llmConfig: LlmConfig, sessionStore: SessionStore) {
  const router = Router();

  router.post('/', validateBody(ChatSchema), async (req, res) => {
    try {
      const { sessionId, profileId, userMessage, mode } = req.body;
      let session = await sessionStore.get(sessionId);
      if (!session) {
        session = await sessionStore.create(sessionId, undefined, req.user?.id);
        if (profileId) await sessionStore.update(sessionId, { profileId });
      }
      await sessionStore.addMessage(sessionId, { role: 'user', content: userMessage, timestamp: Date.now() });

      if (mode === 'architecture-refinement') {
        const archSkill = getSkill('architecture-planning');
        if (!archSkill) return res.status(500).json({ error: 'architecture-planning skill not found' });

        const archData = getActiveArchitecture(session);
        const doc = (session.document as Record<string, unknown>) ?? {};
        const archVersions = doc._architectureVersions as Array<Record<string, unknown>> | undefined;
        const activeArchId = doc._activeArchitectureId as string | undefined;
        const activeVersion = archVersions?.find(v => v.id === activeArchId) ?? archVersions?.[archVersions.length - 1];
        const currentMarkdown = (activeVersion?.markdown as string)
          ?? (activeVersion?.architecture ? buildArchitectureMarkdown(activeVersion.architecture as Record<string, unknown>) : '');

        const ctx = createSkillContext(profileId);
        const archInput: JsonObject = {
          mode: 'refine',
          userMessage,
          currentArchitecture: archData ?? (activeVersion?.architecture as JsonObject) ?? null,
          currentMarkdown,
        };
        const archResult = await runSkillThroughLlm(archSkill, ctx, archInput, llmConfig);
        if (archResult.ok && archResult.output) {
          const refinedArch = archResult.output as Record<string, unknown>;
          return res.json({
            ok: true,
            mode: 'architecture-refinement',
            architecture: refinedArch,
            markdown: buildArchitectureMarkdown(refinedArch),
            model: llmConfig.model,
            usage: archResult.usage,
          });
        }
        return res.json({ ok: false, error: archResult.error, mode: 'architecture-refinement' });
      }

      const skill = getSkill('interactive-requirement');
      if (!skill) return res.status(500).json({ error: 'interactive-requirement skill not found' });

      const ctx = createSkillContext(profileId);
      const input: JsonObject = {
        userMessage,
        conversationHistory: session.messages as JsonObject[],
        existingDocument: session.document as JsonObject ?? null,
        mode,
      };
      const result = await runSkillThroughLlm(skill, ctx, input, llmConfig);
      if (result.ok && result.output) {
        const doc = result.output as Record<string, unknown>;
        const completeness = (doc.completeness as number) ?? 0;
        await sessionStore.updateDocument(sessionId, doc, completeness);
        await sessionStore.addMessage(sessionId, { role: 'assistant', content: JSON.stringify(result.output), timestamp: Date.now() });
      }
      session = (await sessionStore.get(sessionId))!;
      res.json({
        ok: result.ok,
        document: session.document,
        error: result.error,
        usage: result.usage,
        model: result.model,
        sessionId: session.id,
        messageCount: session.messages.length,
      });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  router.post('/stream', validateBody(ChatSchema), async (req, res) => {
    const { sessionId, profileId, userMessage, mode } = req.body;

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const send = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      let session = await sessionStore.get(sessionId);
      if (!session) {
        session = await sessionStore.create(sessionId, undefined, req.user?.id);
        if (profileId) await sessionStore.update(sessionId, { profileId });
      }
      await sessionStore.addMessage(sessionId, { role: 'user', content: userMessage, timestamp: Date.now() });

      const skill = getSkill('interactive-requirement');
      if (!skill) {
        send('error', { error: 'interactive-requirement skill not found' });
        res.end();
        return;
      }

      const ctx = createSkillContext(profileId);
      session = (await sessionStore.get(sessionId))!;
      const input: JsonObject = {
        userMessage,
        conversationHistory: session.messages as JsonObject[],
        existingDocument: session.document as JsonObject ?? null,
        mode,
      };

      const prompt = await (skill as SkillDefinition<unknown, unknown>).buildPrompt(ctx, input);
      const messages = [
        { role: 'system' as const, content: prompt.system },
        { role: 'user' as const, content: prompt.user + (prompt.attachments?.map(a => `\n\n--- ${a.kind} ---\n${a.content}`).join('') ?? '') },
      ];

      send('start', { model: llmConfig.model });

      const url = `${llmConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`;
      const body = {
        model: llmConfig.model,
        messages,
        temperature: llmConfig.temperature ?? Object.values(MODEL_PRESETS).find(p => p.model === llmConfig.model)?.temperature ?? 0.2,
        max_tokens: llmConfig.maxTokens ?? 131072,
        stream: true,
      };

      const llmRes = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${llmConfig.apiKey}` },
        body: JSON.stringify(body),
      });

      if (!llmRes.ok) {
        const errorText = await llmRes.text().catch(() => '');
        send('error', { error: `LLM request failed (${llmRes.status}): ${errorText}` });
        res.end();
        return;
      }

      let fullContent = '';
      let finishReason = '';
      const reader = llmRes.body?.getReader();
      if (!reader) {
        send('error', { error: 'No response body' });
        res.end();
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6);
          if (data === '[DONE]') continue;
          try {
            const chunk = JSON.parse(data);
            const delta = chunk.choices?.[0]?.delta?.content;
            if (delta) {
              fullContent += delta;
              send('chunk', { content: delta });
            }
            const fr = chunk.choices?.[0]?.finish_reason;
            if (fr) finishReason = fr;
          } catch {
            // ignore parse errors in stream
          }
        }
      }

      if (finishReason === 'length') {
        console.log(`⚠️ [${sessionId}] Truncated: finish_reason=length, content_len=${fullContent.length}`);
        send('warning', { message: '⚠️ AI 响应被截断（token 限制），已尝试自动修复 JSON' });
      } else {
        console.log(`✅ [${sessionId}] Stream done: finish_reason=${finishReason}, content_len=${fullContent.length}`);
      }

      send('done', { fullContent });

      const textContent = stripJson(fullContent);
      const messageToStore = textContent.length >= 15 ? textContent : '（需求信息已更新至右侧面板）';
      console.log(`📝 [${sessionId}] Storing message: original=${fullContent.length} chars, stripped=${textContent.length} chars, json=${fullContent !== textContent}`);
      await sessionStore.addMessage(sessionId, { role: 'assistant', content: messageToStore, timestamp: Date.now() });

      session = (await sessionStore.get(sessionId))!;
      try {
        const { extractRequirementInfo, mergeDocument } = await import('@ai-engineering-agent/agent-runtime');
        const currentDoc = session.document ?? {};
        const allMessages = session.messages ?? [];
        const recentMsgs = allMessages.slice(-4);
        const conversationSummary = recentMsgs
          .map(m => {
            const c = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
            return `[${m.role}]: ${c.slice(0, 150)}`;
          })
          .join('\n');

        console.log(`🔍 [${sessionId}] Extraction starting: msgs=${recentMsgs.length}, docKeys=${Object.keys(currentDoc).length}`);
        const extracted = await extractRequirementInfo(llmConfig, conversationSummary, currentDoc);
        console.log(`🔍 [${sessionId}] Extraction result:`, extracted ? `completeness=${extracted.completeness}` : 'null');

        if (extracted) {
          const merged = mergeDocument(currentDoc, extracted);
          const completeness = (merged.completeness as number) ?? 0;
          await sessionStore.updateDocument(sessionId, merged, completeness);
          console.log(`✅ [${sessionId}] Document updated: completeness=${completeness}%`);
          send('document', { document: merged, completeness });
        }
      } catch (extractErr) {
        console.error(`⚠️ [${sessionId}] Extraction failed:`, extractErr instanceof Error ? extractErr.message : extractErr);
      }

      send('end', { sessionId, messageCount: (await sessionStore.get(sessionId))?.messages.length ?? 0 });
      res.end();
    } catch (err) {
      send('error', { error: String(err) });
      res.end();
    }
  });

  router.get('/:sessionId', async (req, res) => {
    try {
      const session = await sessionStore.get(req.params.sessionId);
      if (!session) return res.status(404).json({ error: 'Session not found' });
      res.json({
        sessionId: session.id,
        profileId: session.profileId,
        document: session.document,
        messageCount: session.messages.length,
        messages: session.messages,
      });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  router.post('/document/generate', validateBody(DocumentGenerateSchema), async (req, res) => {
    try {
      const { sessionId } = req.body;
      const session = await sessionStore.get(sessionId);
      if (!session) return res.status(404).json({ error: 'Session not found' });

      const messages = session.messages ?? [];
      const currentDoc = (session.document ?? {}) as Record<string, unknown>;
      const recentMsgs = messages.slice(-20);
      const conversationText = recentMsgs
        .map(m => {
          const c = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
          return `[${m.role}]: ${c.slice(0, 500)}`;
        })
        .join('\n');

      const { generateFullDocument, mergeDocumentDeep } = await import('@ai-engineering-agent/agent-runtime');
      console.log(`📄 [${sessionId}] Generating full document from ${recentMsgs.length} messages...`);
      const newDoc = await generateFullDocument(llmConfig, conversationText, currentDoc);
      const merged = mergeDocumentDeep(currentDoc, newDoc);
      const completeness = (merged.completeness as number) ?? 0;
      await sessionStore.updateDocument(sessionId, merged, completeness);
      console.log(`✅ [${sessionId}] Document generated: completeness=${completeness}%`);
      res.json({ ok: true, document: merged, completeness });
    } catch (err) {
      console.error(`❌ Document generation failed:`, err instanceof Error ? err.message : err);
      res.status(500).json({ error: String(err) });
    }
  });

  router.post('/document/optimize', validateBody(DocumentOptimizeSchema), async (req, res) => {
    try {
      const { sessionId, module, instruction } = req.body;
      const session = await sessionStore.get(sessionId);
      if (!session) return res.status(404).json({ error: 'Session not found' });

      const currentDoc = (session.document ?? {}) as Record<string, unknown>;
      const currentModuleValue = currentDoc[module];
      const { optimizeModule, estimateCompleteness } = await import('@ai-engineering-agent/agent-runtime');

      const history = (currentDoc._optimizeHistory as Array<Record<string, unknown>>) ?? [];
      history.push({ module, instruction, previousValue: currentModuleValue, timestamp: Date.now() });
      currentDoc._optimizeHistory = history;

      const optimizedValue = await optimizeModule(llmConfig, module, currentModuleValue, instruction, currentDoc);
      currentDoc[module] = optimizedValue;
      const completeness = estimateCompleteness(currentDoc);
      currentDoc.completeness = completeness;
      await sessionStore.updateDocument(sessionId, currentDoc, completeness);
      res.json({ ok: true, document: currentDoc, module, completeness });
    } catch (err) {
      console.error(`❌ Module optimization failed:`, err instanceof Error ? err.message : err);
      res.status(500).json({ error: String(err) });
    }
  });

  return router;
}

function stripJson(text: string): string {
  let s = text;
  s = s.replace(/```(?:json)?\s*\n?[\s\S]*?(?:```|$)/g, '').trim();
  s = s.replace(/\n?\{[\s\S]*?"(?:featureName|completeness|userRoles|businessGoal)"[\s\S]*/g, '').trim();
  s = s.replace(/\n?\{[\s\S]*$/g, '').trim();
  s = s.replace(/^-{3,}\s*$/gm, '').trim();
  s = s.replace(/\n{3,}/g, '\n\n').trim();
  return s;
}
