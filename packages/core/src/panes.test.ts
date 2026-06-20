import { describe, expect, it } from "vitest";
import {
  closeSurface,
  focusSurface,
  openSurface,
  reorderSurface,
  type PaneLayoutState,
} from "./panes.js";

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

  it("reorders surfaces without changing focus by default", () => {
    const layout: PaneLayoutState = {
      surfaces: [
        { id: "one", kind: "local-terminal", title: "One" },
        { id: "two", kind: "agent-terminal", title: "Two" },
        { id: "three", kind: "transcript", title: "Three" },
      ],
      activeSurfaceId: "one",
    };

    expect(reorderSurface(layout, "three", { beforeSurfaceId: "two" })).toEqual({
      surfaces: [
        { id: "one", kind: "local-terminal", title: "One" },
        { id: "three", kind: "transcript", title: "Three" },
        { id: "two", kind: "agent-terminal", title: "Two" },
      ],
      activeSurfaceId: "one",
    });
  });

  it("can focus a surface while reordering it", () => {
    const layout: PaneLayoutState = {
      surfaces: [
        { id: "one", kind: "local-terminal", title: "One" },
        { id: "two", kind: "agent-terminal", title: "Two" },
      ],
      activeSurfaceId: "one",
    };

    expect(reorderSurface(layout, "one", { afterSurfaceId: "two", focus: true })).toMatchObject({
      activeSurfaceId: "one",
      surfaces: [
        { id: "two", kind: "agent-terminal", title: "Two" },
        { id: "one", kind: "local-terminal", title: "One" },
      ],
    });
  });

  it("rejects focusing unknown surfaces", () => {
    expect(() => focusSurface(emptyLayout, "missing")).toThrow(/Unknown pane/);
    expect(() => reorderSurface(emptyLayout, "missing", {})).toThrow(/Unknown pane/);
  });
});
