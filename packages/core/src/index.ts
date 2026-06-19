import type { AgentSessionStatus, TerminalSessionStatus } from "@cmux/shared";

const terminalTransitions: Readonly<
  Record<TerminalSessionStatus, readonly TerminalSessionStatus[]>
> = {
  starting: ["running", "crashed"],
  running: ["closing", "exited", "crashed"],
  closing: ["exited", "crashed", "disposed"],
  exited: ["disposed"],
  crashed: ["disposed"],
  disposed: [],
};

const agentTransitions: Readonly<Record<AgentSessionStatus, readonly AgentSessionStatus[]>> = {
  starting: ["running", "waiting", "needs-attention", "failed", "completed", "stopped"],
  running: ["waiting", "needs-attention", "failed", "completed", "stopped"],
  waiting: ["running", "needs-attention", "failed", "completed", "stopped"],
  "needs-attention": ["running", "waiting", "failed", "completed", "stopped"],
  failed: ["running", "archived"],
  completed: ["running", "archived"],
  stopped: ["running", "archived"],
  archived: [],
};

export function canTransitionTerminal(
  from: TerminalSessionStatus,
  to: TerminalSessionStatus,
): boolean {
  return terminalTransitions[from].includes(to);
}

export function assertTerminalTransition(
  from: TerminalSessionStatus,
  to: TerminalSessionStatus,
): void {
  if (!canTransitionTerminal(from, to)) {
    throw new Error(`Invalid terminal status transition: ${from} -> ${to}`);
  }
}

export function canTransitionAgent(from: AgentSessionStatus, to: AgentSessionStatus): boolean {
  return agentTransitions[from].includes(to);
}

export interface AttentionDetectionResult {
  status: Extract<AgentSessionStatus, "running" | "waiting" | "needs-attention" | "failed">;
  reason?: string;
}

const failedPatterns = [
  /\b(error|failed|failure|exception)\b/i,
  /tests? failed/i,
  /merge conflict/i,
];
const waitingPatterns = [
  /\bcontinue\?/i,
  /\bapprove\?/i,
  /\byes\/no\b/i,
  /press enter/i,
  /\bpassword\b/i,
  /\bpermission\b/i,
];

export function detectAgentAttention(output: string): AttentionDetectionResult {
  const failed = failedPatterns.find((pattern) => pattern.test(output));
  if (failed) return { status: "failed", reason: `Matched ${failed.source}` };

  const waiting = waitingPatterns.find((pattern) => pattern.test(output));
  if (waiting) return { status: "waiting", reason: `Matched ${waiting.source}` };

  return { status: "running" };
}

export * from "./templates.js";
