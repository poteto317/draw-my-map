import type { MapPrintLayout, MapPrintSettings } from "@/types/mapPrintExport";

export function createMapPrintDocument(
  doc: Document,
  layout: MapPrintLayout,
  settings: MapPrintSettings,
  imageUrl: string,
  mapName: string,
): HTMLImageElement[] {
  const title = doc.createElement("title");
  title.textContent = mapName;
  const style = doc.createElement("style");
  style.textContent = `
    @page { size: ${layout.paperWidthMm}mm ${layout.paperHeightMm}mm; margin: 0; }
    html, body { margin: 0; padding: 0; }
  `;
  doc.head.replaceChildren(title, style);

  const { top, right, bottom, left } = settings.margins;
  const pages = doc.createDocumentFragment();
  const images = layout.pages.map((placement, index) => {
    const page = doc.createElement("section");
    Object.assign(page.style, {
      width: `${layout.paperWidthMm}mm`,
      height: `${layout.paperHeightMm}mm`,
      boxSizing: "border-box",
      padding: `${top}mm ${right}mm ${bottom}mm ${left}mm`,
      breakInside: "avoid",
    });
    if (index < layout.pages.length - 1) page.style.breakAfter = "page";

    const content = doc.createElement("div");
    Object.assign(content.style, {
      position: "relative",
      overflow: "hidden",
      width: `${layout.contentWidthMm}mm`,
      height: `${layout.contentHeightMm}mm`,
    });

    const image = doc.createElement("img");
    image.alt = "";
    Object.assign(image.style, {
      position: "absolute",
      left: `${placement.leftMm}mm`,
      top: `${placement.topMm}mm`,
      width: `${placement.widthMm}mm`,
      height: `${placement.heightMm}mm`,
    });

    content.append(image);
    page.append(content);
    pages.append(page);
    return image;
  });

  doc.body.replaceChildren(pages);
  for (const image of images) image.src = imageUrl;
  return images;
}
