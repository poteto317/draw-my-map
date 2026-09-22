function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function createMapImageFileName(
  extension: "svg" | "png",
  now = new Date(),
): string {
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `draw-my-map-${date}-${time}.${extension}`;
}

export function createMapSvgBlob(svg: string): Blob {
  return new Blob([svg], { type: "image/svg+xml" });
}

export function downloadMapImage(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = fileName;
    anchor.click();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
