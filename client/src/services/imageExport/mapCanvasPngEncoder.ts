const PNG_SCALE = 2;

export function createMapPngEncoder(
  width: number,
  height: number,
): (image: CanvasImageSource) => Promise<Blob> {
  const pixelWidth = width * PNG_SCALE;
  const pixelHeight = height * PNG_SCALE;
  if (!Number.isFinite(pixelWidth) || !Number.isFinite(pixelHeight)) {
    throw new RangeError("PNG canvas dimensions must be finite");
  }

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(pixelWidth);
  canvas.height = Math.ceil(pixelHeight);
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
