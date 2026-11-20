import type { ResolutionFilterMode, ResolutionLevel } from "@/types/nodeResolution";
import type { Viewport } from "@/types/viewport";

export type MapViewSnapshot = {
  viewport: Viewport;
  selectedNodeId: number | null;
  selectedNodeIds: readonly number[];
  focusRootId: number | null;
  collapsedNodeIds: readonly number[];
  resolutionMode: ResolutionFilterMode;
  autoResolutionLevel: ResolutionLevel;
};
