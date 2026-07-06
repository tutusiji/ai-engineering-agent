/**
 * App.tsx — Main Studio layout
 *
 * 纯布局编排 + auth 守卫。所有业务逻辑已抽取到独立 hooks：
 * - useSessions: 会话列表管理
 * - useChat: 对话与 SSE 流
 * - useDocument: 需求文档
 * - useArtifacts: 产物管理
 * - useStudioState: 右侧产物与设计状态
 * - useModelSwitcher: 模型切换
 * - useSessionData: 会话切换时的版本加载
 * - useGeneration: 架构/设计/代码生成
 *
 * Layout:
 *   ┌──────────────────────────────────────────────────┐
 *   │                   Header                          │
 *   ├──────────┬───────────────────────┬───────────────┤
 *   │ Sidebar  │    Main Content       │  Doc Panel    │
 *   │          │  (Chat/Workflow/      │  (when chat)  │
 *   │          │   History/Design/     │               │
 *   │          │   Code)               │               │
 *   └──────────┴───────────────────────┴───────────────┘
 */

import { useState, useEffect } from 'react';
import { Zap, Image, Code, Layers } from 'lucide-react';
import { useSessions } from './hooks/useSessions';
import { useChat } from './hooks/useChat';
import { useDocument } from './hooks/useDocument';
import { useArtifacts } from './hooks/useArtifacts';
import { useStudioState } from './hooks/useStudioState';
import { useModelSwitcher } from './hooks/useModelSwitcher';
import { useSessionData } from './hooks/useSessionData';
import { useGeneration } from './hooks/useGeneration';
import { useAuth } from './hooks/useAuth';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { ChatPanel } from './components/ChatPanel';
import { DocumentPanel } from './components/DocumentPanel';
import { ArtifactsPanel } from './components/ArtifactsPanel';
import { DesignPanel } from './components/DesignPanel';
import { ArchitecturePanel } from './components/ArchitecturePanel';
import { CodePanel } from './components/CodePanel';
import { WorkflowPanel } from './components/WorkflowPanel';
import { RunHistory } from './components/RunHistory';
import { LoginPage } from './components/LoginPage';

type NavKey = 'chat' | 'workflows' | 'history';
type ChatTab = 'chat' | 'architecture' | 'design' | 'code' | 'document';

export default function App() {
  const {
    sessions,
    activeSession,
    activeSessionId,
    setActiveSessionId,
    createSession,
    deleteSession,
    editSession,
    togglePin,
  } = useSessions();

  const auth = useAuth();

  const [profileId, setProfileId] = useState<string>('');
  const [activeNav, setActiveNav] = useState<NavKey>('chat');
  const [activeChatTab, setActiveChatTab] = useState<ChatTab>('chat');
  const studio = useStudioState();
  const modelSwitcher = useModelSwitcher();

  const docHook = useDocument(activeSessionId);
  const chat = useChat(activeSessionId, profileId, docHook.updateFromSSE);
  const artifacts = useArtifacts({
    sessionId: activeSessionId,
    document: docHook.document,
    designHtml: studio.designHtml,
    generatedFiles: studio.generatedFiles,
  });

  const sessionData = useSessionData(activeSessionId, studio);
  const generation = useGeneration(activeSessionId, profileId, studio, docHook);

  // 会话切换时加载对话历史（版本加载由 useSessionData 处理）
  useEffect(() => {
    if (activeSessionId) {
      chat.loadSession(activeSessionId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId]);

  // 同步 chat.document 到 docHook（session 加载后）
  useEffect(() => {
    if (chat.document) {
      docHook.loadDocument(chat.document);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.document]);

  // ── 新建会话 ──────────────────────────────────────────────
  const handleCreateSession = async () => {
    const id = await createSession(profileId);
    if (id) {
      // 清空右侧产物和结构化文档状态，避免旧会话内容残留
      chat.setMessages([]);
      chat.setDocument(null);
      docHook.setDocument(null);
      studio.resetOutputs();
      setActiveChatTab('chat');
    }
  };

  const completeness = docHook.completeness;

  // ── Auth 加载中 ───────────────────────────────────────────
  if (auth.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="text-center">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mx-auto mb-4 animate-pulse">
            <Zap className="w-6 h-6 text-white" />
          </div>
          <p className="text-sm text-gray-400">加载中...</p>
        </div>
      </div>
    );
  }

  // ── 未认证 → 登录页 ───────────────────────────────────────
  if (!auth.user) {
    return <LoginPage onLogin={auth.login} onRegister={auth.register} error={auth.error} />;
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <Header
        user={auth.user}
        models={modelSwitcher.models}
        currentModel={modelSwitcher.currentModel}
        modelMenuOpen={modelSwitcher.modelMenuOpen}
        onToggleModelMenu={() => modelSwitcher.setModelMenuOpen(!modelSwitcher.modelMenuOpen)}
        onSwitchModel={modelSwitcher.switchModel}
        onLogout={auth.logout}
      />

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-[280px] shrink-0 bg-gray-50 dark:bg-gray-900 overflow-auto h-full border-r border-divider dark:border-gray-800">
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
            onEditSession={editSession}
            onTogglePin={togglePin}
            onNavigate={setActiveNav}
          />
        </aside>

        {/* Main content */}
        <main className="flex-1 flex flex-col bg-white dark:bg-gray-950 h-full overflow-hidden">
          {activeNav === 'chat' && (
            <div className="flex-1 flex flex-col overflow-hidden min-h-0">
              {/* Tab bar */}
              <div className="flex gap-0 px-4 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 shrink-0">
                {(
                  [
                    ['chat', Zap, '需求对话'],
                    ['architecture', Layers, '架构'],
                    ['design', Image, 'UI预览'],
                    ['code', Code, '代码'],
                  ] as const
                ).map(([key, Icon, label]) => (
                  <button
                    key={key}
                    onClick={() => setActiveChatTab(key)}
                    className={`flex flex-1 items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-all border-b-2 -mb-[1px]
                      ${
                        activeChatTab === key
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
                {activeChatTab === 'architecture' && (
                  <ArchitecturePanel
                    markdown={studio.archDraft ?? studio.archMarkdown}
                    completeness={completeness}
                    loading={generation.archLoading}
                    versions={studio.archVersions}
                    activeArchId={studio.activeArchId}
                    isDraft={!!studio.archDraft}
                    refining={generation.archRefining}
                    onGenerate={generation.generateArchitecture}
                    onSwitchVersion={sessionData.switchArchitectureVersion}
                    onSave={generation.saveArchitecture}
                    onSendFeedback={generation.refineArchitecture}
                  />
                )}
                {activeChatTab === 'design' && (
                  <DesignPanel
                    html={studio.designHtml}
                    completeness={completeness}
                    loading={generation.designLoading}
                    versions={studio.designVersions}
                    activeDesignId={studio.activeDesignId}
                    onGenerate={() =>
                      generation.generateDesign(() => setActiveChatTab('design'))
                    }
                    onSwitchVersion={sessionData.switchDesignVersion}
                  />
                )}
                {activeChatTab === 'code' && <CodePanel files={studio.generatedFiles} />}
              </div>
            </div>
          )}

          {activeNav === 'workflows' && <WorkflowPanel profileId={profileId} />}

          {activeNav === 'history' && <RunHistory />}
        </main>

        {/* Right sidebar — Artifacts + Document panel (only in chat mode) */}
        {activeNav === 'chat' && (
          <aside className="w-[360px] shrink-0 bg-white dark:bg-gray-900 border-l border-divider dark:border-gray-800 flex flex-col h-full overflow-hidden">
            {activeSession && (
              <div className="px-4 py-4 shrink-0 bg-gradient-to-b from-blue-50/70 via-blue-50/20 to-white dark:from-blue-950/30 dark:via-blue-950/10 dark:to-gray-900 border-b-2 border-gray-200 dark:border-gray-700">
                <h3 className="text-base font-bold text-gray-800 dark:text-gray-100 leading-tight break-words">
                  📋 {activeSession.name}
                </h3>
                {activeSession.featureName && (
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 break-words">
                    {activeSession.featureName}
                  </p>
                )}
              </div>
            )}
            <ArtifactsPanel
              artifacts={artifacts.artifacts}
              loading={artifacts.loading}
              onDownloadOne={artifacts.downloadOne}
              onDownloadAll={artifacts.downloadAll}
            />
            <div className="flex-1 overflow-auto min-h-0">
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
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
