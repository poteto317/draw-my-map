import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Home from "@/app/page";
import type { Node } from "@/types/node";
import type { OperationNotice } from "@/types/operationNotice";

const mockDownloadMapJson = jest.fn();
const mockExportPng = jest.fn();
const mockExportSvg = jest.fn();
const mockUseMapImageExport = jest.fn();
let mockImageExportNotice: OperationNotice | null = null;
let mockIsExportingPng = false;

jest.mock("@/hooks/useMapImageExport", () => ({
  useMapImageExport: (options: { nodes: readonly Node[] }) => {
    mockUseMapImageExport(options);
    return {
      exportPng: mockExportPng,
      exportSvg: mockExportSvg,
      isExportingPng: mockIsExportingPng,
      notice: mockImageExportNotice,
    };
  },
}));

jest.mock("@/services/persistence/mapJsonDownload", () => {
  const actual = jest.requireActual("@/services/persistence/mapJsonDownload");
  return {
    ...actual,
    downloadMapJson: (json: string) => mockDownloadMapJson(json),
  };
});

jest.mock("@/components/map/MapStage", () => ({
  MapStage: ({
    nodes,
    selectedNodeId,
    resetRevision,
    onDoubleClick,
  }: {
    nodes: Node[];
    selectedNodeId: number | null;
    resetRevision?: number;
    onDoubleClick: (x: number, y: number) => void;
  }) => (
    <div data-testid="map-stage">
      <output data-testid="node-state">{JSON.stringify(nodes)}</output>
      <output data-testid="selected-node-id">{selectedNodeId}</output>
      <output data-testid="reset-revision">{resetRevision ?? 0}</output>
      <button type="button" onClick={() => onDoubleClick(10, 20)}>
        テスト用ノード追加
      </button>
    </div>
  ),
}));

const validImportedJson = `{
  "version": 1,
  "layoutMode": "auto",
  "nodes": [
    {
      "id": 10,
      "parentId": null,
      "x": 20,
      "y": 30,
      "width": 160,
      "height": 64,
      "label": "読み込み済み"
    }
  ]
}\n`;

function jsonFile(contents: string): File {
  const file = new File([contents], "map.json", { type: "application/json" });
  Object.defineProperty(file, "text", {
    configurable: true,
    value: jest.fn().mockResolvedValue(contents),
  });
  return file;
}

function queryOperationNoticeWrapper(): HTMLElement | null {
  return screen.queryByTestId("operation-notices");
}

describe("Home", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockDownloadMapJson.mockClear();
    mockExportPng.mockClear();
    mockExportSvg.mockClear();
    mockUseMapImageExport.mockClear();
    mockImageExportNotice = null;
    mockIsExportingPng = false;
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe("配置モード配線", () => {
    it("配置モードと変更commandをヘッダーへ接続する", async () => {
      const user = userEvent.setup();
      render(<Home />);

      expect(screen.getByRole("button", { name: "手動配置" }))
        .toHaveAttribute("aria-pressed", "true");
      await user.click(screen.getByRole("button", { name: "自動配置" }));

      expect(screen.getByRole("button", { name: "自動配置" }))
        .toHaveAttribute("aria-pressed", "true");
    });
  });

  describe("永続化配線", () => {
    it("現在のマップをJSON書き出しcommandへ渡す", async () => {
      const user = userEvent.setup();
      render(<Home />);

      await user.click(screen.getByRole("button", { name: "JSON書き出し" }));

      expect(mockDownloadMapJson).toHaveBeenCalledWith(`{
  "version": 2,
  "layoutMode": "manual",
  "nodes": []
}\n`);
      const persistenceNotice = screen.getByText("JSONファイルを書き出しました。");
      expect(persistenceNotice).toBeInTheDocument();
      expect(queryOperationNoticeWrapper()).toContainElement(persistenceNotice);
    });

    it("検証済みファイルでノード・モードを置換してstageをリセットする", async () => {
      const user = userEvent.setup();
      const { container } = render(<Home />);
      const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;

      await user.upload(input, jsonFile(validImportedJson));

      await waitFor(() => {
        expect(screen.getByTestId("node-state")).toHaveTextContent("読み込み済み");
      });
      expect(screen.getByTestId("node-state"))
        .toHaveTextContent('"importance":"medium"');
      expect(screen.getByRole("button", { name: "自動配置" }))
        .toHaveAttribute("aria-pressed", "true");
      expect(screen.getByTestId("selected-node-id")).toHaveTextContent("");
      expect(screen.getByTestId("reset-revision")).toHaveTextContent("1");
      expect(screen.getByText("マップを読み込みました。"))
        .toBeInTheDocument();
    });

    it("不正ファイルではマップとstage revisionを変更しない", async () => {
      const user = userEvent.setup();
      const { container } = render(<Home />);
      const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
      const before = screen.getByTestId("node-state").textContent;

      await user.upload(input, jsonFile("{broken"));

      await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(
        "現在のマップは変更されていません。",
      ));
      expect(screen.getByTestId("node-state")).toHaveTextContent(before ?? "");
      expect(screen.getByTestId("reset-revision")).toHaveTextContent("0");
    });

    it("ノード変更をlocalStorageへ自動保存する", async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(<Home />);

      await user.click(screen.getByRole("button", { name: "テスト用ノード追加" }));
      jest.advanceTimersByTime(300);

      const stored = window.localStorage.getItem("draw-my-map.map.v1");
      expect(stored).not.toBeNull();
      expect(JSON.parse(stored!)).toMatchObject({
        version: 2,
        layoutMode: "manual",
        nodes: [expect.objectContaining({
          x: -40,
          y: -10,
          importance: "medium",
        })],
      });
    });
  });

  describe("画像書き出し配線", () => {
    it("現在のノード配列を画像書き出しHookへ渡す", async () => {
      const user = userEvent.setup();
      render(<Home />);

      expect(mockUseMapImageExport).toHaveBeenLastCalledWith({ nodes: [] });

      await user.click(screen.getByRole("button", { name: "テスト用ノード追加" }));

      expect(mockUseMapImageExport).toHaveBeenLastCalledWith({
        nodes: [expect.objectContaining({ x: -40, y: -10 })],
      });
    });

    it("PNGとSVGの各ボタンを画像書き出しcommandへ接続する", async () => {
      const user = userEvent.setup();
      render(<Home />);

      await user.click(screen.getByRole("button", { name: "PNG書き出し" }));
      await user.click(screen.getByRole("button", { name: "SVG書き出し" }));

      expect(mockExportPng).toHaveBeenCalledTimes(1);
      expect(mockExportSvg).toHaveBeenCalledTimes(1);
    });

    it("PNG処理中はPNG書き出しボタンを無効化する", () => {
      mockIsExportingPng = true;

      render(<Home />);

      expect(screen.getByRole("button", { name: "PNG書き出し" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "SVG書き出し" })).toBeEnabled();
    });

    it("永続化通知と画像書き出し通知を同時に表示する", async () => {
      mockImageExportNotice = {
        kind: "warning",
        message: "書き出すノードがありません。",
      };
      const user = userEvent.setup();
      render(<Home />);

      await user.click(screen.getByRole("button", { name: "JSON書き出し" }));

      const persistenceNotice = screen.getByText("JSONファイルを書き出しました。");
      const imageExportNotice = screen.getByText("書き出すノードがありません。");
      expect(persistenceNotice).toHaveAttribute("role", "status");
      expect(imageExportNotice).toHaveAttribute("role", "alert");
      expect(queryOperationNoticeWrapper()).toContainElement(persistenceNotice);
      expect(queryOperationNoticeWrapper()).toContainElement(imageExportNotice);
    });
  });

  describe("レイアウト", () => {
    it("通知がない通常時はheaderに全幅の通知行を確保しない", () => {
      render(<Home />);

      expect(queryOperationNoticeWrapper()).not.toBeInTheDocument();
    });

    it("可変高headerを除いたviewport内の残領域をmapへ割り当てる", () => {
      render(<Home />);
      const main = screen.getByTestId("map-stage").closest("main")!;
      const shell = main.parentElement!;

      expect(shell).toHaveClass("h-dvh");
      expect(shell).not.toHaveClass("overflow-hidden");
      expect(main).toHaveClass("min-h-0", "flex-1", "overflow-hidden");
    });
  });
});
