import {
  closeCommandPalette,
  consumeCommandPaletteFocusRequest,
  createCommandPaletteState,
  markCommandPaletteStaleIfNeeded,
  moveCommandPaletteHighlight,
  openCommandPalette,
  setCommandPaletteQuery,
  setCommandPaletteReject,
} from "@/hooks/commandPaletteState";

describe("createCommandPaletteState / open / close", () => {
  it("初期状態は閉じている", () => {
    expect(createCommandPaletteState()).toMatchObject({
      screen: "closed",
      query: "",
      activeIndex: 0,
      openedMapId: null,
      openedRevision: 0,
      closeReason: null,
      focusRequest: null,
      rejectMessage: null,
      rejectSequence: 0,
    });
  });

  it("open で検索語を空・ハイライト先頭・opened mapId/revision を記録する", () => {
    const dirty = setCommandPaletteReject(
      setCommandPaletteQuery(
        openCommandPalette(createCommandPaletteState(), { mapId: "a", revision: 1 }),
        "undo",
      ),
      "不可",
    );
    const moved = moveCommandPaletteHighlight(dirty, "down", 5);

    expect(openCommandPalette(moved, { mapId: "b", revision: 9 })).toMatchObject({
      screen: "open",
      query: "",
      activeIndex: 0,
      openedMapId: "b",
      openedRevision: 9,
      closeReason: null,
      focusRequest: null,
      rejectMessage: null,
    });
  });

  it.each([
    ["dismiss", { kind: "restore-opener" as const }],
    ["stale", { kind: "restore-opener" as const }],
    ["execute-immediate", null],
    ["execute-dialog", null],
  ] as const)("close(%s) は closeReason と focusRequest=%j をセットする", (reason, focusRequest) => {
    const opened = openCommandPalette(createCommandPaletteState(), { mapId: "a", revision: 1 });
    expect(closeCommandPalette(opened, reason)).toMatchObject({
      screen: "closed",
      closeReason: reason,
      focusRequest,
    });
  });
});

describe("setCommandPaletteQuery / moveCommandPaletteHighlight", () => {
  const opened = openCommandPalette(createCommandPaletteState(), { mapId: "a", revision: 1 });

  it("クエリ変更でハイライトを先頭に戻し、拒否を消す", () => {
    const rejected = setCommandPaletteReject(moveCommandPaletteHighlight(opened, "down", 3), "不可");
    expect(setCommandPaletteQuery(rejected, "フィット")).toMatchObject({
      query: "フィット",
      activeIndex: 0,
      rejectMessage: null,
    });
  });

  it("↑↓ は端で止まり、不可候補も移動できる（itemCount 全体を対象）", () => {
    expect(moveCommandPaletteHighlight(opened, "up", 3).activeIndex).toBe(0);
    expect(moveCommandPaletteHighlight(opened, "down", 3).activeIndex).toBe(1);
    const atEnd = moveCommandPaletteHighlight(
      moveCommandPaletteHighlight(opened, "down", 3),
      "down",
      3,
    );
    expect(atEnd.activeIndex).toBe(2);
    expect(moveCommandPaletteHighlight(atEnd, "down", 3).activeIndex).toBe(2);
  });

  it("Home/End で先頭・末尾へ移る", () => {
    const mid = moveCommandPaletteHighlight(opened, "down", 4);
    expect(moveCommandPaletteHighlight(mid, "end", 4).activeIndex).toBe(3);
    expect(moveCommandPaletteHighlight(mid, "home", 4).activeIndex).toBe(0);
  });

  it("itemCount が 0 のときは activeIndex を 0 のままにする", () => {
    expect(moveCommandPaletteHighlight(opened, "down", 0).activeIndex).toBe(0);
    expect(moveCommandPaletteHighlight(opened, "end", 0).activeIndex).toBe(0);
  });
});

describe("reject / focusRequest / stale", () => {
  const opened = openCommandPalette(createCommandPaletteState(), { mapId: "a", revision: 1 });

  it("同じ拒否文言でも sequence を進める", () => {
    const first = setCommandPaletteReject(opened, "選択がありません");
    const second = setCommandPaletteReject(first, "選択がありません");
    expect(first.rejectMessage).toBe("選択がありません");
    expect(second.rejectSequence).toBe(first.rejectSequence + 1);
  });

  it("フォーカス要求が無ければ同じ状態を返す", () => {
    const closed = closeCommandPalette(opened, "dismiss");
    const consumed = consumeCommandPaletteFocusRequest(closed);
    expect(consumed.focusRequest).toBeNull();
    expect(consumeCommandPaletteFocusRequest(consumed)).toBe(consumed);
  });

  it("開中に mapId または revision が変わると stale で閉じる", () => {
    expect(markCommandPaletteStaleIfNeeded(opened, { mapId: "a", revision: 1 })).toBe(opened);
    expect(markCommandPaletteStaleIfNeeded(opened, { mapId: "a", revision: 2 })).toMatchObject({
      screen: "closed",
      closeReason: "stale",
      focusRequest: { kind: "restore-opener" },
    });
    expect(markCommandPaletteStaleIfNeeded(opened, { mapId: "b", revision: 1 })).toMatchObject({
      screen: "closed",
      closeReason: "stale",
      focusRequest: { kind: "restore-opener" },
    });
  });

  it("閉じていれば mapId/revision 変化でもそのまま", () => {
    const closed = createCommandPaletteState();
    expect(markCommandPaletteStaleIfNeeded(closed, { mapId: "x", revision: 99 })).toBe(closed);
  });
});
