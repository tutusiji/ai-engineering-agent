/**
 * DesignPanel — frontend preview viewer with generate button and version history
 */

import { useState } from 'react';
import { Image, Sparkles, Loader2, History, Check, ChevronDown, Download } from 'lucide-react';

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
  onGenerate: () => void;
  onSwitchVersion: (versionId: string) => void;
}

export function DesignPanel({ html, completeness, loading, versions, activeDesignId, onGenerate, onSwitchVersion }: DesignPanelProps) {
  const canGenerate = completeness >= 80;
  const [menuOpen, setMenuOpen] = useState(false);

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
      {versions.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 border-b shrink-0">
          <History className="w-4 h-4 text-gray-400" />
          <div className="relative flex-1">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium
                bg-white border hover:border-blue-300 transition-colors cursor-pointer"
            >
              <span>{versions.find(v => v.id === activeDesignId)?.label ?? '选择版本'}</span>
              <ChevronDown className={`w-3 h-3 transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <div className="absolute left-0 top-full mt-1 z-50 w-64 rounded-xl overflow-hidden
                  bg-white border shadow-xl">
                  <div className="px-3 py-2 text-[10px] text-gray-400 uppercase tracking-wider font-medium">
                    历史版本 ({versions.length})
                  </div>
                  {versions.slice().reverse().map(v => (
                    <button key={v.id}
                      onClick={() => { onSwitchVersion(v.id); setMenuOpen(false); }}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors cursor-pointer
                        ${v.id === activeDesignId ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50'}`}>
                      <div className={`w-4 h-4 rounded flex items-center justify-center
                        ${v.id === activeDesignId ? 'bg-blue-500' : 'border'}`}>
                        {v.id === activeDesignId && <Check className="w-3 h-3 text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{v.label}</div>
                        <div className="text-[10px] text-gray-400">{v.model}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <button
            onClick={onGenerate}
            disabled={!canGenerate || loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium
              hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
          >
            {loading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
            重新生成
          </button>
          <button
            onClick={handleDownloadHtml}
            disabled={!html}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border text-gray-700 text-xs font-medium
              hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
            title="下载当前预览 HTML"
          >
            <Download size={12} />
            下载 HTML
          </button>
        </div>
      )}
      <iframe
        srcDoc={html ?? undefined}
        className="flex-1 w-full border-none"
        title="Frontend Preview"
      />
    </div>
  );
}
