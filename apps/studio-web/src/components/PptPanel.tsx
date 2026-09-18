/**
 * PptPanel — PPT 工坊面板
 *
 * 四视图状态机：pick（主题 + 素材 + 设置）→ outline（大纲审批/编辑/精炼）→
 * building（构建轮询，可回退大纲）→ done（下载/预览）。
 * 使用纯 HTML + Tailwind + lucide-react，与 WorkflowPanel 等现有面板风格一致。
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Presentation,
  Upload,
  Trash2,
  Loader2,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  FileText,
  FolderOpen,
  ClipboardPaste,
  Download,
  ArrowLeft,
  Sparkles,
  Wand2,
  Rocket,
  X,
} from 'lucide-react';

const API = '/api';

/** 运行状态轮询间隔（毫秒） */
const POLL_INTERVAL_MS = 2000;

/** PPT 工作流自身 id — 平台项目素材过滤时排除，防止把大纲/构建 run 当作素材递归选自己 */
const PPT_WORKFLOW_IDS = new Set(['ppt-outline', 'ppt-build']);

/** 流程步骤标签 — 顺序与四视图状态机（pick/outline/building/done）一一对应 */
const STEP_LABELS = ['主题与素材', '编辑大纲', '构建', '完成'] as const;

// ── 类型定义 ─────────────────────────────────────────────────────────────

/** PPT 主题色板（六键，色值存储不带 # 前缀） */
interface PptThemeColors {
  primary?: string;
  secondary?: string;
  background?: string;
  surface?: string;
  text?: string;
  accent?: string;
}

/** ppt-theme 合约（前端展示子集；uploaded 行额外携带 assetBasePath，整体原样透传给工作流） */
interface PptThemeData {
  name?: string;
  colors?: PptThemeColors;
  slideSize?: string;
  layoutDensity?: string;
  /** 主题资产（相对 assetBasePath 的文件名，预览经 /api/ppt/themes/:id/assets/:name 读取） */
  assets?: { backgroundPath?: string; coverImagePath?: string };
  assetBasePath?: string;
}

/** 主题行（GET /api/ppt/themes 返回的行结构） */
interface ThemeRow {
  id: string;
  name: string;
  source: 'builtin' | 'uploaded';
  /** 完整 ppt-theme JSON（透传工作流，不本地拼接资产路径） */
  theme: PptThemeData | null;
}

/** 大纲页（ppt-outline 合约，pageType 宽容为 string 以容忍模型输出） */
interface OutlineSlide {
  pageNo: number;
  pageType: string;
  title: string;
  bullets?: string[];
  notes?: string;
}

/** 大纲（ppt-outline 合约，前端编辑态） */
interface PptOutline {
  deckTitle: string;
  subtitle?: string;
  audience?: string;
  totalPages?: number;
  slides: OutlineSlide[];
}

/** 美化后的页（ppt-content 合约子集，done 视图预览用） */
interface PolishedSlide {
  pageNo: number;
  pageType: string;
  title?: string;
  polishedTitle?: string;
  bullets?: string[];
  polishedBullets?: string[];
  hookLine?: string;
  /** 单页 fitting 告警（非致命） */
  fitting?: { warnings?: string[] };
}

/** 美化内容（content_polish 节点输出，done 视图预览数据源） */
interface PptContent {
  deckTitle: string;
  subtitle?: string;
  slides: PolishedSlide[];
}

/** 工作流节点结果（run.result 的顶层值，key 为节点 id） */
interface PptNodeResult {
  ok?: boolean;
  error?: string;
  output?: unknown;
  /** plugin 返回的校验报告（pptx-builder fitting 超预算警告经此透传） */
  validation?: { passed?: boolean; issues?: Array<{ message?: string }> };
}

/** 轮询返回的运行记录（GET /api/runs/:id 的前端子集） */
interface PptRun {
  id: string;
  status: string;
  error?: string;
  /** 节点结果集（顶层 key 为节点 id：outline_planning / content_polish / pptx_build） */
  result?: Record<string, PptNodeResult | undefined>;
}

/** 素材输入（ppt-source-collector 的 CollectInput 契约） */
interface PptSourceInput {
  sourceType: 'paste' | 'file' | 'platform-project';
  text?: string;
  filePath?: string;
  projectRunId?: string;
}

/** 大纲工作流参数（「生成大纲」时快照，精炼/构建复用） */
interface OutlineParams {
  source: PptSourceInput;
  theme: PptThemeData;
  /** 主题行 id — 构建时服务端按此解析上传模板的资产目录（theme JSON 本身不携带路径） */
  themeId: string;
  preferences: { targetPages: number; audience: string };
}

/** 平台 run 列表项（GET /api/runs 返回子集，平台项目素材候选） */
interface PlatformRunItem {
  id: string;
  workflowId: string;
  workflowName: string;
  status: string;
  startedAt: number;
}

// ── 工具函数 ─────────────────────────────────────────────────────────────

/**
 * 深拷贝 JSON 数据（大纲/内容均来自网络 JSON，无循环引用）
 * @param value 任意 JSON 值
 * @returns 深拷贝结果
 */
function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * 读取文件为纯 base64（去 dataURI 前缀）
 * @param file 用户选择的文件
 * @returns base64 字符串（不含 data: 前缀）
 */
function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      // dataURL 形如 data:...;base64,XXXX —— 取逗号之后的纯 base64 段
      const idx = result.indexOf(',');
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(new Error('读取文件失败'));
    reader.readAsDataURL(file);
  });
}

/**
 * 从运行结果提取并规范化大纲对象（缺失/非法字段补默认值，保证编辑态可安全渲染）
 * @param raw run.result.outline_planning.output 原始值
 * @returns 规范化大纲
 */
function normalizeOutline(raw: unknown): PptOutline {
  const obj = (raw ?? {}) as Partial<PptOutline>;
  return {
    deckTitle: typeof obj.deckTitle === 'string' ? obj.deckTitle : '',
    subtitle: typeof obj.subtitle === 'string' ? obj.subtitle : '',
    audience: typeof obj.audience === 'string' ? obj.audience : '',
    totalPages: typeof obj.totalPages === 'number' ? obj.totalPages : undefined,
    slides: Array.isArray(obj.slides)
      ? (obj.slides as unknown[]).map((rawSlide, i) => {
          const s = (rawSlide ?? {}) as Partial<OutlineSlide>;
          return {
            pageNo: typeof s.pageNo === 'number' ? s.pageNo : i + 1,
            pageType: typeof s.pageType === 'string' ? s.pageType : 'content-bullets',
            title: typeof s.title === 'string' ? s.title : '',
            bullets: Array.isArray(s.bullets) ? s.bullets.filter((b): b is string => typeof b === 'string') : [],
            notes: typeof s.notes === 'string' ? s.notes : undefined,
          };
        })
      : [],
  };
}

/**
 * 规范化美化内容（缺失/非法字段兜底，保证预览可安全渲染）
 * @param raw run.result.content_polish.output 原始值
 * @returns 规范化内容
 */
function normalizeContent(raw: unknown): PptContent {
  const obj = (raw ?? {}) as Partial<PptContent>;
  return {
    deckTitle: typeof obj.deckTitle === 'string' ? obj.deckTitle : '',
    subtitle: typeof obj.subtitle === 'string' ? obj.subtitle : '',
    slides: Array.isArray(obj.slides)
      ? (obj.slides as unknown[]).map((rawSlide, i) => {
          const s = (rawSlide ?? {}) as Partial<PolishedSlide>;
          return {
            pageNo: typeof s.pageNo === 'number' ? s.pageNo : i + 1,
            pageType: typeof s.pageType === 'string' ? s.pageType : 'content-bullets',
            title: typeof s.title === 'string' ? s.title : undefined,
            polishedTitle: typeof s.polishedTitle === 'string' ? s.polishedTitle : undefined,
            bullets: Array.isArray(s.bullets) ? s.bullets.filter((b): b is string => typeof b === 'string') : undefined,
            polishedBullets: Array.isArray(s.polishedBullets)
              ? s.polishedBullets.filter((b): b is string => typeof b === 'string')
              : undefined,
            hookLine: typeof s.hookLine === 'string' ? s.hookLine : undefined,
            fitting:
              s.fitting && Array.isArray(s.fitting.warnings)
                ? { warnings: s.fitting.warnings.filter((w): w is string => typeof w === 'string') }
                : undefined,
          };
        })
      : [],
  };
}

// ── 组件 ─────────────────────────────────────────────────────────────────

/**
 * PPT 工坊面板组件
 *
 * 完整串联「选主题 → 备素材 → 生成大纲 → 编辑/精炼 → 构建轮询 → 下载预览」流程。
 */
export function PptPanel() {
  // ── 视图状态机 ──
  const [view, setView] = useState<'pick' | 'outline' | 'building' | 'done'>('pick');

  // ── 主题（pick 视图）──
  const [themeGroups, setThemeGroups] = useState<{ builtin: ThemeRow[]; uploaded: ThemeRow[] } | null>(null);
  const [themesLoading, setThemesLoading] = useState(true);
  const [themesError, setThemesError] = useState<string | null>(null);
  const [selectedThemeId, setSelectedThemeId] = useState<string | null>(null);
  const [uploadingTemplate, setUploadingTemplate] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ── 素材（pick 视图三选 tab）──
  const [materialTab, setMaterialTab] = useState<'paste' | 'file' | 'project'>('paste');
  const [pasteText, setPasteText] = useState('');
  const [uploadedFileSource, setUploadedFileSource] = useState<PptSourceInput | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);
  const [platformRuns, setPlatformRuns] = useState<PlatformRunItem[] | null>(null);
  const [platformLoading, setPlatformLoading] = useState(false);
  const [platformError, setPlatformError] = useState<string | null>(null);
  const [selectedProjectRunId, setSelectedProjectRunId] = useState<string | null>(null);

  // ── 生成设置（pick 视图）──
  const [targetPages, setTargetPages] = useState(12);
  const [audience, setAudience] = useState('向上汇报');

  // ── 大纲生成（pick 视图 loading 与错误）──
  const [outlineLoading, setOutlineLoading] = useState(false);
  const [outlineError, setOutlineError] = useState<string | null>(null);

  // ── 大纲编辑（outline 视图）──
  const [editedOutline, setEditedOutline] = useState<PptOutline | null>(null);
  const [feedback, setFeedback] = useState('');
  const [refining, setRefining] = useState(false);
  const [refineError, setRefineError] = useState<string | null>(null);

  // ── 构建（building 视图）──
  const [buildRunId, setBuildRunId] = useState<string | null>(null);
  const [buildRunning, setBuildRunning] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [buildWarnings, setBuildWarnings] = useState<string[]>([]);

  // ── 完成（done 视图）──
  const [content, setContent] = useState<PptContent | null>(null);
  // 构建成功但个别页超预算的温和告警（pptx-builder ok:true 时经 output.warnings 透传，1-2 处放行）
  const [doneWarnings, setDoneWarnings] = useState<string[]>([]);

  /** 「生成大纲」时的参数快照 — 精炼携带原 params 重跑、构建复用 theme/preferences */
  const outlineParamsRef = useRef<OutlineParams | null>(null);

  /** 组件是否仍挂载 — 卸载后丢弃迟到的启动响应，防止产生清理不到的孤儿轮询 */
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ── 轮询控制：unmount / 视图回退 / 新请求发起时清理，防泄漏与竞态 ──
  const pollTokenRef = useRef<{ cancelled: boolean } | null>(null);
  const pollTimerRef = useRef<number | null>(null);

  /**
   * 取消进行中的轮询（新请求发起、视图回退或组件卸载时调用）
   */
  const cancelPoll = useCallback(() => {
    if (pollTokenRef.current) pollTokenRef.current.cancelled = true;
    if (pollTimerRef.current !== null) {
      window.clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    pollTokenRef.current = null;
  }, []);

  // 组件卸载时清理轮询
  useEffect(() => cancelPoll, [cancelPoll]);

  /**
   * 轮询 run 至 completed / failed 终态（间隔 POLL_INTERVAL_MS）
   * @param runId 运行 id
   * @param onSettled 终态回调（completed 或 failed 的 run）
   * @param onPollError 轮询请求失败回调
   */
  const pollRun = useCallback(
    (runId: string, onSettled: (run: PptRun) => void, onPollError: (message: string) => void) => {
      cancelPoll();
      const token = { cancelled: false };
      pollTokenRef.current = token;
      /** 连续轮询失败计数 — 容忍瞬态网络/代理错误，连续超限才报错放弃 */
      let consecutiveFailures = 0;
      /** 单次轮询 tick：请求完成后按状态决定续轮询或回调终态 */
      const tick = async () => {
        if (token.cancelled) return;
        try {
          const res = await fetch(`${API}/runs/${runId}`, { credentials: 'include' });
          const run = (await res.json().catch(() => null)) as PptRun | null;
          // 响应返回时轮询已被取消则直接丢弃，避免竞态写入
          if (token.cancelled) return;
          if (!res.ok || !run) {
            // 瞬态失败不终止轮询（远端 run 仍在执行，放弃会白白浪费一次 LLM 构建）
            consecutiveFailures += 1;
            if (consecutiveFailures >= 3) {
              onPollError('获取运行状态失败，请稍后重试');
              return;
            }
          } else {
            consecutiveFailures = 0;
            if (run.status === 'completed' || run.status === 'failed') {
              onSettled(run);
              return;
            }
          }
          pollTimerRef.current = window.setTimeout(tick, POLL_INTERVAL_MS);
        } catch {
          if (token.cancelled) return;
          consecutiveFailures += 1;
          if (consecutiveFailures >= 3) {
            onPollError('获取运行状态失败，请稍后重试');
            return;
          }
          pollTimerRef.current = window.setTimeout(tick, POLL_INTERVAL_MS);
        }
      };
      void tick();
    },
    [cancelPoll]
  );

  /**
   * 通用工作流启动：POST /api/workflows/:id/run 并轮询至终态（大纲生成/精炼/构建共用）
   * @param workflowId 工作流 id
   * @param params 工作流参数（整体置于 body.params，服务端 spread 进工作流输入）
   * @param handlers completed / failed / 启动或轮询失败 三路回调
   */
  const startWorkflowRun = (
    workflowId: 'ppt-outline' | 'ppt-build',
    params: Record<string, unknown>,
    handlers: {
      onCompleted: (run: PptRun) => void;
      onFailed: (run: PptRun) => void;
      onError: (message: string) => void;
    }
  ) => {
    void (async () => {
      // 启动 POST 阶段同样纳入取消令牌：发起后用户立即回退视图时，
      // cancelPoll 能取消在途 POST 的后续处理，否则响应到达仍会拉起轮询，
      // 把用户从大纲编辑拽回 done 视图（孤儿轮询竞态）
      cancelPoll();
      const startToken = { cancelled: false };
      pollTokenRef.current = startToken;
      try {
        const res = await fetch(`${API}/workflows/${workflowId}/run`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ params }),
        });
        const data = (await res.json().catch(() => null)) as { ok?: boolean; runId?: string; error?: string } | null;
        // 响应返回时已取消（回退视图/发起新请求）或组件卸载，丢弃响应防止孤儿轮询
        if (startToken.cancelled || !mountedRef.current) return;
        if (!res.ok || !data?.ok || !data.runId) {
          handlers.onError(data?.error || '启动工作流失败，请稍后重试');
          return;
        }
        pollRun(
          data.runId,
          (run) => (run.status === 'completed' ? handlers.onCompleted(run) : handlers.onFailed(run)),
          handlers.onError
        );
      } catch {
        handlers.onError('请求失败，请稍后重试');
      }
    })();
  };

  /**
   * 拉取主题列表（builtin + uploaded 两组）
   */
  const refreshThemes = useCallback(async () => {
    setThemesLoading(true);
    setThemesError(null);
    try {
      const res = await fetch(`${API}/ppt/themes`, { credentials: 'include' });
      const data = (await res.json().catch(() => null)) as { builtin?: ThemeRow[]; uploaded?: ThemeRow[] } | null;
      if (!res.ok || !data || !Array.isArray(data.builtin) || !Array.isArray(data.uploaded)) {
        setThemesError('加载主题列表失败');
        return;
      }
      setThemeGroups({ builtin: data.builtin, uploaded: data.uploaded });
    } catch {
      setThemesError('加载主题列表失败，请检查服务是否启动');
    } finally {
      setThemesLoading(false);
    }
  }, []);

  // 首次挂载拉取主题
  useEffect(() => {
    void refreshThemes();
  }, [refreshThemes]);

  /**
   * 拉取平台项目候选列表：completed 且排除 PPT 工作流自身（防递归选自己）
   */
  const fetchPlatformRuns = useCallback(async () => {
    setPlatformLoading(true);
    setPlatformError(null);
    try {
      const res = await fetch(`${API}/runs`, { credentials: 'include' });
      const list = (await res.json().catch(() => null)) as PlatformRunItem[] | null;
      if (!res.ok || !Array.isArray(list)) {
        setPlatformError('加载平台项目失败');
        return;
      }
      setPlatformRuns(list.filter((r) => r.status === 'completed' && !PPT_WORKFLOW_IDS.has(r.workflowId)));
    } catch {
      setPlatformError('加载平台项目失败，请稍后重试');
    } finally {
      setPlatformLoading(false);
    }
  }, []);

  // 切到「平台项目」tab 时按需加载一次
  useEffect(() => {
    if (materialTab === 'project' && platformRuns === null && !platformLoading) {
      void fetchPlatformRuns();
    }
  }, [materialTab, platformRuns, platformLoading, fetchPlatformRuns]);

  /**
   * 上传 .pptx 模板：读 base64 → POST /api/ppt/templates（解析失败 400 / 超限 413 友好提示）
   * @param event 文件选择事件
   */
  const handleTemplateUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // 清空以允许重复选择同一文件
    if (!file) return;
    setUploadingTemplate(true);
    setTemplateError(null);
    try {
      const fileBase64 = await readFileAsBase64(file);
      const res = await fetch(`${API}/ppt/templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: file.name, fileBase64 }),
      });
      // 413：base64 编码后请求体超出 10MB 上限，映射为友好提示
      if (res.status === 413) {
        setTemplateError('文件过大：模板 base64 编码后超出 10MB 上限（约对应 7.5MB 原始文件），请压缩后再试');
        return;
      }
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        // 400：非 OOXML / 加密 pptx，展示后端 error
        setTemplateError(data?.error || '模板上传失败，请稍后重试');
        return;
      }
      await refreshThemes();
    } catch {
      setTemplateError('模板上传失败，请检查网络后重试');
    } finally {
      setUploadingTemplate(false);
    }
  };

  /**
   * 删除上传模板（二次确认后调用；成功后清理选中态并刷新列表）
   * @param row 待删除的主题行
   */
  const handleDeleteTemplate = async (row: ThemeRow) => {
    setDeletingId(row.id);
    try {
      const res = await fetch(`${API}/ppt/templates/${row.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setTemplateError(data?.error || '模板删除失败，请稍后重试');
        return;
      }
      if (selectedThemeId === row.id) setSelectedThemeId(null);
      setConfirmDeleteId(null);
      await refreshThemes();
    } catch {
      setTemplateError('模板删除失败，请检查网络后重试');
    } finally {
      setDeletingId(null);
    }
  };

  /**
   * 上传素材文档（.docx/.pdf/.md）：POST /api/ppt/uploads，保存返回的 source
   * @param event 文件选择事件
   */
  const handleDocUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // 清空以允许重复选择同一文件
    if (!file) return;
    setUploadingDoc(true);
    setDocError(null);
    try {
      const fileBase64 = await readFileAsBase64(file);
      const res = await fetch(`${API}/ppt/uploads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: file.name, fileBase64 }),
      });
      if (res.status === 413) {
        setDocError('文件过大：素材 base64 编码后超出 10MB 上限（约对应 7.5MB 原始文件），请压缩后再试');
        return;
      }
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setDocError(data?.error || '素材上传失败，请稍后重试');
        return;
      }
      const data = (await res.json()) as { source?: PptSourceInput } | null;
      if (!data?.source || data.source.sourceType !== 'file' || !data.source.filePath) {
        setDocError('素材上传返回数据异常，请重试');
        return;
      }
      setUploadedFileSource(data.source);
      setUploadedFileName(file.name);
    } catch {
      setDocError('素材上传失败，请检查网络后重试');
    } finally {
      setUploadingDoc(false);
    }
  };

  /**
   * 当前素材 tab 是否就绪（决定「生成大纲」按钮可点）
   * @returns 就绪返回 true
   */
  const isSourceReady = (): boolean => {
    if (materialTab === 'paste') return pasteText.trim().length > 0;
    if (materialTab === 'file') return uploadedFileSource !== null;
    return selectedProjectRunId !== null;
  };

  /**
   * 组装素材输入（未就绪返回 null）
   * @returns CollectInput 契约对象或 null
   */
  const buildSource = (): PptSourceInput | null => {
    if (materialTab === 'paste') return { sourceType: 'paste', text: pasteText };
    if (materialTab === 'file') return uploadedFileSource;
    return selectedProjectRunId ? { sourceType: 'platform-project', projectRunId: selectedProjectRunId } : null;
  };

  /**
   * 取当前选中主题行
   * @returns 主题行或 null
   */
  const findSelectedThemeRow = (): ThemeRow | null => {
    if (!themeGroups || !selectedThemeId) return null;
    return (
      themeGroups.builtin.find((t) => t.id === selectedThemeId) ??
      themeGroups.uploaded.find((t) => t.id === selectedThemeId) ??
      null
    );
  };

  /**
   * 「生成大纲」：快照参数 → 启动 ppt-outline → 轮询至终态 → 进入大纲编辑视图
   */
  const handleGenerateOutline = () => {
    if (outlineLoading) return; // 防重复提交
    const source = buildSource();
    if (!source) {
      setOutlineError('请先完善素材输入（粘贴文本 / 上传文档 / 选择平台项目）');
      return;
    }
    const themeRow = findSelectedThemeRow();
    if (!themeRow) {
      setOutlineError('请先选择一个主题');
      return;
    }
    const preferences = { targetPages, audience };
    cancelPoll();
    setOutlineLoading(true);
    setOutlineError(null);
    // themeId 随参数快照 — 构建时 plugin-runner 按行 id 在服务端解析模板资产路径（theme JSON 不携带路径）
    outlineParamsRef.current = {
      source,
      theme: themeRow.theme ?? {},
      themeId: themeRow.id,
      preferences,
    };
    startWorkflowRun(
      'ppt-outline',
      { source, theme: themeRow.theme ?? {}, themeId: themeRow.id, preferences },
      {
        onCompleted: (run) => {
          setOutlineLoading(false);
          const raw = run.result?.outline_planning?.output;
          if (!raw) {
            setOutlineError('运行完成但未返回大纲数据，请重试');
            return;
          }
          // 深拷贝进编辑态，编辑互不污染原始运行结果
          setEditedOutline(normalizeOutline(deepClone(raw)));
          setFeedback('');
          setBuildError(null);
          setBuildWarnings([]);
          setView('outline');
        },
        onFailed: (run) => {
          setOutlineLoading(false);
          setOutlineError(run.error || '大纲生成失败，请重试');
        },
        onError: (message) => {
          setOutlineLoading(false);
          setOutlineError(message);
        },
      }
    );
  };

  /**
   * 更新编辑态大纲的顶部字段（deckTitle/subtitle/audience）
   * @param patch 待合并的字段
   */
  const updateHeader = (patch: Partial<PptOutline>) => {
    setEditedOutline((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  /**
   * 更新指定页的编辑字段（title/bullets）
   * @param index 页索引
   * @param patch 待合并的字段
   */
  const updateSlide = (index: number, patch: Partial<OutlineSlide>) => {
    setEditedOutline((prev) => {
      if (!prev) return prev;
      return { ...prev, slides: prev.slides.map((s, i) => (i === index ? { ...s, ...patch } : s)) };
    });
  };

  /**
   * 「精炼」：反馈非空才可用，携带原 params + feedback + previousOutline 重跑 ppt-outline
   */
  const handleRefine = () => {
    if (refining || !editedOutline || !feedback.trim()) return; // 防重复 + 前置条件
    const base = outlineParamsRef.current;
    if (!base) {
      setRefineError('原始参数缺失，请返回第一步重新生成');
      return;
    }
    cancelPoll();
    setRefining(true);
    setRefineError(null);
    startWorkflowRun(
      'ppt-outline',
      {
        source: base.source,
        theme: base.theme,
        preferences: base.preferences,
        feedback: feedback.trim(),
        previousOutline: editedOutline,
      },
      {
        onCompleted: (run) => {
          setRefining(false);
          const raw = run.result?.outline_planning?.output;
          if (!raw) {
            setRefineError('运行完成但未返回大纲数据，请重试');
            return;
          }
          // 新大纲覆盖编辑态；同步清除上一轮构建的过期警示条
          setEditedOutline(normalizeOutline(deepClone(raw)));
          setFeedback('');
          setBuildError(null);
          setBuildWarnings([]);
        },
        onFailed: (run) => {
          setRefining(false);
          setRefineError(run.error || '大纲精炼失败，请重试');
        },
        onError: (message) => {
          setRefining(false);
          setRefineError(message);
        },
      }
    );
  };

  /**
   * 「确认，美化并构建」：editedOutline + 原 theme/preferences 启动 ppt-build → 轮询
   */
  const handleBuild = () => {
    if (buildRunning || !editedOutline) return; // 防重复提交
    const base = outlineParamsRef.current;
    if (!base) {
      setBuildError('原始参数缺失，请返回第一步重新生成');
      return;
    }
    cancelPoll();
    setBuildRunning(true);
    setBuildError(null);
    setBuildWarnings([]);
    startWorkflowRun(
      'ppt-build',
      // themeId 透传 — plugin-runner 在服务端按行 id 解析模板资产路径（theme JSON 不携带路径）
      { outline: editedOutline, theme: base.theme, themeId: base.themeId, preferences: base.preferences },
      {
        onCompleted: (run) => {
          setBuildRunning(false);
          setBuildRunId(run.id); // 记录构建 run id，供 building 展示与 done 下载链接使用
          const raw = run.result?.content_polish?.output;
          if (!raw) {
            setBuildError('运行完成但未返回内容数据，请重试');
            return;
          }
          setContent(normalizeContent(raw));
          // 放行的超预算告警（ok:true 时 1-2 处）随 pptx_build.output.warnings 透传，完成视图展示
          const buildOutput = run.result?.pptx_build?.output;
          const okWarnings =
            buildOutput && typeof buildOutput === 'object' && 'warnings' in buildOutput
              ? (buildOutput as { warnings?: unknown }).warnings
              : undefined;
          setDoneWarnings(
            Array.isArray(okWarnings) ? okWarnings.filter((w): w is string => typeof w === 'string') : []
          );
          setView('done');
        },
        onFailed: (run) => {
          setBuildRunning(false);
          setBuildRunId(run.id); // 失败 run 同样记录，便于关联日志排查
          setBuildError(run.error || 'PPT 构建失败，请修改大纲后重试');
          // pptx-builder ok:false 时 fitting 逐条警告经 validation.issues 透传
          const issues = run.result?.pptx_build?.validation?.issues;
          setBuildWarnings(
            Array.isArray(issues)
              ? issues.map((issue) => (issue && typeof issue.message === 'string' ? issue.message : '')).filter(Boolean)
              : []
          );
        },
        onError: (message) => {
          setBuildRunning(false);
          setBuildError(message);
        },
      }
    );
    setView('building');
  };

  /**
   * 从 building 回退到 outline 编辑（取消轮询防竞态）
   */
  const handleBackToOutline = () => {
    cancelPoll();
    setBuildRunning(false);
    setView('outline');
  };

  /**
   * 重置流程状态回到 pick 视图（主题与素材设置保留，便于沿用再生成）
   */
  const handleRestart = () => {
    cancelPoll();
    setView('pick');
    setEditedOutline(null);
    setContent(null);
    setDoneWarnings([]);
    setFeedback('');
    setBuildRunId(null);
    setBuildRunning(false);
    setBuildError(null);
    setBuildWarnings([]);
    setOutlineError(null);
    setRefineError(null);
  };

  /**
   * 主题六色圆点色值列表（色值存储不带 #，渲染前补齐；非法值跳过）
   * @param theme 主题数据
   * @returns 可直接用于 CSS 的色值数组
   */
  const themeColorList = (theme: PptThemeData | null): string[] => {
    const c = theme?.colors ?? {};
    return [c.primary, c.secondary, c.accent, c.background, c.surface, c.text]
      .filter((v): v is string => typeof v === 'string' && v.length > 0)
      .map((v) => (v.startsWith('#') ? v : `#${v}`));
  };

  /**
   * 页类型徽标文案
   * @param pageType 合约枚举值
   * @returns 中文标签
   */
  const pageTypeLabel = (pageType: string): string => {
    switch (pageType) {
      case 'cover':
        return '封面';
      case 'toc':
        return '目录';
      case 'section':
        return '章节页';
      case 'content-bullets':
        return '要点页';
      case 'content-two-col':
        return '双栏页';
      case 'quote':
        return '金句页';
      case 'ending':
        return '结尾页';
      default:
        return pageType;
    }
  };

  /** 通用输入框样式（与 Sidebar 弹窗表单一致） */
  const inputClass =
    'w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition';

  /**
   * 渲染单个主题卡片（uploaded 卡带删除按钮与二次确认条）
   * @param row 主题行
   */
  const renderThemeCard = (row: ThemeRow) => {
    const selected = selectedThemeId === row.id;
    const themeName = row.theme?.name || row.name;
    // 封面预览：优先背景/封面资产图（经资产端点读取），无资产时用主题色渐变兜底
    const bgAsset = row.theme?.assets?.backgroundPath || row.theme?.assets?.coverImagePath || null;
    const palette = themeColorList(row.theme);
    const fallbackGradient = `linear-gradient(135deg, ${palette[0] ?? '#64748B'} 0%, ${palette[1] ?? '#94A3B8'} 60%, ${palette[2] ?? '#CBD5E1'} 100%)`;
    return (
      <div
        key={row.id}
        onClick={() => !deletingId && setSelectedThemeId(row.id)}
        className={`relative p-3 rounded-xl border-2 cursor-pointer transition-all hover:shadow-md ${
          selected
            ? 'border-blue-400 bg-blue-50/50 shadow-blue-100 shadow-sm'
            : 'border-gray-200 bg-white hover:border-gray-300'
        } ${deletingId === row.id ? 'opacity-60' : ''}`}
      >
        {row.source === 'uploaded' &&
          (confirmDeleteId === row.id ? (
            /* 删除二次确认条 */
            <div
              className="absolute right-2 top-2 z-10 flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 shadow-md border border-gray-100"
              onClick={(e) => e.stopPropagation()}
            >
              <span className="text-xs text-gray-500">确认删除?</span>
              <button
                onClick={() => void handleDeleteTemplate(row)}
                disabled={deletingId === row.id}
                aria-label="确认删除此模板"
                className="rounded-md px-2.5 py-1 text-xs font-medium bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 transition"
              >
                删除
              </button>
              <button
                onClick={() => setConfirmDeleteId(null)}
                aria-label="取消删除"
                className="rounded-md px-2.5 py-1 text-xs font-medium bg-gray-200 text-gray-600 hover:bg-gray-300 transition"
              >
                取消
              </button>
            </div>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setConfirmDeleteId(row.id);
              }}
              title="删除模板"
              aria-label="删除此模板"
              className={`absolute right-2 top-2 rounded-md p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 transition ${
                bgAsset ? 'bg-white/75 shadow-sm' : ''
              }`}
            >
              <Trash2 size={13} />
            </button>
          ))}
        {/* 封面预览条：真实背景资产图或主题色渐变兜底 */}
        <div className="-mx-3 -mt-3 mb-2.5 aspect-video overflow-hidden rounded-t-[10px] bg-gray-50">
          {bgAsset ? (
            <img
              src={`${API}/ppt/themes/${row.id}/assets/${encodeURIComponent(bgAsset)}`}
              alt={`${themeName} 封面预览`}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="h-full w-full" style={{ background: fallbackGradient }} />
          )}
        </div>
        <div className="pr-6 text-sm font-semibold text-gray-800 truncate">{themeName}</div>
        <div className="mt-2 flex items-center gap-1">
          {themeColorList(row.theme).map((color) => (
            <span
              key={color}
              className="h-4 w-4 rounded-full border border-black/10"
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
        <div className="mt-2 text-[11px] text-gray-400">
          {row.theme?.slideSize ?? '—'} · {row.theme?.layoutDensity ?? '—'}
        </div>
        {selected && (
          <span className="absolute bottom-2 right-2 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">
            已选择
          </span>
        )}
      </div>
    );
  };

  /**
   * 渲染主题区块（loading / error / 数据三态 + uploaded 空态）
   */
  const renderThemeSection = () => {
    if (themesLoading) {
      return (
        <div className="flex items-center justify-center py-10 text-gray-400">
          <Loader2 size={24} className="animate-spin mr-2 text-blue-500" />
          <span className="text-sm">正在加载主题...</span>
        </div>
      );
    }
    if (themesError || !themeGroups) {
      return (
        <div className="flex flex-col items-center py-8 text-gray-400">
          <AlertCircle size={28} className="mb-2 text-amber-500" />
          <p className="text-sm text-gray-600 mb-2">{themesError || '暂无主题数据'}</p>
          <button
            onClick={() => void refreshThemes()}
            className="px-4 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
          >
            重试
          </button>
        </div>
      );
    }
    return (
      <div className="space-y-4">
        {/* 内置主题 */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-500">内置主题</span>
          </div>
          {themeGroups.builtin.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{themeGroups.builtin.map(renderThemeCard)}</div>
          ) : (
            <p className="py-3 text-xs text-gray-300">暂无内置主题</p>
          )}
        </div>
        {/* 我上传的模板 */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-500">我上传的模板</span>
            <label
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                uploadingTemplate
                  ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400'
                  : 'border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100'
              }`}
            >
              {uploadingTemplate ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
              {uploadingTemplate ? '解析中...' : '上传模板'}
              <input
                type="file"
                accept=".pptx"
                className="hidden"
                disabled={uploadingTemplate}
                onChange={handleTemplateUpload}
              />
            </label>
          </div>
          {themeGroups.uploaded.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{themeGroups.uploaded.map(renderThemeCard)}</div>
          ) : (
            <p className="py-3 text-xs text-gray-300">暂无上传模板，可上传 .pptx 提取其主题</p>
          )}
        </div>
        {templateError && (
          <p className="flex items-center gap-1 text-xs text-red-500">
            <AlertCircle size={13} />
            {templateError}
          </p>
        )}
      </div>
    );
  };

  /**
   * 渲染素材三选 tab 面板（粘贴 / 上传文档 / 平台项目）
   */
  const renderMaterialSection = () => (
    <div>
      {/* tab 栏 */}
      <div className="mb-3 flex gap-1 border-b border-gray-200">
        {(
          [
            ['paste', '粘贴文本', ClipboardPaste],
            ['file', '上传文档', FileText],
            ['project', '平台项目', FolderOpen],
          ] as const
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setMaterialTab(key)}
            className={`flex items-center gap-1 px-3 py-2 text-xs font-medium border-b-2 -mb-[1px] transition ${
              materialTab === key
                ? 'text-blue-600 border-blue-600'
                : 'text-gray-400 border-transparent hover:text-gray-600'
            }`}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      {/* 粘贴 */}
      {materialTab === 'paste' && (
        <textarea
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          rows={6}
          placeholder="粘贴需求文档 / 方案 / 讲稿等 Markdown 或纯文本素材…"
          className={`${inputClass} resize-y`}
        />
      )}

      {/* 上传文档 */}
      {materialTab === 'file' && (
        <div>
          <label
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition ${
              uploadingDoc
                ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400'
                : 'border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100'
            }`}
          >
            {uploadingDoc ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
            {uploadingDoc ? '解析中...' : '上传文档（.docx / .pdf / .md）'}
            <input
              type="file"
              accept=".docx,.pdf,.md"
              className="hidden"
              disabled={uploadingDoc}
              onChange={handleDocUpload}
            />
          </label>
          {uploadedFileSource && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-600">
              <CheckCircle2 size={13} />
              <span className="truncate max-w-[240px]">已就绪：{uploadedFileName}</span>
              <button
                onClick={() => {
                  setUploadedFileSource(null);
                  setUploadedFileName('');
                }}
                title="移除"
                aria-label="移除已上传文件"
                className="ml-0.5 rounded p-1.5 text-gray-300 hover:text-gray-500 transition"
              >
                <X size={12} />
              </button>
            </div>
          )}
          {docError && (
            <p className="mt-2 flex items-center gap-1 text-xs text-red-500">
              <AlertCircle size={13} />
              {docError}
            </p>
          )}
        </div>
      )}

      {/* 平台项目 */}
      {materialTab === 'project' && (
        <div>
          {platformLoading ? (
            <div className="flex items-center justify-center py-8 text-gray-400">
              <Loader2 size={20} className="animate-spin mr-2 text-blue-500" />
              <span className="text-sm">正在加载平台项目...</span>
            </div>
          ) : platformError ? (
            <div className="flex flex-col items-center py-6 text-gray-400">
              <AlertCircle size={24} className="mb-2 text-amber-500" />
              <p className="text-sm text-gray-600 mb-2">{platformError}</p>
              <button
                onClick={() => void fetchPlatformRuns()}
                className="px-4 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
              >
                重试
              </button>
            </div>
          ) : platformRuns && platformRuns.length > 0 ? (
            <div className="flex max-h-56 flex-col gap-2 overflow-auto pr-1">
              {platformRuns.map((run) => (
                <div
                  key={run.id}
                  onClick={() => setSelectedProjectRunId(run.id)}
                  className={`flex cursor-pointer items-center gap-2 rounded-xl border-2 p-3 transition-all hover:shadow-sm ${
                    selectedProjectRunId === run.id
                      ? 'border-blue-400 bg-blue-50/50'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <FolderOpen size={14} className="shrink-0 text-gray-400" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-gray-800">{run.workflowName}</div>
                    <div className="truncate text-[11px] text-gray-400">运行 ID：{run.id}</div>
                  </div>
                  {selectedProjectRunId === run.id && (
                    <span className="shrink-0 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">
                      已选择
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            /* 空态：尚无已完成的应用生成 run */
            <div className="py-8 text-center text-gray-400">
              <FolderOpen size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">暂无已完成的平台项目</p>
              <p className="mt-1 text-xs text-gray-300">先在「工作流」中完成一次应用生成，再回来作为素材</p>
            </div>
          )}
        </div>
      )}
    </div>
  );

  /**
   * 渲染 pick 视图：主题选择 + 素材输入 + 生成设置 + 「生成大纲」
   */
  const renderPick = () => (
    <div className="max-w-4xl">
      {/* 主题 */}
      <section>
        <h4 className="mb-3 text-sm font-semibold text-gray-700">1 · 选择主题</h4>
        {renderThemeSection()}
      </section>

      {/* 素材 */}
      <section className="mt-8">
        <h4 className="mb-3 text-sm font-semibold text-gray-700">2 · 准备素材</h4>
        {renderMaterialSection()}
      </section>

      {/* 生成设置 */}
      <section className="mt-8">
        <h4 className="mb-3 text-sm font-semibold text-gray-700">3 · 生成设置</h4>
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-500">目标页数</span>
            <input
              type="number"
              min={1}
              max={50}
              value={targetPages}
              onChange={(e) => {
                const next = Number(e.target.value);
                // NaN 防护 + 钳位 [1, 50]（Number('') === 0 也会被钳到 1）
                if (!Number.isNaN(next)) setTargetPages(Math.min(50, Math.max(1, next)));
              }}
              className="w-24 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-500">受众</span>
            <select
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition"
            >
              <option>向上汇报</option>
              <option>团队分享</option>
              <option>对外宣讲</option>
            </select>
          </label>
        </div>
      </section>

      {/* 生成大纲 */}
      <div className="mt-8 flex items-center gap-3">
        <button
          onClick={handleGenerateOutline}
          disabled={outlineLoading || !isSourceReady() || !selectedThemeId}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-medium text-white transition-all shadow-lg shadow-blue-500/25 hover:bg-blue-700 hover:shadow-blue-500/40 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
        >
          {outlineLoading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
          {outlineLoading ? '大纲生成中…' : '生成大纲'}
        </button>
        {!selectedThemeId && <span className="text-xs text-gray-400">请先选择主题</span>}
        {selectedThemeId && !isSourceReady() && <span className="text-xs text-gray-400">请先完善素材输入</span>}
      </div>
      {outlineError && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="text-red-500" />
            <span className="text-sm font-medium text-red-700">生成失败</span>
          </div>
          <p className="ml-6 mt-1 break-words text-xs text-red-500">{outlineError}</p>
        </div>
      )}
    </div>
  );

  /**
   * 渲染大纲编辑视图：顶部信息 + 逐页编辑 + 反馈精炼 + 构建入口
   */
  const renderOutline = () => {
    // 防御态：正常流程不会到达（进入前已写入编辑态）
    if (!editedOutline) {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <AlertCircle size={32} className="mb-3 text-amber-500" />
          <p className="mb-3 text-sm text-gray-600">大纲数据缺失</p>
          <button
            onClick={handleRestart}
            className="px-4 py-2 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
          >
            返回重新开始
          </button>
        </div>
      );
    }
    return (
      <div className="max-w-4xl">
        {/* 顶部信息编辑 */}
        <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
          <label className="block">
            <span className="text-xs font-medium text-gray-500">主标题</span>
            <input
              value={editedOutline.deckTitle}
              onChange={(e) => updateHeader({ deckTitle: e.target.value })}
              className={`mt-1 ${inputClass}`}
            />
          </label>
          <div className="flex flex-wrap gap-3">
            <label className="min-w-[220px] flex-1">
              <span className="text-xs font-medium text-gray-500">副标题</span>
              <input
                value={editedOutline.subtitle ?? ''}
                onChange={(e) => updateHeader({ subtitle: e.target.value })}
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <label className="w-44">
              <span className="text-xs font-medium text-gray-500">受众</span>
              <input
                value={editedOutline.audience ?? ''}
                onChange={(e) => updateHeader({ audience: e.target.value })}
                className={`mt-1 ${inputClass}`}
              />
            </label>
          </div>
        </div>

        {/* 逐页编辑 */}
        <div className="mt-4 flex flex-col gap-3">
          {editedOutline.slides.map((slide, index) => (
            <div key={index} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                  {pageTypeLabel(slide.pageType)}
                </span>
                <span className="text-[11px] text-gray-300">第 {slide.pageNo} 页</span>
              </div>
              <input
                value={slide.title}
                onChange={(e) => updateSlide(index, { title: e.target.value })}
                placeholder="页标题"
                className={inputClass}
              />
              <textarea
                value={(slide.bullets ?? []).join('\n')}
                onChange={(e) => updateSlide(index, { bullets: e.target.value.split('\n') })}
                rows={Math.max(3, slide.bullets?.length ?? 0)}
                placeholder="要点，每行一条"
                className={`mt-2 ${inputClass} resize-y font-normal`}
              />
            </div>
          ))}
          {editedOutline.slides.length === 0 && (
            <div className="py-8 text-center text-gray-400">
              <p className="text-sm">大纲中没有页面，请填写反馈后点击「精炼」重新生成</p>
            </div>
          )}
        </div>

        {/* 反馈 + 精炼 */}
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-4">
          <span className="text-xs font-medium text-gray-500">精炼反馈（非空才可精炼）</span>
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            rows={3}
            placeholder="对大纲的修改意见，如：第二部分太长压缩到 3 页；增加一页成本对比…"
            className={`mt-1 ${inputClass} resize-y`}
          />
          {refineError && (
            <p className="mt-2 flex items-center gap-1 text-xs text-red-500">
              <AlertCircle size={13} />
              {refineError}
            </p>
          )}
        </div>

        {/* 底部操作区 */}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            onClick={handleRestart}
            disabled={refining}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition"
          >
            <ArrowLeft size={13} />
            返回修改素材
          </button>
          <div className="flex-1" />
          <button
            onClick={handleRefine}
            disabled={refining || !feedback.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-medium text-blue-600 hover:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            {refining ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
            {refining ? '精炼中…' : '精炼'}
          </button>
          <button
            onClick={handleBuild}
            disabled={refining}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-medium text-white transition-all shadow-lg shadow-blue-500/25 hover:bg-blue-700 hover:shadow-blue-500/40 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
          >
            <Rocket size={15} />
            确认，美化并构建
          </button>
        </div>
      </div>
    );
  };

  /**
   * 渲染构建视图：轮询进行中（spinner）或失败引导（警示条已在顶部）
   */
  const renderBuilding = () => (
    <div className="max-w-4xl">
      {buildRunning ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <Loader2 size={40} className="mb-3 animate-spin text-blue-500" />
          <p className="text-sm">正在美化文字并构建 .pptx…</p>
          <p className="mt-1 text-xs text-gray-300">文字美化 → PPTX 构建，请稍候</p>
          {buildRunId && (
            <code className="mt-3 rounded bg-gray-100 px-1.5 py-0.5 text-xs font-mono text-gray-400">{buildRunId}</code>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <AlertTriangle size={36} className="mb-3 text-amber-500" />
          <p className="text-sm text-gray-600">构建未通过，请根据顶部警示修改大纲后重试</p>
        </div>
      )}
      <div className="mt-6 flex justify-center">
        <button
          onClick={handleBackToOutline}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 transition"
        >
          <ArrowLeft size={13} />
          返回修改大纲
        </button>
      </div>
    </div>
  );

  /**
   * 渲染完成视图：下载入口 + slides 全文只读预览
   */
  const renderDone = () => {
    // 防御态：正常流程不会到达（进入前已写入内容）
    if (!content) {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <AlertCircle size={32} className="mb-3 text-amber-500" />
          <p className="mb-3 text-sm text-gray-600">预览数据缺失</p>
          <button
            onClick={handleRestart}
            className="px-4 py-2 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
          >
            返回重新开始
          </button>
        </div>
      );
    }
    return (
      <div className="max-w-4xl">
        {/* 成功条 + 下载 */}
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <CheckCircle2 size={18} className="shrink-0 text-emerald-500" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-emerald-700">演示文稿构建完成</p>
            <p className="mt-0.5 text-xs text-emerald-600/80">
              {content.deckTitle || editedOutline?.deckTitle || '未命名演示'} · 共 {content.slides.length} 页
            </p>
          </div>
          {buildRunId && (
            <a
              href={`${API}/runs/${buildRunId}/artifacts/deck.pptx`}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow transition-all hover:bg-emerald-700"
            >
              <Download size={15} />
              下载 .pptx
            </a>
          )}
        </div>

        {/* 放行的超预算告警（ok:true 但 1-2 处超字数预算，温和提示不阻断） */}
        {doneWarnings.length > 0 && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="shrink-0 text-amber-500" />
              <span className="text-sm font-medium text-amber-700">部分页面超出字数预算，已放行生成</span>
            </div>
            {doneWarnings.map((warning, index) => (
              <p key={index} className="ml-6 mt-1 break-words text-xs text-amber-600">
                · {warning}
              </p>
            ))}
          </div>
        )}

        {/* slides 只读预览 */}
        <div className="mt-4 flex flex-col gap-3">
          {content.slides.map((slide, index) => (
            <div key={index} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-center gap-2">
                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                  {pageTypeLabel(slide.pageType)}
                </span>
                <span className="text-[11px] text-gray-300">第 {slide.pageNo} 页</span>
              </div>
              <h5 className="mt-2 text-sm font-semibold text-gray-800">
                {slide.polishedTitle || slide.title || '（无标题）'}
              </h5>
              {slide.hookLine && <p className="mt-1 text-xs italic text-blue-500/90">“{slide.hookLine}”</p>}
              {(slide.polishedBullets ?? slide.bullets ?? []).length > 0 && (
                <ul className="mt-2 list-inside list-disc space-y-1">
                  {(slide.polishedBullets ?? slide.bullets ?? []).map((bullet, bulletIndex) => (
                    <li key={bulletIndex} className="text-xs text-gray-600">
                      {bullet}
                    </li>
                  ))}
                </ul>
              )}
              {/* 单页 fitting 告警（非致命） */}
              {slide.fitting?.warnings && slide.fitting.warnings.length > 0 && (
                <div className="mt-2 text-[11px] text-amber-600">
                  {slide.fitting.warnings.map((warning, warningIndex) => (
                    <p key={warningIndex}>· {warning}</p>
                  ))}
                </div>
              )}
            </div>
          ))}
          {content.slides.length === 0 && <p className="py-6 text-center text-xs text-gray-300">内容为空</p>}
        </div>

        {/* 后续操作 */}
        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={handleBackToOutline}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 transition"
          >
            <ArrowLeft size={13} />
            返回大纲
          </button>
          <button
            onClick={handleRestart}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 transition"
          >
            <Sparkles size={13} />
            新建演示文稿
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* 页面标题 */}
      <div className="shrink-0 border-b border-gray-100 px-6 pt-6 pb-4">
        <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-800">
          <Presentation size={20} className="text-blue-500" />
          PPT 工坊
        </h3>
        <p className="mt-1 text-sm text-gray-400">选择主题与素材，生成并编辑大纲，一键美化构建并下载 .pptx。</p>
      </div>

      {/* 流程步骤指示器 — 标示四步状态机当前位置，已完成步骤打勾 */}
      <div className="shrink-0 border-b border-gray-100 px-6 py-3">
        <ol className="flex items-center gap-3 text-xs" aria-label="生成流程进度">
          {(['pick', 'outline', 'building', 'done'] as const).map((stepView, index) => {
            const currentIndex = ['pick', 'outline', 'building', 'done'].indexOf(view);
            const isDone = index < currentIndex;
            const isActive = stepView === view;
            return (
              <li key={stepView} className="flex items-center gap-3">
                <span className="flex items-center gap-1.5">
                  <span
                    aria-current={isActive ? 'step' : undefined}
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-medium transition-colors ${
                      isDone
                        ? 'bg-emerald-100 text-emerald-600'
                        : isActive
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-400'
                    }`}
                  >
                    {isDone ? <CheckCircle2 size={12} /> : index + 1}
                  </span>
                  <span className={isActive ? 'font-medium text-gray-800' : 'text-gray-400'}>{STEP_LABELS[index]}</span>
                </span>
                {index < STEP_LABELS.length - 1 && <span className="h-px w-6 bg-gray-200" aria-hidden="true" />}
              </li>
            );
          })}
        </ol>
      </div>

      {/* 构建警示条（outline / building 视图顶部，构建失败时展示错误与 fitting 警告） */}
      {(view === 'outline' || view === 'building') && (buildError || buildWarnings.length > 0) && (
        <div className="mx-6 mt-4 shrink-0 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className="text-amber-500" />
            <span className="text-sm font-medium text-amber-700">构建未通过</span>
          </div>
          {buildError && <p className="ml-6 mt-1 break-words text-xs text-amber-600">{buildError}</p>}
          {buildWarnings.map((warning, index) => (
            <p key={index} className="ml-6 break-words text-xs text-amber-600">
              · {warning}
            </p>
          ))}
        </div>
      )}

      {/* 视图主体 */}
      <div className="min-h-0 flex-1 overflow-auto p-6">
        {view === 'pick' && renderPick()}
        {view === 'outline' && renderOutline()}
        {view === 'building' && renderBuilding()}
        {view === 'done' && renderDone()}
      </div>
    </div>
  );
}
