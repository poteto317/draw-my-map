export function calculateCoverCrop(width: number, height: number) {
  const size = Math.min(width, height);
  return { sx: (width - size) / 2, sy: (height - size) / 2, size };
}
