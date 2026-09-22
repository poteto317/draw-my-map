import type { MeasureMapText } from "@/domain/imageExport/mapExportText";

export function createMapTextMeasurer(): MeasureMapText {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D context is unavailable");

  context.font = "14px Arial, Helvetica, sans-serif";
  return (text) => context.measureText(text).width;
}
