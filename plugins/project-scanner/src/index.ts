import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { JsonObject } from '@ai-engineering-agent/shared-types';

const DEFAULT_IGNORED_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.next',
  '.nuxt',
  'playwright-report',
  'artifacts',
]);

const SOURCE_FILE_PATTERN = /\.(ts|tsx|js|jsx|vue|json)$/;

export interface ProjectScanOptions {
  rootDir: string;
  maxFiles?: number;
}

export interface SourceFileRecord {
  path: string;
  ext: string;
  content?: string;
}

export interface ProjectScanReport extends JsonObject {
  rootDir: string;
  packageManager: string | null;
  frameworkHints: string[];
  uiLibraryHints: string[];
  routingHints: string[];
  counts: {
    sourceFiles: number;
    pageFiles: number;
    componentFiles: number;
    hookFiles: number;
    testFiles: number;
  };
  files: string[];
  pageFiles: string[];
  componentFiles: string[];
  hookFiles: string[];
  testFiles: string[];
  evidence: {
    loading: string[];
    debounce: string[];
    deleteConfirm: string[];
  };
}

export async function scanProject(options: ProjectScanOptions): Promise<ProjectScanReport> {
  const files = await collectSourceFiles(options.rootDir, options.maxFiles ?? 400);
  const packageJson = await readPackageJson(options.rootDir);
  const packageDeps = getDependencyMap(packageJson);

  const frameworkHints = collectFrameworkHints(packageDeps, files);
  const uiLibraryHints = collectUiLibraryHints(packageDeps, files);
  const routingHints = collectRoutingHints(packageDeps, files);

  const pageFiles = files.filter((file) => isPageLikeFile(file.path)).map((file) => file.path);
  const componentFiles = files.filter((file) => isComponentLikeFile(file.path)).map((file) => file.path);
  const hookFiles = files.filter((file) => isHookLikeFile(file.path)).map((file) => file.path);
  const testFiles = files.filter((file) => isTestLikeFile(file.path)).map((file) => file.path);

  return {
    rootDir: options.rootDir,
    packageManager: typeof packageJson?.packageManager === 'string' ? packageJson.packageManager : null,
    frameworkHints,
    uiLibraryHints,
    routingHints,
    counts: {
      sourceFiles: files.length,
      pageFiles: pageFiles.length,
      componentFiles: componentFiles.length,
      hookFiles: hookFiles.length,
      testFiles: testFiles.length,
    },
    files: files.map((file) => file.path),
    pageFiles,
    componentFiles,
    hookFiles,
    testFiles,
    evidence: {
      loading: findEvidence(files, [/loading/i, /isLoading/, /pending/, /skeleton/i, /spin/i]),
      debounce: findEvidence(files, [/debounce/i, /useDebounce/i, /lodash\/debounce/, /setTimeout\(/]),
      deleteConfirm: findEvidence(files, [/confirm/i, /delete/i, /remove/i, /popconfirm/i, /modal\.confirm/i]),
    },
  };
}

async function collectSourceFiles(rootDir: string, maxFiles: number): Promise<SourceFileRecord[]> {
  const result: SourceFileRecord[] = [];

  async function walk(currentDir: string): Promise<void> {
    if (result.length >= maxFiles) {
      return;
    }

    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (result.length >= maxFiles) {
        return;
      }

      const fullPath = path.join(currentDir, entry.name);
      const relativePath = path.relative(rootDir, fullPath).replace(/\\/g, '/');

      if (entry.isDirectory()) {
        if (DEFAULT_IGNORED_DIRS.has(entry.name)) {
          continue;
        }
        await walk(fullPath);
        continue;
      }

      if (!entry.isFile() || !SOURCE_FILE_PATTERN.test(entry.name)) {
        continue;
      }

      const content = await safeReadFile(fullPath);
      result.push({
        path: relativePath,
        ext: path.extname(entry.name),
        content,
      });
    }
  }

  await walk(rootDir);
  return result;
}

async function safeReadFile(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return '';
  }
}

async function readPackageJson(rootDir: string): Promise<Record<string, unknown> | undefined> {
  try {
    const raw = await fs.readFile(path.join(rootDir, 'package.json'), 'utf8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return parsed;
  } catch {
    return undefined;
  }
}

function getDependencyMap(packageJson: Record<string, unknown> | undefined): Record<string, string> {
  const deps = packageJson?.dependencies;
  const devDeps = packageJson?.devDependencies;
  return {
    ...(isStringRecord(deps) ? deps : {}),
    ...(isStringRecord(devDeps) ? devDeps : {}),
  };
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return typeof value === 'object' && value !== null && Object.values(value).every((item) => typeof item === 'string');
}

function collectFrameworkHints(deps: Record<string, string>, files: SourceFileRecord[]): string[] {
  const hints = new Set<string>();
  if ('vue' in deps) hints.add('vue');
  if ('react' in deps) hints.add('react');
  if ('@dcloudio/uni-app' in deps) hints.add('uni-app');
  if ('miniprogram-api-typings' in deps) hints.add('wechat-miniapp');
  if (files.some((file) => file.ext === '.vue')) hints.add('vue-sfc');
  if (files.some((file) => file.ext === '.tsx')) hints.add('tsx');
  return [...hints];
}

function collectUiLibraryHints(deps: Record<string, string>, files: SourceFileRecord[]): string[] {
  const hints = new Set<string>();
  if ('element-plus' in deps) hints.add('element-plus');
  if ('antd' in deps || 'antd-mobile' in deps) hints.add('antd');
  if ('vant' in deps) hints.add('vant');
  if (files.some((file) => /el-table|el-form/.test(file.content ?? ''))) hints.add('element-plus');
  if (files.some((file) => /<Table|<Form|Modal\.confirm/.test(file.content ?? ''))) hints.add('antd');
  return [...hints];
}

function collectRoutingHints(deps: Record<string, string>, files: SourceFileRecord[]): string[] {
  const hints = new Set<string>();
  if ('vue-router' in deps) hints.add('vue-router');
  if ('react-router' in deps || 'react-router-dom' in deps) hints.add('react-router');
  if (files.some((file) => /createRouter|useRouter|router\.push/.test(file.content ?? ''))) hints.add('vue-router-usage');
  if (files.some((file) => /createBrowserRouter|useNavigate|navigate\(/.test(file.content ?? ''))) hints.add('react-router-usage');
  return [...hints];
}

function isPageLikeFile(filePath: string): boolean {
  return /(^|\/)(pages|views|routes)\//.test(filePath) || /page\.(tsx|ts|vue|jsx|js)$/.test(filePath);
}

function isComponentLikeFile(filePath: string): boolean {
  return /(^|\/)(components|widgets)\//.test(filePath);
}

function isHookLikeFile(filePath: string): boolean {
  return /(^|\/)(hooks|composables)\//.test(filePath) || /use[A-Z].*\.(ts|tsx)$/.test(path.basename(filePath));
}

function isTestLikeFile(filePath: string): boolean {
  return /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(filePath) || /(^|\/)(tests|__tests__)\//.test(filePath);
}

function findEvidence(files: SourceFileRecord[], patterns: RegExp[]): string[] {
  const matches = new Set<string>();
  for (const file of files) {
    const content = file.content ?? '';
    if (patterns.some((pattern) => pattern.test(content))) {
      matches.add(file.path);
    }
  }
  return [...matches].slice(0, 20);
}
