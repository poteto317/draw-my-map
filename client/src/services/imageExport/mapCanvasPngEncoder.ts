const PNG_SCALE = 2;
const MAX_CANVAS_ATTRIBUTE_DIMENSION = 2 ** 32 - 1;

function getCanvasPixelDimension(dimension: number): number {
  const pixelDimension = Math.ceil(dimension * PNG_SCALE);
  if (!Number.isFinite(pixelDimension)) {
    throw new RangeError("PNG canvas dimensions must be finite");
  }
  if (pixelDimension > MAX_CANVAS_ATTRIBUTE_DIMENSION) {
    throw new RangeError("PNG canvas dimensions are unsupported");
  }
  return pixelDimension;
}

export function createMapPngEncoder(
  width: number,
  height: number,
): (image: CanvasImageSource) => Promise<Blob> {
  const pixelWidth = getCanvasPixelDimension(width);
  const pixelHeight = getCanvasPixelDimension(height);

  const canvas = document.createElement("canvas");
  canvas.width = pixelWidth;
  canvas.height = pixelHeight;
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    throw new RangeError("PNG canvas dimensions are unsupported");
  }
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
