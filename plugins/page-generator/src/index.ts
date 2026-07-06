import type { JsonObject } from '@ai-engineering-agent/shared-types';

export interface ImplementationPlanFile {
  path: string;
  kind: 'view' | 'page' | 'component' | 'composable' | 'hook' | 'api' | 'type' | 'style' | 'test';
}

export interface ImplementationPlanLike {
  pageName: string;
  targetProfile: string;
  files: ImplementationPlanFile[];
  routeChanges?: string[];
  componentDependencies?: string[];
}

export function buildGenerationReport(input: {
  implementationPlan: ImplementationPlanLike;
  uiContract?: JsonObject;
}): JsonObject {
  const generatedFiles = input.implementationPlan.files.map((file) => ({
    path: file.path,
    kind: file.kind,
    status: 'planned',
  }));

  const patches = input.implementationPlan.files.map((file) => ({
    target: file.path,
    action: 'create',
    summary: summarizePatch(file.kind, input.uiContract),
  }));

  const notes = [
    `本次为 ${input.implementationPlan.targetProfile} 生成最小文件计划`,
    input.implementationPlan.routeChanges?.length
      ? `需要同步路由变更: ${input.implementationPlan.routeChanges.join('；')}`
      : '当前未声明额外路由变更',
    input.implementationPlan.componentDependencies?.length
      ? `依赖组件: ${input.implementationPlan.componentDependencies.join('、')}`
      : '当前未声明额外组件依赖',
  ];

  return {
    pageName: input.implementationPlan.pageName,
    targetProfile: input.implementationPlan.targetProfile,
    generatedFiles,
    patches,
    notes,
  };
}

function summarizePatch(kind: ImplementationPlanFile['kind'], uiContract?: JsonObject): string {
  const layout = typeof uiContract?.layout === 'string' ? uiContract.layout : 'route-page';
  switch (kind) {
    case 'page':
    case 'view':
      return `创建 ${layout} 形态页面骨架，包含基础 sections 与交互占位`;
    case 'component':
      return '创建可复用组件骨架并补齐 props / emits 或类型定义';
    case 'composable':
    case 'hook':
      return '创建页面状态管理逻辑，封装查询、loading 与副作用';
    case 'api':
      return '创建接口调用封装，并预留列表查询/提交方法';
    case 'style':
      return '创建页面样式或主题变量占位';
    case 'test':
      return '创建最小测试骨架，覆盖初始加载与关键交互';
    case 'type':
      return '创建页面数据结构与表单模型类型';
    default:
      return '创建最小实现占位';
  }
}
