import { useCallback, useRef, useState } from "react";
import {
  INITIAL_VIEWPORT,
  isValidViewport,
  panViewport,
  type Viewport,
} from "@/components/map/mapViewport";

export function useMapViewport() {
  const [viewport, setViewportState] = useState<Viewport>(INITIAL_VIEWPORT);
  const viewportRef = useRef<Viewport>(INITIAL_VIEWPORT);

  const setViewport = useCallback((next: Viewport) => {
    if (!isValidViewport(next)) return;
    viewportRef.current = next;
    setViewportState(next);
  }, []);

  const panBy = useCallback((dx: number, dy: number) => {
    const next = panViewport(viewportRef.current, dx, dy);
    if (next !== viewportRef.current) setViewport(next);
  }, [setViewport]);

  return { viewport, viewportRef, setViewport, panBy };
}
