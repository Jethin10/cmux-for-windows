import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CliCommandEnvelope, CliCommandResult } from "@cmux/ipc";
import type { SupervisorService } from "./supervisor-service.js";

export interface QueuedCliCommand {
  id: string;
  envelope: CliCommandEnvelope;
}

export interface CliCommandBridgeOptions {
  pollIntervalMs?: number;
}

export type SupervisorServiceProvider = () => Promise<SupervisorService>;

export function startCliCommandFileBridge(
  inboxDir: string,
  getSupervisorService: SupervisorServiceProvider,
  options: CliCommandBridgeOptions = {},
): () => void {
  const pollIntervalMs = options.pollIntervalMs ?? 1000;
  let stopped = false;
  let running = false;

  async function poll(): Promise<void> {
    if (stopped || running) return;
    running = true;
    try {
      await processCliCommandInbox(inboxDir, await getSupervisorService());
    } catch (error) {
      console.error("Failed to process CLI command inbox", error);
    } finally {
      running = false;
    }
  }

  void mkdir(inboxDir, { recursive: true }).then(() => poll());
  const interval = setInterval(() => void poll(), pollIntervalMs);

  return () => {
    stopped = true;
    clearInterval(interval);
  };
}

export async function processCliCommandInbox(
  inboxDir: string,
  supervisor: SupervisorService,
): Promise<void> {
  await mkdir(inboxDir, { recursive: true });
  const files = (await readdir(inboxDir)).filter((file) => file.endsWith(".json")).sort();

  for (const file of files) {
    const path = join(inboxDir, file);
    const processingPath = join(inboxDir, `${file}.processing`);
    try {
      await rename(path, processingPath);
    } catch {
      continue;
    }

    const result = await processCliCommandFile(processingPath, supervisor);
    await writeFile(
      `${processingPath}.result.json`,
      `${JSON.stringify(result, null, 2)}\n`,
      "utf8",
    );
  }
}

export async function processCliCommandFile(
  path: string,
  supervisor: SupervisorService,
): Promise<CliCommandResult> {
  try {
    const queued = parseQueuedCommand(JSON.parse(await readFile(path, "utf8")));
    return { ok: true, data: await executeCliCommandEnvelope(queued.envelope, supervisor) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function executeCliCommandEnvelope(
  envelope: CliCommandEnvelope,
  supervisor: SupervisorService,
): Promise<unknown> {
  switch (envelope.command) {
    case "workspace.open":
      return supervisor.openWorkspace(envelope.payload);
    case "agent.list":
      return supervisor.listAgents(envelope.payload.workspaceId);
    case "agent.launch":
      return supervisor.launchAgent(envelope.payload);
    case "agent.batchLaunch":
      return supervisor.launchAgentBatch(envelope.payload);
    case "agent.stop":
      return supervisor.stopAgent(envelope.payload);
  }
}

function parseQueuedCommand(value: unknown): QueuedCliCommand {
  if (!isRecord(value)) throw new Error("Queued CLI command must be an object");
  if (typeof value.id !== "string" || value.id.trim().length === 0) {
    throw new Error("Queued CLI command id is required");
  }
  if (!isRecord(value.envelope) || typeof value.envelope.command !== "string") {
    throw new Error("Queued CLI command envelope is required");
  }
  return value as unknown as QueuedCliCommand;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
