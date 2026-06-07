import { Card } from '@heroui/react/card';
import { Text } from '@heroui/react/text';
import { TrendingUp, Clock, FileCode, AlertTriangle } from 'lucide-react';
import type { OverviewStats } from '../hooks/useMetrics';

interface Props { overview: OverviewStats | null; }

export function MetricsQuality({ overview }: Props) {
  if (!overview) return null;

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.round(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
  };

  const stats = [
    { icon: <TrendingUp className="w-5 h-5" />, label: '成功率', value: `${overview.successRate}%`, color: overview.successRate >= 80 ? 'text-green-600' : 'text-yellow-600' },
    { icon: <Clock className="w-5 h-5" />, label: '平均耗时', value: formatDuration(overview.avgDuration), color: '' },
    { icon: <FileCode className="w-5 h-5" />, label: '平均文件数', value: `${overview.avgFiles}`, color: '' },
    { icon: <AlertTriangle className="w-5 h-5" />, label: '项目总数', value: `${overview.totalProjects}`, color: '' },
  ];

  return (
    <div className="p-4">
      <Text className="font-semibold text-lg mb-4">质量概览</Text>
      <div className="grid grid-cols-2 gap-3">
        {stats.map(s => (
          <Card key={s.label} className="p-4">
            <div className="flex items-center gap-2 text-gray-500 mb-1">{s.icon} <span className="text-xs">{s.label}</span></div>
            <Text className={`text-2xl font-bold ${s.color}`}>{s.value}</Text>
          </Card>
        ))}
      </div>
      {overview.commonFailures.length > 0 && (
        <div className="mt-6">
          <Text className="font-medium mb-2 text-sm text-gray-500">常见失败阶段</Text>
          <div className="space-y-2">
            {overview.commonFailures.map(f => (
              <div key={f.stage} className="flex justify-between text-sm">
                <span>{f.stage}</span>
                <span className="text-red-500">{f.count} 次</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
