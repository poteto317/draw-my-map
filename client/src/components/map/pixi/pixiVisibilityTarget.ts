import type { MapVisibilityTarget } from "@/components/map/pixi/mapVisibilityAnimator";
import type { Container, Graphics } from "pixi.js";

export function createNodeVisibilityTarget(
  key: string,
  container: Container,
): MapVisibilityTarget {
  return {
    key,
    setOpacity: (value) => {
      container.alpha = value;
    },
    setInteractive: (enabled) => {
      container.eventMode = enabled ? "static" : "none";
      container.cursor = enabled ? "pointer" : "default";
    },
    setRendered: (rendered) => {
      container.visible = rendered;
    },
  };
}

export function createEdgeVisibilityTarget(
  key: string,
  edge: Graphics,
): MapVisibilityTarget {
  return {
    key,
    setOpacity: (value) => {
      edge.alpha = value;
    },
    setInteractive: () => {
      edge.eventMode = "none";
    },
    setRendered: (rendered) => {
      edge.visible = rendered;
    },
  };
}
