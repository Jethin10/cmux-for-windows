import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { formatSessionBadge } from "@cmux/ui";
import { TerminalSpike } from "./TerminalSpike.js";
import "./styles.css";

function App() {
  const [appInfo, setAppInfo] = useState<string>("Loading app info…");

  useEffect(() => {
    void window.cmux.appInfo().then((info) => {
      setAppInfo(`${info.name} ${info.version} on ${info.platform}`);
    });
  }, []);

  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">Windows-first agent terminal command center</p>
        <h1>CMux for Windows</h1>
        <p>
          Phase 1 PTY spike foundation is underway: xterm.js renders in the secure renderer and the
          backend PTY broker owns process lifecycle state.
        </p>
        <code>{appInfo}</code>
      </section>
      <section className="terminal-panel">
        <TerminalSpike />
      </section>
      <section className="panel">
        <h2>Supervisor MVP target</h2>
        <ul>
          <li>{formatSessionBadge({ title: "Pi in repo", status: "running", unreadCount: 0 })}</li>
          <li>
            {formatSessionBadge({ title: "Codex review", status: "waiting", unreadCount: 1 })}
          </li>
          <li>
            {formatSessionBadge({ title: "Tests watcher", status: "completed", unreadCount: 0 })}
          </li>
        </ul>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
