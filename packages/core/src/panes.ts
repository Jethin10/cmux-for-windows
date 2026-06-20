import type {
  PaneLayoutState,
  PaneLeafNode,
  PaneNode,
  PaneSplitDirection,
  PaneSurface,
} from "@cmux/shared";

export type {
  PaneLayoutState,
  PaneLeafNode,
  PaneNode,
  PaneSplitDirection,
  PaneSurface,
  PaneSurfaceKind,
} from "@cmux/shared";

export function openSurface(layout: PaneLayoutState, surface: PaneSurface): PaneLayoutState {
  const existing = layout.surfaces.find((candidate) => candidate.id === surface.id);
  const surfaces = existing
    ? layout.surfaces.map((candidate) => (candidate.id === surface.id ? surface : candidate))
    : [...layout.surfaces, surface];
  const rootPane = layout.rootPane
    ? existing
      ? layout.rootPane
      : addSurfaceToActiveLeaf(layout.rootPane, layout.activeSurfaceId, surface.id)
    : createLeaf("pane:root", [surface.id], surface.id);
  return { surfaces, activeSurfaceId: surface.id, rootPane };
}

export function closeSurface(layout: PaneLayoutState, surfaceId: string): PaneLayoutState {
  const surfaces = layout.surfaces.filter((surface) => surface.id !== surfaceId);
  const rootPane = layout.rootPane ? removeSurfaceFromPane(layout.rootPane, surfaceId) : undefined;
  if (layout.activeSurfaceId !== surfaceId) {
    return { ...layout, surfaces, ...(rootPane ? { rootPane } : {}) };
  }
  const activeSurfaceId = surfaces.at(-1)?.id;
  return activeSurfaceId
    ? { surfaces, activeSurfaceId, ...(rootPane ? { rootPane } : {}) }
    : { surfaces, ...(rootPane ? { rootPane } : {}) };
}

export interface SplitSurfaceOptions {
  direction: PaneSplitDirection;
  newSurface: PaneSurface;
  newPaneId: string;
  splitPaneId: string;
  focus?: boolean;
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

export function splitSurface(
  layout: PaneLayoutState,
  surfaceId: string,
  options: SplitSurfaceOptions,
): PaneLayoutState {
  if (!layout.surfaces.some((surface) => surface.id === surfaceId)) {
    throw new Error(`Unknown pane surface: ${surfaceId}`);
  }
  if (layout.surfaces.some((surface) => surface.id === options.newSurface.id)) {
    throw new Error(`Pane surface already exists: ${options.newSurface.id}`);
  }

  const surfaces = [...layout.surfaces, options.newSurface];
  const rootPane = splitPaneContainingSurface(
    layout.rootPane ??
      createLeaf(
        "pane:root",
        layout.surfaces.map((surface) => surface.id),
        surfaceId,
      ),
    surfaceId,
    options,
  );
  const activeSurfaceId = options.focus === false ? layout.activeSurfaceId : options.newSurface.id;
  return {
    surfaces,
    ...(activeSurfaceId ? { activeSurfaceId } : {}),
    rootPane,
  };
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
    ...(layout.rootPane ? { rootPane: layout.rootPane } : {}),
  };
}

function createLeaf(
  id: string,
  surfaceIds: readonly string[],
  activeSurfaceId: string | undefined,
): PaneLeafNode {
  return { id, type: "leaf", surfaceIds, ...(activeSurfaceId ? { activeSurfaceId } : {}) };
}

function addSurfaceToActiveLeaf(
  node: PaneNode,
  activeSurfaceId: string | undefined,
  surfaceId: string,
): PaneNode {
  if (node.type === "leaf") {
    if (!activeSurfaceId || node.surfaceIds.includes(activeSurfaceId)) {
      return { ...node, surfaceIds: [...node.surfaceIds, surfaceId], activeSurfaceId: surfaceId };
    }
    return node;
  }
  return {
    ...node,
    children: node.children.map((child) =>
      addSurfaceToActiveLeaf(child, activeSurfaceId, surfaceId),
    ),
  };
}

function removeSurfaceFromPane(node: PaneNode, surfaceId: string): PaneNode | undefined {
  if (node.type === "leaf") {
    const surfaceIds = node.surfaceIds.filter((candidate) => candidate !== surfaceId);
    if (surfaceIds.length === 0) return undefined;
    const activeSurfaceId =
      node.activeSurfaceId === surfaceId ? surfaceIds.at(-1) : node.activeSurfaceId;
    return createLeaf(node.id, surfaceIds, activeSurfaceId);
  }

  const children = node.children
    .map((child) => removeSurfaceFromPane(child, surfaceId))
    .filter((child): child is PaneNode => Boolean(child));
  if (children.length === 0) return undefined;
  if (children.length === 1) return children[0];
  return { ...node, children };
}

function splitPaneContainingSurface(
  node: PaneNode,
  surfaceId: string,
  options: SplitSurfaceOptions,
): PaneNode {
  if (node.type === "leaf") {
    if (!node.surfaceIds.includes(surfaceId)) return node;
    const sibling = createLeaf(options.newPaneId, [options.newSurface.id], options.newSurface.id);
    return {
      id: options.splitPaneId,
      type: "split",
      direction: options.direction,
      children: [node, sibling],
    };
  }

  return {
    ...node,
    children: node.children.map((child) => splitPaneContainingSurface(child, surfaceId, options)),
  };
}
