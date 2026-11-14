import {
  branchMovedToMapNotice,
  branchMoveFlushFailedNotice,
  branchMoveRejectedNotice,
  AUTO_SAVE_FAILURE_MESSAGE,
  autoSaveFailedNotice,
  bodyRemovalFailedNotice,
  createFlushFailedNotice,
  currentBodyRemovalFailedNotice,
  currentMapDeletedNotice,
  indexWriteFailedNotice,
  isAutoSaveFailedNotice,
  lastBodyRemovalFailedNotice,
  lastMapDeletedNotice,
  mapCreatedNotice,
  mapDeletedNotice,
  mapIdUnavailableNotice,
  mapRenamedNotice,
  mapSwitchedNotice,
  switchFlushFailedNotice,
} from "../mapLibraryMessages";

describe("mapLibraryMessages", () => {
  it("自動保存の失敗の文言を定める", () => {
    expect(AUTO_SAVE_FAILURE_MESSAGE).toBe(
      "ブラウザへ自動保存できませんでした。不要なマップを削除するか、JSONで書き出してください。",
    );
  });

  it("自動保存の失敗の通知は error で、自動保存の文言を使う", () => {
    expect(autoSaveFailedNotice()).toEqual({
      kind: "error",
      message: AUTO_SAVE_FAILURE_MESSAGE,
    });
  });

  it("自動保存の失敗の通知だけを自動保存の失敗と判定する", () => {
    expect(isAutoSaveFailedNotice(autoSaveFailedNotice())).toBe(true);
    expect(isAutoSaveFailedNotice(null)).toBe(false);
    expect(isAutoSaveFailedNotice({ kind: "warning", message: AUTO_SAVE_FAILURE_MESSAGE })).toBe(false);
    expect(isAutoSaveFailedNotice(createFlushFailedNotice())).toBe(false);
  });

  it("成功の通知は status で、名前をそのまま入れる", () => {
    expect(mapCreatedNotice("地図 A")).toEqual({
      kind: "status",
      message: "マップ「地図 A」を作成しました。",
    });
    expect(mapSwitchedNotice("地図 A")).toEqual({
      kind: "status",
      message: "マップ「地図 A」を開きました。",
    });
    expect(mapRenamedNotice("地図 A")).toEqual({
      kind: "status",
      message: "マップの名前を「地図 A」に変更しました。",
    });
    expect(mapDeletedNotice("地図 A")).toEqual({
      kind: "status",
      message: "マップ「地図 A」をゴミ箱に移動しました。",
    });
    expect(currentMapDeletedNotice("地図 A", "地図 B")).toEqual({
      kind: "status",
      message: "マップ「地図 A」をゴミ箱に移動し、「地図 B」を開きました。",
    });
    expect(lastMapDeletedNotice("地図 A")).toEqual({
      kind: "status",
      message: "マップ「地図 A」をゴミ箱に移動し、新しい「無題のマップ」を作成しました。",
    });
  });

  it("flush の失敗は error で、操作ごとに文言を分ける", () => {
    expect(switchFlushFailedNotice()).toEqual({
      kind: "error",
      message:
        "現在のマップを保存できなかったため、マップを切り替えませんでした。不要なマップを削除するか、JSONで書き出してください。",
    });
    expect(createFlushFailedNotice()).toEqual({
      kind: "error",
      message:
        "現在のマップを保存できなかったため、新しいマップを作成しませんでした。不要なマップを削除するか、JSONで書き出してください。",
    });
  });

  it.each([
    ["マップを作成"],
    ["マップを切り替え"],
    ["名前を変更"],
    ["マップを削除"],
  ] as const)("インデックスの書き込みの失敗は error で、操作「%s」を入れる", (operation) => {
    expect(indexWriteFailedNotice(operation)).toEqual({
      kind: "error",
      message: `マップの一覧を保存できなかったため、${operation}できませんでした。不要なマップを削除してください。`,
    });
  });

  it("本体の削除の失敗は warning で、場面ごとに文言を分ける", () => {
    expect(bodyRemovalFailedNotice("地図 A")).toEqual({
      kind: "warning",
      message:
        "マップ「地図 A」を一覧から削除しましたが、保存データの一部を消せませんでした。",
    });
    expect(currentBodyRemovalFailedNotice("地図 A", "地図 B")).toEqual({
      kind: "warning",
      message:
        "マップ「地図 A」を一覧から削除し、「地図 B」を開きましたが、保存データの一部を消せませんでした。",
    });
    expect(lastBodyRemovalFailedNotice("地図 A")).toEqual({
      kind: "warning",
      message:
        "マップ「地図 A」を一覧から削除し、新しい「無題のマップ」を作成しましたが、保存データの一部を消せませんでした。",
    });
  });

  it("枝の移動の通知", () => {
    expect(branchMoveFlushFailedNotice()).toEqual({
      kind: "error",
      message: "編集中のマップを保存できないため、枝を移動できませんでした。",
    });
    expect(branchMoveRejectedNotice()).toEqual({
      kind: "error",
      message: "枝を移動できませんでした。移動元と移動先を確認してやり直してください。",
    });
    expect(branchMovedToMapNotice()).toEqual({
      kind: "status",
      message: "枝を移動し、移動先のマップを開きました。",
    });
  });

  it("id を決められないときは error", () => {
    expect(mapIdUnavailableNotice()).toEqual({
      kind: "error",
      message: "新しいマップを作成できませんでした。もう一度お試しください。",
    });
  });
});
