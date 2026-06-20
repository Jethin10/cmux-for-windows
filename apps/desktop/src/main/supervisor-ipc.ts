import type { IpcMain } from "electron";
import {
  assertAgentArchiveRequest,
  assertAgentBatchLaunchRequest,
  assertAgentHistoryRequest,
  assertAgentLaunchRequest,
  assertAgentListRequest,
  assertAgentRestartRequest,
  assertAgentStopRequest,
  assertApprovalListRequest,
  assertApprovalResolveRequest,
  assertBrowserSurfaceOpenRequest,
  assertGitStatusRequest,
  assertNotificationListRequest,
  assertNotificationMarkReadRequest,
  assertNotificationNextUnreadRequest,
  assertPaneLayoutGetRequest,
  assertPaneSurfaceCloseRequest,
  assertPaneSurfaceFocusRequest,
  assertPaneSurfaceOpenRequest,
  assertPaneSurfaceReorderRequest,
  assertTranscriptSearchRequest,
  assertWorkspaceOpenRequest,
  ipcChannels,
  type AgentArchiveRequest,
  type AgentBatchLaunchRequest,
  type AgentHistoryRequest,
  type AgentLaunchRequest,
  type AgentListRequest,
  type AgentRestartRequest,
  type AgentStopRequest,
  type ApprovalListRequest,
  type ApprovalResolveRequest,
  type BrowserSurfaceOpenRequest,
  type GitStatusRequest,
  type NotificationListRequest,
  type NotificationMarkReadRequest,
  type NotificationNextUnreadRequest,
  type PaneLayoutGetRequest,
  type PaneSurfaceCloseRequest,
  type PaneSurfaceFocusRequest,
  type PaneSurfaceOpenRequest,
  type PaneSurfaceReorderRequest,
  type TranscriptSearchRequest,
  type WorkspaceOpenRequest,
} from "@cmux/ipc";
import { GitService } from "./git-service.js";
import type { SupervisorService } from "./supervisor-service.js";

export type SupervisorServiceProvider = () => Promise<SupervisorService>;

export function registerSupervisorIpc(
  ipcMain: IpcMain,
  getSupervisorService: SupervisorServiceProvider,
  gitService = new GitService(),
): () => void {
  ipcMain.handle(ipcChannels.workspaceList, async () => {
    return (await getSupervisorService()).listWorkspaces();
  });

  ipcMain.handle(ipcChannels.workspaceOpen, async (_event, payload: unknown) => {
    assertWorkspaceOpenRequest(payload);
    return (await getSupervisorService()).openWorkspace(payload as WorkspaceOpenRequest);
  });

  ipcMain.handle(ipcChannels.agentList, async (_event, payload: unknown) => {
    assertAgentListRequest(payload);
    return (await getSupervisorService()).listAgents((payload as AgentListRequest).workspaceId);
  });

  ipcMain.handle(ipcChannels.agentHistory, async (_event, payload: unknown) => {
    assertAgentHistoryRequest(payload);
    return (await getSupervisorService()).listAgentHistory(
      (payload as AgentHistoryRequest).workspaceId,
    );
  });

  ipcMain.handle(ipcChannels.agentLaunch, async (_event, payload: unknown) => {
    assertAgentLaunchRequest(payload);
    return (await getSupervisorService()).launchAgent(payload as AgentLaunchRequest);
  });

  ipcMain.handle(ipcChannels.agentBatchLaunch, async (_event, payload: unknown) => {
    assertAgentBatchLaunchRequest(payload);
    return (await getSupervisorService()).launchAgentBatch(payload as AgentBatchLaunchRequest);
  });

  ipcMain.handle(ipcChannels.agentStop, async (_event, payload: unknown) => {
    assertAgentStopRequest(payload);
    return (await getSupervisorService()).stopAgent(payload as AgentStopRequest);
  });

  ipcMain.handle(ipcChannels.agentRestart, async (_event, payload: unknown) => {
    assertAgentRestartRequest(payload);
    return (await getSupervisorService()).restartAgent(
      (payload as AgentRestartRequest).agentSessionId,
    );
  });

  ipcMain.handle(ipcChannels.agentArchive, async (_event, payload: unknown) => {
    assertAgentArchiveRequest(payload);
    return (await getSupervisorService()).archiveAgent(
      (payload as AgentArchiveRequest).agentSessionId,
    );
  });

  ipcMain.handle(ipcChannels.transcriptSearch, async (_event, payload: unknown) => {
    assertTranscriptSearchRequest(payload);
    return (await getSupervisorService()).searchTranscripts(payload as TranscriptSearchRequest);
  });

  ipcMain.handle(ipcChannels.notificationList, async (_event, payload: unknown) => {
    assertNotificationListRequest(payload);
    return (await getSupervisorService()).listNotifications(
      (payload as NotificationListRequest).workspaceId,
    );
  });

  ipcMain.handle(ipcChannels.notificationMarkRead, async (_event, payload: unknown) => {
    assertNotificationMarkReadRequest(payload);
    return (await getSupervisorService()).markNotificationRead(
      (payload as NotificationMarkReadRequest).notificationId,
    );
  });

  ipcMain.handle(ipcChannels.notificationNextUnread, async (_event, payload: unknown) => {
    assertNotificationNextUnreadRequest(payload);
    return (await getSupervisorService()).nextUnreadAgent(
      (payload as NotificationNextUnreadRequest).workspaceId,
    );
  });

  ipcMain.handle(ipcChannels.approvalList, async (_event, payload: unknown) => {
    assertApprovalListRequest(payload);
    return (await getSupervisorService()).listApprovals(
      (payload as ApprovalListRequest).workspaceId,
    );
  });

  ipcMain.handle(ipcChannels.approvalResolve, async (_event, payload: unknown) => {
    assertApprovalResolveRequest(payload);
    const request = payload as ApprovalResolveRequest;
    return (await getSupervisorService()).resolveApprovalRequest(
      request.approvalId,
      request.status,
      request.resolvedBy,
    );
  });

  ipcMain.handle(ipcChannels.gitStatus, async (_event, payload: unknown) => {
    assertGitStatusRequest(payload);
    const supervisor = await getSupervisorService();
    return gitService.getStatus(supervisor.getWorkspace((payload as GitStatusRequest).workspaceId));
  });

  ipcMain.handle(ipcChannels.browserSurfaceOpen, async (_event, payload: unknown) => {
    assertBrowserSurfaceOpenRequest(payload);
    const request = payload as BrowserSurfaceOpenRequest;
    return (await getSupervisorService()).openBrowserSurface(request.workspaceId, {
      url: request.url,
      ...(request.title ? { title: request.title } : {}),
    });
  });

  ipcMain.handle(ipcChannels.paneLayoutGet, async (_event, payload: unknown) => {
    assertPaneLayoutGetRequest(payload);
    return (await getSupervisorService()).getPaneLayout(
      (payload as PaneLayoutGetRequest).workspaceId,
    );
  });

  ipcMain.handle(ipcChannels.paneSurfaceOpen, async (_event, payload: unknown) => {
    assertPaneSurfaceOpenRequest(payload);
    const request = payload as PaneSurfaceOpenRequest;
    return (await getSupervisorService()).openPaneSurface(request.workspaceId, request.surface);
  });

  ipcMain.handle(ipcChannels.paneSurfaceFocus, async (_event, payload: unknown) => {
    assertPaneSurfaceFocusRequest(payload);
    const request = payload as PaneSurfaceFocusRequest;
    return (await getSupervisorService()).focusPaneSurface(request.workspaceId, request.surfaceId);
  });

  ipcMain.handle(ipcChannels.paneSurfaceClose, async (_event, payload: unknown) => {
    assertPaneSurfaceCloseRequest(payload);
    const request = payload as PaneSurfaceCloseRequest;
    return (await getSupervisorService()).closePaneSurface(request.workspaceId, request.surfaceId);
  });

  ipcMain.handle(ipcChannels.paneSurfaceReorder, async (_event, payload: unknown) => {
    assertPaneSurfaceReorderRequest(payload);
    const request = payload as PaneSurfaceReorderRequest;
    return (await getSupervisorService()).reorderPaneSurface(
      request.workspaceId,
      request.surfaceId,
      {
        ...(request.beforeSurfaceId ? { beforeSurfaceId: request.beforeSurfaceId } : {}),
        ...(request.afterSurfaceId ? { afterSurfaceId: request.afterSurfaceId } : {}),
        ...(request.focus !== undefined ? { focus: request.focus } : {}),
      },
    );
  });

  return () => {
    ipcMain.removeHandler(ipcChannels.workspaceList);
    ipcMain.removeHandler(ipcChannels.workspaceOpen);
    ipcMain.removeHandler(ipcChannels.agentList);
    ipcMain.removeHandler(ipcChannels.agentHistory);
    ipcMain.removeHandler(ipcChannels.agentLaunch);
    ipcMain.removeHandler(ipcChannels.agentBatchLaunch);
    ipcMain.removeHandler(ipcChannels.agentStop);
    ipcMain.removeHandler(ipcChannels.agentRestart);
    ipcMain.removeHandler(ipcChannels.agentArchive);
    ipcMain.removeHandler(ipcChannels.transcriptSearch);
    ipcMain.removeHandler(ipcChannels.notificationList);
    ipcMain.removeHandler(ipcChannels.notificationMarkRead);
    ipcMain.removeHandler(ipcChannels.notificationNextUnread);
    ipcMain.removeHandler(ipcChannels.approvalList);
    ipcMain.removeHandler(ipcChannels.approvalResolve);
    ipcMain.removeHandler(ipcChannels.gitStatus);
    ipcMain.removeHandler(ipcChannels.browserSurfaceOpen);
    ipcMain.removeHandler(ipcChannels.paneLayoutGet);
    ipcMain.removeHandler(ipcChannels.paneSurfaceOpen);
    ipcMain.removeHandler(ipcChannels.paneSurfaceFocus);
    ipcMain.removeHandler(ipcChannels.paneSurfaceClose);
    ipcMain.removeHandler(ipcChannels.paneSurfaceReorder);
  };
}
