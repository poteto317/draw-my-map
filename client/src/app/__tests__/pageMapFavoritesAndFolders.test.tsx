import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  dialog,
  headerButton,
  renderPage,
  v3JsonFromLabels,
} from "@/app/testing/pageTestHelpers";
import { resetMapStageTestRuntime } from "@/components/map/testing/mapStageTestRuntime";
import { MAP_LIBRARY_META_STORAGE_KEY } from "@/services/persistence/mapLibraryMetaStorage";
import { readMapIndex, seedMapLibrary } from "@/testing/mapLibraryTestStorage";

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

const mockDownloadLibraryBackup = jest.fn();
jest.mock("@/services/persistence/libraryBackupFile", () => {
  const actual = jest.requireActual("@/services/persistence/libraryBackupFile");
  return {
    ...actual,
    downloadLibraryBackup: (json: string, date: Date) => mockDownloadLibraryBackup(json, date),
  };
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
  mockDownloadLibraryBackup.mockReset();
});

afterEach(() => jest.restoreAllMocks());

function seedThreeMaps() {
  seedMapLibrary(
    window.localStorage,
    [
      { id: "a", name: "マップA", json: v3JsonFromLabels(["A1"]), updatedAt: "2026-11-19T10:00:00.000Z" },
      { id: "b", name: "マップB", json: v3JsonFromLabels(["B1"]), updatedAt: "2026-11-19T09:00:00.000Z" },
      { id: "c", name: "マップC", json: v3JsonFromLabels(["C1"]), updatedAt: "2026-11-19T08:00:00.000Z" },
    ],
    { currentMapId: "a" },
  );
}

function listRows(): HTMLElement[] {
  return within(dialog().getByRole("list", { name: "保存済みのマップ" })).getAllByRole("listitem");
}

function backupFile(json: string): File {
  const file = new File([json], "library.json", { type: "application/json" });
  Object.defineProperty(file, "text", { value: jest.fn().mockResolvedValue(json) });
  return file;
}

describe("お気に入り・最近使用・フォルダー管理（ページ統合）", () => {
  it("お気に入りトグル・お気に入りタブ・最近使用タブ（閲覧順と未閲覧除外）が動作する", async () => {
    seedThreeMaps();
    const user = userEvent.setup();
    await renderPage();

    await user.click(headerButton("マップ一覧"));

    // 初期起動直後はマップA のみ閲覧済み
    await user.click(dialog().getByRole("button", { name: "最近使用" }));
    expect(listRows().map((row) => row.textContent)).toHaveLength(1);
    expect(listRows()[0]).toHaveTextContent("マップA");

    // すべてへ戻し、マップB をお気に入り登録してマップC へ切り替える
    await user.click(dialog().getByRole("button", { name: "すべて" }));
    await user.click(dialog().getByRole("button", { name: "お気に入り: マップB" }));
    expect(dialog().getByRole("button", { name: "お気に入り: マップB" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // お気に入りタブではマップB のみ表示
    await user.click(dialog().getByRole("button", { name: "お気に入り" }));
    expect(listRows()).toHaveLength(1);
    expect(listRows()[0]).toHaveTextContent("マップB");

    // すべてタブへ戻し、マップC を開く
    await user.click(dialog().getByRole("button", { name: "すべて" }));
    await user.click(dialog().getByRole("button", { name: "マップC" }));
    expect(screen.getByTestId("current-map-name")).toHaveTextContent("マップ: マップC");

    // 再度一覧の最近使用タブを開くと、マップC・マップA の順（未閲覧のマップB は除外）
    await user.click(headerButton("マップ一覧"));
    await user.click(dialog().getByRole("button", { name: "最近使用" }));
    const recentRows = listRows();
    expect(recentRows).toHaveLength(2);
    expect(recentRows[0]).toHaveTextContent("マップC");
    expect(recentRows[1]).toHaveTextContent("マップA");
  });

  it("フォルダー作成・名前変更・割り当て・絞り込み・削除（マップ非消失・フィルタ自動リセット・フィルタ中削除フォーカス移動）が動作する", async () => {
    seedThreeMaps();
    const user = userEvent.setup();
    await renderPage();

    await user.click(headerButton("マップ一覧"));
    await user.click(dialog().getByRole("button", { name: "フォルダー管理" }));

    // フォルダー作成
    await user.type(dialog().getByRole("textbox", { name: "新しいフォルダー名" }), "仕事");
    await user.click(dialog().getByRole("button", { name: "作成" }));
    expect(dialog().getByText("仕事")).toBeInTheDocument();

    // フォルダー名前変更
    await user.click(dialog().getByRole("button", { name: "名前を変更: 仕事" }));
    const renameInput = dialog().getByRole("textbox", { name: "フォルダー名" });
    await user.clear(renameInput);
    await user.type(renameInput, "業務");
    await user.click(dialog().getByRole("button", { name: "変更" }));
    expect(dialog().getByText("業務")).toBeInTheDocument();

    // 一覧に戻ってマップB・マップC を「業務」に割り当て
    await user.click(dialog().getByRole("button", { name: "マップ一覧に戻る" }));
    const folderSelectB = dialog().getByRole("combobox", { name: "マップBのフォルダー" });
    const folderOptionValue = Array.from(folderSelectB.querySelectorAll("option")).find(
      (opt) => opt.textContent === "業務",
    )!.value;
    await user.selectOptions(folderSelectB, folderOptionValue);
    await user.selectOptions(dialog().getByRole("combobox", { name: "マップCのフォルダー" }), folderOptionValue);

    // フォルダー絞り込み
    const filterSelect = dialog().getByRole("combobox", { name: "フォルダーで絞り込み" });
    await user.selectOptions(filterSelect, `folder:${folderOptionValue}`);
    expect(listRows()).toHaveLength(2);
    expect(listRows()[0]).toHaveTextContent("マップB");
    expect(listRows()[1]).toHaveTextContent("マップC");

    // フィルタ中にマップB を削除すると絞り込み後の隣行（マップC の開くボタン）へフォーカス移動
    await user.click(dialog().getByRole("button", { name: "削除: マップB" }));
    await user.click(dialog().getByRole("button", { name: "このマップを削除" }));
    await waitFor(() => expect(dialog().getByRole("button", { name: /^マップC/ })).toHaveFocus());
    expect(listRows()).toHaveLength(1);

    // 絞り込み中のフォルダー「業務」を削除 → マップC は消えずに未分類になり、フィルタは「すべてのフォルダー」へ自動リセット
    await user.click(dialog().getByRole("button", { name: "フォルダー管理" }));
    await user.click(dialog().getByRole("button", { name: "削除: 業務" }));
    await user.click(dialog().getByRole("button", { name: "このフォルダーを削除" }));
    await user.click(dialog().getByRole("button", { name: "マップ一覧に戻る" }));

    expect(dialog().getByRole("combobox", { name: "フォルダーで絞り込み" })).toHaveValue("all");
    expect(listRows()).toHaveLength(2);
    expect(dialog().getByRole("combobox", { name: "マップCのフォルダー" })).toHaveValue("");
  });

  it("メタデータ破損時は保護モードに入らず通常モードを維持し、初期化ボタンで回復できる（L-002・L-669）", async () => {
    seedThreeMaps();
    window.localStorage.setItem(MAP_LIBRARY_META_STORAGE_KEY, "{broken-meta");
    const user = userEvent.setup();
    await renderPage();

    // 保護モードではなく通常モードのままマップ一覧が開ける
    expect(headerButton("マップ一覧")).toBeEnabled();
    await user.click(headerButton("マップ一覧"));
    expect(
      dialog()
        .getAllByRole("alert")
        .some((el) => el.textContent?.includes("破損")),
    ).toBe(true);
    expect(dialog().getByRole("button", { name: "フォルダー管理" })).toBeDisabled();

    // 「メタデータを初期化」で回復し、フォルダー管理が有効になる
    await user.click(dialog().getByRole("button", { name: "メタデータを初期化" }));
    await waitFor(() => {
      expect(dialog().getByRole("button", { name: "フォルダー管理" })).toBeEnabled();
    });
    expect(dialog().queryByRole("button", { name: "メタデータを初期化" })).not.toBeInTheDocument();
  });

  it("一括バックアップ＆追加復元後にフォルダーとお気に入り・フォルダー割り当てが復元される", async () => {
    seedThreeMaps();
    const user = userEvent.setup();
    await renderPage();

    await user.click(headerButton("マップ一覧"));
    await user.click(dialog().getByRole("button", { name: "フォルダー管理" }));
    await user.type(dialog().getByRole("textbox", { name: "新しいフォルダー名" }), "研究");
    await user.click(dialog().getByRole("button", { name: "作成" }));
    await user.click(dialog().getByRole("button", { name: "マップ一覧に戻る" }));

    const folderSelectA = dialog().getByRole("combobox", { name: "マップAのフォルダー" });
    const folderId = Array.from(folderSelectA.querySelectorAll("option")).find(
      (opt) => opt.textContent === "研究",
    )!.value;
    await user.selectOptions(folderSelectA, folderId);
    await user.click(dialog().getByRole("button", { name: "お気に入り: マップA" }));

    // バックアップ作成
    await user.click(dialog().getByRole("button", { name: "全マップをバックアップ" }));
    await user.click(dialog().getByRole("button", { name: "ダウンロードを開始" }));
    const backupJson = mockDownloadLibraryBackup.mock.lastCall![0] as string;

    // 既存フォルダーを削除してからバックアップを追加復元
    await user.click(dialog().getByRole("button", { name: "フォルダー管理" }));
    await user.click(dialog().getByRole("button", { name: "削除: 研究" }));
    await user.click(dialog().getByRole("button", { name: "このフォルダーを削除" }));
    await user.click(dialog().getByRole("button", { name: "マップ一覧に戻る" }));

    await user.upload(
      dialog().getByLabelText("バックアップファイル", { selector: "input" }) as HTMLInputElement,
      backupFile(backupJson),
    );
    await waitFor(() => expect(dialog().getByRole("group", { name: "復元を確認" })).toBeInTheDocument());
    await user.click(dialog().getByRole("button", { name: "マップを追加" }));
    await waitFor(() => expect(dialog().getByRole("status")).toHaveTextContent("追加しました"));

    // フォルダー「研究」が復元され、復元されたマップA がお気に入り＆「研究」所属になっている
    expect(readMapIndex(window.localStorage)?.maps).toHaveLength(6);
    const filterSelect = dialog().getByRole("combobox", { name: "フォルダーで絞り込み" });
    const restoredFolderOption = Array.from(filterSelect.querySelectorAll("option")).find(
      (opt) => opt.textContent === "研究",
    );
    expect(restoredFolderOption).toBeDefined();
    await user.selectOptions(filterSelect, restoredFolderOption!.value);
    expect(listRows()).toHaveLength(1);
    expect(listRows()[0]).toHaveTextContent("マップA");
    expect(within(listRows()[0]).getByRole("button", { name: "お気に入り: マップA" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
