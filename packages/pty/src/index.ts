import type { TerminalSession, TerminalSessionId } from "@cmux/shared";

export * from "./broker.js";
export * from "./validation.js";

export interface CreateTerminalRequest {
  profileId: string;
  command: string;
  args: readonly string[];
  cwd: string;
  cols: number;
  rows: number;
  agentSessionId?: string;
  workspaceId: string;
}

export type TerminalCloseMode = "interrupt" | "terminate" | "kill-process-tree" | "detach";

export interface TerminalOutputEvent {
  terminalSessionId: TerminalSessionId;
  sequence: number;
  data: string;
}

export interface TerminalExitEvent {
  terminalSessionId: TerminalSessionId;
  exitCode?: number;
  signal?: number;
}

export type TerminalOutputHandler = (event: TerminalOutputEvent) => void;
export type TerminalExitHandler = (event: TerminalExitEvent) => void;

export interface TerminalSubscription {
  dispose(): void;
}

export interface PtyBroker {
  createTerminal(request: CreateTerminalRequest): Promise<TerminalSession>;
  writeTerminal(terminalId: TerminalSessionId, data: string): Promise<void>;
  resizeTerminal(terminalId: TerminalSessionId, cols: number, rows: number): Promise<void>;
  closeTerminal(terminalId: TerminalSessionId, mode: TerminalCloseMode): Promise<void>;
  restartTerminal(terminalId: TerminalSessionId): Promise<TerminalSession>;
  subscribeOutput(
    terminalId: TerminalSessionId,
    handler: TerminalOutputHandler,
  ): TerminalSubscription;
  subscribeExit(terminalId: TerminalSessionId, handler: TerminalExitHandler): TerminalSubscription;
}
