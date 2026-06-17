/**
 * DocumentPanel — Structured requirement document with per-module optimization
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@heroui/react/button';
import { Chip } from '@heroui/react/chip';
import { ProgressBar } from '@heroui/react/progress-bar';
import { Spinner } from '@heroui/react/spinner';
import {
  FileText,
  RefreshCw,
  Download,
  CheckCircle,
  Sparkles,
  Pencil,
  X,
  Clock,
  LayoutTemplate,
} from 'lucide-react';
import { Select, SelectTrigger, SelectValue, SelectPopover } from '@heroui/react/select';
import { ListBox } from '@heroui/react/list-box';
import type { RequirementDocument } from '../hooks/useChat';

// ─── Normalize ─────────────────────────────────────────────────────────

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

// ─── Module Config ─────────────────────────────────────────────────────

interface ModuleConfig {
  key: string;
  label: string;
  icon: string;
  type: 'text' | 'array-objects' | 'array-strings' | 'object';
}

const MODULES: ModuleConfig[] = [
  { key: 'businessGoal', label: '业务目标', icon: '🎯', type: 'text' },
  { key: 'userRoles', label: '用户角色', icon: '👥', type: 'array-objects' },
  { key: 'uiLibrary', label: 'UI 组件库', icon: '🎨', type: 'object' },
  { key: 'pages', label: '页面', icon: '📄', type: 'array-objects' },
  { key: 'entities', label: '数据实体', icon: '📦', type: 'array-objects' },
  { key: 'businessRules', label: '业务规则', icon: '📏', type: 'array-strings' },
  { key: 'edgeCases', label: '边界情况', icon: '⚠️', type: 'array-strings' },
  { key: 'nonFunctional', label: '非功能需求', icon: '🔧', type: 'array-strings' },
  { key: 'phases', label: '阶段规划', icon: '🗓️', type: 'array-objects' },
];

// ─── Optimize Modal ────────────────────────────────────────────────────

interface OptimizeModalProps {
  isOpen: boolean;
  onClose: () => void;
  moduleConfig: ModuleConfig;
  currentValue: unknown;
  loading: boolean;
  onOptimize: (instruction: string) => void;
}

function OptimizeModal({ isOpen, onClose, moduleConfig, currentValue, loading, onOptimize }: OptimizeModalProps) {
  const [instruction, setInstruction] = useState('');
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  const modalRef = useRef<HTMLDivElement>(null);

  // 初始化位置居中
  useEffect(() => {
    if (isOpen) {
      setPosition({
        x: Math.max(0, (window.innerWidth - 480) / 2),
        y: Math.max(0, (window.innerHeight - 400) / 2),
      });
      setInstruction('');
    }
  }, [isOpen]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // 只在 header 区域触发拖动
    const target = e.target as HTMLElement;
    if (target.closest('button')) return; // 忽略按钮点击
    
    setIsDragging(true);
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      posX: position.x,
      posY: position.y,
    };
    e.preventDefault();
  }, [position]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      setPosition({
        x: dragStart.current.posX + dx,
        y: dragStart.current.posY + dy,
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  if (!isOpen) return null;

  const handleSubmit = () => {
    if (instruction.trim()) {
      onOptimize(instruction.trim());
      setInstruction('');
    }
  };

  return (
    <div
      ref={modalRef}
      className="fixed z-50 w-[480px] max-h-[80vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col select-none"
      style={{
        left: position.x,
        top: position.y,
        cursor: isDragging ? 'grabbing' : 'default',
      }}
    >
      {/* Header — 可拖动区域 */}
      <div
        className="flex items-center justify-between px-5 py-4 border-b border-gray-100 cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
      >
        <div className="flex items-center gap-2 pointer-events-none">
          <Pencil size={18} className="text-blue-500" />
          <span className="font-semibold text-gray-800">优化 {moduleConfig.label}</span>
        </div>
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 transition">
          <X size={18} className="text-gray-400" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto p-5 flex flex-col gap-4">
        {/* Current value preview */}
        <div>
          <p className="text-xs text-gray-400 mb-1.5 uppercase tracking-wider font-medium">当前内容</p>
          <div className="bg-gray-50 rounded-lg p-3 max-h-40 overflow-auto text-sm text-gray-600 border border-gray-100">
            {currentValue ? (
              <pre className="whitespace-pre-wrap break-words text-xs">
                {typeof currentValue === 'string' ? currentValue : JSON.stringify(currentValue, null, 2)}
              </pre>
            ) : (
              <span className="text-gray-300 italic">暂无内容</span>
            )}
          </div>
        </div>

        {/* Instruction input */}
        <div>
          <p className="text-xs text-gray-400 mb-1.5 uppercase tracking-wider font-medium">优化指令</p>
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder={`描述你想要的修改，例如：\n- 补充目标用户画像\n- 增加删除功能\n- 细化字段定义`}
            rows={4}
            className="w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm
              outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSubmit();
              }
            }}
          />
          <p className="text-[10px] text-gray-300 mt-1">Ctrl+Enter 提交</p>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100 bg-gray-50/50">
        <Button variant="ghost" size="sm" onPress={onClose}>取消</Button>
        <Button
          variant="primary"
          size="sm"
          onPress={handleSubmit}
          isDisabled={!instruction.trim() || loading}
        >
          {loading ? <Spinner size="sm" className="mr-1" /> : <Sparkles size={14} className="mr-1" />}
          优化
        </Button>
      </div>
    </div>
  );
}

// ─── Open Questions Section ────────────────────────────────────────────

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
      <div className="flex flex-col gap-1.5">
        {questions.map((q, idx) => (
          <div key={idx} className="flex items-start gap-2">
            <span className="text-amber-500 mt-0.5 text-xs font-bold w-4 text-right shrink-0">{idx + 1}.</span>
            <p className="text-gray-700 text-sm flex-1 leading-relaxed">{q}</p>
          </div>
        ))}
      </div>

      <button
        onClick={() => setExpanded(!expanded)}
        className="mt-1 w-full py-2 px-3 rounded-lg border-2 border-dashed border-blue-300 text-blue-600 text-sm font-medium hover:bg-blue-50 hover:border-blue-400 transition flex items-center justify-center gap-2"
      >
        {expanded ? '收起回答' : `回答这些问题 (${questions.length})`}
      </button>

      {expanded && (
        <div className="flex flex-col gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
          {questions.map((q, idx) => (
            <div key={idx} className="flex items-start gap-2">
              <span className="text-gray-400 text-xs mt-2 w-4 text-right shrink-0">{idx + 1}.</span>
              <div className="flex-1 flex flex-col gap-1">
                <p className="text-gray-500 text-xs">{q}</p>
                <textarea
                  value={answers[idx] ?? ''}
                  onChange={(e) => setAnswers(prev => ({ ...prev, [idx]: e.target.value }))}
                  placeholder="你的回答..."
                  rows={1}
                  className="w-full resize-none rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-800 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 transition"
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

// ─── Module Section Renderer ───────────────────────────────────────────

function ModuleSection({
  config,
  value,
  onOptimize,
  optimizingModule,
  history = [],
}: {
  config: ModuleConfig;
  value: unknown;
  onOptimize: (module: string, instruction: string) => void;
  optimizingModule: string | null;
  history?: Array<{ module: string; instruction: string; timestamp: number; previousValue: unknown }>;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const isOptimizing = optimizingModule === config.key;
  const moduleHistory = history.filter(h => h.module === config.key);

  const renderContent = () => {
    if (!value || (Array.isArray(value) && value.length === 0)) {
      return <p className="text-gray-300 text-sm italic">暂未定义</p>;
    }

    switch (config.type) {
      case 'text':
        return <p className="text-gray-700 text-sm leading-relaxed">{String(value)}</p>;

      case 'object':
        if (typeof value === 'object' && value !== null) {
          const obj = value as Record<string, unknown>;
          return (
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(obj).map(([k, v]) => (
                <Chip key={k} size="sm" variant="soft" color="default">
                  {k}: {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                </Chip>
              ))}
            </div>
          );
        }
        return <p className="text-gray-700 text-sm">{String(value)}</p>;

      case 'array-objects': {
        const arr = value as Array<Record<string, unknown>>;
        return (
          <div className="flex flex-col gap-2">
            {arr.map((item, idx) => {
              const name = String(item.name ?? '未命名');
              const desc = item.description ? String(item.description) : '';
              const goal = item.goal ? String(item.goal) : '';
              const pageType = item.pageType ? String(item.pageType) : '';
              const fieldsCount = item.fields && Array.isArray(item.fields) ? (item.fields as unknown[]).length : 0;
              return (
                <div key={idx} className="flex items-start gap-2">
                  <span className="text-gray-400 text-xs mt-1 w-4 text-right shrink-0">{idx + 1}.</span>
                  <div className="flex-1">
                    <span className="font-medium text-sm text-gray-800">{name}</span>
                    {desc && <span className="text-gray-500 text-xs ml-2">— {desc}</span>}
                    {goal && <span className="text-gray-500 text-xs ml-2">— {goal}</span>}
                    {pageType && <Chip size="sm" variant="soft" className="ml-2">{pageType}</Chip>}
                    {fieldsCount > 0 && <p className="text-gray-400 text-xs mt-0.5">{fieldsCount} 个字段</p>}
                  </div>
                </div>
              );
            })}
          </div>
        );
      }

      case 'array-strings': {
        const arr = value as string[];
        return (
          <div className="flex flex-col gap-1">
            {arr.map((item, idx) => (
              <p key={idx} className="text-gray-700 text-sm">• {item}</p>
            ))}
          </div>
        );
      }

      default:
        return <p className="text-gray-700 text-sm">{JSON.stringify(value)}</p>;
    }
  };

  return (
    <>
      <div className={`border border-gray-200 rounded-xl p-3 shadow-sm bg-white hover:shadow-md transition-shadow relative ${isOptimizing ? 'overflow-hidden' : ''}`}>
        {/* Loading overlay */}
        {isOptimizing && (
          <div className="absolute inset-0 bg-white/70 backdrop-blur-sm z-10 flex items-center justify-center rounded-xl">
            <div className="flex items-center gap-2 text-blue-600">
              <Spinner size="sm" />
              <span className="text-xs font-medium">优化中...</span>
            </div>
          </div>
        )}
        <div className="flex items-center justify-between mb-2">
          <span className="font-semibold text-sm text-gray-800">
            {config.icon} {config.label}
            <span className="ml-1 text-xs text-gray-500 font-normal">
              ({Array.isArray(value) ? (value as unknown[]).length : value ? 1 : 0})
            </span>
          </span>
          <div className="flex gap-0.5">
            {/* History button */}
            {moduleHistory.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setHistoryOpen(!historyOpen)}
                  className="p-1.5 rounded-lg hover:bg-amber-50 text-gray-400 hover:text-amber-600 transition"
                  title="查看历史"
                >
                  <Clock size={14} />
                </button>
                {historyOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setHistoryOpen(false)} />
                    <div className="absolute right-0 top-full mt-1 z-50 w-72 rounded-xl bg-white border border-gray-200 shadow-xl overflow-hidden">
                      <div className="px-3 py-2 text-[10px] text-gray-400 uppercase tracking-wider font-medium bg-gray-50 border-b">
                        优化历史 ({moduleHistory.length})
                      </div>
                      <div className="max-h-60 overflow-auto">
                        {moduleHistory.slice().reverse().map((h, i) => (
                          <div key={i} className="px-3 py-2 border-b border-gray-100 last:border-0">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[10px] text-gray-400">
                                {new Date(h.timestamp).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <p className="text-xs text-gray-600">{h.instruction}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
            {/* Optimize button */}
            <button
              onClick={() => setModalOpen(true)}
              disabled={isOptimizing}
              className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-500 transition disabled:opacity-40"
              title={`优化${config.label}`}
            >
              {isOptimizing ? <Spinner size="sm" /> : <Sparkles size={14} />}
            </button>
          </div>
        </div>
        {renderContent()}
      </div>

      <OptimizeModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        moduleConfig={config}
        currentValue={value}
        loading={isOptimizing}
        onOptimize={(instruction) => {
          onOptimize(config.key, instruction);
          setModalOpen(false);
        }}
      />
    </>
  );
}

// ─── Generate Markdown ─────────────────────────────────────────────────

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

// ─── DocumentPanel ─────────────────────────────────────────────────────

interface DocumentPanelProps {
  document: RequirementDocument | null;
  sessionId: string | null;
  generating: boolean;
  optimizingModule: string | null;
  onGenerate: () => void;
  onOptimize: (module: string, instruction: string) => void;
  onSend?: (text: string) => void;
  loading?: boolean;
  profileId?: string;
  onProfileChange?: (v: string) => void;
}

export function DocumentPanel({
  document: doc,
  sessionId,
  generating,
  optimizingModule,
  onGenerate,
  onOptimize,
  onSend,
  loading,
  profileId = 'vue3-admin',
  onProfileChange,
}: DocumentPanelProps) {
  if (!doc) {
    return (
      <div className="p-6 text-center text-default-400 flex flex-col items-center justify-center h-full">
        <FileText size={48} className="mx-auto mb-4 opacity-40" />
        <p className="text-sm mb-3">开始对话后，需求文档将在这里实时展示</p>
        {sessionId && (
          <Button
            variant="primary"
            size="sm"
            onPress={onGenerate}
            isDisabled={generating}
          >
            {generating ? <Spinner size="sm" className="mr-1" /> : <Sparkles size={14} className="mr-1" />}
            {generating ? '生成中...' : '生成结构化文档'}
          </Button>
        )}
      </div>
    );
  }

  const d = normalizeDoc(doc);

  const handleExportMd = () => {
    const md = generateMarkdown(doc);
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${doc.featureName || '需求文档'}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Fixed header area */}
      <div className="p-4 pb-2 shrink-0 flex flex-col gap-3">
        {/* Header */}
        <div className="flex items-center justify-between">
        <h5 className="text-lg font-semibold truncate flex-1">📋 {d.featureName || '未命名功能'}</h5>
        <div className="flex gap-1 shrink-0">
          <button
            onClick={onGenerate}
            disabled={generating}
            className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-500 hover:text-blue-600 disabled:opacity-40 transition"
            title="重新生成文档"
          >
            {generating ? <Spinner size="sm" /> : <RefreshCw size={16} className={generating ? 'animate-spin' : ''} />}
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

      {/* Completeness progress */}
      <div>
        <ProgressBar
          value={d.completeness}
          color={d.completeness >= 80 ? 'success' : d.completeness >= 50 ? 'warning' : 'default'}
          className="mb-1"
          size="sm"
          valueLabel={`${d.completeness}%`}
        />
        {d.completeness >= 80 && d.completeness < 95 && (
          <div className="mt-2 p-2 rounded-lg bg-success-50 border border-success-200 flex items-start gap-2">
            <CheckCircle size={14} className="text-success-500 mt-0.5 shrink-0" />
            <span className="text-xs text-success-700">需求已足够完整，可以生成可预览前端页面了</span>
          </div>
        )}
        {d.completeness >= 95 && (
          <div className="mt-2 p-2 rounded-lg bg-success-50 border border-success-200 flex items-start gap-2">
            <CheckCircle size={14} className="text-success-500 mt-0.5 shrink-0" />
            <span className="text-xs text-success-700">需求非常完整，可以直接生成代码</span>
          </div>
        )}
      </div>

      {/* Generate button */}
      <Button
        variant="primary"
        size="sm"
        className="w-full"
        onPress={onGenerate}
        isDisabled={generating}
      >
        {generating ? <Spinner size="sm" className="mr-1" /> : <Sparkles size={14} className="mr-1" />}
        {generating ? '生成中...' : '生成结构化文档'}
      </Button>
      </div>

      {/* Scrollable module sections */}
      <div className="flex-1 overflow-auto p-4 pt-0">
        <div className="flex flex-col gap-3">
        {MODULES.map(config => (
          <ModuleSection
            key={config.key}
            config={config}
            value={(d as Record<string, unknown>)[config.key]}
            onOptimize={onOptimize}
            optimizingModule={optimizingModule}
            history={(d._optimizeHistory as Array<{ module: string; instruction: string; timestamp: number; previousValue: unknown }>) ?? []}
          />
        ))}

        {d.openQuestions.length > 0 && (
          <div className="border border-gray-200 rounded-xl p-3 shadow-sm bg-white">
            <span className="font-semibold text-sm text-gray-800 mb-2 block">
              ❓ 待确认 ({d.openQuestions.length})
            </span>
            <OpenQuestionsSection
              questions={d.openQuestions}
              onSend={onSend}
              loading={loading}
            />
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
