import { describe, expect, it } from "vitest";
import type { WorkspaceId } from "@cmux/shared";
import { GitService } from "./git-service.js";

describe("GitService", () => {
  it("returns formatted git status summaries for workspaces", async () => {
    const service = new GitService(async () =>
      ["# branch.head main", "# branch.ab +2 -1", "1 M. N... file.ts", "? new.ts"].join("\n"),
    );

    await expect(
      service.getStatus({
        id: "workspace-1" as WorkspaceId,
        name: "repo",
        rootPath: "C:/repo",
        trusted: true,
        createdAt: "2026-06-20T00:00:00.000Z",
        updatedAt: "2026-06-20T00:00:00.000Z",
        unreadCount: 0,
      }),
    ).resolves.toMatchObject({
      workspaceId: "workspace-1",
      summary: "main · ↑2 · ↓1 · 1 staged · 1 untracked",
      branch: "main",
      ahead: 2,
      behind: 1,
      staged: 1,
      untracked: 1,
    });
  });
});
