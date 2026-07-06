import type { JsonObject } from '@ai-engineering-agent/shared-types';
import type { ProjectScanReport } from '@ai-engineering-agent/project-scanner';

export interface PagePlanItem {
  name: string;
  pageType: 'list' | 'form' | 'detail' | 'dashboard' | 'modal' | 'drawer' | 'tab' | 'wizard';
  routeMode: 'menu-route' | 'child-route' | 'modal' | 'drawer' | 'tab-page' | 'miniapp-page' | 'standalone';
  reusedComponents?: string[];
  dangerActions?: string[];
}

export interface PagePlanLike {
  targetProfile: string;
  pages: PagePlanItem[];
}

export interface NavigationDecisionInput {
  targetProfileId: string;
  supportedLayouts?: string[];
  pagePlan: PagePlanLike;
  projectScan?: ProjectScanReport;
}

export function buildUiContract(input: NavigationDecisionInput): JsonObject {
  const primaryPage = input.pagePlan.pages[0] ?? {
    name: '默认页面',
    pageType: 'list',
    routeMode: 'menu-route',
  };

  const layout = decideLayout(primaryPage, input.supportedLayouts ?? [], input.targetProfileId);
  const sections = decideSections(primaryPage.pageType);
  const interactions = decideInteractions(primaryPage, input.projectScan);

  return {
    pageName: primaryPage.name,
    targetProfile: input.targetProfileId,
    layout,
    sections,
    interactions,
  };
}

function decideLayout(
  page: PagePlanItem,
  supportedLayouts: string[],
  targetProfileId: string,
): 'route-page' | 'drawer' | 'modal' | 'tab-page' | 'miniapp-page' | 'standalone-page' {
  if (targetProfileId === 'wechat-miniapp') {
    return 'miniapp-page';
  }

  const supports = new Set(supportedLayouts);
  if (page.routeMode === 'drawer' && supports.has('drawer')) {
    return 'drawer';
  }
  if (page.routeMode === 'modal' && supports.has('modal')) {
    return 'modal';
  }
  if (page.routeMode === 'tab-page' && supports.has('tab-page')) {
    return 'tab-page';
  }
  if (page.routeMode === 'standalone') {
    return 'standalone-page';
  }
  return 'route-page';
}

function decideSections(pageType: PagePlanItem['pageType']): Array<{ name: string; type: string }> {
  switch (pageType) {
    case 'list':
      return [
        { name: '筛选区', type: 'search' },
        { name: '工具栏', type: 'toolbar' },
        { name: '数据表格', type: 'table' },
      ];
    case 'form':
      return [
        { name: '基础表单', type: 'form' },
        { name: '底部操作区', type: 'footer' },
      ];
    case 'detail':
      return [
        { name: '详情信息', type: 'detail' },
        { name: '底部操作区', type: 'footer' },
      ];
    case 'dashboard':
      return [
        { name: '概览卡片', type: 'hero' },
        { name: '图表区域', type: 'chart' },
      ];
    default:
      return [
        { name: '主体内容', type: 'detail' },
      ];
  }
}

function decideInteractions(
  page: PagePlanItem,
  projectScan?: ProjectScanReport,
): Array<{ action: string; rule: string }> {
  const interactions: Array<{ action: string; rule: string }> = [];

  if (page.pageType === 'list') {
    interactions.push({ action: 'query', rule: '列表查询默认使用 debounce，并支持取消前序请求' });
    interactions.push({ action: 'load', rule: '列表首次加载和翻页必须展示 loading / empty / error 状态' });
  }

  if ((page.dangerActions?.length ?? 0) > 0) {
    interactions.push({ action: 'danger-action', rule: '危险操作必须二次确认，并展示实体名称' });
  }

  if ((projectScan?.evidence.deleteConfirm.length ?? 0) === 0) {
    interactions.push({ action: 'delete-review', rule: '当前仓库未发现明显删除确认证据，生成实现时需优先补齐' });
  }

  return interactions;
}
