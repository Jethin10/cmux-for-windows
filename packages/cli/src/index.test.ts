import { describe, expect, it } from "vitest";
import { run } from "./index.js";

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

  it("validates stop modes", () => {
    expect(run(["agent", "stop", "--agent", "agent-1", "--mode", "detach"])).toMatchObject({
      exitCode: 1,
      stderr: expect.stringContaining("--mode"),
    });
  });
});
