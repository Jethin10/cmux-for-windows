import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import type { TerminalSessionId, WorkspaceId } from "@cmux/shared";
import { FileSupervisorStore } from "./persistent-store.js";

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "cmux-store-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("FileSupervisorStore", () => {
  it("persists and restores supervisor snapshots", async () => {
    const dir = await createTempDir();
    const store = new FileSupervisorStore(dir);

    await store.saveSnapshot({
      workspaces: [
        {
          id: "workspace-1" as WorkspaceId,
          name: "repo",
          rootPath: "C:/repo",
          trusted: true,
          createdAt: "2026-06-20T00:00:00.000Z",
          updatedAt: "2026-06-20T00:00:00.000Z",
          unreadCount: 0,
        },
      ],
      agents: [],
      paneLayouts: [
        {
          workspaceId: "workspace-1" as WorkspaceId,
          layout: {
            surfaces: [{ id: "surface-1", kind: "transcript", title: "Logs" }],
            activeSurfaceId: "surface-1",
          },
        },
      ],
    });

    await expect(store.loadSnapshot()).resolves.toMatchObject({
      workspaces: [{ id: "workspace-1", rootPath: "C:/repo" }],
      agents: [],
      paneLayouts: [
        {
          workspaceId: "workspace-1",
          layout: { surfaces: [{ id: "surface-1", kind: "transcript" }] },
        },
      ],
    });
  });

  it("appends bounded transcript records and searches excerpts", async () => {
    const dir = await createTempDir();
    const store = new FileSupervisorStore(dir, 512);

    await store.appendTranscript({
      workspaceId: "workspace-1" as WorkspaceId,
      terminalSessionId: "terminal-1" as TerminalSessionId,
      sequence: 1,
      createdAt: "2026-06-20T00:00:00.000Z",
      data: "first line\n",
    });
    await store.appendTranscript({
      workspaceId: "workspace-1" as WorkspaceId,
      terminalSessionId: "terminal-1" as TerminalSessionId,
      sequence: 2,
      createdAt: "2026-06-20T00:00:01.000Z",
      data: "tests failed with useful detail",
    });

    await expect(
      store.searchTranscripts("failed", { workspaceId: "workspace-1" as WorkspaceId }),
    ).resolves.toEqual([
      expect.objectContaining({
        terminalSessionId: "terminal-1",
        sequence: 2,
        excerpt: expect.stringContaining("failed"),
      }),
    ]);
  });
});
