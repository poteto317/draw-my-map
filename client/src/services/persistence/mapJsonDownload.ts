import { createMapFileName } from "@/domain/mapLibrary/mapFileName";

export function createMapJsonFileName(mapName: string, now: Date): string {
  return createMapFileName(mapName, "json", now);
}

export function downloadMapJson(json: string, mapName: string, now = new Date()): void {
  const blob = new Blob([json], { type: "application/json" });
  const objectUrl = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = createMapJsonFileName(mapName, now);
    anchor.click();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
