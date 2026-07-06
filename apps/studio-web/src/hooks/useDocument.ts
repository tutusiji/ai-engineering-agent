/**
 * useDocument — document generation, optimization, and state management
 */

import { useState, useCallback } from 'react';
import type { RequirementDocument } from './useChat';

const API = '/api';

export function useDocument(sessionId: string | null) {
  const [document, setDocument] = useState<RequirementDocument | null>(null);
  const [generating, setGenerating] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [optimizingModule, setOptimizingModule] = useState<string | null>(null);

  // Load document from session data
  const loadDocument = useCallback((doc: RequirementDocument | null) => {
    setDocument(doc);
  }, []);

  // Full document generation (manual trigger)
  const generate = useCallback(async () => {
    if (!sessionId) return null;
    setGenerating(true);
    try {
      const res = await fetch(`${API}/chat/document/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ sessionId }),
      });
      const data = await res.json();
      if (data.ok && data.document) {
        setDocument(data.document);
        return data.document;
      }
      console.error('Document generation failed:', data.error);
      return null;
    } catch (err) {
      console.error('Document generation error:', err);
      return null;
    } finally {
      setGenerating(false);
    }
  }, [sessionId]);

  // Single module optimization
  const optimize = useCallback(async (module: string, instruction: string) => {
    if (!sessionId) return null;
    setOptimizing(true);
    setOptimizingModule(module);
    try {
      const res = await fetch(`${API}/chat/document/optimize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ sessionId, module, instruction }),
      });
      const data = await res.json();
      if (data.ok && data.document) {
        setDocument(data.document);
        return data.document;
      }
      console.error('Module optimization failed:', data.error);
      return null;
    } catch (err) {
      console.error('Module optimization error:', err);
      return null;
    } finally {
      setOptimizing(false);
      setOptimizingModule(null);
    }
  }, [sessionId]);

  // Update from SSE document event
  const updateFromSSE = useCallback((doc: RequirementDocument) => {
    setDocument(doc);
  }, []);

  const completeness = document?.completeness ?? 0;

  return {
    document,
    setDocument,
    loadDocument,
    generating,
    optimizing,
    optimizingModule,
    completeness,
    generate,
    optimize,
    updateFromSSE,
  };
}
