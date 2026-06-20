import type { PaneLayoutState, PaneSurface } from "@cmux/shared";

export type { PaneLayoutState, PaneSurface, PaneSurfaceKind } from "@cmux/shared";

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

export interface ReorderSurfaceOptions {
  beforeSurfaceId?: string;
  afterSurfaceId?: string;
  focus?: boolean;
}

export function focusSurface(layout: PaneLayoutState, surfaceId: string): PaneLayoutState {
  if (!layout.surfaces.some((surface) => surface.id === surfaceId)) {
    throw new Error(`Unknown pane surface: ${surfaceId}`);
  }
  return { ...layout, activeSurfaceId: surfaceId };
}

export function reorderSurface(
  layout: PaneLayoutState,
  surfaceId: string,
  options: ReorderSurfaceOptions,
): PaneLayoutState {
  if (options.beforeSurfaceId && options.afterSurfaceId) {
    throw new Error("Specify either beforeSurfaceId or afterSurfaceId, not both");
  }

  const surface = layout.surfaces.find((candidate) => candidate.id === surfaceId);
  if (!surface) throw new Error(`Unknown pane surface: ${surfaceId}`);

  const remaining = layout.surfaces.filter((candidate) => candidate.id !== surfaceId);
  let insertIndex = remaining.length;

  if (options.beforeSurfaceId) {
    insertIndex = remaining.findIndex((candidate) => candidate.id === options.beforeSurfaceId);
    if (insertIndex < 0) throw new Error(`Unknown pane surface: ${options.beforeSurfaceId}`);
  } else if (options.afterSurfaceId) {
    const afterIndex = remaining.findIndex((candidate) => candidate.id === options.afterSurfaceId);
    if (afterIndex < 0) throw new Error(`Unknown pane surface: ${options.afterSurfaceId}`);
    insertIndex = afterIndex + 1;
  }

  const surfaces = [...remaining.slice(0, insertIndex), surface, ...remaining.slice(insertIndex)];
  return {
    surfaces,
    ...(options.focus
      ? { activeSurfaceId: surfaceId }
      : layout.activeSurfaceId
        ? { activeSurfaceId: layout.activeSurfaceId }
        : {}),
  };
}
