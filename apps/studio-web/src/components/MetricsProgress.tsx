import { useEffect, useState } from 'react';
import { Chip } from '@heroui/react/chip';
import { ProgressBar } from '@heroui/react/progress-bar';
import { Text } from '@heroui/react/text';
import { CheckCircle2, Loader2, Clock, XCircle } from 'lucide-react';
import { fetchProjectStages, type StageDetail } from '../hooks/useMetrics';

interface Props { projectId: string | null; }

const STAGE_LABELS: Record<string, string> = {
  'interactive-requirement': '需求收集',
  'requirement-analysis': '需求分析',
  'target-profile-selection': 'Profile 选择',
  'data-modeling': '数据建模',
  'api-design': 'API 设计',
  'page-planning': '页面规划',
  'backend-coding': '后端代码',
  'frontend-coding': '前端代码',
  'design-generation': '设计稿',
  'deployment-planning': '部署配置',
};

function StageIcon({ status }: { status: string }) {
  switch (status) {
    case 'completed': return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    case 'running': return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
    case 'failed': return <XCircle className="w-4 h-4 text-red-500" />;
    default: return <Clock className="w-4 h-4 text-gray-400" />;
  }
}

export function MetricsProgress({ projectId }: Props) {
  const [stages, setStages] = useState<StageDetail[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    fetchProjectStages(projectId).then(s => { setStages(s); setLoading(false); });
    const interval = setInterval(() => { fetchProjectStages(projectId).then(s => setStages(s)); }, 2000);
    return () => clearInterval(interval);
  }, [projectId]);

  if (!projectId) return <Text className="text-gray-400 p-8 text-center">选择一个项目查看进度</Text>;
  if (loading && !stages.length) return <div className="flex items-center gap-2 p-8"><Loader2 className="animate-spin" /> 加载中...</div>;

  const completed = stages.filter(s => s.status === 'completed').length;
  const progress = stages.length > 0 ? Math.round((completed / stages.length) * 100) : 0;

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <Text className="font-semibold text-lg">生成进度</Text>
        <Chip size="sm" color={progress === 100 ? 'success' : 'primary'}>{progress}%</Chip>
      </div>
      <ProgressBar value={progress} className="mb-6" color={progress === 100 ? 'success' : 'primary'} />
      <div className="space-y-2">
        {stages.map(s => (
          <div key={s.stage} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
            <StageIcon status={s.status} />
            <span className="flex-1 text-sm font-medium">{STAGE_LABELS[s.stage] ?? s.stage}</span>
            {s.summary && <Chip size="sm" variant="flat">{s.summary}</Chip>}
            {s.duration && <span className="text-xs text-gray-400">{(s.duration / 1000).toFixed(1)}s</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
