import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { run } from "./index.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "cmux-cli-"));
  tempDirs.push(dir);
  return dir;
}

describe("cmux CLI", () => {
  it("prints help", () => {
    expect(run(["--help"])).toMatchObject({
      exitCode: 0,
      stdout: expect.stringContaining("cmux CLI"),
    });
  });

  it("builds workspace open envelopes", () => {
    const result = run(["workspace", "open", "--path", "C:/repo"]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout!)).toEqual({
      command: "workspace.open",
      payload: { rootPath: "C:/repo", trusted: true },
    });
  });

  it("builds agent launch envelopes", () => {
    const result = run([
      "agent",
      "launch",
      "--workspace",
      "workspace-1",
      "--template",
      "template-pi",
      "--title",
      "Pi",
      "--prompt",
      "fix tests",
    ]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout!)).toEqual({
      command: "agent.launch",
      payload: {
        workspaceId: "workspace-1",
        templateId: "template-pi",
        title: "Pi",
        prompt: "fix tests",
      },
    });
  });

  it("queues envelopes to a desktop bridge inbox", async () => {
    const inbox = await createTempDir();
    const result = run(["workspace", "open", "--path", "C:/repo", "--inbox", inbox]);

    expect(result).toMatchObject({
      exitCode: 0,
      stdout: expect.stringContaining("Queued command"),
    });
    const [file] = await readdir(inbox);
    const queued = JSON.parse(await readFile(join(inbox, file!), "utf8"));
    expect(queued).toMatchObject({
      id: expect.any(String),
      envelope: { command: "workspace.open", payload: { rootPath: "C:/repo" } },
    });
  });

  it("validates stop modes", () => {
    expect(run(["agent", "stop", "--agent", "agent-1", "--mode", "detach"])).toMatchObject({
      exitCode: 1,
      stderr: expect.stringContaining("--mode"),
    });
  });
});
