function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function createMapJsonFileName(now: Date): string {
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `draw-my-map-${date}-${time}.json`;
}

export function downloadMapJson(json: string, now = new Date()): void {
  const blob = new Blob([json], { type: "application/json" });
  const objectUrl = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = createMapJsonFileName(now);
    anchor.click();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
