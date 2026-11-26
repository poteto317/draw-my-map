import { useMemo } from "react";
import { getMapExportBounds } from "@/domain/imageExport/mapExportBounds";
import { calculateMapPrintLayout, MapPrintLayoutError } from "@/domain/printExport/mapPrintLayout";
import {
  EMPTY_MAP_PRINT_MESSAGE,
  MAP_PRINT_FAILURE_MESSAGES,
} from "@/domain/printExport/mapPrintMessages";
import { isValidMapPrintMargin } from "@/domain/printExport/mapPrintSettings";
import { createMapTextMeasurer } from "@/services/imageExport/mapTextMeasurement";
import type { MapPrintLayout, MapPrintSettings } from "@/types/mapPrintExport";
import type { Node } from "@/types/node";

type UseMapPrintPreviewOptions = {
  nodes: readonly Node[];
  settings: MapPrintSettings;
  unavailableReason: string | undefined;
};

type MapPrintPreview = {
  layout: MapPrintLayout | undefined;
  error: string | undefined;
};

function measurePrintBounds(nodes: readonly Node[]) {
  if (nodes.length === 0) return null;
  try {
    // SVG出力と同じテキスト計測と境界を使ってページ数を求める。
    return getMapExportBounds(nodes, createMapTextMeasurer());
  } catch {
    return null;
  }
}

export function useMapPrintPreview({
  nodes, settings, unavailableReason,
}: UseMapPrintPreviewOptions): MapPrintPreview {
  const bounds = useMemo(() => measurePrintBounds(nodes), [nodes]);

  if (unavailableReason !== undefined) {
    return { layout: undefined, error: unavailableReason };
  }
  if (nodes.length === 0) {
    return { layout: undefined, error: EMPTY_MAP_PRINT_MESSAGE };
  }
  if (!bounds) {
    return { layout: undefined, error: MAP_PRINT_FAILURE_MESSAGES.preparation };
  }
  if (!Object.values(settings.margins).every(isValidMapPrintMargin)) {
    // 余白の通知はフォーム側で入力欄に関連付ける。
    return { layout: undefined, error: undefined };
  }

  try {
    return {
      layout: calculateMapPrintLayout(bounds.width, bounds.height, settings),
      error: undefined,
    };
  } catch (error) {
    const reason = error instanceof MapPrintLayoutError ? error.reason : "preparation";
    return { layout: undefined, error: MAP_PRINT_FAILURE_MESSAGES[reason] };
  }
}
