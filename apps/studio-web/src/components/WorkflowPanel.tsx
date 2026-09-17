/**
 * WorkflowPanel — 工作流选择和执行面板
 *
 * 提供工作流列表浏览、选择、执行及实时进度查看功能。
 * 展示层按「明亮轻奢极简」风格重绘：语义表面令牌 + luxe 阴影 + 柔和渐变徽章 + 骨架屏。
 * 业务逻辑（列表加载 /api/workflows、pollRun 轮询、handleRun 提交）与原实现保持一致。
 */

import { useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import {
  Workflow,
  Rocket,
  Sparkles,
  Wand2,
  Code2,
  Palette,
  Presentation,
  DraftingCompass,
  FileText,
  FlaskConical,
  PlayCircle,
  CheckCircle2,
  XCircle,
  Loader2,
  LayoutGrid,
  ChevronRight,
  AlertCircle,
  Clock,
  Check,
  Minus,
  Hourglass,
  RotateCcw,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const API = '/api';

/** 工作流定义 */
interface Workflow {
  id: string;
  name: string;
  description: string;
  stages: string[];
}

/** 工作流执行阶段 */
interface RunStage {
  id: string;
  name: string;
  nodeType: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'waiting-approval';
  startedAt?: number;
  completedAt?: number;
  error?: string;
}

/** 工作流执行记录（匹配服务端 runStore 格式） */
interface WorkflowRun {
  id: string;
  workflowId: string;
  workflowName: string;
  status: string;
  stages: RunStage[];
  error?: string;
  startedAt: number;
  completedAt?: number;
  duration?: number;
}

/* ─── 展示层映射（纯视觉辅助，不涉及业务逻辑） ─────────────────────────── */

/** 工作流卡片渐变主题（专属图标 + 柔和渐变徽章配色） */
interface WorkflowTheme {
  /** 徽章图标 */
  icon: LucideIcon;
  /** 图标徽章的柔和渐变类（Tailwind gradient 工具类） */
  gradient: string;
}

/** 柔和渐变配色池：按序号轮换，保证同一卡片色调稳定 */
const WORKFLOW_THEMES: readonly WorkflowTheme[] = [
  { icon: Sparkles, gradient: 'from-indigo-500 to-violet-500' },
  { icon: Rocket, gradient: 'from-sky-400 to-blue-500' },
  { icon: Code2, gradient: 'from-emerald-400 to-teal-500' },
  { icon: Wand2, gradient: 'from-amber-400 to-orange-500' },
  { icon: Palette, gradient: 'from-fuchsia-400 to-pink-500' },
];

/** 工作流名称关键词与专属图标映射（按 id/name 匹配，未命中时取主题池图标） */
const WORKFLOW_ICON_RULES: ReadonlyArray<{ keywords: string[]; icon: LucideIcon }> = [
  { keywords: ['ppt', 'slide', 'present', 'deck'], icon: Presentation },
  { keywords: ['arch', '架构'], icon: DraftingCompass },
  { keywords: ['code', 'impl', 'gen', 'scaffold'], icon: Code2 },
  { keywords: ['design', 'ui', 'ux', '设计'], icon: Palette },
  { keywords: ['test', 'qa', 'review', '测试'], icon: FlaskConical },
  { keywords: ['require', 'prd', '需求'], icon: FileText },
  { keywords: ['deploy', 'ship', 'release'], icon: Rocket },
];

/**
 * 根据工作流 id/name 选取专属图标，并按序号轮换渐变配色
 * @param wf 工作流定义
 * @param index 在列表中的序号（用于配色轮换与入场 stagger）
 * @returns 卡片渐变主题
 */
const getWorkflowTheme = (wf: Workflow, index: number): WorkflowTheme => {
  const name = `${wf.id} ${wf.name}`.toLowerCase();
  const theme = WORKFLOW_THEMES[index % WORKFLOW_THEMES.length];
  const icon = WORKFLOW_ICON_RULES.find((rule) => rule.keywords.some((k) => name.includes(k)))?.icon ?? theme.icon;
  return { icon, gradient: theme.gradient };
};

/** 状态展示元数据（中文标签 + 图标 + 徽章配色） */
interface StatusMeta {
  /** 中文标签 */
  label: string;
  /** 徽章图标 */
  icon: LucideIcon;
  /** 图标附加类（如运行中的旋转动画） */
  iconClass?: string;
  /** 徽章底色与文字配色类 */
  chipClass: string;
}

/** 运行与阶段状态的统一中文标签映射（未知状态回退为原值展示） */
const STATUS_META: Record<string, StatusMeta> = {
  pending: { label: '待执行', icon: Clock, chipClass: 'bg-surface-sunken text-slate-500 dark:text-slate-400' },
  running: {
    label: '运行中',
    icon: Loader2,
    iconClass: 'animate-spin',
    chipClass: 'bg-accent-50 text-accent-700 dark:bg-accent-500/15 dark:text-accent-300',
  },
  completed: {
    label: '已完成',
    icon: CheckCircle2,
    chipClass: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  },
  failed: {
    label: '已失败',
    icon: XCircle,
    chipClass: 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
  },
  skipped: { label: '已跳过', icon: Minus, chipClass: 'bg-surface-sunken text-slate-400 dark:text-slate-500' },
  'waiting-approval': {
    label: '等待审批',
    icon: Hourglass,
    chipClass: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  },
};

/**
 * 获取运行/阶段状态的展示元数据（未知状态回退为原值 + 中性配色）
 * @param status 状态原值
 * @returns 状态展示元数据
 */
const getStatusMeta = (status: string): StatusMeta =>
  STATUS_META[status] ?? {
    label: status,
    icon: PlayCircle,
    chipClass: 'bg-surface-sunken text-slate-500 dark:text-slate-400',
  };

/** 时间线节点展示元数据（圆点配色 + 节点图标 + 连接线配色） */
interface StageNodeMeta {
  /** 圆点样式类 */
  dot: string;
  /** 圆点内部图标（待执行为空心、无图标） */
  icon: ReactNode;
  /** 向下连接线样式类 */
  line: string;
}

/**
 * 获取时间线节点的展示元数据
 * 规则：完成=accent 实心对勾、运行中=pulse-ring 呼吸圆点、失败=玫红实心叉、
 * 等待审批=琥珀实心沙漏、跳过=弱化横杠、待执行=空心
 * @param status 阶段状态
 * @returns 节点展示元数据
 */
const getStageNodeMeta = (status: string): StageNodeMeta => {
  switch (status) {
    case 'completed':
      return {
        dot: 'border-accent-500 bg-accent-500',
        icon: <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />,
        line: 'bg-accent-400/70',
      };
    case 'running':
      return {
        dot: 'border-accent-500 bg-accent-500 animate-pulse-ring',
        icon: <span className="h-1 w-1 rounded-full" style={{ backgroundColor: '#fff' }} />,
        line: 'bg-accent-300',
      };
    case 'failed':
      return {
        dot: 'border-rose-500 bg-rose-500',
        icon: <X className="h-2.5 w-2.5 text-white" strokeWidth={3} />,
        line: 'bg-rose-300/70',
      };
    case 'waiting-approval':
      return {
        dot: 'border-amber-400 bg-amber-400',
        icon: <Hourglass className="h-2.5 w-2.5 text-white" />,
        line: 'bg-amber-300/70',
      };
    case 'skipped':
      return {
        dot: 'border-line bg-surface-sunken',
        icon: <Minus className="h-2.5 w-2.5 text-slate-400" />,
        line: 'bg-line',
      };
    default:
      // pending 及未知状态：空心待执行圆点
      return { dot: 'border-line bg-surface', icon: null, line: 'bg-line' };
  }
};

/** 运行进度摘要（供总进度渐变条展示） */
interface RunProgress {
  /** 完成百分比（0-100） */
  percent: number;
  /** 已完成/已跳过的阶段数 */
  done: number;
  /** 阶段总数 */
  total: number;
}

/**
 * 计算运行总进度（已完成/已跳过阶段占比，仅用于进度条展示）
 * @param run 当前运行记录
 * @returns 进度摘要（百分比与计数）
 */
const getRunProgress = (run: WorkflowRun): RunProgress => {
  const stages = run.stages ?? [];
  const total = stages.length;
  const done = stages.filter((s) => s.status === 'completed' || s.status === 'skipped').length;
  // 无阶段数据时按整体状态兜底：已完成视为 100%，其余为 0
  const percent = total === 0 ? (run.status === 'completed' ? 100 : 0) : Math.round((done / total) * 100);
  return { percent, done, total };
};

/**
 * 工作流面板组件
 *
 * 传入 sessionId 以携带会话上下文（需求文档、架构方案）执行工作流。
 * 这是修复"前端工作流页与主功能割裂"断裂点的关键。
 */
export function WorkflowPanel({ profileId, sessionId }: { profileId: string; sessionId: string | null }) {
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
    fetch(`${API}/workflows`, { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setWorkflows(data);
        } else {
          setError('工作流数据格式异常');
        }
      })
      .catch(() => setError('加载工作流列表失败，请检查服务是否启动'))
      .finally(() => setLoading(false));
  }, []);

  /** 轮询工作流执行状态 */
  const pollRun = useCallback(async (runId: string) => {
    const poll = async () => {
      try {
        const res = await fetch(`${API}/runs/${runId}`, { credentials: 'include' });
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

  /** 执行选中的工作流 */
  const handleRun = useCallback(async () => {
    if (!selectedWorkflow) return;
    if (!sessionId) {
      setRunError('请先选择或创建一个会话，工作流需要会话上下文');
      return;
    }
    setRunning(true);
    setRunError(null);
    setCurrentRun(null);

    try {
      const res = await fetch(`${API}/workflows/${selectedWorkflow.id}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ profileId, sessionId }),
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
  }, [selectedWorkflow, profileId, sessionId, pollRun]);

  // ── 渲染 ──
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* 页头：渐变徽章 + 标题 + 可用数量 */}
      <div className="px-6 pt-6 pb-5 border-b border-line-soft shrink-0 bg-surface/80 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-accent-500 to-violet-500 shadow-luxe-sm shrink-0">
            <Workflow className="w-5 h-5 text-white" />
          </span>
          <div className="min-w-0">
            <h3 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">工作流</h3>
            <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500 truncate">
              选择一个工作流，配置参数后运行。工作流会自动执行各个阶段并生成产物。
            </p>
          </div>
          {!loading && workflows.length > 0 && (
            <span className="ml-auto shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium text-accent-700 bg-accent-50 border border-accent-200/60 dark:bg-accent-500/10 dark:text-accent-300 dark:border-accent-500/25">
              {workflows.length} 个可用
            </span>
          )}
        </div>
      </div>

      {/* 主体内容区 */}
      <div className="flex-1 overflow-auto p-6 bg-surface-soft">
        {loading ? (
          /* 加载骨架屏：占位卡片逐张浮现 */
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2" aria-hidden="true">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="p-5 rounded-2xl border border-line-soft bg-surface shadow-luxe-sm animate-pulse"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-surface-sunken" />
                  <div className="h-3.5 w-28 rounded-full bg-surface-sunken" />
                </div>
                <div className="h-2.5 w-full rounded-full bg-surface-sunken mb-2" />
                <div className="h-2.5 w-2/3 rounded-full bg-surface-sunken mb-5" />
                <div className="flex gap-1.5">
                  <div className="h-5 w-16 rounded-md bg-surface-sunken" />
                  <div className="h-5 w-20 rounded-md bg-surface-sunken" />
                  <div className="h-5 w-14 rounded-md bg-surface-sunken" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          /* 列表加载失败 */
          <div className="flex flex-col items-center justify-center py-20 animate-rise">
            <span className="flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200/70 dark:bg-amber-500/10 dark:border-amber-500/25 mb-4">
              <AlertCircle className="w-6 h-6 text-amber-500" />
            </span>
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium text-accent-700 bg-accent-50 border border-accent-200/70 hover:bg-accent-100 dark:bg-accent-500/10 dark:text-accent-300 dark:border-accent-500/25 dark:hover:bg-accent-500/20 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              刷新页面
            </button>
          </div>
        ) : workflows.length > 0 ? (
          <>
            {/* 工作流卡片网格：柔和渐变徽章 + hover 抬升 + 入场 stagger */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {workflows.map((wf, index) => {
                const theme = getWorkflowTheme(wf, index);
                const selected = selectedWorkflow?.id === wf.id;
                const ThemeIcon = theme.icon;
                return (
                  <div
                    key={wf.id}
                    role="button"
                    aria-pressed={selected}
                    onClick={() => !running && setSelectedWorkflow(wf)}
                    style={{ animationDelay: `${index * 70}ms` }}
                    className={`group relative p-5 rounded-2xl border text-left transition-all duration-300 ease-luxe animate-rise
                      ${
                        selected
                          ? 'border-accent-400 ring-2 ring-accent-500/30 shadow-luxe-md bg-accent-50/40 dark:bg-accent-500/10'
                          : running
                            ? 'border-line bg-surface shadow-luxe-sm opacity-60 cursor-not-allowed'
                            : 'border-line bg-surface shadow-luxe-sm cursor-pointer hover:-translate-y-0.5 hover:border-accent-300/70 hover:shadow-luxe-md'
                      }`}
                  >
                    {/* 选中角标 */}
                    {selected && (
                      <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center w-5 h-5 rounded-full bg-accent-500 text-white shadow-luxe-sm ring-2 ring-surface-soft">
                        <Check className="w-3 h-3" strokeWidth={3} />
                      </span>
                    )}
                    {/* 图标徽章 + 名称/描述 */}
                    <div className="flex items-start gap-3">
                      <span
                        className={`flex items-center justify-center w-10 h-10 rounded-xl shrink-0 text-white bg-gradient-to-br ${theme.gradient} shadow-luxe-sm transition-transform duration-300 group-hover:scale-105`}
                      >
                        <ThemeIcon className="w-5 h-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{wf.name}</h4>
                        {wf.description && (
                          <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400 line-clamp-2">
                            {wf.description}
                          </p>
                        )}
                      </div>
                    </div>
                    {/* 阶段步骤条：小号 chip + chevron 分隔 */}
                    {wf.stages.length > 0 ? (
                      <div className="mt-4 pt-3 border-t border-line-soft flex flex-wrap items-center gap-y-1.5">
                        {wf.stages.map((s, i) => (
                          <span key={`${s}-${i}`} className="inline-flex items-center">
                            <span className="px-2 py-0.5 text-[10px] font-medium rounded-md bg-surface-sunken border border-line-soft text-slate-500 dark:text-slate-400">
                              {s}
                            </span>
                            {i < wf.stages.length - 1 && (
                              <ChevronRight className="w-3 h-3 mx-0.5 text-slate-300 dark:text-slate-600 shrink-0" />
                            )}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-4 pt-3 border-t border-line-soft text-[10px] text-slate-400 dark:text-slate-500 italic">
                        暂无阶段定义
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* 运行按钮（仅在选择后、未在运行中且无运行记录时出现） */}
            {selectedWorkflow && !running && !currentRun && (
              <div className="mt-8 flex justify-center animate-rise">
                <button
                  onClick={handleRun}
                  disabled={running}
                  className="inline-flex items-center gap-2 px-7 py-3 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-accent-600 to-violet-500 shadow-luxe-sm
                    enabled:hover:-translate-y-0.5 enabled:hover:shadow-luxe-md enabled:active:translate-y-0
                    disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 cursor-pointer"
                >
                  <PlayCircle className="w-[18px] h-[18px]" />
                  运行 {selectedWorkflow.name}
                </button>
              </div>
            )}
          </>
        ) : (
          /* 空状态 */
          <div className="flex flex-col items-center justify-center py-20 animate-rise">
            <span className="flex items-center justify-center w-16 h-16 rounded-2xl bg-surface border border-line-soft shadow-luxe-sm mb-4">
              <LayoutGrid className="w-7 h-7 text-slate-300 dark:text-slate-600" />
            </span>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">暂无工作流定义</p>
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
              请在 workflows/ 目录下添加 YAML 工作流定义文件
            </p>
          </div>
        )}

        {/* 启动错误提示 */}
        {!loading && !error && runError && (
          <div className="mt-6 p-4 rounded-2xl bg-rose-50/80 border border-rose-200/80 dark:bg-rose-500/10 dark:border-rose-500/25 animate-rise">
            <div className="flex items-start gap-2.5">
              <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-rose-500/15 text-rose-500 shrink-0">
                <AlertCircle className="w-3.5 h-3.5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-rose-700 dark:text-rose-300">启动失败</p>
                <p className="mt-1 text-xs leading-relaxed text-rose-600 dark:text-rose-300/80">{runError}</p>
              </div>
            </div>
          </div>
        )}

        {/* 运行进度：概览卡（运行信息 + 状态徽章 + 总进度条）+ 阶段时间线 */}
        {!loading &&
          !error &&
          currentRun &&
          (() => {
            const stages = currentRun.stages ?? [];
            const progress = getRunProgress(currentRun);
            const runMeta = getStatusMeta(currentRun.status);
            return (
              <div className="mt-8 rounded-2xl border border-line bg-surface shadow-luxe-md overflow-hidden animate-rise">
                {/* 概览区 */}
                <div className="px-5 py-4 bg-surface-soft/70 border-b border-line-soft">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 shrink-0">
                        运行 ID
                      </span>
                      <code className="px-2 py-0.5 rounded-md text-[11px] font-mono text-slate-600 dark:text-slate-300 bg-surface-sunken border border-line-soft truncate max-w-[220px]">
                        {currentRun.id}
                      </code>
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0">
                      {/* 运行总耗时（保留原 duration 字段语义：毫秒 → 秒） */}
                      {typeof currentRun.duration === 'number' && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400 tabular-nums">
                          <Clock className="w-3 h-3" />
                          {(currentRun.duration / 1000).toFixed(1)}s
                        </span>
                      )}
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${runMeta.chipClass}`}
                      >
                        <runMeta.icon className={`w-3 h-3 ${runMeta.iconClass ?? ''}`} />
                        {runMeta.label}
                      </span>
                    </div>
                  </div>
                  {/* 总进度渐变条 */}
                  <div className="mt-3.5">
                    <div className="h-1.5 rounded-full bg-surface-sunken overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-accent-500 to-violet-500 transition-all duration-700 ease-luxe"
                        style={{ width: `${progress.percent}%` }}
                      />
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500">
                      <span>{progress.total > 0 ? `${progress.done}/${progress.total} 阶段完成` : '等待阶段数据'}</span>
                      <span className="font-medium tabular-nums">{progress.percent}%</span>
                    </div>
                  </div>
                </div>

                {/* 阶段时间线 */}
                <div className="px-5 py-5">
                  {stages.length > 0 ? (
                    <ol>
                      {stages.map((stage, i) => {
                        const isLast = i === stages.length - 1;
                        const node = getStageNodeMeta(stage.status);
                        const meta = getStatusMeta(stage.status);
                        return (
                          <li key={stage.id || i} className="relative flex gap-3 pb-6 last:pb-0">
                            {/* 左侧节点列：圆点 + 连接线 */}
                            <div className="relative flex flex-col items-center w-3.5 shrink-0 self-stretch">
                              <span
                                className={`relative z-10 flex items-center justify-center w-3.5 h-3.5 rounded-full border-2 ${node.dot}`}
                              >
                                {node.icon}
                              </span>
                              {!isLast && (
                                <span
                                  className={`absolute top-3 bottom-0 left-1/2 -translate-x-1/2 w-0.5 rounded-full ${node.line}`}
                                />
                              )}
                            </div>
                            {/* 右侧内容 */}
                            <div className="min-w-0 flex-1 pt-0.5">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                                  {stage.name}
                                </span>
                                <span
                                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${meta.chipClass}`}
                                >
                                  <meta.icon className={`w-3 h-3 ${meta.iconClass ?? ''}`} />
                                  {meta.label}
                                </span>
                                {stage.nodeType && (
                                  <span className="px-1.5 py-0.5 rounded-md text-[10px] font-mono text-slate-400 dark:text-slate-500 bg-surface-sunken border border-line-soft">
                                    {stage.nodeType}
                                  </span>
                                )}
                                {/* 阶段耗时（有起止时间戳时展示，毫秒 → 秒） */}
                                {typeof stage.startedAt === 'number' && typeof stage.completedAt === 'number' && (
                                  <span className="inline-flex items-center gap-1 text-[10px] text-slate-400 dark:text-slate-500 tabular-nums">
                                    <Clock className="w-3 h-3" />
                                    {((stage.completedAt - stage.startedAt) / 1000).toFixed(1)}s
                                  </span>
                                )}
                              </div>
                              {stage.error && (
                                <pre className="mt-2 px-3 py-2 rounded-xl text-xs leading-relaxed text-rose-600 dark:text-rose-300 bg-rose-50/80 dark:bg-rose-500/10 border border-rose-200/70 dark:border-rose-500/25 whitespace-pre-wrap font-mono">
                                  {stage.error}
                                </pre>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  ) : (
                    /* 无阶段数据时的启动提示 */
                    currentRun.status === 'running' && (
                      <div className="flex items-center gap-2.5 py-1">
                        <span className="flex items-center justify-center w-3.5 h-3.5 rounded-full bg-accent-500 animate-pulse-ring">
                          <span className="w-1 h-1 rounded-full" style={{ backgroundColor: '#fff' }} />
                        </span>
                        <span className="text-sm text-slate-400 dark:text-slate-500">正在启动...</span>
                      </div>
                    )
                  )}

                  {/* 执行完成提示 */}
                  {currentRun.status === 'completed' && (
                    <div className="mt-3 flex items-center gap-2.5 px-4 py-3 rounded-xl bg-emerald-50/80 border border-emerald-200/70 dark:bg-emerald-500/10 dark:border-emerald-500/25">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">工作流执行完成</span>
                    </div>
                  )}

                  {/* 执行失败提示 */}
                  {currentRun.status === 'failed' && (
                    <div className="mt-3 p-4 rounded-xl bg-rose-50/80 border border-rose-200/70 dark:bg-rose-500/10 dark:border-rose-500/25">
                      <div className="flex items-start gap-2.5">
                        <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-rose-500/15 text-rose-500 shrink-0">
                          <XCircle className="w-3.5 h-3.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-rose-700 dark:text-rose-300">工作流执行失败</p>
                          {currentRun.error && (
                            <pre className="mt-2 text-xs leading-relaxed text-rose-600 dark:text-rose-300/80 whitespace-pre-wrap font-mono">
                              {currentRun.error}
                            </pre>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

        {/* 重新运行按钮（仅结束态出现，点击后回到选择视图） */}
        {!loading && !error && currentRun && (currentRun.status === 'completed' || currentRun.status === 'failed') && (
          <div className="mt-5 flex justify-center animate-rise">
            <button
              onClick={() => {
                setCurrentRun(null);
                setRunError(null);
              }}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-accent-600 to-violet-500 shadow-luxe-sm
                hover:-translate-y-0.5 hover:shadow-luxe-md active:translate-y-0 transition-all duration-200 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              再次运行
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
