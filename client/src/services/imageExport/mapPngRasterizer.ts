import { createMapSvgBlob } from "@/services/imageExport/mapImageDownload";

const PNG_SCALE = 2;

export async function rasterizeMapSvgToPng(
  svg: string,
  width: number,
  height: number,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = width * PNG_SCALE;
  canvas.height = height * PNG_SCALE;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas 2D context is unavailable");
  }
  context.scale(PNG_SCALE, PNG_SCALE);

  const objectUrl = URL.createObjectURL(createMapSvgBlob(svg));
  const image = new Image();

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (complete: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      URL.revokeObjectURL(objectUrl);
      complete();
    };

    image.onerror = () => {
      finish(() => reject(new Error("Failed to load SVG image")));
    };
    image.onload = () => {
      try {
        context.drawImage(image, 0, 0, width, height);
      } catch (error) {
        finish(() => reject(error));
        return;
      }
      canvas.toBlob((blob) => {
        if (!blob) {
          finish(() => reject(new Error("Failed to create PNG blob")));
          return;
        }
        finish(() => resolve(blob));
      }, "image/png");
    };
    image.src = objectUrl;
  });
}
