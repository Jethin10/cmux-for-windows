import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { defaultTemplates } from "@cmux/core";
import type { GitStatusResponse, TranscriptSearchResult } from "@cmux/ipc";
import type {
  AgentSession,
  Notification,
  PaneLayoutState,
  PaneSurface,
  Workspace,
} from "@cmux/shared";
import { formatSessionBadge } from "@cmux/ui";
import { TerminalSpike } from "./TerminalSpike.js";
import { TerminalSurface } from "./TerminalSurface.js";
import "./styles.css";

function App() {
  const [appInfo, setAppInfo] = useState<string>("Loading app info…");
  const [workspacePath, setWorkspacePath] = useState<string>(".");
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | undefined>();
  const [agents, setAgents] = useState<AgentSession[]>([]);
  const [history, setHistory] = useState<AgentSession[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searchResults, setSearchResults] = useState<TranscriptSearchResult[]>([]);
  const [gitStatus, setGitStatus] = useState<GitStatusResponse | undefined>();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [paneLayout, setPaneLayout] = useState<PaneLayoutState>({ surfaces: [] });
  const [selectedAgentId, setSelectedAgentId] = useState<string | undefined>();
  const [templateId, setTemplateId] = useState<string>(String(defaultTemplates[0]?.id ?? ""));
  const [agentTitle, setAgentTitle] = useState<string>("Pi in repo");
  const [batchCount, setBatchCount] = useState<number>(3);
  const [prompt, setPrompt] = useState<string>("Review the repository and summarize next steps.");
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const activeWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === activeWorkspaceId),
    [activeWorkspaceId, workspaces],
  );
  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId),
    [agents, selectedAgentId],
  );
  const activeSurface = useMemo(
    () => paneLayout.surfaces.find((surface) => surface.id === paneLayout.activeSurfaceId),
    [paneLayout],
  );
  const activeSurfaceAgent = useMemo(
    () => agents.find((agent) => agent.id === activeSurface?.agentSessionId),
    [activeSurface, agents],
  );

  useEffect(() => {
    void window.cmux.appInfo().then((info) => {
      setAppInfo(`${info.name} ${info.version} on ${info.platform}`);
    });
    void refreshWorkspaces();
  }, []);

  useEffect(() => {
    if (!activeWorkspaceId) {
      setAgents([]);
      setPaneLayout({ surfaces: [] });
      setGitStatus(undefined);
      return;
    }
    void refreshAgents(activeWorkspaceId);
  }, [activeWorkspaceId]);

  async function refreshWorkspaces(): Promise<void> {
    const nextWorkspaces = await window.cmux.workspace.list();
    setWorkspaces(nextWorkspaces);
    setActiveWorkspaceId((current) => current ?? nextWorkspaces[0]?.id);
  }

  async function refreshAgents(workspaceId: string): Promise<void> {
    const workspaceIdValue = workspaceId as Workspace["id"];
    const [nextAgents, nextHistory] = await Promise.all([
      window.cmux.agent.list({ workspaceId: workspaceIdValue }),
      window.cmux.agent.history({ workspaceId: workspaceIdValue }),
    ]);
    setAgents(nextAgents);
    setHistory(nextHistory);
    setNotifications(await window.cmux.notification.list({ workspaceId: workspaceIdValue }));
    setPaneLayout(await window.cmux.paneLayout.get({ workspaceId: workspaceIdValue }));
    try {
      setGitStatus(await window.cmux.git.status({ workspaceId: workspaceIdValue }));
    } catch {
      setGitStatus(undefined);
    }
    setSelectedAgentId((current) => {
      if (current && nextAgents.some((agent) => agent.id === current)) return current;
      return nextAgents.find((agent) => agent.terminalSessionId)?.id;
    });
  }

  async function runAction(action: () => Promise<void>): Promise<void> {
    setBusy(true);
    setError(undefined);
    try {
      await action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">Windows-first agent terminal command center</p>
        <h1>CMux for Windows</h1>
        <p>
          Phase 2 starts the supervisor MVP: create workspaces, launch named agent sessions from
          templates, and stop/restart/archive sessions while the backend owns process lifecycle.
        </p>
        <code>{appInfo}</code>
        {error ? <p className="error-banner">{error}</p> : null}
      </section>

      <section className="panel supervisor-panel">
        <h2>Workspace</h2>
        <form
          className="form-row"
          onSubmit={(event) => {
            event.preventDefault();
            void runAction(async () => {
              const workspace = await window.cmux.workspace.open({
                rootPath: workspacePath,
                trusted: true,
              });
              await refreshWorkspaces();
              setActiveWorkspaceId(workspace.id);
            });
          }}
        >
          <input
            value={workspacePath}
            onChange={(event) => setWorkspacePath(event.target.value)}
            aria-label="Workspace path"
            placeholder="C:/path/to/repo"
          />
          <button disabled={busy}>Open</button>
        </form>

        <div className="workspace-list">
          {workspaces.map((workspace) => (
            <button
              key={workspace.id}
              className={workspace.id === activeWorkspaceId ? "workspace active" : "workspace"}
              onClick={() => setActiveWorkspaceId(workspace.id)}
            >
              <strong>
                {workspace.unreadCount > 0
                  ? `${workspace.name} (${workspace.unreadCount})`
                  : workspace.name}
              </strong>
              <span>{workspace.rootPath}</span>
            </button>
          ))}
          {workspaces.length === 0 ? <p>No workspaces yet.</p> : null}
        </div>
      </section>

      <section className="panel supervisor-panel">
        <div className="panel-heading">
          <h2>Git</h2>
          <button
            disabled={!activeWorkspace}
            onClick={() =>
              activeWorkspace &&
              void runAction(async () => {
                setGitStatus(await window.cmux.git.status({ workspaceId: activeWorkspace.id }));
              })
            }
          >
            Refresh status
          </button>
        </div>
        <p>{gitStatus?.summary ?? "Open a Git workspace and refresh status."}</p>
      </section>

      <section className="panel supervisor-panel">
        <h2>Launch agent</h2>
        <div className="form-grid">
          <label>
            Template
            <select
              value={templateId}
              onChange={(event) => {
                const nextTemplateId = event.target.value;
                setTemplateId(nextTemplateId);
                const template = defaultTemplates.find(
                  (candidate) => candidate.id === nextTemplateId,
                );
                if (template) setAgentTitle(template.name);
              }}
            >
              {defaultTemplates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Title
            <input value={agentTitle} onChange={(event) => setAgentTitle(event.target.value)} />
          </label>
          <label>
            Batch count
            <input
              type="number"
              min={1}
              max={20}
              value={batchCount}
              onChange={(event) => setBatchCount(Number(event.target.value))}
            />
          </label>
          <label className="prompt-field">
            Prompt
            <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={4} />
          </label>
          <button
            disabled={busy || !activeWorkspace}
            onClick={() => {
              if (!activeWorkspace) return;
              void runAction(async () => {
                try {
                  await window.cmux.agent.launch({
                    workspaceId: activeWorkspace.id,
                    templateId,
                    title: agentTitle,
                    prompt,
                  });
                } finally {
                  await refreshAgents(activeWorkspace.id);
                }
              });
            }}
          >
            Launch
          </button>
          <button
            disabled={busy || !activeWorkspace || batchCount < 1 || batchCount > 20}
            onClick={() => {
              if (!activeWorkspace) return;
              void runAction(async () => {
                const response = await window.cmux.agent.batchLaunch({
                  workspaceId: activeWorkspace.id,
                  launches: Array.from({ length: batchCount }, (_, index) => ({
                    templateId,
                    title: `${agentTitle} #${index + 1}`,
                    prompt,
                  })),
                });
                if (response.failures.length > 0) {
                  setError(
                    `Launched ${response.agents.length}; ${response.failures.length} failed: ${response.failures
                      .map((failure) => failure.error)
                      .join(", ")}`,
                  );
                }
                await refreshAgents(activeWorkspace.id);
              });
            }}
          >
            Launch batch
          </button>
        </div>
      </section>

      <section className="panel session-panel">
        <div className="panel-heading">
          <h2>Sessions</h2>
          <button
            disabled={!activeWorkspace}
            onClick={() => activeWorkspace && void refreshAgents(activeWorkspace.id)}
          >
            Refresh
          </button>
        </div>
        <ul className="session-list">
          {agents.map((agent) => (
            <li key={agent.id} className="session-card">
              <div>
                <strong>
                  {formatSessionBadge({
                    title: agent.title,
                    status: agent.status,
                    unreadCount: 0,
                  })}
                </strong>
                <p>{agent.statusReason ?? agent.cwd}</p>
              </div>
              <div className="session-actions">
                <button
                  disabled={!agent.terminalSessionId || !activeWorkspace}
                  onClick={() => {
                    const terminalSessionId = agent.terminalSessionId;
                    if (!activeWorkspace || !terminalSessionId) return;
                    void runAction(async () => {
                      const surface: PaneSurface = {
                        id: `agent-terminal:${agent.id}`,
                        kind: "agent-terminal",
                        title: agent.title,
                        agentSessionId: agent.id,
                        terminalSessionId,
                      };
                      setPaneLayout(
                        await window.cmux.paneLayout.openSurface({
                          workspaceId: activeWorkspace.id,
                          surface,
                        }),
                      );
                      setSelectedAgentId(agent.id);
                    });
                  }}
                >
                  Attach
                </button>
                <button
                  disabled={busy || agent.status === "stopped" || agent.status === "archived"}
                  onClick={() =>
                    void runAction(async () => {
                      await window.cmux.agent.stop({ agentSessionId: agent.id, mode: "terminate" });
                      if (activeWorkspace) await refreshAgents(activeWorkspace.id);
                    })
                  }
                >
                  Stop
                </button>
                <button
                  disabled={busy || agent.status === "archived"}
                  onClick={() =>
                    void runAction(async () => {
                      await window.cmux.agent.restart({ agentSessionId: agent.id });
                      if (activeWorkspace) await refreshAgents(activeWorkspace.id);
                    })
                  }
                >
                  Restart
                </button>
                <button
                  disabled={
                    busy ||
                    agent.status === "running" ||
                    agent.status === "waiting" ||
                    agent.status === "needs-attention"
                  }
                  onClick={() =>
                    void runAction(async () => {
                      await window.cmux.agent.archive({ agentSessionId: agent.id });
                      if (activeWorkspace) await refreshAgents(activeWorkspace.id);
                    })
                  }
                >
                  Archive
                </button>
              </div>
            </li>
          ))}
          {agents.length === 0 ? <li>No sessions in this workspace.</li> : null}
        </ul>
      </section>

      <section className="panel session-panel">
        <div className="panel-heading">
          <h2>Notifications</h2>
          <button
            disabled={!activeWorkspace}
            onClick={() =>
              activeWorkspace &&
              void runAction(async () => {
                const nextAgent = await window.cmux.notification.nextUnread({
                  workspaceId: activeWorkspace.id,
                });
                if (nextAgent)
                  setAgents((current) => [
                    nextAgent,
                    ...current.filter((agent) => agent.id !== nextAgent.id),
                  ]);
              })
            }
          >
            Jump to next unread
          </button>
        </div>
        <ul className="session-list">
          {notifications.map((notification) => (
            <li key={notification.id} className="session-card">
              <div>
                <strong>{notification.title}</strong>
                <p>{notification.body}</p>
              </div>
              <button
                disabled={notification.read}
                onClick={() =>
                  void runAction(async () => {
                    await window.cmux.notification.markRead({ notificationId: notification.id });
                    if (activeWorkspace) await refreshAgents(activeWorkspace.id);
                  })
                }
              >
                {notification.read ? "Read" : "Mark read"}
              </button>
            </li>
          ))}
          {notifications.length === 0 ? <li>No notifications yet.</li> : null}
        </ul>
      </section>

      <section className="panel session-panel">
        <div className="panel-heading">
          <h2>Transcript search</h2>
        </div>
        <form
          className="form-row"
          onSubmit={(event) => {
            event.preventDefault();
            if (!searchQuery.trim()) return;
            void runAction(async () => {
              const results = await window.cmux.transcript.search({
                ...(activeWorkspace ? { workspaceId: activeWorkspace.id } : {}),
                query: searchQuery,
                limit: 50,
              });
              setSearchResults(results);
            });
          }}
        >
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            aria-label="Transcript search query"
            placeholder="Search logs…"
          />
          <button disabled={busy || !searchQuery.trim()}>Search</button>
        </form>
        <ul className="session-list">
          {searchResults.map((result) => (
            <li key={`${result.terminalSessionId}-${result.sequence}`} className="session-card">
              <div>
                <strong>{result.createdAt}</strong>
                <p>{result.excerpt}</p>
              </div>
            </li>
          ))}
          {searchResults.length === 0 ? <li>No transcript matches yet.</li> : null}
        </ul>
      </section>

      <section className="panel session-panel">
        <div className="panel-heading">
          <h2>Session history</h2>
        </div>
        <ul className="session-list">
          {history.map((agent) => (
            <li key={agent.id} className="session-card">
              <div>
                <strong>
                  {formatSessionBadge({ title: agent.title, status: agent.status, unreadCount: 0 })}
                </strong>
                <p>{agent.statusReason ?? agent.startedAt}</p>
              </div>
            </li>
          ))}
          {history.length === 0 ? <li>No session history yet.</li> : null}
        </ul>
      </section>

      <section className="terminal-panel pane-grid">
        <div className="pane-surface">
          <div className="pane-title">Local shell spike</div>
          <TerminalSpike />
        </div>
        <div className="pane-surface">
          <div className="pane-title">
            {activeSurfaceAgent
              ? `Agent session: ${activeSurfaceAgent.title}`
              : selectedAgent
                ? `Agent session: ${selectedAgent.title}`
                : "Agent session surface"}
          </div>
          {activeWorkspace && paneLayout.surfaces.length > 0 ? (
            <div className="surface-tabs">
              {paneLayout.surfaces.map((surface, index) => (
                <div
                  key={surface.id}
                  className={
                    surface.id === paneLayout.activeSurfaceId ? "surface-tab active" : "surface-tab"
                  }
                >
                  <button
                    onClick={() =>
                      void runAction(async () => {
                        setPaneLayout(
                          await window.cmux.paneLayout.focusSurface({
                            workspaceId: activeWorkspace.id,
                            surfaceId: surface.id,
                          }),
                        );
                        if (surface.agentSessionId) setSelectedAgentId(surface.agentSessionId);
                      })
                    }
                  >
                    {surface.title}
                  </button>
                  <button
                    disabled={index === 0}
                    aria-label={`Move ${surface.title} left`}
                    onClick={() =>
                      void runAction(async () => {
                        setPaneLayout(
                          await window.cmux.paneLayout.reorderSurface({
                            workspaceId: activeWorkspace.id,
                            surfaceId: surface.id,
                            beforeSurfaceId: paneLayout.surfaces[index - 1]!.id,
                          }),
                        );
                      })
                    }
                  >
                    ←
                  </button>
                  <button
                    disabled={index === paneLayout.surfaces.length - 1}
                    aria-label={`Move ${surface.title} right`}
                    onClick={() =>
                      void runAction(async () => {
                        setPaneLayout(
                          await window.cmux.paneLayout.reorderSurface({
                            workspaceId: activeWorkspace.id,
                            surfaceId: surface.id,
                            afterSurfaceId: paneLayout.surfaces[index + 1]!.id,
                          }),
                        );
                      })
                    }
                  >
                    →
                  </button>
                  <button
                    aria-label={`Close ${surface.title}`}
                    onClick={() =>
                      void runAction(async () => {
                        setPaneLayout(
                          await window.cmux.paneLayout.closeSurface({
                            workspaceId: activeWorkspace.id,
                            surfaceId: surface.id,
                          }),
                        );
                      })
                    }
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          {activeSurfaceAgent?.terminalSessionId ? (
            <TerminalSurface
              key={activeSurfaceAgent.terminalSessionId}
              terminalSessionId={activeSurfaceAgent.terminalSessionId}
              title={activeSurfaceAgent.title}
            />
          ) : selectedAgent?.terminalSessionId ? (
            <TerminalSurface
              key={selectedAgent.terminalSessionId}
              terminalSessionId={selectedAgent.terminalSessionId}
              title={selectedAgent.title}
            />
          ) : (
            <div className="empty-surface">
              Select a running session and click Attach to open a persisted terminal surface.
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
