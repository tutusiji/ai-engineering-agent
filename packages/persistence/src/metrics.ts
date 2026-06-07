import { query, queryOne, queryAll } from './store.js';

export interface StageMetric {
  stage: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt?: number;
  completedAt?: number;
  duration?: number;
  summary?: string;
}

export interface ArtifactStats {
  fileCount: number;
  totalLines: number;
  framework?: string;
}

export interface ProjectMetrics {
  projectId: string;
  sessionId?: string;
  profile: { frontend: string; backend: string; database: string };
  stages: StageMetric[];
  artifacts: {
    frontend: ArtifactStats;
    backend: ArtifactStats;
    database: ArtifactStats;
    deployment: ArtifactStats;
  };
  quality: {
    lintErrors: number;
    typeErrors: number;
    testPassed: number;
    testFailed: number;
  };
  timings: { start: number; end?: number };
  status: 'running' | 'completed' | 'failed';
}

function rowToMetrics(row: Record<string, unknown>): ProjectMetrics {
  return {
    projectId: row.project_id as string,
    sessionId: row.session_id as string | undefined,
    profile: typeof row.profile === 'string' ? JSON.parse(row.profile as string) : row.profile as ProjectMetrics['profile'],
    stages: typeof row.stages === 'string' ? JSON.parse(row.stages as string) : row.stages as StageMetric[],
    artifacts: typeof row.artifacts === 'string' ? JSON.parse(row.artifacts as string) : row.artifacts as ProjectMetrics['artifacts'],
    quality: typeof row.quality === 'string' ? JSON.parse(row.quality as string) : row.quality as ProjectMetrics['quality'],
    timings: typeof row.timings === 'string' ? JSON.parse(row.timings as string) : row.timings as ProjectMetrics['timings'],
    status: row.status as ProjectMetrics['status'],
  };
}

export class MetricsStore {
  async ensureTable(): Promise<void> {
    await query(`
      CREATE TABLE IF NOT EXISTS project_metrics (
        project_id TEXT PRIMARY KEY,
        session_id TEXT,
        profile JSONB NOT NULL DEFAULT '{}',
        stages JSONB NOT NULL DEFAULT '[]',
        artifacts JSONB NOT NULL DEFAULT '{}',
        quality JSONB NOT NULL DEFAULT '{}',
        timings JSONB NOT NULL DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'running',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
  }

  async create(projectId: string, metrics: Omit<ProjectMetrics, 'projectId'>): Promise<ProjectMetrics> {
    const m: ProjectMetrics = { projectId, ...metrics };
    await query(
      `INSERT INTO project_metrics (project_id, session_id, profile, stages, artifacts, quality, timings, status)
       VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, $8)
       ON CONFLICT (project_id) DO UPDATE SET
         stages = $4::jsonb, artifacts = $5::jsonb, quality = $6::jsonb, timings = $7::jsonb, status = $8, updated_at = NOW()`,
      [projectId, m.sessionId ?? null, JSON.stringify(m.profile), JSON.stringify(m.stages),
       JSON.stringify(m.artifacts), JSON.stringify(m.quality), JSON.stringify(m.timings), m.status]
    );
    return m;
  }

  async get(projectId: string): Promise<ProjectMetrics | undefined> {
    const row = await queryOne('SELECT * FROM project_metrics WHERE project_id = $1', [projectId]);
    return row ? rowToMetrics(row) : undefined;
  }

  async list(limit: number = 20): Promise<ProjectMetrics[]> {
    const rows = await queryAll('SELECT * FROM project_metrics ORDER BY created_at DESC LIMIT $1', [limit]);
    return rows.map(rowToMetrics);
  }

  async updateStage(projectId: string, stage: StageMetric): Promise<void> {
    const m = await this.get(projectId);
    if (!m) return;
    const idx = m.stages.findIndex(s => s.stage === stage.stage);
    if (idx >= 0) {
      m.stages[idx] = { ...m.stages[idx], ...stage };
    } else {
      m.stages.push(stage);
    }
    await query(
      `UPDATE project_metrics SET stages = $2::jsonb, updated_at = NOW() WHERE project_id = $1`,
      [projectId, JSON.stringify(m.stages)]
    );
  }

  async update(projectId: string, patch: Partial<ProjectMetrics>): Promise<void> {
    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;
    if (patch.status) { sets.push(`status = $${idx++}`); values.push(patch.status); }
    if (patch.stages) { sets.push(`stages = $${idx++}::jsonb`); values.push(JSON.stringify(patch.stages)); }
    if (patch.artifacts) { sets.push(`artifacts = $${idx++}::jsonb`); values.push(JSON.stringify(patch.artifacts)); }
    if (patch.quality) { sets.push(`quality = $${idx++}::jsonb`); values.push(JSON.stringify(patch.quality)); }
    if (patch.timings) { sets.push(`timings = $${idx++}::jsonb`); values.push(JSON.stringify(patch.timings)); }
    if (sets.length === 0) return;
    values.push(projectId);
    await query(`UPDATE project_metrics SET ${sets.join(', ')}, updated_at = NOW() WHERE project_id = $${idx}`, values);
  }

  async overview(): Promise<{
    totalProjects: number;
    successRate: number;
    avgDuration: number;
    avgFiles: number;
    commonFailures: Array<{ stage: string; count: number }>;
  }> {
    const rows = await queryAll('SELECT * FROM project_metrics WHERE status != $1', ['running']);
    const total = rows.length;
    const completed = rows.filter((r: Record<string, unknown>) => r.status === 'completed').length;
    const totalDuration = rows.reduce((sum: number, r: Record<string, unknown>) => {
      const timings = typeof r.timings === 'string' ? JSON.parse(r.timings as string) : r.timings;
      const dur = (timings as Record<string, number>).end ? (timings as Record<string, number>).end - (timings as Record<string, number>).start : 0;
      return sum + dur;
    }, 0);

    const totalFiles = rows.reduce((sum: number, r: Record<string, unknown>) => {
      const artifacts = typeof r.artifacts === 'string' ? JSON.parse(r.artifacts as string) : r.artifacts;
      const a = artifacts as Record<string, { fileCount?: number }>;
      return sum + (a.frontend?.fileCount ?? 0) + (a.backend?.fileCount ?? 0) + (a.database?.fileCount ?? 0) + (a.deployment?.fileCount ?? 0);
    }, 0);

    const failureCounts = new Map<string, number>();
    for (const row of rows.filter((r: Record<string, unknown>) => r.status === 'failed')) {
      const stages = typeof row.stages === 'string' ? JSON.parse(row.stages as string) : row.stages;
      for (const s of (stages as StageMetric[])) {
        if (s.status === 'failed') {
          failureCounts.set(s.stage, (failureCounts.get(s.stage) ?? 0) + 1);
        }
      }
    }

    return {
      totalProjects: total,
      successRate: total > 0 ? Math.round((completed / total) * 100) : 0,
      avgDuration: total > 0 ? Math.round(totalDuration / total) : 0,
      avgFiles: total > 0 ? Math.round(totalFiles / total) : 0,
      commonFailures: [...failureCounts.entries()]
        .map(([stage, count]) => ({ stage, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
    };
  }
}
