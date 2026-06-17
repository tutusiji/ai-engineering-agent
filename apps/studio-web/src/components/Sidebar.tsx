/**
 * Sidebar — session list + management + navigation
 */

import { useState } from 'react';
import { Button } from '@heroui/react/button';
import { Input } from '@heroui/react/input';
import { Tooltip, TooltipTrigger, TooltipContent } from '@heroui/react/tooltip';
import { Chip } from '@heroui/react/chip';
import { ProgressBar } from '@heroui/react/progress-bar';
import { Separator } from '@heroui/react/separator';
import { Text } from '@heroui/react/text';
import {
  Plus,
  Trash2,
  Pencil,
  Pin,
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
    if (window.confirm('确认删除?')) {
      onDeleteSession(id);
    }
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
          <div className="flex-1 overflow-auto px-2">
            {sessions.map((s) => (
              <div
                key={s.id}
                onClick={() => onSelectSession(s.id)}
                className={`px-2.5 py-2 mb-1 rounded-lg cursor-pointer transition-all ${
                  activeSessionId === s.id
                    ? 'bg-blue-50 border border-blue-300'
                    : 'bg-white border border-transparent hover:bg-gray-50'
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
                      <div className="flex items-center gap-1 flex-1 min-w-0">
                        {s.pinned && <Pin size={11} className="text-blue-500 shrink-0 fill-blue-500" />}
                        <Text className="text-[13px] font-semibold truncate">{s.name}</Text>
                      </div>
                      <div className="flex gap-0.5">
                        <Tooltip>
                          <TooltipTrigger>
                            <Button
                              isIconOnly
                              variant="ghost"
                              size="sm"
                              onPress={() => { onTogglePin(s.id); }}
                            >
                              <Pin size={11} className={s.pinned ? 'text-blue-500 fill-blue-500' : 'text-gray-400'} />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{s.pinned ? '取消置顶' : '置顶'}</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger>
                            <Button
                              isIconOnly
                              variant="ghost"
                              size="sm"
                              onPress={() => { startEdit(s); }}
                            >
                              <Pencil size={11} />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>重命名</TooltipContent>
                        </Tooltip>
                        <Button
                          isIconOnly
                          variant="danger-soft"
                          size="sm"
                          onPress={() => handleDelete(s.id)}
                        >
                          <Trash2 size={11} />
                        </Button>
                      </div>
                    </>
                  )}
                </div>

                {s.featureName && (
                  <Text className="text-[11px] text-[#666] truncate">{s.featureName}</Text>
                )}

                <div className="flex items-center gap-2 mt-1">
                  <ProgressBar
                    value={Number(s.completeness) || 0}
                    size="sm"
                    className="flex-1"
                    color={s.completeness >= 80 ? 'success' : 'default'}
                    aria-label="Session completeness"
                  />
                  <Chip size="sm" variant="soft" className="text-[10px] h-4 px-1">
                    {s.messageCount}条
                  </Chip>
                </div>
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
