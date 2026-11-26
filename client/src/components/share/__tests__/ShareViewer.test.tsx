import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  ShareViewer,
  type ShareViewerProps,
} from "@/components/share/ShareViewer";
import { SHARE_MESSAGES } from "@/domain/share/shareMessages";
import { createMapDocument } from "@/domain/persistence/mapDocumentCodec";
import { createTestNode } from "@/testing/createTestNode";

jest.mock("pixi.js", () => {
  const runtime = jest.requireActual<typeof import("@/components/map/testing/mapStageTestRuntime")>(
    "@/components/map/testing/mapStageTestRuntime",
  );
  return runtime.createMockPixiModule();
});

function createProps(overrides: Partial<ShareViewerProps> = {}): ShareViewerProps {
  return {
    document: createMapDocument(
      [
        createTestNode({
          id: 1,
          parentId: null,
          label: "根ノード",
          x: 0,
          y: 0,
          width: 160,
          height: 64,
        }),
        createTestNode({
          id: 2,
          parentId: 1,
          label: "子ノード",
          x: 200,
          y: 0,
          width: 160,
          height: 64,
        }),
      ],
      "manual",
    ),
    loadError: null,
    viewMode: "map",
    onViewModeChange: jest.fn(),
    ...overrides,
  };
}

/** L-060: 必須 props が型上省略不可であることをコンパイル時に担保する参照 */
const REQUIRED_SHARE_VIEWER_PROP_KEYS = [
  "document",
  "loadError",
  "viewMode",
  "onViewModeChange",
] as const satisfies ReadonlyArray<keyof ShareViewerProps>;

const SHARE_SRC_ROOT = path.resolve(__dirname, "..");
const PAGE_SRC = path.resolve(__dirname, "../../../app/share/[token]");

const FORBIDDEN_IMPORT_PATTERNS = [
  "@/components/map/MapEditor",
  "@/components/map/MapStage",
  "@/components/map/NodeContextMenu",
  "@/components/map/NodeLabelEditor",
  "@/components/layout/ShareDialog",
  "@/components/layout/ShareControl",
  "@/components/layout/OutlineExportControls",
  "@/components/layout/ExchangeExportControls",
  "@/components/layout/MapPersistenceControls",
  "@/components/layout/MapPrintControls",
  "@/components/layout/OutlineImportControl",
  "@/components/layout/OutlineImportDialog",
  "@/components/layout/CommandPaletteDialog",
  "@/components/layout/CommandPaletteControl",
  "@/components/layout/VoiceInputControl",
  "@/components/layout/AiAssistDialog",
  "@/components/layout/AiAssistSection",
  "@/components/layout/TourEditorDialog",
  "@/components/layout/TourEditorControl",
  "@/components/layout/PresentationStartControl",
  "@/components/layout/PresentationPlaybackBar",
  "@/components/outline/OutlineEditor",
  "@/components/outline/OutlineToolbar",
  "@/hooks/useOutlineExport",
  "@/hooks/useOutlineImport",
  "@/hooks/useMapEditorShare",
  "@/hooks/useMapEditorTourAndPresentation",
  "@/hooks/useMapEditorVoice",
] as const;

function listTsFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === "__tests__" || entry === "node_modules") continue;
      files.push(...listTsFiles(full));
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith(".test.ts") && !entry.endsWith(".test.tsx")) {
      files.push(full);
    }
  }
  return files;
}

describe("ShareViewer", () => {
  it("L-060: 必須 props キーが揃っている（未配線 RED 用の正本）", () => {
    const props = createProps();
    for (const key of REQUIRED_SHARE_VIEWER_PROP_KEYS) {
      expect(props[key] !== undefined || key === "document" || key === "loadError").toBe(true);
      expect(key in props).toBe(true);
    }
    render(<ShareViewer {...props} />);
    expect(screen.getByTestId("share-viewer")).toBeInTheDocument();
  });

  it("編集・書き出し・共有・編集シェル入口を import しない（S5/S6・L-061）", () => {
    const sources = [
      ...listTsFiles(SHARE_SRC_ROOT),
      ...listTsFiles(PAGE_SRC),
    ];
    expect(sources.length).toBeGreaterThan(0);
    for (const file of sources) {
      const text = readFileSync(file, "utf8");
      for (const pattern of FORBIDDEN_IMPORT_PATTERNS) {
        expect(text).not.toContain(pattern);
      }
    }
  });

  it("loadError があるときは 404 相当文言を出し、空 document と混同しない", () => {
    render(
      <ShareViewer
        {...createProps({
          document: null,
          loadError: SHARE_MESSAGES.viewNotFound,
        })}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(SHARE_MESSAGES.viewNotFound);
    expect(screen.queryByTestId("share-map-view")).not.toBeInTheDocument();
    expect(screen.queryByText(SHARE_MESSAGES.viewEmpty)).not.toBeInTheDocument();
  });

  it("不正 document は loading に倒さず loadError 相当にする", () => {
    render(
      <ShareViewer
        {...createProps({
          document: { version: 1, nodes: [] },
          loadError: null,
        })}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(SHARE_MESSAGES.viewLoadFailed);
    expect(screen.queryByText(SHARE_MESSAGES.viewLoading)).not.toBeInTheDocument();
  });

  it("空 document（ノード0）は成功表示で loadError と混同しない", () => {
    render(
      <ShareViewer
        {...createProps({
          document: createMapDocument([], "manual"),
          loadError: null,
          viewMode: "outline",
        })}
      />,
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText(SHARE_MESSAGES.viewEmpty)).toBeInTheDocument();
    expect(screen.queryByText(SHARE_MESSAGES.viewNotFound)).not.toBeInTheDocument();
  });

  it("document 欠落かつ loadError なしは読込中（空・404と混同しない）", () => {
    render(
      <ShareViewer
        {...createProps({
          document: null,
          loadError: null,
        })}
      />,
    );
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent(SHARE_MESSAGES.viewLoading);
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(screen.queryByText(SHARE_MESSAGES.viewEmpty)).not.toBeInTheDocument();
    expect(screen.queryByText(SHARE_MESSAGES.viewNotFound)).not.toBeInTheDocument();
  });

  it("map / outline 切替を onViewModeChange へ渡す（編集コマンド非配線）", async () => {
    const user = userEvent.setup();
    const onViewModeChange = jest.fn();
    const { rerender } = render(
      <ShareViewer {...createProps({ viewMode: "map", onViewModeChange })} />,
    );
    expect(screen.getByTestId("share-map-view")).toBeInTheDocument();
    expect(screen.queryByTestId("share-outline-view")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "アウトライン" }));
    expect(onViewModeChange).toHaveBeenCalledWith("outline");

    rerender(
      <ShareViewer {...createProps({ viewMode: "outline", onViewModeChange })} />,
    );
    expect(screen.getByTestId("share-outline-view")).toBeInTheDocument();
    expect(screen.queryByTestId("share-map-view")).not.toBeInTheDocument();
    expect(screen.getByText("根ノード")).toBeInTheDocument();
    expect(screen.getByText("子ノード")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "マップ" }));
    expect(onViewModeChange).toHaveBeenCalledWith("map");
  });

  it("編集・書き出し・共有のボタンが 0 件", () => {
    render(<ShareViewer {...createProps()} />);
    expect(screen.queryByRole("button", { name: /書き出し/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: SHARE_MESSAGES.shareButton })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /追加|削除|保存|Undo|Redo|音声/ })).not.toBeInTheDocument();
  });
});
