import { useState, useEffect, useCallback } from 'react';

const API = '/api';

export interface ProjectMetric {
  projectId: string;
  sessionId?: string;
  profile: { frontend: string; backend: string; database: string };
  status: 'running' | 'completed' | 'failed';
  stageCount: number;
  totalFiles: number;
  duration?: number;
  start: number;
}

export interface OverviewStats {
  totalProjects: number;
  successRate: number;
  avgDuration: number;
  avgFiles: number;
  commonFailures: Array<{ stage: string; count: number }>;
}

export interface StageDetail {
  stage: string;
  status: string;
  startedAt?: number;
  completedAt?: number;
  duration?: number;
  summary?: string;
}

export function useMetrics() {
  const [projects, setProjects] = useState<ProjectMetric[]>([]);
  const [overview, setOverview] = useState<OverviewStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProjects = useCallback(async () => {
    const res = await fetch(`${API}/metrics/projects`);
    if (res.ok) setProjects(await res.json());
  }, []);

  const fetchOverview = useCallback(async () => {
    const res = await fetch(`${API}/metrics/overview`);
    if (res.ok) setOverview(await res.json());
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchProjects(), fetchOverview()]);
    setLoading(false);
  }, [fetchProjects, fetchOverview]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  return { projects, overview, loading, refresh: fetchAll };
}

export async function fetchProjectDetail(projectId: string) {
  const res = await fetch(`${API}/metrics/projects/${projectId}`);
  return res.ok ? res.json() : null;
}

export async function fetchProjectStages(projectId: string): Promise<StageDetail[]> {
  const res = await fetch(`${API}/metrics/projects/${projectId}/stages`);
  return res.ok ? res.json() : [];
}
