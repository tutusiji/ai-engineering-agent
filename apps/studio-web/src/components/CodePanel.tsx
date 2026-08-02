/**
 * CodePanel — generated code file viewer with syntax highlighting
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Chip } from '@heroui/react/chip';
import { Text } from '@heroui/react/text';
import { Code, File, Download, Loader2, Sparkles, MessageSquare, Send, Check, X } from 'lucide-react';
import Prism from 'prismjs';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-bash';
import 'prismjs/themes/prism-tomorrow.css';

interface CodeFile {
  path: string;
  kind: string;
  content?: string;
}

function getLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'tsx',
    js: 'jsx',
    jsx: 'jsx',
    css: 'css',
    scss: 'css',
    less: 'css',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    md: 'markdown',
    sh: 'bash',
    bash: 'bash',
    vue: 'html',
    html: 'html',
  };
  return map[ext] ?? 'typescript';
}

function kindChipColor(kind: string): "accent" | "success" | "default" | "warning" | "danger" {
  const map: Record<string, "accent" | "success" | "default" | "warning" | "danger"> = {
    view: 'accent',
    page: 'accent',
    component: 'success',
    composable: 'default',
    hook: 'default',
    api: 'warning',
    test: 'danger',
    type: 'accent',
    style: 'default',
  };
  return map[kind] ?? 'default';
}

function HighlightedCode({ code, language }: { code: string; language: string }) {
  const codeRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (codeRef.current) {
      Prism.highlightElement(codeRef.current);
    }
  }, [code, language]);

  return (
    <pre className="m-0 p-4 bg-[#1e1e1e] text-[13px] leading-relaxed">
      <code ref={codeRef} className={`language-${language}`}>
        {code}
      </code>
    </pre>
  );
}

/** 需求阶段选项(用于多阶段生成时的阶段选择器) */
interface PhaseOption {
  id: string;
  name?: string;
}

interface CodePanelProps {
  files: CodeFile[];
  onGenerate?: (phaseId?: string) => void;
  loading?: boolean;
  refining?: boolean;
  /** 需求文档中的阶段列表,多阶段时显示阶段选择器 */
  phases?: PhaseOption[];
  selectedPhaseId?: string;
  onPhaseChange?: (phaseId: string) => void;
  /** 流式生成进度:已开始的文件路径与当前文件 */
  codeProgress?: { files: string[]; current: string | null };
  /** 截断等警告信息 */
  codeWarning?: string | null;
  /** 取消当前生成/精炼 */
  onCancel?: () => void;
  onRefine?: (feedback: string) => void;
}

export function CodePanel({
  files,
  onGenerate,
  loading,
  refining,
  phases,
  selectedPhaseId,
  onPhaseChange,
  codeProgress,
  codeWarning,
  onCancel,
  onRefine,
}: CodePanelProps) {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [refineOpen, setRefineOpen] = useState(false);
  const [refineFeedback, setRefineFeedback] = useState('');
  const [codeWarningDismissed, setCodeWarningDismissed] = useState(false);

  // 生成/精炼完成后,自动选中第一个文件便于查看
  useEffect(() => {
    if (files.length > 0 && !selectedFile) {
      setSelectedFile(files[0].path);
    }
  }, [files, selectedFile]);

  // 新的警告到来时重置关闭标记
  useEffect(() => {
    if (codeWarning) setCodeWarningDismissed(false);
  }, [codeWarning]);

  const busy = !!loading || !!refining;
  const seenFiles = codeProgress?.files ?? [];
  const generatingFile = codeProgress?.current ?? null;
  // 已完成的文件数(当前正在生成的文件不计入)
  const doneCount = Math.max(0, seenFiles.length - (generatingFile ? 1 : 0));
  const progressText = generatingFile
    ? `正在生成文件: ${generatingFile.split('/').pop()}(已生成 ${doneCount} 个)`
    : (loading ? '正在连接 AI 引擎...' : '正在分析修改...');

  // 下载单个文件
  const handleDownloadFile = useCallback((file: CodeFile) => {
    if (!file.content) return;
    const blob = new Blob([file.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.path.split('/').pop() ?? 'code.txt';
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  // 打包下载所有文件为 ZIP
  const handleDownloadAll = useCallback(async () => {
    if (files.length === 0) return;
    if (files.length === 1) {
      handleDownloadFile(files[0]);
      return;
    }

    // 使用 JSZip 打包
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    files.forEach(file => {
      if (file.content) {
        zip.file(file.path, file.content);
      }
    });

    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'generated-code.zip';
    a.click();
    URL.revokeObjectURL(url);
  }, [files, handleDownloadFile]);

  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-16">
        {onGenerate ? (
          <>
            <Code size={64} className="text-default-400" />
            <Text className="text-default-500 text-center max-w-md">
              架构方案已就绪，点击下方按钮生成全栈代码
            </Text>
            <button
              onClick={() => onGenerate?.(selectedPhaseId)}
              disabled={loading}
              className="mt-2 flex items-center gap-2 px-6 py-3 rounded-lg bg-gradient-to-r from-green-500 to-emerald-600
                text-white font-semibold text-sm shadow-lg shadow-green-500/25
                hover:shadow-green-500/40 hover:scale-105
                disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100
                transition-all cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  <span>代码生成中...</span>
                </>
              ) : (
                <>
                  <Sparkles size={18} />
                  <span>生成代码</span>
                </>
              )}
            </button>
          </>
        ) : (
          <>
            <Code size={64} className="text-default-400" />
            <Text className="text-default-500">
              {'需求完整度达到 95% 后，点击"代码"按钮生成'}
            </Text>
          </>
        )}
      </div>
    );
  }

  const currentFile = files.find((f) => f.path === selectedFile);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 shrink-0">
        <div className="flex items-center gap-2">
          <Code className="w-4 h-4 text-blue-500" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            生成的代码 ({files.length} 个文件)
          </span>
          {phases && phases.length > 1 && (
            <select
              value={selectedPhaseId ?? phases[0]?.id ?? ''}
              onChange={(e) => onPhaseChange?.(e.target.value)}
              disabled={busy}
              className="px-2 py-1 rounded-md border border-gray-200 dark:border-gray-700
                bg-white dark:bg-gray-800 text-xs text-gray-700 dark:text-gray-200
                focus:outline-none focus:ring-2 focus:ring-blue-400/40 disabled:opacity-50"
              title="选择生成阶段"
            >
              {phases.map((p) => (
                <option key={p.id} value={p.id}>{p.name || p.id}</option>
              ))}
            </select>
          )}
          {onRefine && (
            <button
              onClick={() => setRefineOpen(!refineOpen)}
              disabled={refining}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer
                ${refineOpen
                  ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                  : 'text-purple-600 hover:bg-purple-50 dark:text-purple-400 dark:hover:bg-purple-900/20'
                } disabled:opacity-50`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              对话修改
            </button>
          )}
        </div>
        <button
          onClick={handleDownloadAll}
          disabled={files.length === 0}
          className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-blue-600 text-white text-xs font-medium
            hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          打包下载
        </button>
      </div>

      {/* Refine panel */}
      {refineOpen && onRefine && (
        <div className="px-4 py-3 bg-purple-50/50 dark:bg-purple-950/20 border-b border-purple-200 dark:border-purple-800 shrink-0">
          <div className="flex gap-2">
            <input
              value={refineFeedback}
              onChange={e => setRefineFeedback(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey && refineFeedback.trim()) {
                  onRefine(refineFeedback);
                  setRefineFeedback('');
                }
              }}
              placeholder="描述你想要的修改，如：给登录页添加手机号验证、修复 API 调用错误..."
              disabled={refining}
              className="flex-1 px-3 py-2 rounded-lg border border-purple-200 dark:border-purple-700
                bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-200
                placeholder:text-gray-400 dark:placeholder:text-gray-500
                focus:outline-none focus:ring-2 focus:ring-purple-400/50
                disabled:opacity-50"
            />
            <button
              onClick={() => {
                if (refineFeedback.trim()) {
                  onRefine(refineFeedback);
                  setRefineFeedback('');
                }
              }}
              disabled={refining || !refineFeedback.trim()}
              className="flex items-center gap-1 px-4 py-2 rounded-lg bg-purple-600 text-white text-sm font-medium
                hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              {refining ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              <span>{refining ? '修改中...' : '发送'}</span>
            </button>
          </div>
        </div>
      )}

      {/* 截断等警告横幅(生成结束后仍展示,直到下次生成重置) */}
      {codeWarning && !codeWarningDismissed && (
        <div className="px-4 py-2 bg-yellow-50 dark:bg-yellow-950/40 border-b border-yellow-200 dark:border-yellow-800 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-yellow-800 dark:text-yellow-300">{codeWarning}</span>
            <button
              onClick={() => setCodeWarningDismissed(true)}
              className="text-yellow-600 hover:text-yellow-800 dark:text-yellow-400 shrink-0 cursor-pointer"
              title="关闭提示"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* 进度面板(生成/精炼中),替代原始 JSON 文本流 */}
      {busy && (
        <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 min-w-0">
              <Loader2 size={14} className="animate-spin text-blue-500 shrink-0" />
              <span className="truncate">{progressText}</span>
            </div>
            {onCancel && (
              <button
                onClick={onCancel}
                className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-gray-200 dark:bg-gray-700
                  text-gray-700 dark:text-gray-200 text-xs font-medium
                  hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors cursor-pointer shrink-0"
              >
                <X className="w-3 h-3" />
                取消
              </button>
            )}
          </div>

          {/* 已生成/生成中的文件清单 */}
          {seenFiles.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {seenFiles.map((path) => {
                const isCurrent = path === generatingFile;
                return (
                  <span
                    key={path}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] border
                      ${isCurrent
                        ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                        : 'border-gray-200 bg-white text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'}`}
                  >
                    {isCurrent
                      ? <Loader2 size={10} className="animate-spin" />
                      : <Check size={10} className="text-green-500" />}
                    <span className="max-w-[140px] truncate">{path.split('/').pop()}</span>
                  </span>
                );
              })}
            </div>
          )}

          {/* 不确定进度条(未依赖精确总数) */}
          <div className="mt-2 h-1 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
            <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 animate-pulse" />
          </div>
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* File tree */}
        <div className="w-[280px] border-r border-divider overflow-auto p-2">
          <div className="px-2 pt-2 pb-1 text-xs text-default-500 font-semibold">
            📁 文件列表
          </div>
          <div className="flex flex-col gap-0.5">
            {files.map((file) => (
              <div
                key={file.path}
                onClick={() => setSelectedFile(file.path)}
                className={`flex items-center gap-1.5 cursor-pointer px-2 py-1.5 rounded-md transition-colors group ${
                  selectedFile === file.path
                    ? 'bg-blue-100 dark:bg-blue-900/30'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                <File size={14} className={`text-${kindChipColor(file.kind)} shrink-0`} />
                <Chip
                  size="sm"
                  variant="soft"
                  color={kindChipColor(file.kind)}
                  className="text-[10px] h-4 min-w-0 px-1 shrink-0"
                >
                  {file.kind}
                </Chip>
                <Text className="text-xs truncate flex-1 min-w-0">
                  {file.path.split('/').pop()}
                </Text>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDownloadFile(file);
                  }}
                  className="p-1 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50
                    opacity-0 group-hover:opacity-100 transition shrink-0"
                  title="下载文件"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Code view */}
        <div className="flex-1 overflow-auto bg-[#1e1e1e]">
          {currentFile?.content ? (
            <div>
              <div className="flex items-center gap-2 px-4 py-2 bg-[#252526] border-b border-[#333]">
                <File size={14} className="text-[#569cd6]" />
                <Text className="text-[#d4d4d4] text-xs">
                  {currentFile.path}
                </Text>
                <Chip
                  size="sm"
                  variant="soft"
                  className="text-[10px] h-4 min-w-0 px-1"
                >
                  {getLanguage(currentFile.path)}
                </Chip>
                <button
                  onClick={() => handleDownloadFile(currentFile)}
                  className="ml-auto flex items-center gap-1 px-2 py-1 rounded-md text-[#d4d4d4]
                    text-[10px] hover:bg-[#3c3c3c] transition-colors"
                >
                  <Download className="w-3 h-3" />
                  下载
                </button>
              </div>
              <HighlightedCode
                code={currentFile.content}
                language={getLanguage(currentFile.path)}
              />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-16 text-default-500 gap-4">
              <File size={48} />
              <div>选择文件查看代码</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}