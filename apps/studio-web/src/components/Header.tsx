/**
 * Header — 顶部导航栏
 *
 * 包含: Logo、用户信息与登出、主题切换、模型切换器。
 * 从 App.tsx 抽取，减少 App.tsx 的渲染负担。
 */

import { Zap, ChevronDown, Check, Cpu, LogOut, User } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';
import type { ModelOption } from '../hooks/useModelSwitcher';
import type { AuthUser } from '../hooks/useAuth';

interface HeaderProps {
  user: AuthUser | null;
  models: ModelOption[];
  currentModel: string;
  modelMenuOpen: boolean;
  onToggleModelMenu: () => void;
  onSwitchModel: (modelId: string) => void;
  onLogout: () => void;
}

export function Header({
  user,
  models,
  currentModel,
  modelMenuOpen,
  onToggleModelMenu,
  onSwitchModel,
  onLogout,
}: HeaderProps) {
  return (
    <header
      className="flex items-center px-6 h-16 shrink-0"
      style={{
        background: 'linear-gradient(135deg, #001529, #002140)',
        borderBottom: '1px solid #003a70',
      }}
    >
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center mr-3"
        style={{ background: 'linear-gradient(135deg, #1677ff, #4096ff)' }}
      >
        <Zap className="w-5 h-5 text-white" />
      </div>
      <h4 className="text-white m-0 flex-1 text-lg font-semibold">AI Engineering Agent</h4>

      <div className="flex gap-3 items-center">
        {/* 用户信息 */}
        {user && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/10 border border-white/10">
            <User className="w-3.5 h-3.5 text-white/70" />
            <span className="text-xs text-white/90 font-medium">{user.username}</span>
            <button
              onClick={onLogout}
              className="ml-1 p-1 rounded hover:bg-white/20 text-white/60 hover:text-white transition-colors"
              title="退出登录"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <ThemeToggle />

        {/* 模型切换器 */}
        <div className="relative">
          <button
            onClick={onToggleModelMenu}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium
              bg-white/10 hover:bg-white/20 text-white/90 backdrop-blur-sm
              border border-white/10 hover:border-white/20 transition-all cursor-pointer"
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>{currentModel || 'Loading...'}</span>
            <ChevronDown
              className={`w-3 h-3 transition-transform ${modelMenuOpen ? 'rotate-180' : ''}`}
            />
          </button>
          {modelMenuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={onToggleModelMenu} />
              <div
                className="absolute right-0 top-full mt-2 z-50 w-52 rounded-xl overflow-hidden
                  bg-gray-900/95 backdrop-blur-xl border border-white/10 shadow-2xl"
              >
                <div className="px-3 py-2 text-[10px] text-white/40 uppercase tracking-wider font-medium">
                  选择模型
                </div>
                {models.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => onSwitchModel(m.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-sm transition-colors cursor-pointer
                      ${
                        m.active
                          ? 'bg-blue-500/20 text-blue-300'
                          : 'text-white/80 hover:bg-white/10 hover:text-white'
                      }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-md flex items-center justify-center
                        ${m.active ? 'bg-blue-500/30' : 'bg-white/10'}`}
                    >
                      {m.active ? (
                        <Check className="w-3 h-3" />
                      ) : (
                        <Cpu className="w-3 h-3" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{m.label}</div>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
