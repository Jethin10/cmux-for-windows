export interface GitStatusSummary {
  branch?: string;
  ahead: number;
  behind: number;
  staged: number;
  unstaged: number;
  untracked: number;
  conflicted: number;
}

export function parsePorcelainV2Status(output: string): GitStatusSummary {
  const summary: GitStatusSummary = {
    ahead: 0,
    behind: 0,
    staged: 0,
    unstaged: 0,
    untracked: 0,
    conflicted: 0,
  };

  for (const line of output.split("\n")) {
    if (line.startsWith("# branch.head ")) {
      const branch = line.slice("# branch.head ".length).trim();
      if (branch && branch !== "(detached)") summary.branch = branch;
      continue;
    }
    if (line.startsWith("# branch.ab ")) {
      const match = /\+(\d+)\s+-(\d+)/.exec(line);
      if (match) {
        summary.ahead = Number(match[1]);
        summary.behind = Number(match[2]);
      }
      continue;
    }
    if (line.startsWith("? ")) {
      summary.untracked += 1;
      continue;
    }
    if (line.startsWith("u ")) {
      summary.conflicted += 1;
      continue;
    }
    if (line.startsWith("1 ") || line.startsWith("2 ")) {
      const status = line.split(" ")[1] ?? "..";
      const [indexStatus, worktreeStatus] = status;
      if (indexStatus && indexStatus !== ".") summary.staged += 1;
      if (worktreeStatus && worktreeStatus !== ".") summary.unstaged += 1;
    }
  }

  return summary;
}

export function formatGitSummary(summary: GitStatusSummary): string {
  const parts = [summary.branch ?? "no branch"];
  if (summary.ahead) parts.push(`↑${summary.ahead}`);
  if (summary.behind) parts.push(`↓${summary.behind}`);
  if (summary.staged) parts.push(`${summary.staged} staged`);
  if (summary.unstaged) parts.push(`${summary.unstaged} changed`);
  if (summary.untracked) parts.push(`${summary.untracked} untracked`);
  if (summary.conflicted) parts.push(`${summary.conflicted} conflicted`);
  return parts.join(" · ");
}
