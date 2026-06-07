import { Chip } from '@heroui/react/chip';
import { Text } from '@heroui/react/text';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import type { ProjectMetric } from '../hooks/useMetrics';

interface Props { projects: ProjectMetric[]; selectedId: string | null; onSelect: (id: string) => void; }

function StatusChip({ status }: { status: string }) {
  switch (status) {
    case 'completed': return <Chip size="sm" color="success" startContent={<CheckCircle2 className="w-3 h-3" />}>完成</Chip>;
    case 'failed': return <Chip size="sm" color="danger" startContent={<XCircle className="w-3 h-3" />}>失败</Chip>;
    case 'running': return <Chip size="sm" color="primary" startContent={<Loader2 className="w-3 h-3 animate-spin" />}>运行中</Chip>;
    default: return <Chip size="sm">{status}</Chip>;
  }
}

export function MetricsHistory({ projects, selectedId, onSelect }: Props) {
  if (!projects.length) return <Text className="text-gray-400 p-8 text-center">暂无生成记录</Text>;

  return (
    <div className="p-4">
      <Text className="font-semibold text-lg mb-4">历史回溯</Text>
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {projects.map(p => (
          <div key={p.projectId}
            className={`p-3 rounded-lg cursor-pointer transition-colors border ${selectedId === p.projectId ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-100 hover:border-gray-300 dark:border-gray-700'}`}
            onClick={() => onSelect(p.projectId)}>
            <div className="flex items-center justify-between mb-1">
              <Text className="font-medium text-sm truncate">{p.projectId}</Text>
              <StatusChip status={p.status} />
            </div>
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span>{p.profile.frontend} + {p.profile.backend}</span>
              <span>{p.totalFiles} 文件</span>
              {p.duration && <span>{(p.duration / 1000).toFixed(1)}s</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
