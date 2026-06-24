/**
 * ArchitecturePanel — architecture design viewer with markdown rendering,
 * version history dropdown, explicit save, and chat-based refinement.
 */

import { useState } from 'react';
import { Layers, Sparkles, Loader2, Download, History, Check, ChevronDown, Save, Send } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ArchitectureVersion {
  id: string;
  label: string;
  model: string;
  createdAt: number;
}

interface ArchitecturePanelProps {
  markdown: string | null;
  completeness: number;
  loading: boolean;
  versions: ArchitectureVersion[];
  activeArchId: string | null;
  isDraft: boolean;
  refining: boolean;
  onGenerate: () => void;
  onSwitchVersion: (versionId: string) => void;
  onSave: () => void;
  onSendFeedback: (message: string) => void;
}

export function ArchitecturePanel({
  markdown,
  completeness,
  loading,
  versions,
  activeArchId,
  isDraft,
  refining,
  onGenerate,
  onSwitchVersion,
  onSave,
  onSendFeedback,
}: ArchitecturePanelProps) {
  const canGenerate = completeness >= 80;
  const [menuOpen, setMenuOpen] = useState(false);
  const [feedbackInput, setFeedbackInput] = useState('');

  const activeLabel = versions.find(v => v.id === activeArchId)?.label;

  const handleDownloadMd = () => {
    if (!markdown) return;
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'architecture-design.md';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSendFeedback = () => {
    if (!feedbackInput.trim() || refining) return;
    onSendFeedback(feedbackInput.trim());
    setFeedbackInput('');
  };

  // ── Empty state: no markdown, no versions ──
  if (!markdown && versions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-gray-400 h-full">
        <Layers className="w-16 h-16 mb-4 opacity-40" />
        <h4 className="text-lg font-semibold text-gray-500 mb-2">架构设计</h4>
        <p className="text-sm mb-6 text-center">
          {canGenerate
            ? '需求已就绪，点击下方按钮生成全栈架构设计方案'
            : `需求完整度需要达到 80% 才能生成（当前 ${completeness}%）`}
        </p>
        <button
          onClick={onGenerate}
          disabled={!canGenerate || loading}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium
            hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all
            shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40"
        >
          {loading ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              <span>架构生成中...</span>
            </>
          ) : (
            <>
              <Sparkles size={16} />
              <span>生成架构方案</span>
            </>
          )}
        </button>
      </div>
    );
  }

  // ── Versions exist but no markdown loaded ──
  if (!markdown && versions.length > 0) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-gray-400 h-full">
        <Layers className="w-16 h-16 mb-4 opacity-40" />
        <h4 className="text-lg font-semibold text-gray-500 mb-2">选择版本</h4>
        <div className="flex flex-col gap-2 max-w-xs w-full">
          {versions.slice().reverse().map(v => (
            <button
              key={v.id}
              onClick={() => onSwitchVersion(v.id)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white border border-gray-200
                hover:border-blue-300 hover:bg-blue-50 text-sm text-gray-700 transition-all"
            >
              {v.id === activeArchId ? (
                <div className="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center shrink-0">
                  <Check className="w-3 h-3 text-white" />
                </div>
              ) : (
                <div className="w-4 h-4 rounded-full border border-gray-300 shrink-0" />
              )}
              <div className="flex-1 text-left">
                <div className="font-medium truncate">{v.label}</div>
                <div className="text-[10px] text-gray-400">{v.model}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── Content state: markdown loaded ──
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-gray-50 shrink-0 gap-2">
        {/* Left: version indicator + dropdown */}
        <div className="flex items-center gap-2 min-w-0">
          <Layers className="w-4 h-4 text-blue-500 shrink-0" />
          {isDraft ? (
            <span className="text-sm text-amber-600 font-medium whitespace-nowrap">
              未保存的草稿
            </span>
          ) : versions.length > 0 ? (
            <div className="relative">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="flex items-center gap-1.5 px-2 py-1 text-sm text-gray-700 bg-white
                  border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <History size={14} />
                <span className="max-w-[160px] truncate">{activeLabel ?? '选择版本'}</span>
                <ChevronDown size={14} className={menuOpen ? 'rotate-180' : ''} />
              </button>

              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                  <div className="absolute left-0 top-full mt-1 z-50 w-72 rounded-xl overflow-hidden bg-white border border-gray-200 shadow-xl">
                    <div className="px-3 py-2 text-[10px] text-gray-400 uppercase tracking-wider font-medium">
                      历史版本 ({versions.length})
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      {versions.slice().reverse().map(v => (
                        <button
                          key={v.id}
                          onClick={() => {
                            onSwitchVersion(v.id);
                            setMenuOpen(false);
                          }}
                          className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm transition-colors
                            ${v.id === activeArchId
                              ? 'bg-blue-50 text-blue-700'
                              : 'hover:bg-gray-50 text-gray-700'
                            }`}
                        >
                          {v.id === activeArchId ? (
                            <div className="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center shrink-0">
                              <Check className="w-3 h-3 text-white" />
                            </div>
                          ) : (
                            <div className="w-4 h-4 rounded-full border border-gray-300 shrink-0" />
                          )}
                          <div className="flex-1 text-left min-w-0">
                            <div className="font-medium truncate">{v.label}</div>
                            <div className="text-[10px] text-gray-400">{v.model}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : null}
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-2 shrink-0">
          {isDraft && (
            <button
              onClick={onSave}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-emerald-600
                rounded-lg hover:bg-emerald-700 transition-colors"
            >
              <Save size={14} />
              <span>保存</span>
            </button>
          )}
          <button
            onClick={handleDownloadMd}
            disabled={!markdown}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white
              border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors
              disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download size={14} />
            <span>下载 .md</span>
          </button>
          <button
            onClick={onGenerate}
            disabled={loading || !canGenerate}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-blue-600
              rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                <span>生成中...</span>
              </>
            ) : (
              <>
                <Sparkles size={14} />
                <span>重新生成</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Markdown content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="bg-white border border-gray-100 rounded-xl p-6 max-w-4xl mx-auto">
          <div className="chat-markdown prose prose-sm max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {markdown}
            </ReactMarkdown>
          </div>
        </div>
      </div>

      {/* Refinement chat input */}
      <div className="flex items-end gap-2 px-4 py-3 border-t border-gray-200 bg-white shrink-0">
        <textarea
          value={feedbackInput}
          onChange={(e) => setFeedbackInput(e.target.value)}
          placeholder="输入反馈来调整架构设计...（如：将数据库改为 MongoDB，添加 Redis 缓存层）"
          rows={2}
          className="flex-1 resize-none rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm
            outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100
            placeholder:text-gray-400"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSendFeedback();
            }
          }}
        />
        <button
          onClick={handleSendFeedback}
          disabled={!feedbackInput.trim() || refining}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium
            hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
        >
          {refining ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Send size={16} />
          )}
        </button>
      </div>
    </div>
  );
}
