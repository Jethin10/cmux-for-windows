import type { TerminalSession, TerminalSessionId, WorkspaceId } from "@cmux/shared";
import type {
  PtyBroker,
  TerminalCloseMode as BrokerTerminalCloseMode,
  TerminalExitHandler,
  TerminalOutputHandler,
  TerminalSubscription,
} from "@cmux/pty";
import { createNodePtyBroker } from "@cmux/pty";
import type {
  TerminalCloseMode,
  TerminalCreateRequest,
  TerminalResizeRequest,
  TerminalWriteRequest,
} from "@cmux/ipc";

const LOCAL_TERMINAL_WORKSPACE_ID = "local-terminal-spike" as WorkspaceId;
const DEFAULT_PROFILE_ID = "default-shell";

export interface ShellProfile {
  profileId: string;
  command: string;
  args: readonly string[];
}

export interface TerminalServiceOptions {
  defaultCwd?: string;
  workspaceId?: WorkspaceId;
  resolveProfile?: (profileId: string | undefined) => ShellProfile;
}

export class TerminalService {
  private readonly defaultCwd: string;
  private readonly workspaceId: WorkspaceId;
  private readonly resolveProfile: (profileId: string | undefined) => ShellProfile;
  private readonly terminalIds = new Set<TerminalSessionId>();
  private readonly lifecycleSubscriptions = new Map<TerminalSessionId, TerminalSubscription>();

  constructor(
    private readonly broker: PtyBroker,
    options: TerminalServiceOptions = {},
  ) {
    this.defaultCwd = options.defaultCwd ?? process.cwd();
    this.workspaceId = options.workspaceId ?? LOCAL_TERMINAL_WORKSPACE_ID;
    this.resolveProfile = options.resolveProfile ?? resolveLocalShellProfile;
  }

  static async create(options: TerminalServiceOptions = {}): Promise<TerminalService> {
    return new TerminalService(await createNodePtyBroker(), options);
  }

  async createTerminal(request: TerminalCreateRequest): Promise<TerminalSession> {
    const profile = this.resolveProfile(request.profileId);
    const session = await this.broker.createTerminal({
      profileId: profile.profileId,
      command: profile.command,
      args: profile.args,
      cwd: request.cwd ?? this.defaultCwd,
      cols: request.cols,
      rows: request.rows,
      workspaceId: this.workspaceId,
    });
    this.terminalIds.add(session.id);
    const lifecycleSubscription = this.broker.subscribeExit(session.id, () => {
      this.terminalIds.delete(session.id);
      this.disposeLifecycleSubscription(session.id);
    });
    this.lifecycleSubscriptions.set(session.id, lifecycleSubscription);
    return session;
  }

  async writeTerminal(request: TerminalWriteRequest): Promise<void> {
    await this.broker.writeTerminal(request.terminalSessionId, request.data);
  }

  async resizeTerminal(request: TerminalResizeRequest): Promise<void> {
    await this.broker.resizeTerminal(request.terminalSessionId, request.cols, request.rows);
  }

  async closeTerminal(terminalId: TerminalSessionId, mode: TerminalCloseMode): Promise<void> {
    await this.broker.closeTerminal(terminalId, mode as BrokerTerminalCloseMode);
  }

  subscribeOutput(
    terminalId: TerminalSessionId,
    handler: TerminalOutputHandler,
  ): TerminalSubscription {
    return this.broker.subscribeOutput(terminalId, handler);
  }

  subscribeExit(terminalId: TerminalSessionId, handler: TerminalExitHandler): TerminalSubscription {
    return this.broker.subscribeExit(terminalId, handler);
  }

  async closeAll(mode: TerminalCloseMode = "terminate"): Promise<void> {
    const terminalIds = [...this.terminalIds];
    await Promise.allSettled(terminalIds.map((terminalId) => this.closeTerminal(terminalId, mode)));
    this.terminalIds.clear();
    for (const terminalId of terminalIds) this.disposeLifecycleSubscription(terminalId);
  }

  private disposeLifecycleSubscription(terminalId: TerminalSessionId): void {
    const subscription = this.lifecycleSubscriptions.get(terminalId);
    if (!subscription) return;
    subscription.dispose();
    this.lifecycleSubscriptions.delete(terminalId);
  }
}

export function resolveLocalShellProfile(profileId: string | undefined): ShellProfile {
  const requestedProfileId = profileId ?? DEFAULT_PROFILE_ID;

  if (process.platform === "win32") {
    if (requestedProfileId === "pwsh") {
      return { profileId: "pwsh", command: "pwsh.exe", args: ["-NoLogo"] };
    }
    if (requestedProfileId === "powershell") {
      return {
        profileId: "powershell",
        command: "powershell.exe",
        args: ["-NoLogo", "-NoExit"],
      };
    }
    if (requestedProfileId === "cmd" || requestedProfileId === DEFAULT_PROFILE_ID) {
      return {
        profileId: requestedProfileId,
        command: process.env.ComSpec || "cmd.exe",
        args: [],
      };
    }
  }

  if (requestedProfileId !== DEFAULT_PROFILE_ID) {
    throw new Error(`Unsupported terminal profile: ${requestedProfileId}`);
  }

  return {
    profileId: DEFAULT_PROFILE_ID,
    command: process.env.SHELL || "sh",
    args: [],
  };
}
