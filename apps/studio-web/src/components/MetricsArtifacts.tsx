import { Text } from '@heroui/react/text';
import { Code, Server, Database, Container } from 'lucide-react';
import type { ProjectMetric } from '../hooks/useMetrics';

interface Props { project: ProjectMetric | null; }

export function MetricsArtifacts({ project }: Props) {
  if (!project) return <Text className="text-gray-400 p-8 text-center">选择项目查看产物统计</Text>;

  const items = [
    { icon: <Code className="w-4 h-4" />, label: '前端', framework: project.profile.frontend },
    { icon: <Server className="w-4 h-4" />, label: '后端', framework: project.profile.backend },
    { icon: <Database className="w-4 h-4" />, label: '数据库', framework: project.profile.database },
    { icon: <Container className="w-4 h-4" />, label: '部署', framework: 'Docker' },
  ];

  return (
    <div className="p-4">
      <Text className="font-semibold text-lg mb-4">产物统计</Text>
      <div className="space-y-3">
        {items.map(item => (
          <div key={item.label} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
            {item.icon}
            <div><Text className="text-sm font-medium">{item.label}</Text><Text className="text-xs text-gray-500">{item.framework}</Text></div>
          </div>
        ))}
      </div>
      <div className="mt-4 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20">
        <Text className="text-sm">总文件: <strong>{project.totalFiles}</strong>{project.duration && ` · 耗时: ${(project.duration / 1000).toFixed(1)}s`}</Text>
      </div>
    </div>
  );
}
