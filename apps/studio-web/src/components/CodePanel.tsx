/**
 * CodePanel — generated code file viewer with syntax highlighting
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Chip } from '@heroui/react/chip';
import { Text } from '@heroui/react/text';
import { Code, File, Download } from 'lucide-react';
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

export function CodePanel({ files }: { files: CodeFile[] }) {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

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
        <Code size={64} className="text-default-400" />
        <Text className="text-default-500">
          {'需求完整度达到 95% 后，点击"代码"按钮生成'}
        </Text>
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
