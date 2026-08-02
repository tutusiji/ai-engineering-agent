/**
 * stream-llm — extractFilePaths 进度提取函数单元测试
 */
import { describe, it, expect } from 'vitest';
import { extractFilePaths } from '../lib/stream-llm.js';

describe('extractFilePaths', () => {
  it('提取 generatedFiles 中的文件路径', () => {
    const text = `{
  "generatedFiles": [
    { "path": "src/views/login/index.vue", "kind": "view", "content": "..." },
    { "path": "src/api/login.ts", "kind": "api", "content": "..." }
  ]
}`;
    expect(extractFilePaths(text)).toEqual(['src/views/login/index.vue', 'src/api/login.ts']);
  });

  it('按出现顺序去重', () => {
    const text = `
      { "path": "a.vue" } { "path": "b.ts" } { "path": "a.vue" }
    `;
    expect(extractFilePaths(text)).toEqual(['a.vue', 'b.ts']);
  });

  it('无路径时返回空数组', () => {
    expect(extractFilePaths('')).toEqual([]);
    expect(extractFilePaths('hello world')).toEqual([]);
  });

  it('跳过穿越目录的异常路径', () => {
    const text = `{ "path": "../secret.txt", "path": "src/ok.ts" }`;
    expect(extractFilePaths(text)).toEqual(['src/ok.ts']);
  });

  it('受上限限制,防止恶意长流', () => {
    const text = Array.from({ length: 5 }, (_, i) => `"path": "f${i}.vue"`).join(',');
    expect(extractFilePaths(text, 3)).toEqual(['f0.vue', 'f1.vue', 'f2.vue']);
  });

  it('截断文本也能提取已出现的路径(用于进度提示)', () => {
    const text = `{
  "generatedFiles": [
    { "path": "src/views/home/index.vue", "kind": "view", "content": "`; // 内容被截断
    expect(extractFilePaths(text)).toEqual(['src/views/home/index.vue']);
  });

  it('content 中出现的 "path" 文本可能产生误报,但不会崩溃且按出现顺序处理', () => {
    const text = `{ "path": "src/main.ts", "content": "// \${path} 处理" }`;
    const paths = extractFilePaths(text);
    expect(Array.isArray(paths)).toBe(true);
    expect(paths[0]).toBe('src/main.ts');
  });
});
