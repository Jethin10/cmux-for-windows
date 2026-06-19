import type { IpcMain } from "electron";
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
  assertTranscriptSearchRequest,
  assertWorkspaceOpenRequest,
  ipcChannels,
  type AgentArchiveRequest,
  type AgentHistoryRequest,
  type AgentLaunchRequest,
  type AgentListRequest,
  type AgentRestartRequest,
  type AgentStopRequest,
  type NotificationListRequest,
  type NotificationMarkReadRequest,
  type NotificationNextUnreadRequest,
  type TranscriptSearchRequest,
  type WorkspaceOpenRequest,
} from "@cmux/ipc";
import type { SupervisorService } from "./supervisor-service.js";

export type SupervisorServiceProvider = () => Promise<SupervisorService>;

export function registerSupervisorIpc(
  ipcMain: IpcMain,
  getSupervisorService: SupervisorServiceProvider,
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

  return () => {
    ipcMain.removeHandler(ipcChannels.workspaceList);
    ipcMain.removeHandler(ipcChannels.workspaceOpen);
    ipcMain.removeHandler(ipcChannels.agentList);
    ipcMain.removeHandler(ipcChannels.agentHistory);
    ipcMain.removeHandler(ipcChannels.agentLaunch);
    ipcMain.removeHandler(ipcChannels.agentStop);
    ipcMain.removeHandler(ipcChannels.agentRestart);
    ipcMain.removeHandler(ipcChannels.agentArchive);
    ipcMain.removeHandler(ipcChannels.transcriptSearch);
    ipcMain.removeHandler(ipcChannels.notificationList);
    ipcMain.removeHandler(ipcChannels.notificationMarkRead);
    ipcMain.removeHandler(ipcChannels.notificationNextUnread);
  };
}
