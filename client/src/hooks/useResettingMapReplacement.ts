import { useCallback, useState } from "react";
import type { NodeMapState } from "@/types/nodeMapState";

type MapReplacement = (state: NodeMapState) => void;

export function useResettingMapReplacement(replaceMap: MapReplacement) {
  const [resetRevision, setResetRevision] = useState(0);
  const replaceMapAndReset = useCallback((state: NodeMapState) => {
    replaceMap(state);
    setResetRevision((revision) => revision + 1);
  }, [replaceMap]);

  return { replaceMapAndReset, resetRevision };
}
