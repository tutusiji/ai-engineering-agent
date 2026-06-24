/**
 * ChatPanel — chat with SSE streaming + Markdown rendering
 */

import { useRef, useEffect, useState } from 'react';
import { Button } from '@heroui/react/button';
import { TextArea } from '@heroui/react/textarea';
import { Chip } from '@heroui/react/chip';
import { ProgressBar } from '@heroui/react/progress-bar';
import { Spinner } from '@heroui/react/spinner';
import {
  Accordion,
  AccordionItem,
  AccordionHeading,
  AccordionTrigger,
  AccordionPanel,
} from '@heroui/react/accordion';
import {
  Bot,
  User,
  Send,
  Image,
  Code,
  FileText,
  HelpCircle,
  Square,
  Zap,
  RefreshCw,
  Download,
  CheckCircle,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChatMessage, RequirementDocument } from '../hooks/useChat';

/** Normalize a partial document from LLM to ensure all array fields exist */
function normalizeDoc(doc: RequirementDocument): Required<RequirementDocument> {
  return {
    featureName: doc.featureName ?? '',
    businessGoal: doc.businessGoal ?? '',
    userRoles: doc.userRoles ?? [],
    uiLibrary: doc.uiLibrary ?? null,
    pages: doc.pages ?? [],
    entities: doc.entities ?? [],
    businessRules: doc.businessRules ?? [],
    edgeCases: doc.edgeCases ?? [],
    nonFunctional: doc.nonFunctional ?? [],
    phases: doc.phases ?? [],
    completeness: doc.completeness ?? 0,
    openQuestions: doc.openQuestions ?? [],
    suggestedNextStep: doc.suggestedNextStep ?? '',
  };
}

interface ChatPanelProps {
  messages: ChatMessage[];
  document: RequirementDocument | null;
  loading: boolean;
  streaming: boolean;
  streamContent: string;
  completeness: number;
  onSend: (text: string) => void;
  onStop: () => void;
}

/** Check if content looks like JSON (requirement doc) */
function isJsonDocument(content: string): boolean {
  try {
    const parsed = JSON.parse(content);
    return typeof parsed === 'object' && parsed !== null && (
      parsed.completeness !== undefined || parsed.featureName !== undefined || parsed.openQuestions !== undefined
    );
  } catch {
    return false;
  }
}

/** Format a requirement document into readable markdown */
function formatDocAsMarkdown(doc: RequirementDocument): string {
  const d = normalizeDoc(doc);
  const parts: string[] = [];

  if (d.featureName) parts.push(`### 📋 ${d.featureName}`);
  if (d.businessGoal) parts.push(`\n**业务目标：** ${d.businessGoal}`);
  if (d.uiLibrary) parts.push(`**UI 组件库：** ${d.uiLibrary.name}`);
  if (d.pages.length > 0) {
    parts.push(`\n**页面列表：**`);
    d.pages.forEach(p => parts.push(`- **${p.name}** (${p.pageType}) — ${p.goal || ''}`));
  }
  parts.push(`\n**需求完整度：** ${d.completeness}%`);

  if (d.openQuestions.length > 0) {
    parts.push(`\n**❓ 待确认问题：**`);
    d.openQuestions.forEach((q, i) => parts.push(`${i + 1}. ${q}`));
  }

  if (doc.suggestedNextStep === 'generate-design') {
    parts.push(`\n💡 *需求已足够完整，可以生成可预览前端页面了*`);
  } else if (doc.suggestedNextStep === 'start-coding') {
    parts.push(`\n🚀 *需求已非常完整，可以开始生成代码*`);
  }

  return parts.join('\n');
}

/** Render message content with markdown support */
function MessageContent({ content, isUser }: { content: string; isUser: boolean }) {
  // For user messages, show plain text
  if (isUser) {
    // Replace literal \n (backslash + n) with real newlines for display
    const normalized = content.replace(/(?<!\\)\\n/g, '\n');
    return <span style={{ whiteSpace: 'pre-wrap' }}>{normalized}</span>;
  }

  // For assistant messages, try to parse as document JSON first
  if (isJsonDocument(content)) {
    try {
      const doc = JSON.parse(content) as RequirementDocument;
      const md = formatDocAsMarkdown(doc);
      return (
        <div className="chat-markdown">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{md}</ReactMarkdown>
        </div>
      );
    } catch {
      // fall through to plain markdown
    }
  }

  // Strip ALL JSON from assistant messages — extraction handles document updates
  let cleaned = content;

  // Remove ```json ... ``` blocks (including unclosed ones)
  cleaned = cleaned.replace(/```(?:json)?\s*\n?[\s\S]*?(?:```|$)/g, '').trim();

  // Remove raw JSON objects (anything with featureName/completeness/userRoles)
  cleaned = cleaned.replace(/\n?\{[\s\S]*?"(?:featureName|completeness|userRoles|businessGoal)"[\s\S]*$/g, '').trim();

  // Remove incomplete JSON fragments at the end
  cleaned = cleaned.replace(/\n?\{[\s\S]*$/g, '').trim();

  // Clean up leftover markdown artifacts
  cleaned = cleaned.replace(/^-{3,}\s*$/gm, '').trim(); // horizontal rules
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim(); // excessive newlines

  // If nothing meaningful left, show a brief status
  if (cleaned.length < 15) cleaned = '';

  if (!cleaned) {
    return <span className="text-gray-400 text-sm italic">💬 对话进行中，右侧文档已更新</span>;
  }

  // Pre-process: single \n to double \n\n so ReactMarkdown renders paragraphs
  const processed = cleaned.replace(/([^\n])\n(?!\n)/g, "$1\n\n");

  return (
    <div className="chat-markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{processed}</ReactMarkdown>
    </div>
  );
}

export function ChatPanel({
  messages,
  document: doc,
  loading,
  streaming,
  streamContent,
  completeness,
  onSend,
  onStop,
}: ChatPanelProps) {
  const [inputValue, setInputValue] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll: only scroll when user is near bottom
  const isNearBottomRef = useRef(true);

  const checkIfNearBottom = () => {
    const el = messagesContainerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };

  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const onScroll = () => { isNearBottomRef.current = checkIfNearBottom(); };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  // Scroll to bottom on mount (tab switch)
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'instant' });
  }, []);

  useEffect(() => {
    if (isNearBottomRef.current) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, streamContent]);

  const handleSend = () => {
    const text = inputValue.trim();
    if (!text || loading) return;
    setInputValue('');
    onSend(text);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Action bar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-default-200 bg-white dark:bg-gray-900 flex-shrink-0">
        <Zap size={16} className="text-primary-500 shrink-0" />
        <div className="flex-1 flex items-center gap-2">
          <ProgressBar
            value={completeness}
            color={completeness >= 80 ? 'success' : 'default'}
            className="flex-1"
            size="sm"
            valueLabel={`${completeness}%`}
          />
        </div>

      </div>

      {/* Messages — scrollable area */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto overflow-x-hidden px-6 py-4 bg-default-50 dark:bg-gray-950 min-h-0"
      >
        {messages.length === 0 && !streaming && (
          <div className="text-center py-20 px-10 text-default-400">
            <Bot size={64} className="mx-auto mb-4" />
            <h4 className="text-lg text-default-400 mb-2">告诉我你想做什么功能</h4>
            <p className="text-default-300 max-w-[400px] mx-auto">
              例如: "做一个用户管理后台，包含列表、新增、编辑和删除功能"
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} mb-4`}
          >
            <div className="max-w-[85%] flex gap-2 items-start">
              {msg.role === 'assistant' && (
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{ background: 'linear-gradient(135deg, #1677ff, #4096ff)' }}
                >
                  <Bot className="text-white" size={16} />
                </div>
              )}
              <div
                className={`px-4 py-2.5 shadow-sm leading-7 max-w-full overflow-hidden ${
                  msg.role === 'user'
                    ? 'rounded-[16px_16px_4px_16px]'
                    : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-[12px_12px_12px_4px]'
                }`}
                style={msg.role === 'user' ? { background: '#e8f0fe', color: '#1a1a1a' } : undefined}
              >
                <MessageContent content={msg.content} isUser={msg.role === 'user'} />
              </div>
              {msg.role === 'user' && (
                <div className="w-8 h-8 rounded-full bg-default-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <User className="text-default-500" size={16} />
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Streaming content */}
        {streaming && streamContent && (
          <div className="flex justify-start mb-4">
            <div className="max-w-[85%] flex gap-2 items-start">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                style={{ background: 'linear-gradient(135deg, #1677ff, #4096ff)' }}
              >
                <Bot className="text-white" size={16} />
              </div>
              <div className="px-4 py-2.5 rounded-[12px_12px_12px_4px] bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 shadow-sm leading-7 max-w-full overflow-hidden">
                <div className="chat-markdown">
                  {(() => {
                    let sc = streamContent;
                    // Strip JSON from streaming display
                    sc = sc.replace(/```(?:json)?\s*\n?[\s\S]*?(?:```|$)/g, '').trim();
                    sc = sc.replace(/\n?\{[\s\S]*?"(?:featureName|completeness|userRoles|businessGoal)"[\s\S]*/g, '').trim();
                    sc = sc.replace(/\n?\{[\s\S]*$/g, '').trim();
                    sc = sc.replace(/^-{3,}\s*$/gm, '').trim();
                    if (sc.length < 15) sc = '';
                    if (!sc) return <span className="text-gray-400 text-sm italic">💬 AI 思考中...</span>;
                    const p = sc.replace(/([^\n])\n(?!\n)/g, "$1\n\n");
                    return <ReactMarkdown remarkPlugins={[remarkGfm]}>{p}</ReactMarkdown>;
                  })()}
                </div>
                <span style={{ animation: 'blink 1s infinite', marginLeft: 2, color: '#1677ff' }}>▊</span>
              </div>
            </div>
          </div>
        )}

        {/* Loading indicator */}
        {loading && !streamContent && (
          <div className="flex justify-start mb-4">
            <div className="flex gap-2 items-start">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #1677ff, #4096ff)' }}
              >
                <Bot className="text-white" size={16} />
              </div>
              <div className="px-4 py-2.5 rounded-xl bg-white dark:bg-gray-800 shadow-sm flex items-center gap-2">
                <Spinner size="sm" />
                <span className="text-default-400 text-sm">AI 思考中...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Input — fixed height */}
      <div className="flex items-end gap-2 px-4 py-3 border-t border-default-200 bg-white dark:bg-gray-900 shrink-0 min-h-[72px]">
        <textarea
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="描述你的需求，或回答 AI 的问题..."
          rows={2}
          className="flex-1 resize-none rounded-xl border border-default-300 bg-white dark:bg-gray-800 dark:text-gray-200 dark:border-gray-600 px-3 py-2 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100 transition"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
        />
        {loading ? (
          <Button
            variant="danger"
            onPress={onStop}
            className="shrink-0"
          >
            <Square size={16} className="inline mr-1" /> 停止
          </Button>
        ) : (
          <Button
            variant="primary"
            onPress={handleSend}
            isDisabled={!inputValue.trim()}
            className="shrink-0"
          >
            <Send size={16} className="inline mr-1" /> 发送
          </Button>
        )}
      </div>
    </div>
  );
}

/** Generate markdown from requirement document */
function generateMarkdown(doc: RequirementDocument): string {
  const d = normalizeDoc(doc);
  const lines: string[] = [];
  lines.push(`# ${d.featureName || '需求文档'}`);
  lines.push('');
  lines.push(`> 需求完整度: ${d.completeness}%`);
  lines.push('');

  if (d.businessGoal) {
    lines.push('## 🎯 业务目标');
    lines.push(d.businessGoal);
    lines.push('');
  }

  if (d.uiLibrary) {
    lines.push('## 🎨 UI 组件库');
    lines.push(`- ${d.uiLibrary.name} (${d.uiLibrary.npmPackage})`);
    lines.push('');
  }

  if (d.pages.length > 0) {
    lines.push('## 📄 页面列表');
    d.pages.forEach(p => {
      lines.push(`### ${p.name}`);
      lines.push(`- **类型**: ${p.pageType}`);
      lines.push(`- **目标**: ${p.goal}`);
      if (p.sections.length) lines.push(`- **区域**: ${p.sections.join(', ')}`);
      if (p.actions.length) lines.push(`- **操作**: ${p.actions.join(', ')}`);
      if (p.fields.length) {
        lines.push('- **字段**:');
        p.fields.forEach(f => lines.push(`  - ${f.name} (${f.type}${f.required ? ', 必填' : ''}) — ${f.description}`));
      }
      lines.push('');
    });
  }

  if (d.entities.length > 0) {
    lines.push('## 📦 数据实体');
    d.entities.forEach(e => {
      lines.push(`### ${e.name}`);
      e.fields.forEach(f => lines.push(`- ${f.name} (${f.type}${f.required ? ', 必填' : ''})`));
      lines.push('');
    });
  }

  if (d.businessRules.length) {
    lines.push('## 📏 业务规则');
    d.businessRules.forEach(r => lines.push(`- ${r}`));
    lines.push('');
  }

  if (d.edgeCases.length) {
    lines.push('## ⚠️ 边界情况');
    d.edgeCases.forEach(e => lines.push(`- ${e}`));
    lines.push('');
  }

  if (d.phases.length) {
    lines.push('## 🗓️ 阶段规划');
    d.phases.forEach(p => lines.push(`- **${p.id}** ${p.name} (${p.priority}) — ${p.pages.join(', ')}`));
    lines.push('');
  }

  if (d.openQuestions.length) {
    lines.push('## ❓ 待确认问题');
    d.openQuestions.forEach(q => lines.push(`- [ ] ${q}`));
    lines.push('');
  }

  return lines.join('\n');
}

// ─── Document Panel ─────────────────────────────────────────────────────

interface DocumentPanelProps {
  document: RequirementDocument | null;
  onSend?: (text: string) => void;
  onRegenerate?: () => void;
  loading?: boolean;
}

/** Interactive open questions with batch answer support */
function OpenQuestionsSection({
  questions,
  onSend,
  loading,
}: {
  questions: string[];
  onSend?: (text: string) => void;
  loading?: boolean;
}) {
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [expanded, setExpanded] = useState(false);

  const handleAnswer = (idx: number, value: string) => {
    setAnswers(prev => ({ ...prev, [idx]: value }));
  };

  const handleSubmitAll = () => {
    if (!onSend) return;
    const answered = Object.entries(answers).filter(([, v]) => v.trim());
    if (answered.length === 0) return;
    const parts = answered.map(([idx, answer]) => `${questions[Number(idx)]}\n${answer}`);
    onSend(parts.join('\n\n'));
    setAnswers({});
  };

  const answeredCount = Object.values(answers).filter(v => v.trim()).length;

  return (
    <div className="flex flex-col gap-2">
      {/* Compact list view */}
      <div className="flex flex-col gap-1.5">
        {questions.map((q, idx) => (
          <div key={idx} className="flex items-start gap-2 group">
            <span className="text-amber-500 mt-0.5 text-xs font-bold w-4 text-right flex-shrink-0">{idx + 1}.</span>
            <p className="text-gray-700 text-sm flex-1 leading-relaxed">{q}</p>
          </div>
        ))}
      </div>

      {/* Toggle answer mode */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="mt-1 w-full py-2 px-3 rounded-lg border-2 border-dashed border-blue-300 text-blue-600 text-sm font-medium hover:bg-blue-50 hover:border-blue-400 transition flex items-center justify-center gap-2"
      >
        {expanded ? '收起回答' : `回答这些问题 (${questions.length})`}
      </button>

      {/* Batch answer area */}
      {expanded && (
        <div className="flex flex-col gap-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600">
          {questions.map((q, idx) => (
            <div key={idx} className="flex items-start gap-2">
              <span className="text-gray-400 text-xs mt-2 w-4 text-right flex-shrink-0">{idx + 1}.</span>
              <div className="flex-1 flex flex-col gap-1">
                <p className="text-gray-500 text-xs">{q}</p>
                <textarea
                  value={answers[idx] ?? ''}
                  onChange={(e) => handleAnswer(idx, e.target.value)}
                  placeholder="你的回答..."
                  rows={1}
                  className="w-full resize-none rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 px-2.5 py-1.5 text-sm text-gray-800 dark:text-gray-200 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 transition"
                />
              </div>
            </div>
          ))}

          {answeredCount > 0 && (
            <button
              onClick={handleSubmitAll}
              disabled={loading}
              className="mt-1 w-full py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              提交 {answeredCount} 个回答
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function DocumentPanel({ document: doc, onSend, onRegenerate, loading }: DocumentPanelProps) {
  if (!doc) {
    return (
      <div className="p-6 text-center text-default-400">
        <FileText size={48} className="mx-auto mb-4" />
        <div>开始对话后，需求文档将在这里实时展示</div>
      </div>
    );
  }

  const d = normalizeDoc(doc);

  const handleExportMd = () => {
    const md = generateMarkdown(d);
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${doc.featureName || '需求文档'}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4">
      {/* Header with action buttons */}
      <div className="flex items-center justify-between mb-3">
        <h5 className="text-lg font-semibold">📋 {d.featureName || '未命名功能'}</h5>
        <div className="flex gap-1">
          <button
            onClick={onRegenerate}
            disabled={loading}
            className="p-1.5 rounded-lg hover:bg-default-100 text-default-500 hover:text-default-700 disabled:opacity-40 transition"
            title="重新生成文档"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={handleExportMd}
            className="p-1.5 rounded-lg hover:bg-default-100 text-default-500 hover:text-default-700 transition"
            title="导出 Markdown"
          >
            <Download size={16} />
          </button>
        </div>
      </div>

      {/* Completeness progress with milestone hints */}
      <ProgressBar
        value={d.completeness}
        color={d.completeness >= 80 ? 'success' : 'default'}
        className="mb-2"
        valueLabel={`${d.completeness}%`}
      />

      {/* Milestone notification */}
      {d.completeness >= 80 && d.completeness < 95 && (
        <div className="mb-3 p-2 rounded-lg bg-success-50 border border-success-200 flex items-start gap-2">
          <CheckCircle size={16} className="text-success-500 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-success-700">
            <span className="font-medium">需求已足够完整！</span> 可以生成可预览前端页面了。
          </div>
        </div>
      )}
      {d.completeness >= 95 && (
        <div className="mb-3 p-2 rounded-lg bg-success-50 border border-success-200 flex items-start gap-2">
          <CheckCircle size={16} className="text-success-500 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-success-700">
            <span className="font-medium">需求非常完整！</span> 可以直接生成代码。
          </div>
        </div>
      )}

      <Accordion
        variant="default"
        defaultExpandedKeys={['goal', 'ui', 'pages', 'questions']}
      >
        <AccordionItem key="goal">
          <AccordionHeading>
            <AccordionTrigger>🎯 业务目标</AccordionTrigger>
          </AccordionHeading>
          <AccordionPanel>
            <p className="text-default-700">{d.businessGoal || '未定义'}</p>
          </AccordionPanel>
        </AccordionItem>

        <AccordionItem key="ui">
          <AccordionHeading>
            <AccordionTrigger>🎨 UI 组件库</AccordionTrigger>
          </AccordionHeading>
          <AccordionPanel>
            {d.uiLibrary ? (
              <Chip color="default" variant="soft">{d.uiLibrary.name}</Chip>
            ) : (
              <Chip variant="soft">未选择</Chip>
            )}
          </AccordionPanel>
        </AccordionItem>

        <AccordionItem key="pages">
          <AccordionHeading>
            <AccordionTrigger>📄 页面 ({d.pages.length})</AccordionTrigger>
          </AccordionHeading>
          <AccordionPanel>
            <div className="flex flex-col gap-2">
              {d.pages.map((page, idx) => (
                <div key={idx} className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <Chip size="sm" variant="soft">{page.pageType}</Chip>
                    <span className="font-medium">{page.name}</span>
                  </div>
                  <p className="text-default-400 text-sm">{page.goal}</p>
                </div>
              ))}
            </div>
          </AccordionPanel>
        </AccordionItem>

        <AccordionItem key="entities">
          <AccordionHeading>
            <AccordionTrigger>📦 实体 ({d.entities.length})</AccordionTrigger>
          </AccordionHeading>
          <AccordionPanel>
            <div className="flex flex-col gap-2">
              {d.entities.map((entity, idx) => (
                <div key={idx} className="flex flex-col gap-1">
                  <span className="font-medium">{entity.name}</span>
                  <p className="text-default-400 text-sm">{entity.fields.length} 个字段</p>
                </div>
              ))}
            </div>
          </AccordionPanel>
        </AccordionItem>

        <AccordionItem key="rules">
          <AccordionHeading>
            <AccordionTrigger>📏 业务规则 ({d.businessRules.length})</AccordionTrigger>
          </AccordionHeading>
          <AccordionPanel>
            <div className="flex flex-col gap-1">
              {d.businessRules.map((rule, idx) => (
                <p key={idx} className="text-default-700 text-sm">• {rule}</p>
              ))}
            </div>
          </AccordionPanel>
        </AccordionItem>

        <AccordionItem key="phases">
          <AccordionHeading>
            <AccordionTrigger>🗓️ 阶段 ({d.phases.length})</AccordionTrigger>
          </AccordionHeading>
          <AccordionPanel>
            <div className="flex flex-col gap-2">
              {d.phases.map((phase, idx) => (
                <div key={idx} className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <Chip size="sm" color="default" variant="soft">{phase.id}</Chip>
                    <span className="font-medium">{phase.name}</span>
                    <Chip size="sm" color="warning" variant="soft">{phase.priority}</Chip>
                  </div>
                  <p className="text-default-400 text-sm">{phase.pages.join(', ')}</p>
                </div>
              ))}
            </div>
          </AccordionPanel>
        </AccordionItem>

        {d.openQuestions.length > 0 && (
          <AccordionItem key="questions">
            <AccordionHeading>
              <AccordionTrigger>❓ 待确认 ({d.openQuestions.length})</AccordionTrigger>
            </AccordionHeading>
            <AccordionPanel>
              <OpenQuestionsSection
                questions={d.openQuestions}
                onSend={onSend}
                loading={loading}
              />
            </AccordionPanel>
          </AccordionItem>
        )}
      </Accordion>
    </div>
  );
}