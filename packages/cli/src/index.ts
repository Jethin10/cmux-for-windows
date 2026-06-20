#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  AgentLaunchRequest,
  AgentListRequest,
  AgentStopRequest,
  CliCommandEnvelope,
} from "@cmux/ipc";

export type CliEnvelope = CliCommandEnvelope;

export interface CliResult {
  exitCode: number;
  stdout?: string;
  stderr?: string;
  envelope?: CliEnvelope;
}

export function run(argv = process.argv.slice(2)): CliResult {
  if (argv.length === 0 || argv.includes("--help")) return ok(helpText());

  try {
    const { argv: commandArgv, inboxDir } = extractBridgeOptions(argv);
    const [command, ...rest] = commandArgv;
    if (!command) return ok(helpText());

    const result = commandResult(command, rest);
    return inboxDir && result.envelope ? writeEnvelopeToInbox(inboxDir, result.envelope) : result;
  } catch (error) {
    return fail(error instanceof Error ? `${error.message}\n` : `${String(error)}\n`);
  }
}

export function main(argv = process.argv.slice(2)): number {
  const result = run(argv);
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return result.exitCode;
}

function commandResult(command: string, rest: string[]): CliResult {
  if (command === "workspace") return workspaceCommand(rest);
  if (command === "agent") return agentCommand(rest);
  if (command === "version" || command === "--version") return ok("cmux 0.1.0\n");
  return fail(`Unknown command: ${command}\n\n${helpText()}`);
}

function workspaceCommand(argv: string[]): CliResult {
  const [subcommand, ...rest] = argv;
  if (subcommand !== "open") {
    return fail("Usage: cmux workspace open --path <path> [--untrusted]\n");
  }
  const flags = parseFlags(rest);
  const rootPath = requireFlag(flags, "path");
  return envelope({
    command: "workspace.open",
    payload: { rootPath, trusted: flags.untrusted !== "true" },
  });
}

function agentCommand(argv: string[]): CliResult {
  const [subcommand, ...rest] = argv;
  const flags = parseFlags(rest);

  if (subcommand === "list") {
    return envelope({
      command: "agent.list",
      payload: { workspaceId: requireFlag(flags, "workspace") as AgentListRequest["workspaceId"] },
    });
  }

  if (subcommand === "launch") {
    return envelope({
      command: "agent.launch",
      payload: {
        workspaceId: requireFlag(flags, "workspace") as AgentLaunchRequest["workspaceId"],
        templateId: requireFlag(flags, "template"),
        title: requireFlag(flags, "title"),
        ...(flags.prompt ? { prompt: flags.prompt } : {}),
      },
    });
  }

  if (subcommand === "stop") {
    return envelope({
      command: "agent.stop",
      payload: {
        agentSessionId: requireFlag(flags, "agent") as AgentStopRequest["agentSessionId"],
        mode: parseStopMode(flags.mode),
      },
    });
  }

  return fail("Usage: cmux agent <list|launch|stop> [options]\n");
}

function parseStopMode(value: string | undefined): AgentStopRequest["mode"] {
  if (!value) return "terminate";
  if (value === "interrupt" || value === "terminate" || value === "kill-process-tree") return value;
  throw new Error("--mode must be interrupt, terminate, or kill-process-tree");
}

function parseFlags(argv: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith("--")) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      flags[key] = "true";
      continue;
    }
    flags[key] = next;
    index += 1;
  }
  return flags;
}

function requireFlag(flags: Record<string, string>, key: string): string {
  const value = flags[key];
  if (!value || value === "true") throw new Error(`Missing required --${key}`);
  return value;
}

function envelope(value: CliEnvelope): CliResult {
  return { ...ok(`${JSON.stringify(value, null, 2)}\n`), envelope: value };
}

function extractBridgeOptions(argv: string[]): { argv: string[]; inboxDir?: string } {
  const inboxIndex = argv.indexOf("--inbox");
  if (inboxIndex >= 0) {
    const inboxDir = argv[inboxIndex + 1];
    if (!inboxDir || inboxDir.startsWith("--")) throw new Error("Missing required --inbox path");
    return { argv: [...argv.slice(0, inboxIndex), ...argv.slice(inboxIndex + 2)], inboxDir };
  }
  return process.env.CMUX_COMMAND_INBOX
    ? { argv, inboxDir: process.env.CMUX_COMMAND_INBOX }
    : { argv };
}

function writeEnvelopeToInbox(inboxDir: string, value: CliEnvelope): CliResult {
  mkdirSync(inboxDir, { recursive: true });
  const id = randomUUID();
  const path = join(inboxDir, `${Date.now()}-${id}.json`);
  writeFileSync(path, `${JSON.stringify({ id, envelope: value }, null, 2)}\n`, "utf8");
  return ok(`Queued command ${id}\n${path}\n`);
}

function ok(stdout: string): CliResult {
  return { exitCode: 0, stdout };
}

function fail(stderr: string): CliResult {
  return { exitCode: 1, stderr };
}

function helpText(): string {
  return `cmux CLI\n\nCommands:\n  cmux workspace open --path <path> [--untrusted]\n  cmux agent list --workspace <workspace-id>\n  cmux agent launch --workspace <workspace-id> --template <template-id> --title <title> [--prompt <prompt>]\n  cmux agent stop --agent <agent-session-id> [--mode interrupt|terminate|kill-process-tree]\n\nBy default the CLI emits typed command envelopes. Pass --inbox <dir> or set CMUX_COMMAND_INBOX to queue envelopes for the desktop file bridge.\n`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = main();
}
