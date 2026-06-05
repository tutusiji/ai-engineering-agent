/**
 * DesignPanel — design mockup viewer with generate button
 */

import { Image, Sparkles, Loader2 } from 'lucide-react';

interface DesignPanelProps {
  html: string | null;
  completeness: number;
  loading: boolean;
  onGenerate: () => void;
}

export function DesignPanel({ html, completeness, loading, onGenerate }: DesignPanelProps) {
  const canGenerate = completeness >= 80;

  if (!html) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-gray-400">
        <Image className="w-16 h-16 mb-4 opacity-40" />
        <h4 className="text-lg font-semibold text-gray-500 mb-2">设计稿预览</h4>
        <p className="text-sm mb-6 text-center">
          {canGenerate
            ? '需求已就绪，点击下方按钮生成设计稿'
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
              生成设计稿
            </>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <iframe
        srcDoc={html}
        className="flex-1 w-full border-none"
        title="Design Mockup"
      />
    </div>
  );
}
