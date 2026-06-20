import { appendFile, mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type {
  AgentSession,
  Notification,
  PaneLayoutState,
  TerminalSessionId,
  Workspace,
  WorkspaceId,
} from "@cmux/shared";
import type { ApprovalRequestRecord, TranscriptSearchResult } from "@cmux/ipc";

export interface PersistedPaneLayout {
  workspaceId: WorkspaceId;
  layout: PaneLayoutState;
}

export interface SupervisorSnapshot {
  workspaces: Workspace[];
  agents: AgentSession[];
  notifications?: Notification[];
  approvals?: ApprovalRequestRecord[];
  paneLayouts?: PersistedPaneLayout[];
}

export interface TranscriptRecord {
  workspaceId: WorkspaceId;
  agentSessionId?: AgentSession["id"];
  terminalSessionId: TerminalSessionId;
  sequence: number;
  createdAt: string;
  data: string;
}

export interface TranscriptSearchOptions {
  workspaceId?: WorkspaceId;
  limit?: number;
}

export interface SupervisorStore {
  loadSnapshot(): Promise<SupervisorSnapshot>;
  saveSnapshot(snapshot: SupervisorSnapshot): Promise<void>;
  appendTranscript(record: TranscriptRecord): Promise<void>;
  searchTranscripts(
    query: string,
    options?: TranscriptSearchOptions,
  ): Promise<TranscriptSearchResult[]>;
}

interface PersistedSnapshot extends SupervisorSnapshot {
  version: 1;
}

const DEFAULT_MAX_TRANSCRIPT_BYTES = 2 * 1024 * 1024;

export class FileSupervisorStore implements SupervisorStore {
  private readonly snapshotPath: string;
  private readonly transcriptDir: string;
  private saveQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly rootDir: string,
    private readonly maxTranscriptBytes = DEFAULT_MAX_TRANSCRIPT_BYTES,
  ) {
    this.snapshotPath = join(rootDir, "supervisor-state.json");
    this.transcriptDir = join(rootDir, "transcripts");
  }

  async loadSnapshot(): Promise<SupervisorSnapshot> {
    try {
      const parsed = JSON.parse(
        await readFile(this.snapshotPath, "utf8"),
      ) as Partial<PersistedSnapshot>;
      return {
        workspaces: Array.isArray(parsed.workspaces) ? (parsed.workspaces as Workspace[]) : [],
        agents: Array.isArray(parsed.agents) ? (parsed.agents as AgentSession[]) : [],
        notifications: Array.isArray(parsed.notifications)
          ? (parsed.notifications as Notification[])
          : [],
        approvals: Array.isArray(parsed.approvals)
          ? (parsed.approvals as ApprovalRequestRecord[])
          : [],
        paneLayouts: Array.isArray(parsed.paneLayouts)
          ? (parsed.paneLayouts as PersistedPaneLayout[])
          : [],
      };
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return { workspaces: [], agents: [], notifications: [], approvals: [], paneLayouts: [] };
      }
      throw error;
    }
  }

  async saveSnapshot(snapshot: SupervisorSnapshot): Promise<void> {
    const snapshotCopy: SupervisorSnapshot = {
      workspaces: snapshot.workspaces.map((workspace) => ({ ...workspace })),
      agents: snapshot.agents.map((agent) => ({ ...agent })),
      notifications: snapshot.notifications?.map((notification) => ({ ...notification })) ?? [],
      approvals: snapshot.approvals?.map((approval) => ({ ...approval })) ?? [],
      paneLayouts:
        snapshot.paneLayouts?.map((entry) => ({
          workspaceId: entry.workspaceId,
          layout: copyPaneLayout(entry.layout),
        })) ?? [],
    };
    this.saveQueue = this.saveQueue.then(
      () => this.writeSnapshot(snapshotCopy),
      () => this.writeSnapshot(snapshotCopy),
    );
    return this.saveQueue;
  }

  private async writeSnapshot(snapshot: SupervisorSnapshot): Promise<void> {
    await mkdir(dirname(this.snapshotPath), { recursive: true });
    const persisted: PersistedSnapshot = { version: 1, ...snapshot };
    const tempPath = `${this.snapshotPath}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(persisted, null, 2)}\n`, "utf8");
    await rename(tempPath, this.snapshotPath);
  }

  async appendTranscript(record: TranscriptRecord): Promise<void> {
    await mkdir(this.transcriptDir, { recursive: true });
    const path = this.transcriptPath(record.terminalSessionId);
    await appendFile(path, `${JSON.stringify(record)}\n`, "utf8");
    await this.enforceTranscriptBound(path);
  }

  async searchTranscripts(
    query: string,
    options: TranscriptSearchOptions = {},
  ): Promise<TranscriptSearchResult[]> {
    const normalizedQuery = query.toLocaleLowerCase();
    const limit = options.limit ?? 50;
    const results: TranscriptSearchResult[] = [];

    let files: string[];
    try {
      files = await readdir(this.transcriptDir);
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") return [];
      throw error;
    }

    for (const file of files.filter((candidate) => candidate.endsWith(".jsonl")).sort()) {
      const path = join(this.transcriptDir, file);
      const content = await readFile(path, "utf8");
      for (const line of content.split("\n")) {
        if (!line.trim()) continue;
        const record = parseTranscriptRecord(line);
        if (!record) continue;
        if (options.workspaceId && record.workspaceId !== options.workspaceId) continue;
        if (!record.data.toLocaleLowerCase().includes(normalizedQuery)) continue;
        results.push({
          terminalSessionId: record.terminalSessionId,
          ...(record.agentSessionId ? { agentSessionId: record.agentSessionId } : {}),
          sequence: record.sequence,
          createdAt: record.createdAt,
          excerpt: createExcerpt(record.data, query),
        });
        if (results.length >= limit) return results;
      }
    }

    return results;
  }

  private async enforceTranscriptBound(path: string): Promise<void> {
    const size = (await stat(path)).size;
    if (size <= this.maxTranscriptBytes) return;

    const content = await readFile(path, "utf8");
    const tail = content.slice(-this.maxTranscriptBytes);
    const firstNewline = tail.indexOf("\n");
    await writeFile(path, firstNewline >= 0 ? tail.slice(firstNewline + 1) : tail, "utf8");
  }

  private transcriptPath(terminalSessionId: TerminalSessionId): string {
    return join(this.transcriptDir, `${encodeURIComponent(terminalSessionId)}.jsonl`);
  }
}

function copyPaneLayout(layout: PaneLayoutState): PaneLayoutState {
  return {
    surfaces: layout.surfaces.map((surface) => ({ ...surface })),
    ...(layout.activeSurfaceId ? { activeSurfaceId: layout.activeSurfaceId } : {}),
  };
}

function parseTranscriptRecord(line: string): TranscriptRecord | undefined {
  try {
    const parsed = JSON.parse(line) as Partial<TranscriptRecord>;
    if (
      typeof parsed.workspaceId !== "string" ||
      typeof parsed.terminalSessionId !== "string" ||
      typeof parsed.sequence !== "number" ||
      typeof parsed.createdAt !== "string" ||
      typeof parsed.data !== "string"
    ) {
      return undefined;
    }
    return {
      workspaceId: parsed.workspaceId,
      ...(typeof parsed.agentSessionId === "string"
        ? { agentSessionId: parsed.agentSessionId }
        : {}),
      terminalSessionId: parsed.terminalSessionId,
      sequence: parsed.sequence,
      createdAt: parsed.createdAt,
      data: parsed.data,
    };
  } catch {
    return undefined;
  }
}

function createExcerpt(data: string, query: string): string {
  const index = data.toLocaleLowerCase().indexOf(query.toLocaleLowerCase());
  if (index < 0) return data.slice(0, 160);
  const start = Math.max(0, index - 60);
  const end = Math.min(data.length, index + query.length + 100);
  return `${start > 0 ? "…" : ""}${data.slice(start, end)}${end < data.length ? "…" : ""}`;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
