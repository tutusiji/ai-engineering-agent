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
