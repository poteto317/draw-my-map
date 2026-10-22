import { createMapFileName } from "@/domain/mapLibrary/mapFileName";

export function createMapImageFileName(
  extension: "svg" | "png",
  mapName: string,
  now = new Date(),
): string {
  return createMapFileName(mapName, extension, now);
}
