/**
 * RunHistory — 工作流运行历史面板
 *
 * 提供运行记录列表查看、详情弹窗（含执行阶段时间线、产物文件树、审批记录、执行结果）功能。
 * 使用纯 HTML + Tailwind + lucide-react，与项目其他面板保持一致。
 */

import { useState, useEffect, useCallback } from 'react';
import {
  History,
  RefreshCw,
  Eye,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Check,
  Square,
  File,
  Folder,
  X,
  AlertCircle,
  ChevronRight,
  FileCode,
} from 'lucide-react';

const API = '/api';

// ─── 类型定义 ─────────────────────────────────────────────────────

/** 运行阶段 */
interface RunStage {
  id: string;
  name: string;
  nodeType: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'waiting-approval';
  startedAt?: number;
  completedAt?: number;
  result?: unknown;
  error?: string;
}

/** 审批记录 */
interface ApprovalRecord {
  action: 'approved' | 'rejected';
  by: string;
  at: number;
  comment?: string;
}

/** 运行摘要（列表用） */
interface RunSummary {
  id: string;
  workflowId: string;
  workflowName: string;
  status: string;
  startedAt: number;
  completedAt?: number;
  duration?: number;
  error?: string;
  artifactCount: number;
}

/** 运行详情 */
interface RunDetail {
  id: string;
  workflowId: string;
  workflowName: string;
  status: string;
  stages: RunStage[];
  approvalHistory: ApprovalRecord[];
  artifacts: string[];
  error?: string;
  startedAt: number;
  completedAt?: number;
  duration?: number;
  result?: unknown;
}

/** 产物文件项 */
interface ArtifactItem {
  path: string;
  size: number;
  modified: string;
}

/** 文件树节点 */
interface TreeNode {
  name: string;
  path: string;
  isFile: boolean;
  children: TreeNode[];
}

// ─── 工具函数 ─────────────────────────────────────────────────────

/** 从扁平路径构建嵌套文件树 */
function buildTreeFromPaths(paths: string[]): TreeNode[] {
  const root: TreeNode[] = [];
  for (const p of paths) {
    const parts = p.split('/');
    let currentLevel = root;
    let builtPath = '';
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      builtPath = builtPath ? `${builtPath}/${part}` : part;
      const isFile = i === parts.length - 1;
      let existing = currentLevel.find((n) => n.name === part);
      if (!existing) {
        existing = { name: part, path: builtPath, isFile, children: [] };
        currentLevel.push(existing);
      }
      if (!isFile) {
        currentLevel = existing.children;
      }
    }
  }
  return root;
}

/** 格式化耗时 */
function formatDuration(ms?: number) {
  if (!ms) return '-';
  return ms > 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

/** 格式化时间 */
function formatTime(ts: number) {
  return new Date(ts).toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

// ─── 子组件 ───────────────────────────────────────────────────────

/** 文件树组件 */
function FileTree({
  nodes,
  onSelect,
  selectedPath,
  depth = 0,
}: {
  nodes: TreeNode[];
  onSelect: (path: string) => void;
  selectedPath: string | null;
  depth?: number;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // 首次渲染时自动展开所有目录
  useEffect(() => {
    const allFolders = new Set<string>();
    const collect = (ns: TreeNode[]) => {
      for (const n of ns) {
        if (!n.isFile) { allFolders.add(n.path); collect(n.children); }
      }
    };
    collect(nodes);
    setExpanded(allFolders);
  }, [nodes]);

  const toggle = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  return (
    <div>
      {nodes.map((node) => (
        <div key={node.path}>
          <div
            className={`flex items-center gap-1.5 py-1 px-2 rounded-md cursor-pointer text-sm transition-colors hover:bg-gray-100 ${
              selectedPath === node.path ? 'bg-blue-100 text-blue-700 font-medium' : 'text-gray-600'
            }`}
            style={{ paddingLeft: `${depth * 16 + 8}px` }}
            onClick={() => {
              if (node.isFile) {
                onSelect(node.path);
              } else {
                toggle(node.path);
              }
            }}
          >
            {!node.isFile ? (
              <span className="text-xs">
                {expanded.has(node.path) ? '📂' : '📁'}
              </span>
            ) : (
              <File size={14} className="text-gray-400 shrink-0" />
            )}
            <span className="truncate text-xs">{node.name}</span>
          </div>
          {!node.isFile && expanded.has(node.path) && (
            <FileTree
              nodes={node.children}
              onSelect={onSelect}
              selectedPath={selectedPath}
              depth={depth + 1}
            />
          )}
        </div>
      ))}
    </div>
  );
}

/** 阶段状态标签 */
function StageBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    pending:    { bg: 'bg-gray-100', text: 'text-gray-600', label: '等待中' },
    running:    { bg: 'bg-blue-100', text: 'text-blue-700', label: '运行中' },
    completed:  { bg: 'bg-emerald-100', text: 'text-emerald-700', label: '已完成' },
    failed:     { bg: 'bg-red-100', text: 'text-red-700', label: '失败' },
    skipped:    { bg: 'bg-amber-100', text: 'text-amber-700', label: '已跳过' },
    'waiting-approval': { bg: 'bg-purple-100', text: 'text-purple-700', label: '待审批' },
  };
  const s = map[status] ?? { bg: 'bg-gray-100', text: 'text-gray-600', label: status };
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
}

/** 运行状态标签 */
function RunStatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string; icon: React.ReactNode; label: string }> = {
    pending:    { bg: 'bg-gray-100', text: 'text-gray-600', icon: <Clock size={10} />, label: '等待中' },
    running:    { bg: 'bg-blue-100', text: 'text-blue-700', icon: <Loader2 size={10} className="animate-spin" />, label: '运行中' },
    completed:  { bg: 'bg-emerald-100', text: 'text-emerald-700', icon: <CheckCircle2 size={10} />, label: '已完成' },
    failed:     { bg: 'bg-red-100', text: 'text-red-700', icon: <XCircle size={10} />, label: '失败' },
    'waiting-approval': { bg: 'bg-purple-100', text: 'text-purple-700', icon: <Clock size={10} />, label: '待审批' },
  };
  const s = map[status] ?? { bg: 'bg-gray-100', text: 'text-gray-600', icon: null, label: status };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${s.bg} ${s.text}`}>
      {s.icon}
      {s.label}
    </span>
  );
}

// ─── 主组件 ───────────────────────────────────────────────────────

/**
 * 运行历史面板组件
 */
export function RunHistory() {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailRun, setDetailRun] = useState<RunDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [artifacts, setArtifacts] = useState<ArtifactItem[]>([]);
  const [artifactContent, setArtifactContent] = useState<string | null>(null);
  const [artifactLoading, setArtifactLoading] = useState(false);
  const [approvalLoading, setApprovalLoading] = useState(false);
  const [selectedArtifactPath, setSelectedArtifactPath] = useState<string | null>(null);
  const [activeDetailTab, setActiveDetailTab] = useState<string>('stages');

  /** 刷新运行历史列表 */
  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/runs`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setRuns(data);
      } else {
        setError('运行历史数据格式异常');
      }
    } catch {
      setError('加载运行历史失败，请检查服务是否启动');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  /** 查看运行详情 */
  const showDetail = async (runId: string) => {
    setDetailLoading(true);
    setArtifacts([]);
    setArtifactContent(null);
    setSelectedArtifactPath(null);
    setActiveDetailTab('stages');
    try {
      const res = await fetch(`${API}/runs/${runId}`);
      const data = await res.json();
      setDetailRun(data);

      // 加载产物列表
      const artRes = await fetch(`${API}/runs/${runId}/artifacts`);
      if (artRes.ok) {
        const artData = await artRes.json();
        setArtifacts(Array.isArray(artData) ? artData : []);
      }
    } catch {
      setDetailRun(null);
    } finally {
      setDetailLoading(false);
    }
  };

  /** 加载产物文件内容 */
  const loadArtifact = async (path: string) => {
    if (!detailRun) return;
    setArtifactLoading(true);
    setArtifactContent(null);
    setSelectedArtifactPath(path);
    try {
      const res = await fetch(`${API}/runs/${detailRun.id}/artifacts/${path}`);
      if (res.ok) {
        const content = await res.text();
        setArtifactContent(content);
      }
    } catch {
      setArtifactContent('加载文件内容失败');
    } finally {
      setArtifactLoading(false);
    }
  };

  /** 审批操作 */
  const handleApproval = async (action: 'approve' | 'reject') => {
    if (!detailRun) return;
    setApprovalLoading(true);
    try {
      const res = await fetch(`${API}/runs/${detailRun.id}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ by: 'user' }),
      });
      if (res.ok) {
        showDetail(detailRun.id);
        refresh();
      }
    } catch {
      // 忽略错误
    } finally {
      setApprovalLoading(false);
    }
  };

  const handleArtifactSelect = useCallback(
    (path: string) => {
      loadArtifact(path);
    },
    [detailRun]
  );

  const artifactTree = buildTreeFromPaths(artifacts.map((a) => a.path));

  /** 判断是否为代码文件（用于语法高亮外观） */
  const isCodeFile = (path: string) => {
    const codeExts = ['.ts', '.tsx', '.js', '.jsx', '.json', '.css', '.html', '.yaml', '.yml', '.md', '.py', '.go', '.rs', '.java'];
    return codeExts.some(ext => path.endsWith(ext));
  };

  // ── 加载状态 ──
  if (loading && runs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-20 text-gray-400">
        <Loader2 size={40} className="animate-spin mb-3 text-blue-500" />
        <p className="text-sm">正在加载运行历史...</p>
      </div>
    );
  }

  // ── 错误状态 ──
  if (error && runs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-20 text-gray-400">
        <AlertCircle size={40} className="mb-3 text-amber-500" />
        <p className="text-sm text-gray-600 mb-2">{error}</p>
        <button
          onClick={refresh}
          className="px-4 py-2 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
        >
          重试
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* 页面标题 */}
      <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100 shrink-0">
        <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-800">
          <History size={20} className="text-blue-500" />
          运行历史
        </h3>
        <button
          onClick={refresh}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg
            hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          刷新
        </button>
      </div>

      {/* 主体内容 */}
      <div className="flex-1 overflow-auto p-6">
        {runs.length === 0 ? (
          /* 空状态 */
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <History size={48} className="mb-3 opacity-30" />
            <p className="text-sm">暂无运行记录</p>
            <p className="text-xs mt-1 text-gray-300">运行工作流后，执行记录将显示在此处</p>
          </div>
        ) : (
          /* 运行列表表格 */
          <div className="overflow-hidden rounded-xl border border-gray-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {['运行 ID', '工作流', '状态', '产物', '开始时间', '耗时', '操作'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {runs.map((run) => (
                  <tr key={run.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded font-mono text-gray-600 truncate max-w-[120px] block">
                        {run.id}
                      </code>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-blue-50 text-blue-700">
                        {run.workflowName || run.workflowId}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <RunStatusBadge status={run.status} />
                    </td>
                    <td className="px-4 py-3">
                      {run.artifactCount > 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium">
                          <File size={12} />
                          {run.artifactCount} 文件
                        </span>
                      ) : (
                        <span className="text-xs text-gray-300">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-gray-500">{formatTime(run.startedAt)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-gray-500 font-mono">{formatDuration(run.duration)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => showDetail(run.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg
                          hover:bg-blue-100 transition-colors"
                      >
                        <Eye size={12} />
                        详情
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── 详情弹窗 ─── */}
      {detailRun !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* 遮罩 */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setDetailRun(null)}
          />

          {/* 弹窗内容 */}
          <div className="relative z-10 w-[90vw] max-w-3xl max-h-[85vh] rounded-2xl bg-white shadow-2xl overflow-hidden flex flex-col">
            {/* 弹窗标题栏 */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
              <h4 className="text-base font-semibold text-gray-800">运行详情</h4>
              <button
                onClick={() => setDetailRun(null)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* 弹窗内容 */}
            <div className="flex-1 overflow-auto">
              {detailLoading ? (
                <div className="flex justify-center items-center py-20">
                  <Loader2 size={32} className="animate-spin text-blue-500" />
                </div>
              ) : detailRun ? (
                <div className="p-6">
                  {/* 摘要信息 */}
                  <div className="grid grid-cols-3 gap-4 mb-6 p-4 rounded-xl bg-gray-50">
                    {[
                      ['工作流', detailRun.workflowName || detailRun.workflowId],
                      ['状态', detailRun.status],
                      ['耗时', formatDuration(detailRun.duration)],
                      ['开始时间', formatTime(detailRun.startedAt)],
                      ['运行 ID', detailRun.id],
                      ['产物数', `${artifacts.length} 个文件`],
                    ].map(([label, value]) => (
                      <div key={label as string} className="flex flex-col">
                        <span className="text-[10px] text-gray-400 uppercase tracking-wider">{label}</span>
                        <span className="text-sm font-medium text-gray-700 mt-0.5">{String(value)}</span>
                      </div>
                    ))}
                  </div>

                  {/* 审批按钮 */}
                  {detailRun.status === 'waiting-approval' && (
                    <div className="flex items-center justify-center gap-3 mb-6 p-4 rounded-xl bg-purple-50 border border-purple-100">
                      <button
                        disabled={approvalLoading}
                        onClick={() => handleApproval('approve')}
                        className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-emerald-600 rounded-lg
                          hover:bg-emerald-700 disabled:opacity-40 transition-colors"
                      >
                        <Check size={14} />
                        批准
                      </button>
                      <button
                        disabled={approvalLoading}
                        onClick={() => handleApproval('reject')}
                        className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-red-600 rounded-lg
                          hover:bg-red-700 disabled:opacity-40 transition-colors"
                      >
                        <Square size={14} />
                        拒绝
                      </button>
                    </div>
                  )}

                  {/* 详情标签页 */}
                  <div>
                    {/* Tab 栏 */}
                    <div className="flex gap-0 border-b border-gray-200 mb-4">
                      {[
                        ['stages', '执行阶段'],
                        ['artifacts', `产物 (${artifacts.length})`],
                        ['approvals', `审批记录 (${detailRun.approvalHistory.length})`],
                        ['result', '执行结果'],
                      ].map(([id, label]) => (
                        <button
                          key={id}
                          onClick={() => setActiveDetailTab(id)}
                          className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-all -mb-[1px] ${
                            activeDetailTab === id
                              ? 'text-blue-600 border-blue-600'
                              : 'text-gray-400 border-transparent hover:text-gray-600'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    {/* 执行阶段 */}
                    {activeDetailTab === 'stages' && (
                      <div className="py-2">
                        {detailRun.stages.length > 0 ? (
                          <div className="relative pl-8">
                            {detailRun.stages.map((stage, i) => {
                              const isLast = i === detailRun.stages.length - 1;
                              const colorMap: Record<string, string> = {
                                completed: 'border-emerald-400 bg-emerald-50',
                                failed: 'border-red-400 bg-red-50',
                                running: 'border-blue-400 bg-blue-50',
                                'waiting-approval': 'border-purple-400 bg-purple-50',
                              };
                              const lineMap: Record<string, string> = {
                                completed: 'bg-emerald-200',
                                failed: 'bg-red-200',
                                running: 'bg-blue-200',
                                'waiting-approval': 'bg-purple-200',
                              };
                              const dotStyle = colorMap[stage.status] ?? 'border-gray-300 bg-gray-50';
                              const lineStyle = lineMap[stage.status] ?? 'bg-gray-200';

                              return (
                                <div key={stage.id} className="relative pb-6 last:pb-0">
                                  {!isLast && (
                                    <div className={`absolute left-[-17px] top-3 bottom-0 w-0.5 ${lineStyle}`} />
                                  )}
                                  <div className={`absolute left-[-21px] top-1 w-2.5 h-2.5 rounded-full border-2 ${dotStyle}`} />
                                  <div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-sm font-semibold text-gray-800">{stage.name}</span>
                                      <StageBadge status={stage.status} />
                                      {stage.nodeType && (
                                        <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                                          {stage.nodeType}
                                        </span>
                                      )}
                                    </div>
                                    {stage.error && (
                                      <pre className="mt-2 text-xs text-red-600 bg-red-50 p-2 rounded-lg whitespace-pre-wrap">
                                        {stage.error}
                                      </pre>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center py-10 text-gray-400">
                            <AlertCircle size={32} className="mb-2 opacity-40" />
                            <p className="text-sm">无执行阶段数据</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* 产物 */}
                    {activeDetailTab === 'artifacts' && (
                      <div className="py-2">
                        {artifacts.length > 0 ? (
                          <div className="flex gap-4">
                            {/* 文件树侧栏 */}
                            <div className="w-56 min-w-[180px] border-r border-gray-100 pr-3 overflow-auto max-h-[350px]">
                              <FileTree
                                nodes={artifactTree}
                                onSelect={handleArtifactSelect}
                                selectedPath={selectedArtifactPath}
                              />
                            </div>
                            {/* 文件内容 */}
                            <div className="flex-1 min-h-[300px]">
                              {artifactLoading ? (
                                <div className="flex justify-center items-center h-[300px]">
                                  <Loader2 size={24} className="animate-spin text-blue-500" />
                                </div>
                              ) : artifactContent ? (
                                <pre
                                  className="text-xs p-4 rounded-lg overflow-auto max-h-[350px] whitespace-pre-wrap break-all font-mono"
                                  style={{
                                    background: '#1e1e1e',
                                    color: '#d4d4d4',
                                  }}
                                >
                                  {artifactContent}
                                </pre>
                              ) : (
                                <div className="flex flex-col items-center justify-center h-[300px] text-gray-400">
                                  <FileCode size={40} className="mb-2 opacity-30" />
                                  <p className="text-sm">选择左侧文件查看内容</p>
                                </div>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center py-10 text-gray-400">
                            <File size={32} className="mb-2 opacity-40" />
                            <p className="text-sm">暂无产物</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* 审批记录 */}
                    {activeDetailTab === 'approvals' && (
                      <div className="py-2">
                        {detailRun.approvalHistory.length > 0 ? (
                          <div className="relative pl-8">
                            {detailRun.approvalHistory.map((a, i) => {
                              const isLast = i === detailRun.approvalHistory.length - 1;
                              const isApproved = a.action === 'approved';
                              const dotStyle = isApproved ? 'border-emerald-400 bg-emerald-50' : 'border-red-400 bg-red-50';
                              const lineStyle = isApproved ? 'bg-emerald-200' : 'bg-red-200';

                              return (
                                <div key={i} className="relative pb-6 last:pb-0">
                                  {!isLast && (
                                    <div className={`absolute left-[-17px] top-3 bottom-0 w-0.5 ${lineStyle}`} />
                                  )}
                                  <div className={`absolute left-[-21px] top-1 w-2.5 h-2.5 rounded-full border-2 ${dotStyle}`} />
                                  <div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                                        isApproved ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                                      }`}>
                                        {isApproved ? '批准' : '拒绝'}
                                      </span>
                                      <span className="text-sm text-gray-700">{a.by}</span>
                                      <span className="text-xs text-gray-400">{formatTime(a.at)}</span>
                                    </div>
                                    {a.comment && (
                                      <p className="mt-1 text-sm text-gray-600">{a.comment}</p>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center py-10 text-gray-400">
                            <Clock size={32} className="mb-2 opacity-40" />
                            <p className="text-sm">暂无审批记录</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* 执行结果 */}
                    {activeDetailTab === 'result' && (
                      <div className="py-2">
                        {detailRun.result ? (
                          <pre className="text-xs bg-gray-50 p-4 rounded-lg overflow-auto max-h-[350px] font-mono text-gray-700">
                            {JSON.stringify(detailRun.result, null, 2)}
                          </pre>
                        ) : (
                          <div className="flex flex-col items-center justify-center py-10 text-gray-400">
                            <FileCode size={32} className="mb-2 opacity-40" />
                            <p className="text-sm">无执行结果</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 错误信息 */}
                  {detailRun.error && (
                    <div className="mt-6 p-4 rounded-xl bg-red-50 border border-red-100">
                      <h5 className="text-sm font-semibold text-red-700 mb-2">错误信息</h5>
                      <pre className="text-xs text-red-600 whitespace-pre-wrap font-mono">
                        {detailRun.error}
                      </pre>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
