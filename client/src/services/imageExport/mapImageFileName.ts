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
