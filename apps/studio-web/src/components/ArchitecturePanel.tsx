/**
 * ArchitecturePanel — displays the architecture design markdown with generate button
 */

import { Layers, Sparkles, Loader2, Download } from 'lucide-react';

interface ArchitecturePanelProps {
  markdown: string | null;
  completeness: number;
  loading: boolean;
  onGenerate: () => void;
}

export function ArchitecturePanel({ markdown, completeness, loading, onGenerate }: ArchitecturePanelProps) {
  const canGenerate = completeness >= 80;

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

  if (!markdown) {
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

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-gray-50 shrink-0">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Layers className="w-4 h-4 text-blue-500" />
          <span className="font-medium">架构设计方案</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDownloadMd}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white
              border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <Download size={14} />
            <span>下载 .md</span>
          </button>
          <button
            onClick={onGenerate}
            disabled={loading}
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
        <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-gray-700 bg-white
          border border-gray-100 rounded-xl p-6 max-w-4xl mx-auto
          [&_.h1]:text-2xl [&_.h2]:text-xl">
          {markdown}
        </pre>
      </div>
    </div>
  );
}
