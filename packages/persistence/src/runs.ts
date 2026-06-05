/**
 * Run Store — PostgreSQL-backed persistent workflow run history
 */

import { query, queryOne, queryAll } from './store.js';

export type RunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'waiting-approval' | 'approved' | 'rejected';
export type StageStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'waiting-approval';

export interface RunStage {
  id: string;
  name: string;
  nodeType: string;
  status: StageStatus;
  startedAt?: number;
  completedAt?: number;
  duration?: number;
  result?: unknown;
  error?: string;
  logs: string[];
}

export interface ApprovalRecord {
  action: 'approved' | 'rejected';
  by: string;
  at: number;
  comment?: string;
}

export interface Run {
  id: string;
  workflowId: string;
  workflowName: string;
  status: RunStatus;
  stages: RunStage[];
  approvalHistory: ApprovalRecord[];
  artifacts: string[];
  error?: string;
  startedAt: number;
  completedAt?: number;
  duration?: number;
  trigger: 'manual' | 'api' | 'auto';
}

/** Map a DB row to Run interface. */
function rowToRun(row: Record<string, unknown>): Run {
  return {
    id: row.id as string,
    workflowId: row.workflow_id as string,
    workflowName: row.workflow_name as string,
    status: row.status as RunStatus,
    stages: (typeof row.stages === 'string' ? JSON.parse(row.stages as string) : row.stages) as RunStage[],
    approvalHistory: (typeof row.approval_history === 'string' ? JSON.parse(row.approval_history as string) : row.approval_history) as ApprovalRecord[],
    artifacts: (typeof row.artifacts === 'string' ? JSON.parse(row.artifacts as string) : row.artifacts) as string[],
    error: row.error as string | undefined,
    startedAt: Number(row.started_at),
    completedAt: row.completed_at ? Number(row.completed_at) : undefined,
    duration: row.duration ? Number(row.duration) : undefined,
    trigger: row.trigger as Run['trigger'],
  };
}

export class RunStore {
  async create(id: string, workflowId: string, workflowName: string, trigger: Run['trigger'] = 'manual'): Promise<Run> {
    const now = Date.now();
    await query(
      `INSERT INTO runs (id, workflow_id, workflow_name, status, stages, approval_history, artifacts, started_at, trigger)
       VALUES ($1, $2, $3, 'pending', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, $4, $5)`,
      [id, workflowId, workflowName, now, trigger]
    );
    return {
      id, workflowId, workflowName, status: 'pending',
      stages: [], approvalHistory: [], artifacts: [],
      startedAt: now, trigger,
    };
  }

  async get(id: string): Promise<Run | undefined> {
    const row = await queryOne('SELECT * FROM runs WHERE id = $1', [id]);
    return row ? rowToRun(row) : undefined;
  }

  async list(): Promise<Run[]> {
    const rows = await queryAll('SELECT * FROM runs ORDER BY started_at DESC');
    return rows.map(rowToRun);
  }

  async update(id: string, patch: Partial<Run>): Promise<Run | undefined> {
    const sets: string[] = [];
    const values: unknown[] = [];
    let paramIdx = 1;

    if (patch.status !== undefined) {
      sets.push(`status = $${paramIdx++}`);
      values.push(patch.status);
    }
    if (patch.stages !== undefined) {
      sets.push(`stages = $${paramIdx++}::jsonb`);
      values.push(JSON.stringify(patch.stages));
    }
    if (patch.approvalHistory !== undefined) {
      sets.push(`approval_history = $${paramIdx++}::jsonb`);
      values.push(JSON.stringify(patch.approvalHistory));
    }
    if (patch.artifacts !== undefined) {
      sets.push(`artifacts = $${paramIdx++}::jsonb`);
      values.push(JSON.stringify(patch.artifacts));
    }
    if (patch.error !== undefined) {
      sets.push(`error = $${paramIdx++}`);
      values.push(patch.error);
    }
    if (patch.completedAt !== undefined) {
      sets.push(`completed_at = $${paramIdx++}`);
      values.push(patch.completedAt);
    }
    if (patch.duration !== undefined) {
      sets.push(`duration = $${paramIdx++}`);
      values.push(patch.duration);
    }

    if (sets.length === 0) return this.get(id);

    values.push(id);
    const sql = `UPDATE runs SET ${sets.join(', ')} WHERE id = $${paramIdx} RETURNING *`;
    const row = await queryOne(sql, values);
    return row ? rowToRun(row) : undefined;
  }

  async delete(id: string): Promise<boolean> {
    const result = await query('DELETE FROM runs WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async updateStage(runId: string, stageId: string, patch: Partial<RunStage>): Promise<Run | undefined> {
    const run = await this.get(runId);
    if (!run) return undefined;

    const stageIndex = run.stages.findIndex(s => s.id === stageId);
    if (stageIndex === -1) {
      run.stages.push({ id: stageId, name: stageId, nodeType: 'unknown', status: 'pending', logs: [], ...patch });
    } else {
      run.stages[stageIndex] = { ...run.stages[stageIndex], ...patch };
    }

    return this.update(runId, { stages: run.stages });
  }

  async complete(runId: string, error?: string): Promise<Run | undefined> {
    const now = Date.now();
    const run = await this.get(runId);
    if (!run) return undefined;

    return this.update(runId, {
      status: error ? 'failed' : 'completed',
      completedAt: now,
      duration: now - run.startedAt,
      error,
    });
  }

  async addApproval(runId: string, approval: ApprovalRecord): Promise<Run | undefined> {
    const run = await this.get(runId);
    if (!run) return undefined;

    run.approvalHistory.push(approval);
    return this.update(runId, {
      approvalHistory: run.approvalHistory,
      status: approval.action === 'approved' ? 'approved' : 'rejected',
    });
  }

  async addArtifact(runId: string, artifactPath: string): Promise<Run | undefined> {
    const run = await this.get(runId);
    if (!run) return undefined;

    if (!run.artifacts.includes(artifactPath)) {
      run.artifacts.push(artifactPath);
      return this.update(runId, { artifacts: run.artifacts });
    }
    return run;
  }

  async recent(limit: number = 20): Promise<Run[]> {
    const rows = await queryAll('SELECT * FROM runs ORDER BY started_at DESC LIMIT $1', [limit]);
    return rows.map(rowToRun);
  }

  async byWorkflow(workflowId: string): Promise<Run[]> {
    const rows = await queryAll('SELECT * FROM runs WHERE workflow_id = $1 ORDER BY started_at DESC', [workflowId]);
    return rows.map(rowToRun);
  }
}
