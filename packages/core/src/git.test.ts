import { describe, expect, it } from "vitest";
import { formatGitSummary, parsePorcelainV2Status } from "./git.js";

describe("git porcelain v2 parsing", () => {
  it("summarizes branch and file state", () => {
    const summary = parsePorcelainV2Status(`# branch.oid abc123
# branch.head main
# branch.ab +2 -1
1 M. N... 100644 100644 100644 a b file-a.ts
1 .M N... 100644 100644 100644 a b file-b.ts
? new-file.ts
u UU N... 100644 100644 100644 100644 a b c d conflicted.ts
`);

    expect(summary).toEqual({
      branch: "main",
      ahead: 2,
      behind: 1,
      staged: 1,
      unstaged: 1,
      untracked: 1,
      conflicted: 1,
    });
    expect(formatGitSummary(summary)).toBe(
      "main · ↑2 · ↓1 · 1 staged · 1 changed · 1 untracked · 1 conflicted",
    );
  });
});
