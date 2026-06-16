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
import { Tabs, TabList, Tab, TabPanel } from '@heroui/react/tabs';
import { Badge } from '@heroui/react/badge';
import { Zap, Image, Code, Sparkles, FileText, ChevronDown, Check, Cpu } from 'lucide-react';
import { useSessions } from './hooks/useSessions';
import { useChat } from './hooks/useChat';
import { useDocument } from './hooks/useDocument';
import { Sidebar } from './components/Sidebar';
import { ChatPanel } from './components/ChatPanel';
import { DocumentPanel } from './components/DocumentPanel';
import { DesignPanel } from './components/DesignPanel';
import { CodePanel } from './components/CodePanel';
import { ImageDesignPanel } from './components/ImageDesignPanel';
import { WorkflowPanel } from './components/WorkflowPanel';
import { RunHistory } from './components/RunHistory';

const API = '/api';

type NavKey = 'chat' | 'workflows' | 'history';
type ChatTab = 'chat' | 'design' | 'ai-image' | 'code' | 'document';

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

  // Load session data when switching sessions
  useEffect(() => {
    if (activeSessionId) {
      chat.loadSession(activeSessionId).then(() => {
        // Document will be loaded from session data via loadSession
      });
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
        console.log('设计稿生成成功');
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
              <Tabs
                selectedKey={activeChatTab}
                onSelectionChange={(key) => setActiveChatTab(key as ChatTab)}
                variant="primary"
                className="flex-1 flex flex-col overflow-hidden min-h-0"
              >
                <TabList className="px-4 bg-white border-b border-divider">
                  <Tab id="chat">
                    <div className="flex items-center gap-1.5">
                      <Zap className="w-4 h-4" />
                      <span>需求对话</span>
                    </div>
                  </Tab>
                  <Tab id="design">
                    {designHtml ? (
                      <Badge content="!" color="default" size="sm">
                        <div className="flex items-center gap-1.5">
                          <Image className="w-4 h-4" />
                          <span>设计稿</span>
                        </div>
                      </Badge>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <Image className="w-4 h-4" />
                        <span>设计稿</span>
                      </div>
                    )}
                  </Tab>
                  <Tab id="ai-image">
                    <div className="flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-purple-400" />
                      <span>AI 画图</span>
                    </div>
                  </Tab>
                  <Tab id="code">
                    {generatedFiles.length > 0 ? (
                      <Badge content={String(generatedFiles.length)} color="success" size="sm">
                        <div className="flex items-center gap-1.5">
                          <Code className="w-4 h-4" />
                          <span>代码</span>
                        </div>
                      </Badge>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <Code className="w-4 h-4" />
                        <span>代码</span>
                      </div>
                    )}
                  </Tab>

                </TabList>

                <TabPanel id="chat" className="!p-0 !mt-0 flex-1 flex flex-col overflow-hidden min-h-0">
                  <ChatPanel
                    messages={chat.messages}
                    document={docHook.document}
                    loading={chat.loading}
                    streaming={chat.streaming}
                    streamContent={chat.streamContent}
                    completeness={completeness}
                    profileId={profileId}
                    onProfileChange={setProfileId}
                    onSend={chat.send}
                    onStop={chat.stop}
                  />
                </TabPanel>
                <TabPanel id="design">
                  <DesignPanel
                    html={designHtml}
                    completeness={completeness}
                    loading={designLoading}
                    onGenerate={handleGenerateDesign}
                  />
                </TabPanel>
                <TabPanel id="ai-image">
                  <ImageDesignPanel
                    defaultPrompt={docHook.document?.featureName ? `为"${docHook.document.featureName}"生成一张设计概念图` : ''}
                  />
                </TabPanel>
                <TabPanel id="code">
                  <CodePanel files={generatedFiles} />
                </TabPanel>

              </Tabs>
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
            />
          </aside>
        )}
      </div>
    </div>
  );
}
