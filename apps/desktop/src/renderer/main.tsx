import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { defaultTemplates } from "@cmux/core";
import type { AgentSession, Workspace } from "@cmux/shared";
import { formatSessionBadge } from "@cmux/ui";
import { TerminalSpike } from "./TerminalSpike.js";
import "./styles.css";

function App() {
  const [appInfo, setAppInfo] = useState<string>("Loading app info…");
  const [workspacePath, setWorkspacePath] = useState<string>(".");
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | undefined>();
  const [agents, setAgents] = useState<AgentSession[]>([]);
  const [templateId, setTemplateId] = useState<string>(String(defaultTemplates[0]?.id ?? ""));
  const [agentTitle, setAgentTitle] = useState<string>("Pi in repo");
  const [prompt, setPrompt] = useState<string>("Review the repository and summarize next steps.");
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const activeWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === activeWorkspaceId),
    [activeWorkspaceId, workspaces],
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
    const nextAgents = await window.cmux.agent.list({
      workspaceId: workspaceId as Workspace["id"],
    });
    setAgents(nextAgents);
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
              <strong>{workspace.name}</strong>
              <span>{workspace.rootPath}</span>
            </button>
          ))}
          {workspaces.length === 0 ? <p>No workspaces yet.</p> : null}
        </div>
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

      <section className="terminal-panel">
        <TerminalSpike />
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
