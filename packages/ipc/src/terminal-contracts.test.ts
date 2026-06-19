import { describe, expect, it } from "vitest";
import {
  assertTerminalCloseRequest,
  assertTerminalCreateRequest,
  assertTerminalResizeRequest,
  assertTerminalSubscriptionRequest,
  assertTerminalWriteRequest,
} from "./index.js";

describe("terminal IPC request validation", () => {
  it("accepts valid terminal lifecycle payloads", () => {
    expect(() => assertTerminalCreateRequest({ cols: 80, rows: 24 })).not.toThrow();
    expect(() =>
      assertTerminalWriteRequest({ terminalSessionId: "terminal-1", data: "echo hello\r" }),
    ).not.toThrow();
    expect(() =>
      assertTerminalResizeRequest({ terminalSessionId: "terminal-1", cols: 120, rows: 40 }),
    ).not.toThrow();
    expect(() =>
      assertTerminalCloseRequest({ terminalSessionId: "terminal-1", mode: "terminate" }),
    ).not.toThrow();
    expect(() =>
      assertTerminalSubscriptionRequest({ terminalSessionId: "terminal-1" }),
    ).not.toThrow();
  });

  it("rejects invalid create and resize sizes before ConPTY", () => {
    expect(() => assertTerminalCreateRequest({ cols: 0, rows: 24 })).toThrow(/size/);
    expect(() =>
      assertTerminalResizeRequest({ terminalSessionId: "terminal-1", cols: 80, rows: 0 }),
    ).toThrow(/size/);
  });

  it("rejects invalid writes and close modes", () => {
    expect(() => assertTerminalWriteRequest({ terminalSessionId: "terminal-1", data: "" })).toThrow(
      /data/,
    );
    expect(() =>
      assertTerminalCloseRequest({ terminalSessionId: "terminal-1", mode: "SIGKILL" }),
    ).toThrow(/mode/);
  });
});
