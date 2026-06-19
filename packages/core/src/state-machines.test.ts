import { describe, expect, it } from "vitest";
import { assertTerminalTransition, canTransitionTerminal, detectAgentAttention } from "./index.js";

describe("terminal state machine", () => {
  it("allows expected lifecycle transitions", () => {
    expect(canTransitionTerminal("starting", "running")).toBe(true);
    expect(canTransitionTerminal("running", "closing")).toBe(true);
    expect(canTransitionTerminal("exited", "disposed")).toBe(true);
  });

  it("rejects invalid lifecycle transitions", () => {
    expect(() => assertTerminalTransition("disposed", "running")).toThrow(/Invalid terminal/);
  });
});

describe("agent attention detection", () => {
  it("detects waiting prompts", () => {
    expect(detectAgentAttention("Approve? yes/no")).toMatchObject({ status: "waiting" });
  });

  it("detects failed output", () => {
    expect(detectAgentAttention("Tests failed in package core")).toMatchObject({
      status: "failed",
    });
  });
});
