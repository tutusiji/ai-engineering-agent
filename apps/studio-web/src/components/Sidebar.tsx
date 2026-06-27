/**
 * Sidebar — session list + management + navigation
 */

import { useState } from 'react';
import { Button } from '@heroui/react/button';
import { Input } from '@heroui/react/input';
import { Tooltip, TooltipTrigger, TooltipContent } from '@heroui/react/tooltip';
import { ProgressBar } from '@heroui/react/progress-bar';
import { Separator } from '@heroui/react/separator';
import { Text } from '@heroui/react/text';
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
} from 'lucide-react';
import type { Session } from '../hooks/useSessions';

type NavKey = 'chat' | 'workflows' | 'history';

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
    <div className="w-[280px] bg-[#fafafa] dark:bg-gray-900 border-r border-[#e8e8e8] dark:border-gray-800 flex flex-col h-full">
      {/* Navigation */}
      <div className="px-3 pt-3">
        <div className="flex flex-col gap-1">
          <Button
            variant={activeNav === 'chat' ? 'primary' : 'ghost'}
            className="w-full justify-start"
            onPress={() => onNavigate('chat')}
          >
            <MessageSquare size={16} className="inline mr-1.5" /> 需求对话
          </Button>
          <Button
            variant={activeNav === 'workflows' ? 'primary' : 'ghost'}
            className="w-full justify-start"
            onPress={() => onNavigate('workflows')}
          >
            <LayoutGrid size={16} className="inline mr-1.5" /> 工作流
          </Button>
          <Button
            variant={activeNav === 'history' ? 'primary' : 'ghost'}
            className="w-full justify-start"
            onPress={() => onNavigate('history')}
          >
            <History size={16} className="inline mr-1.5" /> 运行历史
          </Button>
        </div>
      </div>

      <Separator className="my-2" />

      {/* Session list header */}
      {activeNav === 'chat' && (
        <>
          <div className="flex items-center justify-between px-3 pb-2">
            <Text className="text-xs text-[#888] dark:text-gray-400 font-semibold">会话列表</Text>
            <Tooltip>
              <TooltipTrigger>
                <Button isIconOnly variant="ghost" size="sm" onPress={onCreateSession}>
                  <Plus size={16} />
                </Button>
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
                className={`relative px-3 py-2.5 mb-2 rounded-xl cursor-pointer transition-all border shadow-sm ${
                  activeSessionId === s.id
                    ? 'bg-blue-50 dark:bg-blue-950 border-blue-400 dark:border-blue-600 shadow-blue-100 dark:shadow-blue-900/30'
                    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-md'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    {s.pinned && <Pin size={12} className="text-blue-500 shrink-0 fill-blue-500" />}
                    <Text className="text-[13px] font-semibold text-gray-800 dark:text-gray-200 break-words">{s.featureName || s.name}</Text>
                  </div>
                  {/* Three-dot menu */}
                  <div className="relative">
                    <button
                      onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === s.id ? null : s.id); }}
                      className="p-1 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition cursor-pointer"
                    >
                      <MoreHorizontal size={14} />
                    </button>
                    {menuOpenId === s.id && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setMenuOpenId(null); }} />
                        <div className="absolute right-0 top-full mt-1 z-50 w-32 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 shadow-xl py-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); onTogglePin(s.id); setMenuOpenId(null); }}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition cursor-pointer"
                          >
                            <Pin size={12} className={s.pinned ? 'text-blue-500 fill-blue-500' : ''} />
                            {s.pinned ? '取消置顶' : '置顶'}
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); openEditModal(s); setMenuOpenId(null); }}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition cursor-pointer"
                          >
                            <Pencil size={12} />
                            编辑
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDelete(s.id); }}
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
                  <Text className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 break-words">{s.name}</Text>
                )}

                <div className="flex items-center gap-2 mt-1.5">
                  <ProgressBar
                    value={Number(s.completeness) || 0}
                    size="sm"
                    className="flex-1"
                    color={s.completeness >= 80 ? 'success' : 'default'}
                    aria-label="Session completeness"
                  />
                  <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded-full leading-none">
                    {s.messageCount}
                  </span>
                </div>

                {/* Delete confirmation bar */}
                {confirmDeleteId === s.id && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-[11px] text-gray-500 dark:text-gray-400 flex-1">确认删除?</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDeleteSession(s.id); setConfirmDeleteId(null); }}
                      className="px-2 py-0.5 rounded text-[11px] font-medium bg-red-500 text-white hover:bg-red-600 transition cursor-pointer"
                    >
                      删除
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null); }}
                      className="px-2 py-0.5 rounded text-[11px] font-medium bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500 transition cursor-pointer"
                    >
                      取消
                    </button>
                  </div>
                )}
              </div>
            ))}

            {sessions.length === 0 && (
              <div className="text-center py-6 text-gray-400 dark:text-gray-500">
                <MessageSquare size={32} className="mx-auto mb-2" />
                <div className="text-xs">暂无会话</div>
                <Button
                  variant="ghost"
                  size="sm"
                  onPress={onCreateSession}
                  className="mt-1"
                >
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
          <div className="w-[380px] max-w-[90vw] rounded-2xl bg-white dark:bg-gray-800 shadow-[0_8px_40px_rgba(0,0,0,0.15),0_0_0_1px_rgba(0,0,0,0.05)] dark:shadow-[0_8px_40px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.05)] overflow-hidden pointer-events-auto">
            {/* 标题栏 */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
              <h4 className="text-base font-semibold text-gray-800 dark:text-gray-200">
                编辑会话
              </h4>
              <button
                onClick={closeEditModal}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* 表单内容 */}
            <div className="px-5 py-4 flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  会话名称
                </label>
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
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  描述
                </label>
                <textarea
                  className="w-full resize-none rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2.5 text-sm text-gray-800 dark:text-gray-200 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 dark:focus:ring-blue-900 transition"
                  placeholder="简要描述会话内容（可选）"
                  rows={3}
                  maxLength={100}
                  value={editFeatureName}
                  onChange={(e) => setEditFeatureName(e.target.value)}
                />
                <p className="text-[10px] text-gray-400 dark:text-gray-500 text-right">
                  {editFeatureName.length}/100
                </p>
              </div>
            </div>

            {/* 底部按钮 */}
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-900/80">
              <Button
                variant="ghost"
                size="sm"
                onPress={closeEditModal}
              >
                取消
              </Button>
              <Button
                variant="primary"
                size="sm"
                onPress={confirmEdit}
                isDisabled={!editName.trim()}
              >
                保存
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
