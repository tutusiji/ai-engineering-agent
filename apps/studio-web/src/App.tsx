/**
 * App.tsx — Main Studio layout (HeroUI + Tailwind)
 *
 * Layout:
 *   ┌──────────────────────────────────────────────────┐
 *   │                   Header                          │
 *   ├──────────┬───────────────────────┬───────────────┤
 *   │          │                       │               │
 *   │ Sidebar  │    Main Content       │  Doc Panel    │
 *   │          │  (Chat/Workflow/      │  (when chat)  │
 *   │          │   History/Design/     │               │
 *   │          │   Code)               │               │
 *   │          │                       │               │
 *   └──────────┴───────────────────────┴───────────────┘
 */

import { useState, useEffect, useCallback } from 'react';
import { Zap, Image, Code, ChevronDown, Check, Cpu } from 'lucide-react';
import { useSessions } from './hooks/useSessions';
import { useChat } from './hooks/useChat';
import { useDocument } from './hooks/useDocument';
import { Sidebar } from './components/Sidebar';
import { ChatPanel } from './components/ChatPanel';
import { DocumentPanel } from './components/DocumentPanel';
import { DesignPanel } from './components/DesignPanel';
import { CodePanel } from './components/CodePanel';
import { WorkflowPanel } from './components/WorkflowPanel';
import { RunHistory } from './components/RunHistory';

const API = '/api';

type NavKey = 'chat' | 'workflows' | 'history';
type ChatTab = 'chat' | 'design' | 'code' | 'document';

export default function App() {
  const {
    sessions,
    activeSession,
    activeSessionId,
    setActiveSessionId,
    createSession,
    deleteSession,
    renameSession,
    refresh: refreshSessions,
  } = useSessions();

  const [profileId, setProfileId] = useState('vue3-admin');
  const [activeNav, setActiveNav] = useState<NavKey>('chat');
  const [activeChatTab, setActiveChatTab] = useState<ChatTab>('chat');
  const [designHtml, setDesignHtml] = useState<string | null>(null);
  const [designVersions, setDesignVersions] = useState<Array<{ id: string; label: string; model: string; createdAt: number }>>([]);
  const [activeDesignId, setActiveDesignId] = useState<string | null>(null);
  const [generatedFiles, setGeneratedFiles] = useState<Array<{ path: string; kind: string; content?: string }>>([]);
  const [designLoading, setDesignLoading] = useState(false);
  const [codeLoading, setCodeLoading] = useState(false);

  // Model switcher state
  interface ModelOption { id: string; label: string; model: string; active: boolean }
  const [models, setModels] = useState<ModelOption[]>([]);
  const [currentModel, setCurrentModel] = useState<string>('');
  const [modelMenuOpen, setModelMenuOpen] = useState(false);

  const fetchModels = useCallback(async () => {
    try {
      const res = await fetch(`${API}/models`);
      const data = await res.json();
      setModels(data);
      const active = data.find((m: ModelOption) => m.active);
      if (active) setCurrentModel(active.label);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchModels(); }, [fetchModels]);

  const switchModel = async (modelId: string) => {
    try {
      const res = await fetch(`${API}/models/switch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId }),
      });
      const data = await res.json();
      if (data.ok) {
        setCurrentModel(data.label);
        setModels(prev => prev.map(m => ({ ...m, active: m.id === modelId })));
      }
    } catch { /* ignore */ }
    setModelMenuOpen(false);
  };

  const docHook = useDocument(activeSessionId);

  const chat = useChat(activeSessionId, profileId, docHook.updateFromSSE);

  // Load design versions for a session
  const loadDesignVersions = useCallback(async (sid: string) => {
    try {
      const res = await fetch(`${API}/sessions/${sid}/designs`);
      const data = await res.json();
      setDesignVersions(data.versions ?? []);
      const activeId = data.activeId;
      setActiveDesignId(activeId);
      if (activeId) {
        const active = data.versions?.find((v: { id: string; html: string }) => v.id === activeId);
        if (active) setDesignHtml(active.html);
        else setDesignHtml(null);
      } else {
        setDesignHtml(null);
      }
    } catch {
      setDesignVersions([]);
      setDesignHtml(null);
    }
  }, []);

  // Switch design version
  const switchDesignVersion = async (designId: string) => {
    if (!activeSessionId) return;
    const version = designVersions.find(v => v.id === designId);
    if (!version) return;
    // Fetch full version HTML
    try {
      const res = await fetch(`${API}/sessions/${activeSessionId}/designs/active`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ designId }),
      });
      const data = await res.json();
      if (data.ok) {
        setActiveDesignId(designId);
        // Find HTML from versions list (we need to store it)
        await loadDesignVersions(activeSessionId);
      }
    } catch { /* ignore */ }
  };

  // Load session data when switching sessions
  useEffect(() => {
    if (activeSessionId) {
      setDesignHtml(null);
      setDesignVersions([]);
      setGeneratedFiles([]);
      chat.loadSession(activeSessionId);
      loadDesignVersions(activeSessionId);
    }
  }, [activeSessionId]);

  // Sync document from chat to docHook when session loads
  useEffect(() => {
    if (chat.document) {
      docHook.loadDocument(chat.document);
    }
  }, [chat.document]);

  const handleCreateSession = async () => {
    const id = await createSession(profileId);
    if (id) {
      console.log('会话已创建');
    }
  };

  const handleGenerateDesign = async () => {
    if (!activeSessionId) return;
    setDesignLoading(true);
    try {
      const res = await fetch(`${API}/generate/design`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: activeSessionId, profileId }),
      });
      const data = await res.json();
      if (data.ok && data.htmlContent) {
        setDesignHtml(data.htmlContent);
        setActiveChatTab('design');
        // Reload version list
        await loadDesignVersions(activeSessionId);
        console.log('UI预览生成成功');
      } else {
        console.error(data.error || '生成失败');
      }
    } catch {
      console.error('请求失败');
    } finally {
      setDesignLoading(false);
    }
  };

  const handleGenerateCode = async () => {
    if (!activeSessionId) return;
    setCodeLoading(true);
    try {
      const res = await fetch(`${API}/generate/code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: activeSessionId, profileId }),
      });
      const data = await res.json();
      if (data.ok && data.files) {
        setGeneratedFiles(data.files);
        setActiveChatTab('code');
        console.log(`代码生成成功，共 ${data.files.length} 个文件`);
      } else {
        console.error(data.error || '生成失败');
      }
    } catch {
      console.error('请求失败');
    } finally {
      setCodeLoading(false);
    }
  };

  const completeness = docHook.completeness;

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <header className="flex items-center px-6 h-16 shrink-0"
        style={{ background: 'linear-gradient(135deg, #001529, #002140)', borderBottom: '1px solid #003a70' }}>
        <div className="w-9 h-9 rounded-lg flex items-center justify-center mr-3"
          style={{ background: 'linear-gradient(135deg, #1677ff, #4096ff)' }}>
          <Zap className="w-5 h-5 text-white" />
        </div>
        <h4 className="text-white m-0 flex-1 text-lg font-semibold">
          AI Engineering Agent
        </h4>
        <div className="flex gap-3 items-center">
          {activeSession && (
            <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-300 backdrop-blur-sm">
              {activeSession.name}
            </span>
          )}
          {/* Model Switcher */}
          <div className="relative">
            <button
              onClick={() => setModelMenuOpen(!modelMenuOpen)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium
                bg-white/10 hover:bg-white/20 text-white/90 backdrop-blur-sm
                border border-white/10 hover:border-white/20 transition-all cursor-pointer"
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>{currentModel || 'Loading...'}</span>
              <ChevronDown className={`w-3 h-3 transition-transform ${modelMenuOpen ? 'rotate-180' : ''}`} />
            </button>
            {modelMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setModelMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-2 z-50 w-52 rounded-xl overflow-hidden
                  bg-gray-900/95 backdrop-blur-xl border border-white/10 shadow-2xl">
                  <div className="px-3 py-2 text-[10px] text-white/40 uppercase tracking-wider font-medium">
                    选择模型
                  </div>
                  {models.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => switchModel(m.id)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-sm transition-colors cursor-pointer
                        ${m.active
                          ? 'bg-blue-500/20 text-blue-300'
                          : 'text-white/80 hover:bg-white/10 hover:text-white'
                        }`}
                    >
                      <div className={`w-5 h-5 rounded-md flex items-center justify-center
                        ${m.active ? 'bg-blue-500/30' : 'bg-white/10'}`}>
                        {m.active ? <Check className="w-3 h-3" /> : <Cpu className="w-3 h-3" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{m.label}</div>
                        <div className="text-[10px] opacity-50 truncate">{m.model}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-[280px] shrink-0 bg-gray-50 overflow-auto h-full border-r border-divider">
          <Sidebar
            sessions={sessions}
            activeSessionId={activeSessionId}
            activeNav={activeNav}
            onSelectSession={(id) => {
              setActiveSessionId(id);
              setActiveNav('chat');
            }}
            onCreateSession={handleCreateSession}
            onDeleteSession={deleteSession}
            onRenameSession={renameSession}
            onNavigate={setActiveNav}
          />
        </aside>

        {/* Main content */}
        <main className="flex-1 flex flex-col bg-white h-full overflow-hidden">
          {activeNav === 'chat' && (
            <div className="flex-1 flex flex-col overflow-hidden min-h-0">
              {/* Tab bar */}
              <div className="flex gap-0 px-4 bg-white border-b border-gray-200 shrink-0">
                {([
                  ['chat', Zap, '需求对话'],
                  ['design', Image, 'UI预览'],
                  ['code', Code, '代码'],
                ] as const).map(([key, Icon, label]) => (
                  <button
                    key={key}
                    onClick={() => setActiveChatTab(key)}
                    className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-all border-b-2 -mb-[1px]
                      ${activeChatTab === key
                        ? 'text-blue-600 border-blue-600'
                        : 'text-gray-400 border-transparent hover:text-gray-600 hover:border-gray-300'
                      }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{label}</span>
                  </button>
                ))}
              </div>

              {/* Tab panels */}
              <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                {activeChatTab === 'chat' && (
                  <ChatPanel
                    messages={chat.messages}
                    document={docHook.document}
                    loading={chat.loading}
                    streaming={chat.streaming}
                    streamContent={chat.streamContent}
                    completeness={completeness}
                    onSend={chat.send}
                    onStop={chat.stop}
                  />
                )}
                {activeChatTab === 'design' && (
                  <DesignPanel
                    html={designHtml}
                    completeness={completeness}
                    loading={designLoading}
                    versions={designVersions}
                    activeDesignId={activeDesignId}
                    onGenerate={handleGenerateDesign}
                    onSwitchVersion={switchDesignVersion}
                  />
                )}
                {activeChatTab === 'code' && (
                  <CodePanel files={generatedFiles} />
                )}
              </div>
            </div>
          )}

          {activeNav === 'workflows' && (
            <WorkflowPanel profileId={profileId} />
          )}

          {activeNav === 'history' && (
            <RunHistory />
          )}
        </main>

        {/* Right sidebar — Document panel (only in chat mode) */}
        {activeNav === 'chat' && (
          <aside className="w-[360px] shrink-0 bg-white border-l border-divider overflow-auto h-full">
            <DocumentPanel
              document={docHook.document}
              sessionId={activeSessionId}
              generating={docHook.generating}
              optimizingModule={docHook.optimizingModule}
              onGenerate={docHook.generate}
              onOptimize={docHook.optimize}
              onSend={chat.send}
              loading={chat.loading}
              profileId={profileId}
              onProfileChange={setProfileId}
            />
          </aside>
        )}

      </div>
    </div>
  );
}
