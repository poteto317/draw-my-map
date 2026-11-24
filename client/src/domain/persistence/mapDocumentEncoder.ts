import {
  projectGroups,
  projectRelations,
} from "@/domain/map/relationGroupModel";
import { projectMapDocumentLayoutSpacing } from "@/domain/persistence/mapDocumentLayoutSpacing";
import { projectMapDocumentNode } from "@/domain/persistence/mapDocumentNodeProjection";
import { projectMapDocumentTreeDirection } from "@/domain/persistence/mapDocumentTreeDirection";
import { projectBranchLayouts, type BranchLayout } from "@/types/branchLayout";
import { projectLayoutStyle, type LayoutStyle } from "@/types/layoutStyle";
import type { MapDocument, MapDocumentV3 } from "@/types/mapDocument";
import type { MapGroup } from "@/types/mapGroup";
import type { MapRelation } from "@/types/mapRelation";
import type { Node } from "@/types/node";
import type { NodeLayoutMode } from "@/types/nodeLayout";
import type { LayoutSpacing } from "@/types/layoutSpacing";
import type { TreeDirection } from "@/types/treeDirection";

function projectMapDocument(
  nodes: readonly Node[],
  layoutMode: NodeLayoutMode,
  treeDirection?: TreeDirection,
  layoutSpacing?: LayoutSpacing,
  layoutStyle?: LayoutStyle,
  branchLayouts?: readonly BranchLayout[],
  relations?: readonly MapRelation[],
  groups?: readonly MapGroup[],
): MapDocumentV3 {
  return {
    version: 3,
    layoutMode,
    nodes: nodes.map(projectMapDocumentNode),
    ...projectMapDocumentTreeDirection(treeDirection),
    ...projectMapDocumentLayoutSpacing(layoutSpacing),
    ...projectLayoutStyle(layoutStyle),
    ...projectBranchLayouts(branchLayouts),
    ...projectRelations(relations),
    ...projectGroups(groups),
  };
}

export function createMapDocument(
  nodes: readonly Node[],
  layoutMode: NodeLayoutMode,
  options?: Pick<
    MapDocumentV3,
    "treeDirection" | "layoutSpacing" | "layoutStyle" | "branchLayouts" | "relations" | "groups"
  >,
): MapDocumentV3 {
  return projectMapDocument(
    nodes,
    layoutMode,
    options?.treeDirection,
    options?.layoutSpacing,
    options?.layoutStyle,
    options?.branchLayouts,
    options?.relations,
    options?.groups,
  );
}

export function serializeMapDocument(document: MapDocument): string {
  return `${JSON.stringify(
    projectMapDocument(
      document.nodes,
      document.layoutMode,
      document.treeDirection,
      document.layoutSpacing,
      document.layoutStyle,
      document.branchLayouts,
      document.relations,
      document.groups,
    ),
    null,
    2,
  )}\n`;
}
