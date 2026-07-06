/**
 * useSessions — session management hook
 */

import { useState, useEffect, useCallback } from 'react';

const API = '/api';

export interface Session {
  id: string;
  name: string;
  profileId: string;
  messageCount: number;
  completeness: number;
  pinned: boolean;
  featureName: string | null;
  createdAt: number;
  updatedAt: number;
}

export function useSessions() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${API}/sessions`, { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      if (!Array.isArray(data)) return;
      setSessions(data);
      // Auto-select first session if none selected
      if (!activeSessionId && data.length > 0) {
        setActiveSessionId(data[0].id);
      }
    } catch {
      console.error('Failed to load sessions');
    }
  }, [activeSessionId]);

  useEffect(() => { refresh(); }, []);

  const createSession = useCallback(async (profileId?: string, name?: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...(profileId ? { profileId } : {}), name }),
      });
      const data = await res.json();
      await refresh();
      setActiveSessionId(data.id);
      return data.id;
    } finally {
      setLoading(false);
    }
  }, [refresh]);

  const deleteSession = useCallback(async (id: string) => {
    await fetch(`${API}/sessions/${id}`, { method: 'DELETE', credentials: 'include' });
    if (activeSessionId === id) {
      setActiveSessionId(null);
    }
    await refresh();
  }, [activeSessionId, refresh]);

  const editSession = useCallback(async (id: string, name: string, featureName?: string) => {
    await fetch(`${API}/sessions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name, ...(featureName !== undefined ? { featureName } : {}) }),
    });
    await refresh();
  }, [refresh]);

  const togglePin = useCallback(async (id: string) => {
    await fetch(`${API}/sessions/${id}/pin`, { method: 'POST', credentials: 'include' });
    await refresh();
  }, [refresh]);

  const activeSession = sessions.find(s => s.id === activeSessionId) ?? null;

  return {
    sessions,
    activeSession,
    activeSessionId,
    setActiveSessionId,
    createSession,
    deleteSession,
    editSession,
    togglePin,
    loading,
    refresh,
  };
}
