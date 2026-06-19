export type PaneSurfaceKind = "local-terminal" | "agent-terminal" | "transcript" | "browser";

export interface PaneSurface {
  id: string;
  kind: PaneSurfaceKind;
  title: string;
  agentSessionId?: string;
  terminalSessionId?: string;
}

export interface PaneLayoutState {
  surfaces: readonly PaneSurface[];
  activeSurfaceId?: string;
}

export function openSurface(layout: PaneLayoutState, surface: PaneSurface): PaneLayoutState {
  const existing = layout.surfaces.find((candidate) => candidate.id === surface.id);
  const surfaces = existing
    ? layout.surfaces.map((candidate) => (candidate.id === surface.id ? surface : candidate))
    : [...layout.surfaces, surface];
  return { surfaces, activeSurfaceId: surface.id };
}

export function closeSurface(layout: PaneLayoutState, surfaceId: string): PaneLayoutState {
  const surfaces = layout.surfaces.filter((surface) => surface.id !== surfaceId);
  if (layout.activeSurfaceId !== surfaceId) return { ...layout, surfaces };
  const activeSurfaceId = surfaces.at(-1)?.id;
  return activeSurfaceId ? { surfaces, activeSurfaceId } : { surfaces };
}

export function focusSurface(layout: PaneLayoutState, surfaceId: string): PaneLayoutState {
  if (!layout.surfaces.some((surface) => surface.id === surfaceId)) {
    throw new Error(`Unknown pane surface: ${surfaceId}`);
  }
  return { ...layout, activeSurfaceId: surfaceId };
}
