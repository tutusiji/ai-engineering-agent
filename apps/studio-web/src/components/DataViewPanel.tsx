import { useState } from 'react';
import { Tabs, TabList, Tab, TabPanel } from '@heroui/react/tabs';
import { Spinner } from '@heroui/react/spinner';
import { Activity } from 'lucide-react';
import { useMetrics, fetchProjectDetail } from '../hooks/useMetrics';
import { MetricsProgress } from './MetricsProgress';
import { MetricsArtifacts } from './MetricsArtifacts';
import { MetricsHistory } from './MetricsHistory';
import { MetricsQuality } from './MetricsQuality';
import type { ProjectMetric } from '../hooks/useMetrics';

export function DataViewPanel() {
  const { projects, overview, loading, refresh } = useMetrics();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<ProjectMetric | null>(null);

  const handleSelect = async (id: string) => {
    setSelectedId(id);
    const detail = await fetchProjectDetail(id);
    setSelectedProject(detail);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-gray-400">
        <Spinner size="lg" />
        <span className="mt-4">加载监控数据...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b">
        <Activity className="w-5 h-5 text-blue-500" />
        <h2 className="text-lg font-semibold">DataView · 生成监控</h2>
        <button onClick={refresh} className="ml-auto text-sm text-blue-600 hover:text-blue-800">刷新</button>
      </div>
      <Tabs className="flex-1 overflow-hidden">
        <TabList className="px-4 pt-2">
          <Tab>进度</Tab><Tab>产物</Tab><Tab>历史</Tab><Tab>质量</Tab>
        </TabList>
        <div className="flex-1 overflow-y-auto">
          <TabPanel><MetricsProgress projectId={selectedId} /></TabPanel>
          <TabPanel><MetricsArtifacts project={selectedProject} /></TabPanel>
          <TabPanel><MetricsHistory projects={projects} selectedId={selectedId} onSelect={handleSelect} /></TabPanel>
          <TabPanel><MetricsQuality overview={overview} /></TabPanel>
        </div>
      </Tabs>
    </div>
  );
}
