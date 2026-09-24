import { createMapSvgBlob } from "@/services/imageExport/mapSvgArtifact";

export async function withLoadedMapSvgImage<T>(
  svg: string,
  consume: (image: HTMLImageElement) => Promise<T>,
): Promise<T> {
  const objectUrl = URL.createObjectURL(createMapSvgBlob(svg));

  return new Promise((resolve, reject) => {
    let state: "loading" | "consuming" | "settled" = "loading";
    let image: HTMLImageElement | undefined;

    const finish = (complete: () => void) => {
      if (state === "settled") return;
      state = "settled";
      if (image) {
        image.onload = null;
        image.onerror = null;
      }
      URL.revokeObjectURL(objectUrl);
      complete();
    };
    const fail = (error: unknown) => finish(() => reject(error));

    try {
      const loadedImage = new Image();
      image = loadedImage;
      loadedImage.onerror = () => {
        if (state !== "loading") return;
        fail(new Error("Failed to load SVG image"));
      };
      loadedImage.onload = () => {
        if (state !== "loading") return;
        state = "consuming";
        try {
          consume(loadedImage).then(
            (result) => finish(() => resolve(result)),
            fail,
          );
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
