const PNG_SCALE = 2;

export function createMapPngEncoder(
  width: number,
  height: number,
): (image: CanvasImageSource) => Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = width * PNG_SCALE;
  canvas.height = height * PNG_SCALE;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas 2D context is unavailable");
  }
  context.scale(PNG_SCALE, PNG_SCALE);

  return (image) => new Promise((resolve, reject) => {
    context.drawImage(image, 0, 0, width, height);
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Failed to create PNG blob"));
        return;
      }
      resolve(blob);
    }, "image/png");
  });
}
