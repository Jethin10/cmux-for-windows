import type { TerminalSession, TerminalSessionId } from "@cmux/shared";

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

export interface PtyBroker {
  createTerminal(request: CreateTerminalRequest): Promise<TerminalSession>;
  writeTerminal(terminalId: TerminalSessionId, data: string): Promise<void>;
  resizeTerminal(terminalId: TerminalSessionId, cols: number, rows: number): Promise<void>;
  closeTerminal(terminalId: TerminalSessionId, mode: TerminalCloseMode): Promise<void>;
  restartTerminal(terminalId: TerminalSessionId): Promise<TerminalSession>;
}

export function assertValidTerminalSize(cols: number, rows: number): void {
  if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 1 || rows < 1) {
    throw new Error(`Invalid terminal size ${cols}x${rows}; never send 0x0 resize to ConPTY`);
  }
}
