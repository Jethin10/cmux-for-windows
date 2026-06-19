export type ApprovalStatus = "pending" | "approved" | "denied" | "expired";
export type ApprovalRisk = "low" | "medium" | "high";

export interface ApprovalRequest {
  id: string;
  agentSessionId: string;
  title: string;
  body: string;
  risk: ApprovalRisk;
  status: ApprovalStatus;
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
}

export function createApprovalRequest(
  input: Omit<ApprovalRequest, "status" | "createdAt"> & { createdAt?: string },
): ApprovalRequest {
  return {
    ...input,
    status: "pending",
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}

export function resolveApproval(
  request: ApprovalRequest,
  status: Extract<ApprovalStatus, "approved" | "denied" | "expired">,
  resolvedBy: string,
  resolvedAt = new Date().toISOString(),
): ApprovalRequest {
  if (request.status !== "pending") {
    throw new Error(`Cannot resolve approval ${request.id} from ${request.status}`);
  }
  return { ...request, status, resolvedBy, resolvedAt };
}

export function inferApprovalRisk(text: string): ApprovalRisk {
  if (/\b(rm\s+-rf|format|delete|drop\s+database|force\s+push|taskkill)\b/i.test(text)) {
    return "high";
  }
  if (/\b(write|modify|commit|push|install|approve)\b/i.test(text)) return "medium";
  return "low";
}
