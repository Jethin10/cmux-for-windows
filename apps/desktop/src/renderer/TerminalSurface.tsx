import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { useEffect, useRef } from "react";
import type { TerminalSessionId } from "@cmux/shared";
import "@xterm/xterm/css/xterm.css";

export interface TerminalSurfaceProps {
  terminalSessionId: TerminalSessionId;
  title: string;
  readOnly?: boolean;
}

export function TerminalSurface({
  terminalSessionId,
  title,
  readOnly = false,
}: TerminalSurfaceProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    let disposed = false;
    let unsubscribeOutput: (() => void) | undefined;
    let unsubscribeExit: (() => void) | undefined;

    const terminal = new Terminal({
      convertEol: true,
      cursorBlink: !readOnly,
      fontFamily: "Cascadia Mono, Consolas, monospace",
      fontSize: 13,
      scrollback: 5000,
      theme: {
        background: "#020617",
        foreground: "#dbeafe",
        cursor: "#7dd3fc",
      },
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(containerRef.current);
    safeFit(fitAddon);
    terminal.writeln(`[attached to ${title}]`);
    terminal.writeln(
      "Live output will appear below. Historical replay is handled by transcripts/search.",
    );
    terminal.write("\r\n");

    const dataDisposable = terminal.onData((data) => {
      if (readOnly) return;
      void window.cmux.terminal
        .write({ terminalSessionId, data })
        .catch((error: unknown) => terminal.writeln(`\r\n[write failed] ${formatError(error)}`));
    });

    const resizeDisposable = terminal.onResize(({ cols, rows }) => {
      if (readOnly || cols < 1 || rows < 1) return;
      void window.cmux.terminal.resize({ terminalSessionId, cols, rows }).catch(() => undefined);
    });

    const resizeObserver = new ResizeObserver(() => safeFit(fitAddon));
    resizeObserver.observe(containerRef.current);

    void window.cmux.terminal
      .subscribeOutput(terminalSessionId, (event) => terminal.write(event.data))
      .then((unsubscribe) => {
        if (disposed) unsubscribe();
        else unsubscribeOutput = unsubscribe;
      })
      .catch((error: unknown) => {
        if (!disposed) terminal.writeln(`\r\n[output subscription failed] ${formatError(error)}`);
      });

    void window.cmux.terminal
      .subscribeExit(terminalSessionId, (event) => {
        const suffix = event.exitCode === undefined ? "" : ` exitCode=${event.exitCode}`;
        terminal.writeln(`\r\n[terminal exited${suffix}]`);
      })
      .then((unsubscribe) => {
        if (disposed) unsubscribe();
        else unsubscribeExit = unsubscribe;
      })
      .catch((error: unknown) => {
        if (!disposed) terminal.writeln(`\r\n[exit subscription failed] ${formatError(error)}`);
      });

    terminal.focus();

    return () => {
      disposed = true;
      unsubscribeOutput?.();
      unsubscribeExit?.();
      resizeObserver.disconnect();
      dataDisposable.dispose();
      resizeDisposable.dispose();
      terminal.dispose();
    };
  }, [readOnly, terminalSessionId, title]);

  return <div ref={containerRef} className="terminal-spike" aria-label={`${title} terminal`} />;
}

function safeFit(fitAddon: FitAddon): void {
  try {
    fitAddon.fit();
  } catch {
    // xterm can throw if the element is temporarily hidden during layout/teardown.
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
