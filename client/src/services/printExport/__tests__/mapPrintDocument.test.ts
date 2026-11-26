import { calculateMapPrintLayout } from "@/domain/printExport/mapPrintLayout";
import { createMapPrintDocument } from "@/services/printExport/mapPrintDocument";
import {
  DEFAULT_MAP_PRINT_SETTINGS,
  type MapPrintSettings,
} from "@/types/mapPrintExport";

const imageUrl = "blob:map-svg";
const settings: MapPrintSettings = {
  ...DEFAULT_MAP_PRINT_SETTINGS,
  paperSize: "letter",
  orientation: "landscape",
  margins: { top: 7.2, right: 13, bottom: 0, left: 4.5 },
  pagination: "tile",
};

describe("createMapPrintDocument", () => {
  it("用紙と非対称余白を指定し、最後のページには強制改ページを付けない", () => {
    const doc = document.implementation.createHTMLDocument();
    const layout = calculateMapPrintLayout(1100, 300, settings);

    const images = createMapPrintDocument(doc, layout, settings, imageUrl, "地図");
    const [first, last] = Array.from(doc.body.children) as HTMLElement[];

    expect(doc.head.querySelector("style")?.textContent).toMatch(
      /@page\s*\{\s*size:\s*279\.4mm 215\.9mm;\s*margin:\s*0[;\s]*\}/,
    );
    expect(doc.head.querySelector("style")?.textContent).toMatch(
      /html,\s*body\s*\{[^}]*margin:\s*0/,
    );
    expect(doc.body.children).toHaveLength(2);
    expect(first.style.width).toBe("279.4mm");
    expect(first.style.height).toBe("215.9mm");
    expect(first.style.boxSizing).toBe("border-box");
    expect(first.style.padding).toBe("7.2mm 13mm 0mm 4.5mm");
    expect(first.style.breakInside).toBe("avoid");
    expect(first.style.breakAfter).toBe("page");
    expect(last.style.breakAfter).toBe("");
    expect(images[1].parentElement?.style.overflow).toBe("hidden");
    expect(images[1].parentElement?.style.position).toBe("relative");
    expect(images[1].style.left).toBe("-261.9mm");
    expect(images[1].style.top).toBe("0mm");
    expect(Number.parseFloat(images[1].style.width)).toBeCloseTo(291.0416666667);
    expect(Number.parseFloat(images[1].style.height)).toBeCloseTo(79.375);
  });

  it("利用者のマップ名をタイトルのテキストにし、全画像で同じBlob URLを使う", () => {
    const doc = document.implementation.createHTMLDocument();
    const layout = calculateMapPrintLayout(1100, 300, settings);
    const mapName = "</title><script>window.changed = true</script><img src=x>";

    const images = createMapPrintDocument(doc, layout, settings, imageUrl, mapName);

    expect(doc.head.querySelector("title")?.textContent).toBe(mapName);
    expect(doc.querySelector("script, svg")).toBeNull();
    expect(Array.from(doc.images)).toEqual(images);
    expect(images.map((image) => image.getAttribute("src"))).toEqual([imageUrl, imageUrl]);
  });
});
