/**
 * DesignPanel — frontend preview viewer with generate button, version history,
 * explicit save button and draft state indicator.
 */

import { useState } from 'react';
import { Image, Sparkles, Loader2, History, Check, ChevronDown, Download, Save } from 'lucide-react';

interface DesignVersion {
  id: string;
  label: string;
  model: string;
  createdAt: number;
  html?: string;
}

interface DesignPanelProps {
  html: string | null;
  completeness: number;
  loading: boolean;
  versions: DesignVersion[];
  activeDesignId: string | null;
  isDraft: boolean;
  onGenerate: () => void;
  onSave: () => void;
  onSwitchVersion: (versionId: string) => void;
}

export function DesignPanel({
  html,
  completeness,
  loading,
  versions,
  activeDesignId,
  isDraft,
  onGenerate,
  onSave,
  onSwitchVersion,
}: DesignPanelProps) {
  const canGenerate = completeness >= 80;
  const [menuOpen, setMenuOpen] = useState(false);

  const activeLabel = versions.find(v => v.id === activeDesignId)?.label;

  const handleDownloadHtml = () => {
    if (!html) return;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'preview.html';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!html && versions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-gray-400 h-full">
        <Image className="w-16 h-16 mb-4 opacity-40" />
        <h4 className="text-lg font-semibold text-gray-500 mb-2">前端预览</h4>
        <p className="text-sm mb-6 text-center">
          {canGenerate
            ? '需求已就绪，点击下方按钮生成可预览前端页面'
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
              生成中...
            </>
          ) : (
            <>
              <Sparkles size={16} />
              生成预览页
            </>
          )}
        </button>
      </div>
    );
  }

  // Show empty state if versions exist but no html loaded
  if (!html && versions.length > 0) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-gray-400 h-full">
        <History className="w-16 h-16 mb-4 opacity-40" />
        <h4 className="text-lg font-semibold text-gray-500 mb-2">选择设计版本</h4>
        <p className="text-sm mb-4">该会话有 {versions.length} 个历史版本</p>
        <div className="flex flex-col gap-2">
          {versions.map(v => (
            <button key={v.id} onClick={() => onSwitchVersion(v.id)}
              className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm text-left">
              {v.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Version toolbar */}
      {(versions.length > 0 || isDraft) && (
        <div className="flex items-center justify-between px-4 py-2 bg-gray-50 dark:bg-gray-900 border-b dark:border-gray-700 shrink-0 gap-2">
          {/* Left: version indicator + dropdown */}
          <div className="flex items-center gap-2 min-w-0">
            <Image className="w-4 h-4 text-blue-500 shrink-0" />
            {versions.length > 0 && (
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
                              ${v.id === activeDesignId
                                ? 'bg-blue-50 text-blue-700'
                                : 'hover:bg-gray-50 text-gray-700'
                              }`}
                          >
                            {v.id === activeDesignId ? (
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
            )}
            {isDraft && (
              <span className="text-xs text-amber-600 font-medium whitespace-nowrap px-2 py-0.5 bg-amber-50 rounded">
                未保存的草稿
              </span>
            )}
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
              onClick={handleDownloadHtml}
              disabled={!html}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white
                border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors
                disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download size={14} />
              <span>下载 HTML</span>
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
      )}
      <iframe
        srcDoc={html ?? undefined}
        className="flex-1 w-full border-none"
        title="Frontend Preview"
        sandbox="allow-scripts allow-same-origin allow-popups allow-downloads"
        loading="lazy"
        referrerPolicy="no-referrer"
      />
    </div>
  );
}
