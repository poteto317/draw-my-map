import { createMockPixiModule } from "@/components/map/testing/mapStageTestRuntime";
import type { MeasureMapText } from "@/domain/imageExport/mapExportText";

// ページの結合テストで、jest.mock のファクトリの中から jest.requireActual で読むモックの中身。
// jest.mock は import より前へ巻き上げられるため、ファクトリからは requireActual で読んだものしか使えない。
// pixi.js のファクトリの評価中に読まれるので、@/app/page・pixi.js・pageTestHelpers をここから import しない。
//
// 使い方:
// jest.mock("pixi.js", () => (
//   jest.requireActual<typeof import("@/app/testing/pageModuleMocks")>("@/app/testing/pageModuleMocks")
//     .createPagePixiModuleMock()
// ));

// Pixi の標準形。Application の init を差し替える変種（折りたたみ・検索のテスト）は各ファイルに残す
export function createPagePixiModuleMock(): ReturnType<typeof createMockPixiModule> {
  return createMockPixiModule();
}

// jsdom は canvas の 2D context を持たないため、文字幅を「文字数×8px」として測る
export function createMapTextMeasurementModuleMock(): { createMapTextMeasurer: () => MeasureMapText } {
  return {
    createMapTextMeasurer: () => (text: string) => text.length * 8,
  };
}
