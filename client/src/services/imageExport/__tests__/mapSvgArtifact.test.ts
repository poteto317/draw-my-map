import { createMapSvgBlob } from "@/services/imageExport/mapSvgArtifact";

describe("mapSvgArtifact", () => {
  it("SVG文字列からUTF-8 SVG Blobを作る", () => {
    const blob = createMapSvgBlob("<svg />");

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("image/svg+xml;charset=utf-8");
  });
});
