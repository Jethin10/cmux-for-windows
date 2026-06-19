import { describe, expect, it } from "vitest";
import { createApprovalRequest, inferApprovalRisk, resolveApproval } from "./approvals.js";

describe("approval requests", () => {
  it("creates pending requests and resolves once", () => {
    const request = createApprovalRequest({
      id: "approval-1",
      agentSessionId: "agent-1",
      title: "Run command",
      body: "npm install",
      risk: "medium",
      createdAt: "2026-06-20T00:00:00.000Z",
    });

    expect(request.status).toBe("pending");
    const approved = resolveApproval(request, "approved", "user", "2026-06-20T00:00:01.000Z");
    expect(approved).toMatchObject({ status: "approved", resolvedBy: "user" });
    expect(() => resolveApproval(approved, "denied", "user")).toThrow(/Cannot resolve/);
  });

  it("infers risky commands", () => {
    expect(inferApprovalRisk("please rm -rf node_modules")).toBe("high");
    expect(inferApprovalRisk("can I modify package.json?")).toBe("medium");
    expect(inferApprovalRisk("read the README")).toBe("low");
  });
});
