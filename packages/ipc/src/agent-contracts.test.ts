import { describe, expect, it } from "vitest";
import {
  assertAgentArchiveRequest,
  assertAgentHistoryRequest,
  assertAgentLaunchRequest,
  assertAgentListRequest,
  assertAgentRestartRequest,
  assertAgentStopRequest,
  assertNotificationListRequest,
  assertNotificationMarkReadRequest,
  assertNotificationNextUnreadRequest,
  assertPaneLayoutGetRequest,
  assertPaneSurfaceCloseRequest,
  assertPaneSurfaceFocusRequest,
  assertPaneSurfaceOpenRequest,
  assertTranscriptSearchRequest,
  assertWorkspaceOpenRequest,
} from "./index.js";

describe("workspace and agent IPC request validation", () => {
  it("accepts valid workspace and agent payloads", () => {
    expect(() => assertWorkspaceOpenRequest({ rootPath: "C:/repo", trusted: true })).not.toThrow();
    expect(() => assertAgentListRequest({ workspaceId: "workspace-1" })).not.toThrow();
    expect(() => assertAgentHistoryRequest({ workspaceId: "workspace-1" })).not.toThrow();
    expect(() =>
      assertAgentLaunchRequest({
        workspaceId: "workspace-1",
        templateId: "template-pi",
        title: "Pi in repo",
        prompt: "fix tests",
      }),
    ).not.toThrow();
    expect(() =>
      assertAgentStopRequest({ agentSessionId: "agent-1", mode: "terminate" }),
    ).not.toThrow();
    expect(() => assertAgentRestartRequest({ agentSessionId: "agent-1" })).not.toThrow();
    expect(() => assertAgentArchiveRequest({ agentSessionId: "agent-1" })).not.toThrow();
    expect(() =>
      assertTranscriptSearchRequest({ workspaceId: "workspace-1", query: "failed", limit: 20 }),
    ).not.toThrow();
    expect(() => assertNotificationListRequest({ workspaceId: "workspace-1" })).not.toThrow();
    expect(() =>
      assertNotificationMarkReadRequest({ notificationId: "notification-1" }),
    ).not.toThrow();
    expect(() => assertNotificationNextUnreadRequest({ workspaceId: "workspace-1" })).not.toThrow();
    expect(() => assertPaneLayoutGetRequest({ workspaceId: "workspace-1" })).not.toThrow();
    expect(() =>
      assertPaneSurfaceOpenRequest({
        workspaceId: "workspace-1",
        surface: {
          id: "surface-1",
          kind: "agent-terminal",
          title: "Pi",
          agentSessionId: "agent-1",
          terminalSessionId: "terminal-1",
        },
      }),
    ).not.toThrow();
    expect(() =>
      assertPaneSurfaceFocusRequest({ workspaceId: "workspace-1", surfaceId: "surface-1" }),
    ).not.toThrow();
    expect(() =>
      assertPaneSurfaceCloseRequest({ workspaceId: "workspace-1", surfaceId: "surface-1" }),
    ).not.toThrow();
  });

  it("rejects malformed agent payloads", () => {
    expect(() => assertWorkspaceOpenRequest({ rootPath: "", trusted: true })).toThrow(/rootPath/);
    expect(() => assertAgentListRequest({ workspaceId: "" })).toThrow(/workspaceId/);
    expect(() =>
      assertAgentLaunchRequest({ workspaceId: "workspace-1", templateId: "", title: "x" }),
    ).toThrow(/templateId/);
    expect(() => assertAgentStopRequest({ agentSessionId: "agent-1", mode: "detach" })).toThrow(
      /mode/,
    );
    expect(() => assertTranscriptSearchRequest({ query: "" })).toThrow(/query/);
    expect(() => assertTranscriptSearchRequest({ query: "failed", limit: 500 })).toThrow(/limit/);
    expect(() => assertNotificationMarkReadRequest({ notificationId: "" })).toThrow(
      /notificationId/,
    );
    expect(() => assertPaneLayoutGetRequest({ workspaceId: "" })).toThrow(/workspaceId/);
    expect(() =>
      assertPaneSurfaceOpenRequest({
        workspaceId: "workspace-1",
        surface: { id: "surface-1", kind: "native-view", title: "Bad" },
      }),
    ).toThrow(/kind/);
    expect(() =>
      assertPaneSurfaceFocusRequest({ workspaceId: "workspace-1", surfaceId: "" }),
    ).toThrow(/surfaceId/);
  });
});
