import { createMapFileName } from "@/domain/mapLibrary/mapFileName";
import type { OutlineExportFormat } from "@/domain/outline/outlineExport";

export function downloadOutlineText(
  text: string,
  mapName: string,
  format: OutlineExportFormat,
  now = new Date(),
): void {
  const blob = new Blob([text], {
    type: format === "md" ? "text/markdown;charset=utf-8" : "text/plain;charset=utf-8",
  });
  const objectUrl = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = createMapFileName(mapName, format, now);
    anchor.click();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
