import { describe, expect, it } from "vitest";
import { closeSurface, focusSurface, openSurface, type PaneLayoutState } from "./panes.js";

const emptyLayout: PaneLayoutState = { surfaces: [] };

describe("pane layout state", () => {
  it("opens new surfaces and focuses them", () => {
    const layout = openSurface(emptyLayout, {
      id: "local",
      kind: "local-terminal",
      title: "Local shell",
    });

    expect(layout).toEqual({
      surfaces: [{ id: "local", kind: "local-terminal", title: "Local shell" }],
      activeSurfaceId: "local",
    });
  });

  it("updates an existing surface instead of duplicating it", () => {
    const first = openSurface(emptyLayout, {
      id: "agent-1",
      kind: "agent-terminal",
      title: "Old title",
    });
    const second = openSurface(first, {
      id: "agent-1",
      kind: "agent-terminal",
      title: "New title",
    });

    expect(second.surfaces).toEqual([
      { id: "agent-1", kind: "agent-terminal", title: "New title" },
    ]);
  });

  it("moves focus when closing the active surface", () => {
    const layout = openSurface(
      openSurface(emptyLayout, { id: "one", kind: "local-terminal", title: "One" }),
      { id: "two", kind: "agent-terminal", title: "Two" },
    );

    expect(closeSurface(layout, "two")).toMatchObject({ activeSurfaceId: "one" });
  });

  it("rejects focusing unknown surfaces", () => {
    expect(() => focusSurface(emptyLayout, "missing")).toThrow(/Unknown pane/);
  });
});
