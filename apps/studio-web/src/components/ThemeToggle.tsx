/**
 * ThemeToggle — 亮色/暗色主题切换按钮
 *
 * 使用 HeroUI 的 useTheme hook，主题偏好持久化到 localStorage。
 */

import { useTheme } from '@heroui/react';
import { Sun, Moon } from 'lucide-react';

/**
 * 主题切换按钮组件
 * 位于页面右上角，支持亮色/暗色切换，偏好自动记忆
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme('light');

  const isDark = theme === 'dark';

  const toggle = () => {
    setTheme(isDark ? 'light' : 'dark');
  };

  return (
    <button
      onClick={toggle}
      title={isDark ? '切换到亮色模式' : '切换到暗色模式'}
      className="flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200 cursor-pointer
        bg-surface-sunken border border-line-soft text-slate-500 dark:text-slate-400
        hover:text-accent-600 hover:border-accent-300 dark:hover:text-accent-300 dark:hover:border-accent-500/40"
    >
      {isDark ? (
        <Sun size={16} className="transition-transform hover:rotate-90" />
      ) : (
        <Moon size={16} className="transition-transform hover:rotate-12" />
      )}
    </button>
  );
}
