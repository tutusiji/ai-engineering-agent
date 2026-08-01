/**
 * VisualBaselines — 视觉基线管理面板
 *
 * 展示 <targetProject>/artifacts/visual-baseline/ 下的基线截图卡片：
 * - 卡片网格：基线缩略图 + 名称 + 大小 + 更新时间
 * - 点击卡片 → 对比弹窗（基线 vs 最新截图 vs diff 图）
 * - 更新基线：用最新截图覆盖基线
 * - 删除基线：二次确认弹窗
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Image as ImageIcon,
  RefreshCw,
  Loader2,
  Eye,
  Trash2,
  Upload,
  X,
  AlertCircle,
  FolderOpen,
} from 'lucide-react';

const API = '/api';

/** 基线条目 */
interface BaselineItem {
  name: string;
  size: number;
  updatedAt: number;
  hasScreenshot: boolean;
  hasDiff: boolean;
}

/** 基线列表响应 */
interface BaselineListResponse {
  baselines: BaselineItem[];
  baselineDir: string;
  screenshotDir: string;
}

/** 格式化文件大小 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** 格式化时间 */
function formatTime(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** 从文件名提取页面名（home.png → home） */
function pageNameOf(name: string): string {
  return name.replace(/\.png$/, '');
}

/**
 * 视觉基线管理面板组件
 */
export function VisualBaselines() {
  const [baselines, setBaselines] = useState<BaselineItem[]>([]);
  const [dirs, setDirs] = useState<{ baselineDir: string; screenshotDir: string }>({ baselineDir: '', screenshotDir: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 对比弹窗状态
  const [previewName, setPreviewName] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // 删除确认状态
  const [confirmDeleteName, setConfirmDeleteName] = useState<string | null>(null);

  /** 刷新基线列表 */
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/baselines`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as BaselineListResponse;
      setBaselines(Array.isArray(data.baselines) ? data.baselines : []);
      setDirs({ baselineDir: data.baselineDir ?? '', screenshotDir: data.screenshotDir ?? '' });
    } catch {
      setError('加载视觉基线失败，请检查服务是否启动');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /** 更新基线：用最新截图覆盖 */
  const handleUpdate = async (name: string) => {
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`${API}/baselines/${encodeURIComponent(name)}/update`, { method: 'POST' });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      await refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionLoading(false);
    }
  };

  /** 删除基线 */
  const handleDelete = async (name: string) => {
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`${API}/baselines/${encodeURIComponent(name)}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      setConfirmDeleteName(null);
      if (previewName === name) setPreviewName(null);
      await refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionLoading(false);
    }
  };

  // ── 加载状态 ──
  if (loading && baselines.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-20 text-gray-400">
        <Loader2 size={40} className="animate-spin mb-3 text-blue-500" />
        <p className="text-sm">正在加载视觉基线...</p>
      </div>
    );
  }

  // ── 错误状态 ──
  if (error && baselines.length === 0) {
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
          <ImageIcon size={20} className="text-blue-500" />
          视觉基线管理
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
        {/* 目录提示 */}
        {dirs.baselineDir && (
          <p className="flex items-center gap-1.5 text-xs text-gray-400 mb-4">
            <FolderOpen size={13} />
            {dirs.baselineDir}
          </p>
        )}

        {baselines.length === 0 ? (
          /* 空状态 */
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <ImageIcon size={48} className="mb-3 opacity-30" />
            <p className="text-sm">暂无视觉基线</p>
            <p className="text-xs mt-1 text-gray-300">
              运行包含 visual-regression 节点的工作流后，基线截图将自动生成于此
            </p>
          </div>
        ) : (
          /* 基线卡片网格 */
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {baselines.map((item) => (
              <div
                key={item.name}
                className="group rounded-2xl bg-white border border-gray-200/80 hover:border-blue-300 hover:shadow-md
                  transition-all overflow-hidden flex flex-col"
              >
                {/* 缩略图 */}
                <button
                  onClick={() => setPreviewName(item.name)}
                  className="relative aspect-[16/9] bg-gray-100 overflow-hidden cursor-pointer"
                  title={`查看 ${pageNameOf(item.name)} 对比`}
                >
                  <img
                    src={`${API}/baselines/${encodeURIComponent(item.name)}/image`}
                    alt={pageNameOf(item.name)}
                    className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                    loading="lazy"
                  />
                  {/* 状态角标 */}
                  <div className="absolute top-2 right-2 flex gap-1">
                    {item.hasDiff && (
                      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-700">
                        有差异
                      </span>
                    )}
                    {item.hasScreenshot && !item.hasDiff && (
                      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-700">
                        已对比
                      </span>
                    )}
                  </div>
                </button>

                {/* 信息区 */}
                <div className="p-3 flex-1 flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-gray-800 truncate">{pageNameOf(item.name)}</span>
                    <span className="text-[10px] text-gray-400 shrink-0">{formatSize(item.size)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-gray-400">{formatTime(item.updatedAt)}</span>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => setPreviewName(item.name)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition cursor-pointer"
                        title="查看对比"
                      >
                        <Eye size={14} />
                      </button>
                      <button
                        onClick={() => handleUpdate(item.name)}
                        disabled={actionLoading || !item.hasScreenshot}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                        title={item.hasScreenshot ? '用最新截图更新基线' : '无最新截图，无法更新'}
                      >
                        <Upload size={14} />
                      </button>
                      <button
                        onClick={() => setConfirmDeleteName(item.name)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition cursor-pointer"
                        title="删除基线"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── 对比弹窗 ─── */}
      {previewName !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setPreviewName(null)} />

          <div className="relative z-10 w-[92vw] max-w-4xl max-h-[88vh] rounded-2xl bg-white shadow-2xl overflow-hidden flex flex-col">
            {/* 标题栏 */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
              <h4 className="text-base font-semibold text-gray-800">
                视觉对比 — {pageNameOf(previewName)}
              </h4>
              <button
                onClick={() => setPreviewName(null)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* 操作错误提示 */}
            {actionError && (
              <div className="px-6 pt-3">
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 text-red-600 text-xs">
                  <AlertCircle size={14} />
                  {actionError}
                </div>
              </div>
            )}

            {/* 三图对比 */}
            <div className="flex-1 overflow-auto p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  {
                    label: '基线',
                    src: `${API}/baselines/${encodeURIComponent(previewName)}/image`,
                    fallback: '无基线图',
                  },
                  {
                    label: '最新截图',
                    src: `${API}/baselines/${encodeURIComponent(previewName)}/screenshot`,
                    fallback: '暂无最新截图',
                  },
                  {
                    label: 'Diff 差异',
                    src: `${API}/baselines/${encodeURIComponent(previewName)}/diff`,
                    fallback: '暂无 diff 图',
                  },
                ].map((panel) => (
                  <div key={panel.label} className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-gray-500">{panel.label}</span>
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-gray-50 overflow-hidden aspect-[16/9] flex items-center justify-center">
                      <img
                        src={panel.src}
                        alt={panel.label}
                        className="w-full h-full object-contain"
                        onError={(e) => {
                          // 加载失败显示占位文案
                          const target = e.currentTarget;
                          target.style.display = 'none';
                          const parent = target.parentElement;
                          if (parent && !parent.querySelector('[data-fallback]')) {
                            const div = document.createElement('div');
                            div.setAttribute('data-fallback', '');
                            div.className = 'text-xs text-gray-400';
                            div.textContent = panel.fallback;
                            parent.appendChild(div);
                          }
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 底部操作 */}
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50/80 shrink-0">
              <button
                onClick={() => setPreviewName(null)}
                className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg
                  hover:bg-gray-50 transition-colors"
              >
                关闭
              </button>
              <button
                onClick={() => handleUpdate(previewName)}
                disabled={actionLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 rounded-lg
                  hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {actionLoading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                用最新截图更新基线
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── 删除确认弹窗 ─── */}
      {confirmDeleteName !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setConfirmDeleteName(null)} />

          <div className="relative z-10 w-[380px] max-w-[90vw] rounded-2xl bg-white shadow-2xl overflow-hidden">
            <div className="px-6 py-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
                  <Trash2 size={18} className="text-red-500" />
                </div>
                <h4 className="text-base font-semibold text-gray-800">删除基线</h4>
              </div>
              <p className="text-sm text-gray-600 leading-relaxed">
                确定要删除基线 <span className="font-medium text-gray-800">{pageNameOf(confirmDeleteName)}</span> 吗？
                删除后无法恢复，后续对比将重新生成基线。
              </p>
              {actionError && (
                <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 text-red-600 text-xs">
                  <AlertCircle size={14} />
                  {actionError}
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50/80">
              <button
                onClick={() => setConfirmDeleteName(null)}
                className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg
                  hover:bg-gray-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => handleDelete(confirmDeleteName)}
                disabled={actionLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-red-600 rounded-lg
                  hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {actionLoading ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
