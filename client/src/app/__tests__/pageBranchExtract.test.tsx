import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  renderPage,
  selectNode,
  stageContainer,
  v3Json,
} from "@/app/testing/pageTestHelpers";
import { resetMapStageTestRuntime } from "@/components/map/testing/mapStageTestRuntime";
import { seedMapLibrary, readMapIndex } from "@/testing/mapLibraryTestStorage";
import { mapBodyKey } from "@/services/persistence/mapLibraryStorage";
import { parseMapDocumentJson } from "@/domain/persistence/mapDocumentCodec";

jest.mock("pixi.js", () => (
  jest.requireActual<typeof import("@/app/testing/pageModuleMocks")>("@/app/testing/pageModuleMocks")
    .createPagePixiModuleMock()
));

jest.mock("@/services/illustration/illustrationGeneration", () => {
  const actual = jest.requireActual("@/services/illustration/illustrationGeneration");
  return { ...actual, generateIllustrationThumbnail: jest.fn() };
});

jest.mock("@/services/persistence/mapJsonDownload", () => {
  const actual = jest.requireActual("@/services/persistence/mapJsonDownload");
  return { ...actual, downloadMapJson: jest.fn() };
});

jest.mock("@/services/imageExport/mapTextMeasurement", () => (
  jest.requireActual<typeof import("@/app/testing/pageModuleMocks")>("@/app/testing/pageModuleMocks")
    .createMapTextMeasurementModuleMock()
));

jest.mock("@/services/imageExport/mapImageDownload", () => ({
  downloadMapImage: jest.fn(),
}));

jest.mock("@/services/imageExport/mapPngRasterizer", () => ({
  rasterizeMapSvgToPng: jest.fn(),
}));

beforeEach(() => {
  resetMapStageTestRuntime();
  window.localStorage.clear();
});

afterEach(() => jest.restoreAllMocks());

const NODE_COUNT = 2;

function openExtractConfirm() {
  selectNode(1, NODE_COUNT, 280, 200);
  fireEvent.contextMenu(stageContainer(), { clientX: 280, clientY: 200 });
  return screen.getByRole("menuitem", { name: "枝を別マップに切り出す" });
}

it("コンテキストから切り出し確認を開き、成功で新マップへ切り替わる", async () => {
  seedMapLibrary(window.localStorage, [{
    id: "a",
    name: "計画",
    json: v3Json([
      { id: 1, label: "親" },
      { id: 2, parentId: 1, label: "枝A" },
    ]),
  }]);
  await renderPage();
  await userEvent.click(openExtractConfirm());
  const dialog = screen.getByRole("dialog", { name: "枝を別マップに切り出す" });
  expect(dialog).toHaveTextContent("元に戻せません");
  await userEvent.click(within(dialog).getByRole("button", { name: "切り出す" }));
  await waitFor(() => {
    const index = readMapIndex(window.localStorage);
    expect(index?.currentMapId).not.toBe("a");
  });
  const newId = readMapIndex(window.localStorage)!.currentMapId;
  const source = parseMapDocumentJson(window.localStorage.getItem(mapBodyKey("a"))!);
  const target = parseMapDocumentJson(window.localStorage.getItem(mapBodyKey(newId))!);
  expect(target.ok && target.value.nodes.map((n) => n.label)).toEqual(["枝A"]);
  expect(source.ok && source.value.nodes.some((n) => n.mapLinks?.[0]?.targetMapId === newId)).toBe(true);
});

it("メタデータ corrupt でも切り出しメニューは meta 理由で disabled にしない", async () => {
  seedMapLibrary(window.localStorage, [{
    id: "a",
    name: "計画",
    json: v3Json([
      { id: 1, label: "親" },
      { id: 2, parentId: 1, label: "枝A" },
    ]),
  }]);
  window.localStorage.setItem("draw-my-map.map-user-meta.v1", "{broken");
  await renderPage();
  await act(async () => {});
  const item = openExtractConfirm();
  expect(item).toBeEnabled();
});