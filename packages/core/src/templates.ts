import type { AgentProvider, Template } from "@cmux/shared";

export interface TemplateRenderContext {
  workspaceRoot: string;
  selectedFolder?: string;
  prompt?: string;
  customCwd?: string;
}

export interface RenderedTemplate {
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  provider?: AgentProvider;
}

export const defaultTemplates: readonly Template[] = [
  {
    id: "template-pi" as Template["id"],
    kind: "agent",
    name: "Pi in repo",
    provider: "pi",
    command: "pi",
    argsTemplate: ["{{prompt}}"],
    envTemplate: {},
    cwdMode: "workspace-root",
    promptMode: "argument",
    color: "#7dd3fc",
  },
  {
    id: "template-claude-code" as Template["id"],
    kind: "agent",
    name: "Claude Code in repo",
    provider: "claude-code",
    command: "claude",
    argsTemplate: ["{{prompt}}"],
    envTemplate: {},
    cwdMode: "workspace-root",
    promptMode: "argument",
    color: "#f59e0b",
  },
  {
    id: "template-codex" as Template["id"],
    kind: "agent",
    name: "Codex CLI in repo",
    provider: "codex",
    command: "codex",
    argsTemplate: ["{{prompt}}"],
    envTemplate: {},
    cwdMode: "workspace-root",
    promptMode: "argument",
    color: "#22c55e",
  },
  {
    id: "template-gemini" as Template["id"],
    kind: "agent",
    name: "Gemini CLI in repo",
    provider: "gemini",
    command: "gemini",
    argsTemplate: ["{{prompt}}"],
    envTemplate: {},
    cwdMode: "workspace-root",
    promptMode: "argument",
    color: "#a78bfa",
  },
  {
    id: "template-opencode" as Template["id"],
    kind: "agent",
    name: "OpenCode in repo",
    provider: "opencode",
    command: "opencode",
    argsTemplate: ["{{prompt}}"],
    envTemplate: {},
    cwdMode: "workspace-root",
    promptMode: "argument",
    color: "#fb7185",
  },
  {
    id: "template-powershell" as Template["id"],
    kind: "shell",
    name: "PowerShell task",
    provider: "shell",
    command: "pwsh.exe",
    argsTemplate: ["-NoLogo"],
    envTemplate: {},
    cwdMode: "workspace-root",
    promptMode: "none",
    color: "#60a5fa",
  },
  {
    id: "template-npm-test-watch" as Template["id"],
    kind: "shell",
    name: "npm test watcher",
    provider: "shell",
    command: "npm.cmd",
    argsTemplate: ["test", "--", "--watch"],
    envTemplate: {},
    cwdMode: "workspace-root",
    promptMode: "none",
    color: "#ef4444",
  },
];

export function renderTemplate(
  template: Template,
  context: TemplateRenderContext,
): RenderedTemplate {
  const cwd = resolveTemplateCwd(template, context);
  const args = template.argsTemplate
    .map((arg) => renderTokenizedString(arg, context))
    .filter((arg) => arg.length > 0);

  return {
    command: template.command,
    args,
    cwd,
    env: renderEnv(template.envTemplate, context),
    ...(template.provider ? { provider: template.provider } : {}),
  };
}

export function findDefaultTemplate(templateId: string): Template | undefined {
  return defaultTemplates.find((template) => template.id === templateId);
}

function resolveTemplateCwd(template: Template, context: TemplateRenderContext): string {
  if (template.cwdMode === "workspace-root") return context.workspaceRoot;
  if (template.cwdMode === "selected-folder")
    return context.selectedFolder ?? context.workspaceRoot;
  const customCwd = context.customCwd?.trim();
  if (!customCwd) throw new Error(`Template ${template.name} requires custom cwd`);
  return customCwd;
}

function renderEnv(
  envTemplate: Readonly<Record<string, string>>,
  context: TemplateRenderContext,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(envTemplate).map(([key, value]) => [key, renderTokenizedString(value, context)]),
  );
}

function renderTokenizedString(value: string, context: TemplateRenderContext): string {
  return value
    .replaceAll("{{workspaceRoot}}", context.workspaceRoot)
    .replaceAll("{{selectedFolder}}", context.selectedFolder ?? context.workspaceRoot)
    .replaceAll("{{prompt}}", context.prompt ?? "");
}
