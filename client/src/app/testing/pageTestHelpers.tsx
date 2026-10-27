import { act, fireEvent, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import Home from "@/app/page";
import {
  mockNodePointerHandlers,
  mockStageBounds,
  mockStageHandlers,
  pointer,
  renderReady,
} from "@/components/map/testing/mapStageTestRuntime";
import { readActiveMapJson } from "@/testing/mapLibraryTestStorage";

// Home（app/page）を本物の MapEditor・MapStage まで通して描画する結合テストの共通ヘルパー。
// 使う側のテストファイルで、pixi.js などを jest.mock で差し替えておくこと（pageModuleMocks を参照）。

// JSON 書き出し・保存の本体として読む V3 のノード。テストで読むフィールドの和集合
export type ExportedNode = {
  id: number;
  parentId: number | null;
  label: string;
  importance: string;
  x: number;
  y: number;
  width: number;
  height: number;
  illustration?: string;
};
export type ExportedMap = { version: number; layoutMode: string; nodes: ExportedNode[] };

export type V3SeedNode = Partial<ExportedNode> & { id: number };
export type V3LayoutMode = "manual" | "auto";

// 既定値（ルート、(250, 170)、100×60、ラベル空、重要度 medium）を補った V3 の保存データ
export function v3Json(nodes: readonly V3SeedNode[], layoutMode: V3LayoutMode = "manual"): string {
  return `${JSON.stringify({
    version: 3,
    layoutMode,
    nodes: nodes.map((node) => ({
      parentId: null,
      x: 250,
      y: 170,
      width: 100,
      height: 60,
      label: "",
      importance: "medium",
      ...node,
    })),
  }, null, 2)}\n`;
}

// ラベルだけを並べた手動配置のマップ。id は 1 から、x は 100 から 200 ずつ
export function v3JsonFromLabels(labels: readonly string[]): string {
  return `${JSON.stringify({
    version: 3,
    layoutMode: "manual",
    nodes: labels.map((label, i) => ({
      id: i + 1,
      parentId: null,
      x: 100 + i * 200,
      y: 100,
      width: 100,
      height: 60,
      label,
      importance: "medium",
    })),
  }, null, 2)}\n`;
}

export function stageContainer(): HTMLElement {
  return document.querySelector<HTMLElement>(".cursor-crosshair")!;
}

// 描画後にキャンバスの枠を (0, 0) から 800×600 に固定する
export async function renderPage(ui: ReactElement = <Home />) {
  const rendered = await renderReady(ui);
  mockStageBounds(stageContainer());
  return rendered;
}

export function undoButton(): HTMLElement {
  return screen.getByRole("button", { name: "元に戻す" });
}

export function redoButton(): HTMLElement {
  return screen.getByRole("button", { name: "やり直す" });
}

export function dialog() {
  return within(screen.getByRole("dialog"));
}

export function headerButton(name: string): HTMLElement {
  return within(screen.getByRole("banner")).getByRole("button", { name });
}

// 直近の描画で登録されたノードの pointerdown で選択し、同じ座標で離す（index は nodes 配列の順）。
// 押した座標と離した座標が同じなのでドラッグにはならず、座標は選択の結果に影響しない
export function selectNode(index: number, nodeCount: number, x = 0, y = 0) {
  act(() => {
    mockNodePointerHandlers.at(index - nodeCount)?.pointerdown?.(pointer(x, y));
    mockStageHandlers.pointerup?.(pointer(x, y));
  });
}

// 「JSON書き出し」を押し、downloadMapJson のモックが最後に受け取った JSON を解析する
export function exportedMap(downloadMapJson: jest.Mock): ExportedMap {
  fireEvent.click(screen.getByRole("button", { name: "JSON書き出し" }));
  return JSON.parse(downloadMapJson.mock.lastCall![0] as string) as ExportedMap;
}

// localStorage に保存された現在のマップの本体
export function storedMap(): ExportedMap | null {
  const stored = readActiveMapJson(window.localStorage);
  return stored === null ? null : JSON.parse(stored) as ExportedMap;
}
