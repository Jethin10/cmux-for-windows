import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { formatGitSummary, parsePorcelainV2Status } from "@cmux/core";
import type { GitStatusResponse } from "@cmux/ipc";
import type { Workspace } from "@cmux/shared";

const execFileAsync = promisify(execFile);

export type GitRunner = (cwd: string, args: readonly string[]) => Promise<string>;

export class GitService {
  constructor(private readonly runGit: GitRunner = defaultRunGit) {}

  async getStatus(workspace: Workspace): Promise<GitStatusResponse> {
    const output = await this.runGit(workspace.rootPath, [
      "status",
      "--porcelain=v2",
      "--branch",
      "--untracked-files=all",
    ]);
    const parsed = parsePorcelainV2Status(output);
    return {
      workspaceId: workspace.id,
      summary: formatGitSummary(parsed),
      ...(parsed.branch ? { branch: parsed.branch } : {}),
      ahead: parsed.ahead,
      behind: parsed.behind,
      staged: parsed.staged,
      unstaged: parsed.unstaged,
      untracked: parsed.untracked,
      conflicted: parsed.conflicted,
    };
  }
}

async function defaultRunGit(cwd: string, args: readonly string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", [...args], {
    cwd,
    windowsHide: true,
    timeout: 15_000,
    maxBuffer: 2 * 1024 * 1024,
  });
  return stdout;
}
