/**
 * WorkflowPanel — 工作流选择和执行面板
 *
 * 提供工作流列表浏览、选择、执行及实时进度查看功能。
 * 使用纯 HTML + Tailwind + lucide-react，与项目其他面板保持一致。
 */

import { useState, useEffect, useCallback } from 'react';
import {
  PlayCircle,
  Rocket,
  CheckCircle2,
  XCircle,
  Loader2,
  LayoutGrid,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';

const API = '/api';

/** 工作流定义 */
interface Workflow {
  id: string;
  name: string;
  description: string;
  stages: string[];
}

/** 工作流执行记录 */
interface WorkflowRun {
  id: string;
  workflowId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt: number;
  completedAt: number | null;
  logs: Array<{ timestamp: number; level: string; message: string }>;
}

/**
 * 工作流面板组件
 */
export function WorkflowPanel({ profileId }: { profileId: string }) {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [running, setRunning] = useState(false);
  const [currentRun, setCurrentRun] = useState<WorkflowRun | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  // 加载工作流列表
  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`${API}/workflows`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setWorkflows(data);
        } else {
          setError('工作流数据格式异常');
        }
      })
      .catch(() => setError('加载工作流列表失败，请检查服务是否启动'))
      .finally(() => setLoading(false));
  }, []);

  /** 执行选中的工作流 */
  const handleRun = useCallback(async () => {
    if (!selectedWorkflow) return;
    setRunning(true);
    setRunError(null);
    setCurrentRun(null);

    try {
      const res = await fetch(`${API}/workflows/${selectedWorkflow.id}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId }),
      });
      const data = await res.json();

      if (data.ok) {
        pollRun(data.runId);
      } else {
        setRunError(data.error || '启动工作流失败');
        setRunning(false);
      }
    } catch {
      setRunError('请求失败，请稍后重试');
      setRunning(false);
    }
  }, [selectedWorkflow, profileId]);

  /** 轮询工作流执行状态 */
  const pollRun = useCallback(async (runId: string) => {
    const poll = async () => {
      try {
        const res = await fetch(`${API}/runs/${runId}`);
        const data = await res.json();
        setCurrentRun(data);

        if (data.status === 'completed' || data.status === 'failed') {
          setRunning(false);
          return;
        }

        setTimeout(poll, 1000);
      } catch {
        setRunError('获取运行状态失败');
        setRunning(false);
      }
    };
    poll();
  }, []);

  /** 获取运行状态的图标和颜色 */
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'running':
        return { icon: <Loader2 size={12} className="animate-spin" />, bg: 'bg-blue-100', text: 'text-blue-700', label: '运行中' };
      case 'completed':
        return { icon: <CheckCircle2 size={12} />, bg: 'bg-emerald-100', text: 'text-emerald-700', label: '已完成' };
      case 'failed':
        return { icon: <XCircle size={12} />, bg: 'bg-red-100', text: 'text-red-700', label: '已失败' };
      default:
        return { icon: <PlayCircle size={12} />, bg: 'bg-gray-100', text: 'text-gray-600', label: status };
    }
  };

  /** 格式化时间戳 */
  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  // ── 加载状态 ──
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-20 text-gray-400">
        <Loader2 size={40} className="animate-spin mb-3 text-blue-500" />
        <p className="text-sm">正在加载工作流列表...</p>
      </div>
    );
  }

  // ── 错误状态 ──
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-20 text-gray-400">
        <AlertCircle size={40} className="mb-3 text-amber-500" />
        <p className="text-sm text-gray-600 mb-2">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
        >
          刷新页面
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* 页面标题 */}
      <div className="px-6 pt-6 pb-4 border-b border-gray-100 shrink-0">
        <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-800">
          <LayoutGrid size={20} className="text-blue-500" />
          工作流
        </h3>
        <p className="mt-1 text-sm text-gray-400">
          选择一个工作流，配置参数后运行。工作流会自动执行各个阶段并生成产物。
        </p>
      </div>

      {/* 主体内容区 */}
      <div className="flex-1 overflow-auto p-6">
        {/* 工作流列表 */}
        {workflows.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {workflows.map(wf => (
              <div
                key={wf.id}
                onClick={() => !running && setSelectedWorkflow(wf)}
                className={`p-4 rounded-xl border-2 cursor-pointer transition-all hover:shadow-md ${
                  selectedWorkflow?.id === wf.id
                    ? 'border-blue-400 bg-blue-50/50 shadow-blue-100 shadow-sm'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                } ${running ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Rocket size={16} className="text-gray-500" />
                  <span className="text-sm font-semibold text-gray-800">{wf.name}</span>
                  {selectedWorkflow?.id === wf.id && (
                    <span className="ml-auto px-1.5 py-0.5 text-[10px] font-medium text-blue-600 bg-blue-100 rounded-full">
                      已选择
                    </span>
                  )}
                </div>
                {wf.description && (
                  <p className="text-xs text-gray-400 mb-3">{wf.description}</p>
                )}
                {wf.stages.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {wf.stages.map((s, i) => (
                      <span
                        key={s}
                        className="inline-flex items-center gap-0.5 px-2 py-0.5 text-[10px] font-medium text-gray-500 bg-gray-100 rounded-md"
                      >
                        {s}
                        {i < wf.stages.length - 1 && (
                          <ChevronRight size={10} className="text-gray-300" />
                        )}
                      </span>
                    ))}
                  </div>
                )}
                {wf.stages.length === 0 && (
                  <span className="text-[10px] text-gray-300 italic">暂无阶段定义</span>
                )}
              </div>
            ))}
          </div>
        ) : (
          /* 空状态 */
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <LayoutGrid size={48} className="mb-3 opacity-30" />
            <p className="text-sm">暂无工作流定义</p>
            <p className="text-xs mt-1 text-gray-300">
              请在 workflows/ 目录下添加 YAML 工作流定义文件
            </p>
          </div>
        )}

        {/* 执行按钮 */}
        {selectedWorkflow && !running && !currentRun && (
          <div className="mt-6 text-center">
            <button
              onClick={handleRun}
              disabled={running}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium
                hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all
                shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40"
            >
              <PlayCircle size={18} />
              运行 {selectedWorkflow.name}
            </button>
          </div>
        )}

        {/* 启动错误提示 */}
        {runError && (
          <div className="mt-4 p-4 rounded-xl bg-red-50 border border-red-200">
            <div className="flex items-center gap-2 mb-1">
              <AlertCircle size={16} className="text-red-500" />
              <span className="text-sm font-medium text-red-700">启动失败</span>
            </div>
            <p className="text-xs text-red-500 ml-6">{runError}</p>
          </div>
        )}

        {/* 运行进度 */}
        {currentRun && (
          <div className="mt-6">
            {/* 运行状态栏 */}
            <div className="flex items-center justify-between mb-4 p-3 rounded-xl bg-gray-50 border border-gray-100">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">运行 ID</span>
                <code className="text-xs font-mono text-gray-600 bg-gray-200 px-1.5 py-0.5 rounded">
                  {currentRun.id}
                </code>
              </div>
              {(() => {
                const badge = getStatusBadge(currentRun.status);
                return (
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${badge.bg} ${badge.text}`}>
                    {badge.icon}
                    {badge.label}
                  </span>
                );
              })()}
            </div>

            {/* 日志时间线 */}
            <div className="relative pl-8">
              {currentRun.logs.map((log, i) => {
                const isLast = i === currentRun.logs.length - 1;
                const isError = log.level === 'error';
                const isRunning = isLast && currentRun.status === 'running';

                let dotColor: string;
                let icon: React.ReactNode;
                if (isError) {
                  dotColor = 'border-red-400 bg-red-50';
                  icon = <XCircle size={12} className="text-red-500" />;
                } else if (isRunning) {
                  dotColor = 'border-blue-400 bg-blue-50';
                  icon = <Loader2 size={12} className="animate-spin text-blue-500" />;
                } else {
                  dotColor = 'border-emerald-400 bg-emerald-50';
                  icon = <CheckCircle2 size={12} className="text-emerald-500" />;
                }

                return (
                  <div key={i} className="relative pb-5 last:pb-0">
                    {/* 竖线 */}
                    {!isLast && (
                      <div className={`absolute left-[-17px] top-3 bottom-0 w-0.5 ${isError ? 'bg-red-200' : isRunning ? 'bg-blue-200' : 'bg-emerald-200'}`} />
                    )}
                    {/* 圆点 */}
                    <div className={`absolute left-[-21px] top-1 w-2.5 h-2.5 rounded-full border-2 flex items-center justify-center ${dotColor}`}>
                      {icon}
                    </div>
                    {/* 内容 */}
                    <div>
                      <p className={`text-sm ${isError ? 'text-red-700 font-medium' : 'text-gray-700'}`}>
                        {log.message}
                      </p>
                      <p className="text-[10px] text-gray-400 mt-0.5">{formatTime(log.timestamp)}</p>
                    </div>
                  </div>
                );
              })}

              {/* 运行中但无日志 */}
              {currentRun.logs.length === 0 && currentRun.status === 'running' && (
                <div className="flex items-center gap-2 py-4">
                  <Loader2 size={16} className="animate-spin text-blue-500" />
                  <span className="text-sm text-gray-400">正在启动...</span>
                </div>
              )}

              {/* 执行完成提示 */}
              {currentRun.status === 'completed' && (
                <div className="flex items-center gap-2 py-2">
                  <CheckCircle2 size={16} className="text-emerald-500" />
                  <span className="text-sm text-emerald-600 font-medium">工作流执行完成</span>
                </div>
              )}

              {/* 执行失败提示 */}
              {currentRun.status === 'failed' && (
                <div className="flex items-center gap-2 py-2">
                  <XCircle size={16} className="text-red-500" />
                  <span className="text-sm text-red-600 font-medium">工作流执行失败</span>
                </div>
              )}
            </div>

            {/* 重新运行按钮 */}
            {(currentRun.status === 'completed' || currentRun.status === 'failed') && (
              <div className="mt-4 text-center">
                <button
                  onClick={() => {
                    setCurrentRun(null);
                    setRunError(null);
                  }}
                  className="px-4 py-2 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                >
                  再次运行
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
