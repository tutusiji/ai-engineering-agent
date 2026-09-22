// extractJson 提取兜底单测 —— 重点钉住 UI 预览「乱码」根因：
// 模型把整页 HTML 作为带引号的 JSON 字符串值整体输出时，不得把 \n \" 转义序列
// 原样截进预览内容（实测 design v3 乱码回归）
import { describe, it, expect } from 'vitest';
import { extractJson } from '../agent-runner.js';

/** 构造一段含中文与换行的真实形态预览 HTML */
function buildHtml(): string {
  return [
    '<!DOCTYPE html>',
    '<html lang="zh-CN">',
    '<head>',
    '  <meta charset="UTF-8">',
    '  <title>麻将计分 App</title>',
    '</head>',
    '<body>',
    '  <div id="app">计分面板</div>',
    '</body>',
    '</html>',
  ].join('\n');
}

describe('extractJson', () => {
  it('整体是 JSON 字符串值（HTML 被 stringify）时 unwrap 后提取干净 HTML', () => {
    const html = buildHtml();
    // 模拟模型输出：整个响应体是一个 JSON 字符串值（带引号、内部转义）
    const modelResponse = JSON.stringify(html);

    const out = extractJson(modelResponse);
    expect(out).not.toBeNull();
    const files = out!.generatedFiles as Array<{ path: string; content: string }>;
    expect(files.length).toBeGreaterThan(0);
    // 关键断言：内容必须是反转义后的干净 HTML，不含字面 \n / \" 转义序列
    expect(files[0].content).toBe(html);
    expect(files[0].content).not.toContain('\\n');
    expect(files[0].content).not.toContain('\\"');
  });

  it('裸 HTML（无代码块、无 JSON 包裹）仍走裸 HTML 兜底', () => {
    const html = buildHtml();
    const out = extractJson(html);
    expect(out).not.toBeNull();
    const files = out!.generatedFiles as Array<{ path: string; content: string }>;
    expect(files[0].content).toBe(html);
  });

  it('正常 JSON 对象原样返回（unwrap 不破坏对象路径）', () => {
    const obj = { pageName: 'interactive-preview', notes: ['ok'] };
    const out = extractJson(JSON.stringify(obj));
    expect(out).toEqual(obj);
  });

  it('JSON 包裹 HTML 且转义合法时正确反转义（常规路径不回归）', () => {
    const html = buildHtml();
    const wrapped = JSON.stringify({
      pageName: 'interactive-preview',
      generatedFiles: [
        { path: 'artifacts/interactive-preview.html', kind: 'page', status: 'generated', content: html },
      ],
    });
    const out = extractJson(wrapped);
    const files = out!.generatedFiles as Array<{ content: string }>;
    expect(files[0].content).toBe(html);
  });
});
