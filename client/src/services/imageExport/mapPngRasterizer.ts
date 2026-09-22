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

  return new Promise((resolve, reject) => {
    let state: "loading" | "encoding" | "settled" = "loading";
    let image: HTMLImageElement | undefined;

    const detachImageHandlers = () => {
      if (!image) {
        return;
      }
      image.onload = null;
      image.onerror = null;
    };
    const finish = (complete: () => void) => {
      if (state === "settled") {
        return;
      }
      state = "settled";
      detachImageHandlers();
      URL.revokeObjectURL(objectUrl);
      complete();
    };
    const fail = (error: unknown) => {
      finish(() => reject(error));
    };

    try {
      const loadedImage = new Image();
      image = loadedImage;
      loadedImage.onerror = () => {
        if (state !== "loading") {
          return;
        }
        fail(new Error("Failed to load SVG image"));
      };
      loadedImage.onload = () => {
        if (state !== "loading") {
          return;
        }
        state = "encoding";
        detachImageHandlers();
        try {
          context.drawImage(loadedImage, 0, 0, width, height);
          canvas.toBlob((blob) => {
            if (!blob) {
              fail(new Error("Failed to create PNG blob"));
              return;
            }
            finish(() => resolve(blob));
          }, "image/png");
        } catch (error) {
          fail(error);
        }
      };
      loadedImage.src = objectUrl;
    } catch (error) {
      fail(error);
    }
  });
}
