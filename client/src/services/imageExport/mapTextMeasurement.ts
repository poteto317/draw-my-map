import {
  formatMapExportCanvasFont,
  type MeasureMapText,
} from "@/domain/imageExport/mapExportText";

export function createMapTextMeasurer(): MeasureMapText {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D context is unavailable");

  return (text, style) => {
    context.font = formatMapExportCanvasFont(style);
    return context.measureText(text).width;
  };
}
