import { describe, expect, it } from "vitest";
import { defaultTemplates, findDefaultTemplate, renderTemplate } from "./templates.js";

describe("defaultTemplates", () => {
  it("includes the MVP agent and shell launchers", () => {
    expect(defaultTemplates.map((template) => template.provider)).toEqual([
      "pi",
      "claude-code",
      "codex",
      "gemini",
      "opencode",
      "shell",
      "shell",
    ]);
  });

  it("stores command and args separately", () => {
    for (const template of defaultTemplates) {
      expect(template.command).not.toContain(" ");
      expect(Array.isArray(template.argsTemplate)).toBe(true);
    }
  });
});

describe("renderTemplate", () => {
  it("renders prompt arguments without shell concatenation", () => {
    const template = findDefaultTemplate("template-pi");
    expect(template).toBeDefined();

    const rendered = renderTemplate(template!, {
      workspaceRoot: "C:/repo",
      prompt: "fix tests && do not run as shell",
    });

    expect(rendered).toEqual({
      command: "pi",
      args: ["fix tests && do not run as shell"],
      cwd: "C:/repo",
      env: {},
      provider: "pi",
    });
  });

  it("falls back to workspace root for selected-folder templates", () => {
    const template = { ...defaultTemplates[0]!, cwdMode: "selected-folder" as const };
    expect(renderTemplate(template, { workspaceRoot: "C:/repo" }).cwd).toBe("C:/repo");
  });
});
