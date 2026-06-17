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
  Check,
  X,
  MessageSquare,
  Zap,
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
  onRenameSession: (id: string, name: string) => void;
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
  onRenameSession,
  onTogglePin,
  onNavigate,
}: SidebarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const startEdit = (s: Session) => {
    setEditingId(s.id);
    setEditName(s.name);
  };

  const confirmEdit = () => {
    if (editingId && editName.trim()) {
      onRenameSession(editingId, editName.trim());
    }
    setEditingId(null);
  };

  const handleDelete = (id: string) => {
    setMenuOpenId(null);
    setConfirmDeleteId(id);
  };

  return (
    <div className="w-[280px] bg-[#fafafa] border-r border-[#e8e8e8] flex flex-col h-full">
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
            <Text className="text-xs text-[#888] font-semibold">会话列表</Text>
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
          <div className="flex-1 overflow-auto px-3">
            {sessions.map((s) => (
              <div
                key={s.id}
                onClick={() => onSelectSession(s.id)}
                className={`px-3 py-2.5 mb-2 rounded-xl cursor-pointer transition-all border shadow-sm ${
                  activeSessionId === s.id
                    ? 'bg-blue-50 border-blue-400 shadow-blue-100'
                    : 'bg-white border-gray-200 hover:border-gray-300 hover:shadow-md'
                }`}
              >
                <div className="flex items-center justify-between">
                  {editingId === s.id ? (
                    <div className="flex items-center gap-1 flex-1">
                      <Input
                        className="text-sm flex-1"
                        value={editName}
                        onChange={(e) => setEditName((e.target as HTMLInputElement).value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') confirmEdit();
                        }}
                        onBlur={confirmEdit}
                        onClick={(e) => e.stopPropagation()}
                        autoFocus
                      />
                      <button
                        className="text-green-500 cursor-pointer hover:text-green-600"
                        onClick={(e) => { e.stopPropagation(); confirmEdit(); }}
                      >
                        <Check size={14} />
                      </button>
                      <button
                        className="text-gray-400 cursor-pointer hover:text-gray-600"
                        onClick={(e) => { e.stopPropagation(); setEditingId(null); }}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        {s.pinned && <Pin size={12} className="text-blue-500 shrink-0 fill-blue-500" />}
                        <Text className="text-[13px] font-semibold text-gray-800 truncate">{s.name}</Text>
                      </div>
                      {/* Three-dot menu */}
                      <div className="relative">
                        <button
                          onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === s.id ? null : s.id); }}
                          className="p-1 rounded-md hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition cursor-pointer"
                        >
                          <MoreHorizontal size={14} />
                        </button>
                        {menuOpenId === s.id && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setMenuOpenId(null); }} />
                            <div className="absolute right-0 top-full mt-1 z-50 w-32 rounded-lg bg-white border border-gray-200 shadow-xl py-1">
                              <button
                                onClick={(e) => { e.stopPropagation(); onTogglePin(s.id); setMenuOpenId(null); }}
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100 transition cursor-pointer"
                              >
                                <Pin size={12} className={s.pinned ? 'text-blue-500 fill-blue-500' : ''} />
                                {s.pinned ? '取消置顶' : '置顶'}
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); startEdit(s); setMenuOpenId(null); }}
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100 transition cursor-pointer"
                              >
                                <Pencil size={12} />
                                重命名
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDelete(s.id); }}
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 transition cursor-pointer"
                              >
                                <Trash2 size={12} />
                                删除
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>

                {s.featureName && (
                  <Text className="text-[11px] text-gray-500 mt-0.5 truncate">{s.featureName}</Text>
                )}

                <div className="flex items-center gap-2 mt-1.5">
                  <ProgressBar
                    value={Number(s.completeness) || 0}
                    size="sm"
                    className="flex-1"
                    color={s.completeness >= 80 ? 'success' : 'default'}
                    aria-label="Session completeness"
                  />
                  <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-full leading-none">
                    {s.messageCount}
                  </span>
                </div>

                {/* Delete confirmation popover */}
                {confirmDeleteId === s.id && (
                  <div className="mt-2 p-2 rounded-lg bg-red-50 border border-red-200 flex items-center gap-2">
                    <span className="text-xs text-red-600 flex-1">确认删除该会话?</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDeleteSession(s.id); setConfirmDeleteId(null); }}
                      className="px-2 py-0.5 rounded text-[11px] font-medium bg-red-500 text-white hover:bg-red-600 transition cursor-pointer"
                    >
                      删除
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null); }}
                      className="px-2 py-0.5 rounded text-[11px] font-medium bg-gray-200 text-gray-600 hover:bg-gray-300 transition cursor-pointer"
                    >
                      取消
                    </button>
                  </div>
                )}
              </div>
            ))}

            {sessions.length === 0 && (
              <div className="text-center py-6 text-gray-400">
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
    </div>
  );
}
