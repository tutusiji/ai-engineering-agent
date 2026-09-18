/**
 * Header — 顶部导航栏
 *
 * 明亮轻奢风：磨砂玻璃表面 + 精致描边 + 靛蓝品牌渐变。
 * 包含: Logo、用户信息与登出、模型切换器。
 * 暗色模式入口已临时移除：主面板尚未完成 dark: 变体适配，锁定亮色保证体验一致；
 * ThemeToggle 组件保留，待全部面板适配后恢复入口。
 * 从 App.tsx 抽取，减少 App.tsx 的渲染负担。
 */

import { Zap, ChevronDown, Check, Cpu, LogOut } from 'lucide-react';
import { Avatar } from './Avatar';
import type { ModelOption } from '../hooks/useModelSwitcher';
import type { AuthUser } from '../hooks/useAuth';

interface HeaderProps {
  /** 当前登录用户 */
  user: AuthUser | null;
  /** 可切换的模型列表 */
  models: ModelOption[];
  /** 当前激活模型标识 */
  currentModel: string;
  /** 模型下拉菜单是否展开 */
  modelMenuOpen: boolean;
  /** 切换下拉菜单展开态 */
  onToggleModelMenu: () => void;
  /** 切换模型回调 */
  onSwitchModel: (modelId: string) => void;
  /** 退出登录回调 */
  onLogout: () => void;
  /** 换一个头像回调（点击头像触发） */
  onShuffleAvatar: () => void;
}

export function Header({
  user,
  models,
  currentModel,
  modelMenuOpen,
  onToggleModelMenu,
  onSwitchModel,
  onLogout,
  onShuffleAvatar,
}: HeaderProps) {
  return (
    <header className="relative z-20 flex items-center px-6 h-16 shrink-0 bg-surface/85 backdrop-blur-xl border-b border-line">
      {/* 品牌标识：靛蓝→紫罗兰渐变方圆角 + 闪电图标 */}
      <div className="relative w-9 h-9 rounded-xl flex items-center justify-center mr-3 bg-gradient-to-br from-accent-500 to-violet-500 shadow-luxe-sm">
        <Zap className="w-5 h-5 text-white" />
      </div>
      <h4 className="m-0 flex-1 text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
        AI Engineering Agent
      </h4>

      <div className="flex gap-2.5 items-center">
        {/* 用户信息胶囊 */}
        {user && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-sunken border border-line-soft">
            <button
              onClick={onShuffleAvatar}
              title="换一个头像"
              className="shrink-0 rounded-full cursor-pointer transition-transform duration-150 hover:scale-110 active:scale-95"
            >
              <Avatar
                src={user.avatarUrl}
                name={user.username}
                className="w-6 h-6 rounded-full border border-line-soft"
              />
            </button>
            <span className="text-xs font-medium text-slate-700 dark:text-slate-200">{user.username}</span>
            <button
              onClick={onLogout}
              className="ml-1 p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-surface cursor-pointer transition-colors dark:text-slate-500 dark:hover:text-slate-200 dark:hover:bg-surface-sunken"
              title="退出登录"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* 模型切换器 */}
        <div className="relative">
          <button
            onClick={onToggleModelMenu}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium
              bg-surface-sunken border border-line-soft text-slate-700 dark:text-slate-200
              hover:border-accent-300 hover:bg-accent-50/60 dark:hover:border-accent-500/40 dark:hover:bg-accent-500/10
              transition-all duration-200 cursor-pointer"
          >
            <Cpu className="w-3.5 h-3.5 text-accent-500" />
            <span>{currentModel || 'Loading...'}</span>
            <ChevronDown
              className={`w-3 h-3 text-slate-400 transition-transform duration-200 ${
                modelMenuOpen ? 'rotate-180' : ''
              }`}
            />
          </button>
          {modelMenuOpen && (
            <>
              {/* 点击遮罩关闭菜单 */}
              <div className="fixed inset-0 z-40" onClick={onToggleModelMenu} />
              <div
                className="absolute right-0 top-full mt-2 z-50 w-56 rounded-2xl overflow-hidden
                  bg-surface border border-line shadow-luxe-lg animate-rise"
              >
                <div className="px-4 py-2.5 text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                  选择模型
                </div>
                {models.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => onSwitchModel(m.id)}
                    className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-left text-sm transition-colors duration-150 cursor-pointer
                      ${
                        m.active
                          ? 'bg-accent-50 text-accent-700 dark:bg-accent-500/15 dark:text-accent-300'
                          : 'text-slate-600 dark:text-slate-300 hover:bg-surface-sunken dark:hover:bg-surface-sunken'
                      }`}
                  >
                    <span
                      className={`flex items-center justify-center w-5 h-5 rounded-md shrink-0
                        ${m.active ? 'bg-accent-500 text-white' : 'bg-surface-sunken text-slate-400'}`}
                    >
                      {m.active ? <Check className="w-3 h-3" /> : <Cpu className="w-3 h-3" />}
                    </span>
                    <span className="font-medium truncate">{m.label}</span>
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
