/**
 * Sidebar — 全站导航 + 会话列表管理
 *
 * 明亮轻奢风：精修导航项（活跃态靛蓝光晕）、会话卡片悬浮抬升。
 * 保留既有全部功能：新建/编辑/删除/置顶、内联删除二次确认。
 */

import { useState } from 'react';
import { Button } from '@heroui/react/button';
import { Input } from '@heroui/react/input';
import { Tooltip, TooltipTrigger, TooltipContent } from '@heroui/react/tooltip';
import { ProgressBar } from '@heroui/react/progress-bar';
import {
  Plus,
  Trash2,
  Pencil,
  Pin,
  MoreHorizontal,
  X,
  MessageSquare,
  History,
  LayoutGrid,
  Image as ImageIcon,
} from 'lucide-react';
import type { Session } from '../hooks/useSessions';

type NavKey = 'chat' | 'workflows' | 'history' | 'baselines';

/** 主导航项定义（key 对应 App 层 NavKey） */
const NAV_ITEMS: ReadonlyArray<{ key: NavKey; icon: typeof MessageSquare; label: string }> = [
  { key: 'chat', icon: MessageSquare, label: '需求对话' },
  { key: 'workflows', icon: LayoutGrid, label: '工作流' },
  { key: 'history', icon: History, label: '运行历史' },
  { key: 'baselines', icon: ImageIcon, label: '视觉基线' },
];

interface SidebarProps {
  sessions: Session[];
  activeSessionId: string | null;
  activeNav: NavKey;
  onSelectSession: (id: string) => void;
  onCreateSession: () => void;
  onDeleteSession: (id: string) => void;
  onEditSession: (id: string, name: string, featureName?: string) => void;
  onTogglePin: (id: string) => void;
  onNavigate: (key: NavKey) => void;
}

export function Sidebar({
  sessions,
  activeSessionId,
  activeNav,
  onSelectSession,
  onCreateSession,
  onDeleteSession,
  onEditSession,
  onTogglePin,
  onNavigate,
}: SidebarProps) {
  // 编辑弹窗状态
  const [editSession, setEditSession] = useState<Session | null>(null);
  const [editName, setEditName] = useState('');
  const [editFeatureName, setEditFeatureName] = useState('');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  /** 打开编辑弹窗 */
  const openEditModal = (s: Session) => {
    setEditSession(s);
    setEditName(s.name);
    setEditFeatureName(s.featureName ?? '');
  };

  /** 关闭编辑弹窗 */
  const closeEditModal = () => {
    setEditSession(null);
  };

  /** 确认编辑 */
  const confirmEdit = () => {
    if (editSession && editName.trim()) {
      onEditSession(editSession.id, editName.trim(), editFeatureName.trim() || undefined);
    }
    closeEditModal();
  };

  const handleDelete = (id: string) => {
    setMenuOpenId(null);
    setConfirmDeleteId(id);
  };

  return (
    <div className="w-[280px] bg-surface-soft flex flex-col h-full">
      {/* ─── 主导航（工作区）─── */}
      <nav aria-label="工作区导航" className="px-3 pt-4 pb-2">
        {/* 分区标签 */}
        <div className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
          工作区
        </div>
        <div className="flex flex-col gap-1">
          {NAV_ITEMS.map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => onNavigate(key)}
              aria-current={activeNav === key ? 'page' : undefined}
              className={`group flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-medium transition-all duration-200 cursor-pointer ${
                activeNav === key
                  ? 'bg-accent-50 text-accent-700 ring-1 ring-inset ring-accent-100 shadow-luxe-sm dark:bg-accent-500/10 dark:text-accent-300 dark:ring-accent-500/25'
                  : 'text-slate-600 hover:bg-surface hover:shadow-luxe-sm dark:text-slate-400 dark:hover:bg-surface-sunken'
              }`}
            >
              <Icon
                className={`h-4 w-4 shrink-0 transition-colors ${
                  activeNav === key
                    ? 'text-accent-600 dark:text-accent-300'
                    : 'text-slate-400 group-hover:text-accent-500 dark:text-slate-500'
                }`}
              />
              <span>{label}</span>
              {activeNav === key && (
                <span className="ml-auto h-1.5 w-1.5 animate-pulse-ring rounded-full bg-accent-500" />
              )}
            </button>
          ))}
        </div>
      </nav>

      {/* 分隔线 */}
      <div className="mx-4 my-1 h-px bg-line shrink-0" />

      {/* Session list header */}
      {activeNav === 'chat' && (
        <>
          <div className="flex items-center justify-between px-3 pb-2">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">会话列表</span>
            <Tooltip>
              <TooltipTrigger>
                <button
                  type="button"
                  onClick={onCreateSession}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-all duration-200 cursor-pointer hover:bg-surface hover:text-accent-600 hover:shadow-luxe-sm dark:hover:text-accent-300"
                >
                  <Plus size={16} />
                </button>
              </TooltipTrigger>
              <TooltipContent>新建会话</TooltipContent>
            </Tooltip>
          </div>

          {/* Sessions */}
          <div className="flex-1 overflow-auto px-3 relative">
            {sessions.map((s) => (
              <div
                key={s.id}
                onClick={() => onSelectSession(s.id)}
                className={`relative px-3 py-2.5 mb-2 rounded-xl cursor-pointer transition-all duration-200 border ${
                  activeSessionId === s.id
                    ? 'bg-accent-50/60 border-accent-300 ring-1 ring-accent-200 shadow-luxe-sm dark:bg-accent-500/10 dark:border-accent-500/40 dark:ring-accent-500/20'
                    : 'bg-surface border-line hover:shadow-luxe-md hover:-translate-y-px hover:border-accent-200 dark:hover:border-accent-500/30'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    {s.pinned && <Pin size={12} className="text-accent-500 shrink-0 fill-accent-500" />}
                    <span className="text-[13px] font-semibold text-slate-800 dark:text-slate-200 break-words">
                      {s.featureName || s.name}
                    </span>
                  </div>
                  {/* Three-dot menu */}
                  <div className="relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpenId(menuOpenId === s.id ? null : s.id);
                      }}
                      className="p-1 rounded-md text-slate-400 hover:bg-surface-sunken hover:text-slate-600 dark:hover:text-slate-200 transition cursor-pointer"
                    >
                      <MoreHorizontal size={14} />
                    </button>
                    {menuOpenId === s.id && (
                      <>
                        <div
                          className="fixed inset-0 z-40"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuOpenId(null);
                          }}
                        />
                        <div className="absolute right-0 top-full mt-1 z-50 w-32 rounded-xl bg-surface border border-line shadow-luxe-lg py-1 animate-rise overflow-hidden">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onTogglePin(s.id);
                              setMenuOpenId(null);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300 hover:bg-surface-sunken transition cursor-pointer"
                          >
                            <Pin size={12} className={s.pinned ? 'text-accent-500 fill-accent-500' : ''} />
                            {s.pinned ? '取消置顶' : '置顶'}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditModal(s);
                              setMenuOpenId(null);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300 hover:bg-surface-sunken transition cursor-pointer"
                          >
                            <Pencil size={12} />
                            编辑
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(s.id);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 transition cursor-pointer"
                          >
                            <Trash2 size={12} />
                            删除
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {s.featureName && s.featureName !== s.name && (
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 break-words">{s.name}</span>
                )}

                <div className="flex items-center gap-2 mt-1.5">
                  <ProgressBar
                    value={Number(s.completeness) || 0}
                    size="sm"
                    className="flex-1"
                    color={s.completeness >= 80 ? 'success' : 'default'}
                    aria-label="Session completeness"
                  />
                  <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 bg-surface-sunken px-1.5 py-0.5 rounded-full leading-none">
                    {s.messageCount}
                  </span>
                </div>

                {/* Delete confirmation bar */}
                {confirmDeleteId === s.id && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 flex-1">确认删除?</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteSession(s.id);
                        setConfirmDeleteId(null);
                      }}
                      className="px-2 py-0.5 rounded text-[11px] font-medium bg-red-500 text-white hover:bg-red-600 transition cursor-pointer"
                    >
                      删除
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDeleteId(null);
                      }}
                      className="px-2 py-0.5 rounded text-[11px] font-medium bg-surface-sunken text-slate-600 dark:text-slate-300 hover:bg-line transition cursor-pointer"
                    >
                      取消
                    </button>
                  </div>
                )}
              </div>
            ))}

            {sessions.length === 0 && (
              <div className="text-center py-6 text-slate-400 dark:text-slate-500">
                <MessageSquare size={32} className="mx-auto mb-2" />
                <div className="text-xs">暂无会话</div>
                <Button variant="ghost" size="sm" onPress={onCreateSession} className="mt-1">
                  创建第一个
                </Button>
              </div>
            )}
          </div>
        </>
      )}

      {/* ─── 编辑会话弹窗（无遮罩）─── */}
      {editSession !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          {/* 弹窗 */}
          <div className="w-[380px] max-w-[90vw] rounded-2xl bg-surface shadow-luxe-lg overflow-hidden pointer-events-auto animate-rise">
            {/* 标题栏 */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-line-soft dark:border-line">
              <h4 className="text-base font-semibold text-slate-800 dark:text-slate-100">编辑会话</h4>
              <button
                onClick={closeEditModal}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-surface-sunken transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* 表单内容 */}
            <div className="px-5 py-4 flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400">会话名称</label>
                <Input
                  className="text-sm"
                  placeholder="输入会话名称"
                  value={editName}
                  onChange={(e) => setEditName((e.target as HTMLInputElement).value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') confirmEdit();
                  }}
                  autoFocus
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400">描述</label>
                <textarea
                  className="w-full resize-none rounded-xl border border-line bg-surface-soft px-3 py-2.5 text-sm text-slate-800 dark:text-slate-200 outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100 dark:focus:ring-accent-500/20 transition"
                  placeholder="简要描述会话内容（可选）"
                  rows={3}
                  maxLength={100}
                  value={editFeatureName}
                  onChange={(e) => setEditFeatureName(e.target.value)}
                />
                <p className="text-[10px] text-slate-400 dark:text-slate-500 text-right">
                  {editFeatureName.length}/100
                </p>
              </div>
            </div>

            {/* 底部按钮 */}
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-line-soft dark:border-line bg-surface-soft/80">
              <Button variant="ghost" size="sm" onPress={closeEditModal}>
                取消
              </Button>
              <Button variant="primary" size="sm" onPress={confirmEdit} isDisabled={!editName.trim()}>
                保存
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
