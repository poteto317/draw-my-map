import {
  BRANCH_MOVE_ROOT_TARGET,
  canSubmitBranchMove,
  closeBranchMoveDialog,
  consumeBranchMoveFocusRequest,
  createBranchMoveDialogState,
  failBranchMoveDialog,
  openBranchMoveDialog,
  selectBranchMoveParentTarget,
  selectBranchMoveTargetMap,
  staleBranchMoveError,
  toBranchMoveParentId,
  type BranchMoveDialogState,
} from "@/hooks/branchMoveDialogState";
import { createTestNode } from "@/testing/createTestNode";

const opened = openBranchMoveDialog(createBranchMoveDialogState("a"), { sourceId: 2, revision: 7, mapId: "a" });

describe("状態の遷移", () => {
  it("初期状態は閉じていて、現在のマップを移動先にする", () => {
    expect(createBranchMoveDialogState("a")).toMatchObject({ screen: "closed", sourceId: null, targetMapId: "a" });
  });

  it("開くと移動元と文書の版を固定し、選択と誤りを初期化してダイアログへフォーカスを要求する", () => {
    const failed = failBranchMoveDialog(selectBranchMoveParentTarget(opened, "5"), "失敗");
    expect(openBranchMoveDialog(failed, { sourceId: 3, revision: 8, mapId: "a" })).toMatchObject({
      screen: "open",
      sourceId: 3,
      openedRevision: 8,
      parentTarget: "",
      focusRequest: "dialog",
      error: { message: null },
    });
  });

  it("閉じるとヘッダーへフォーカスを要求する", () => {
    expect(closeBranchMoveDialog(opened)).toMatchObject({ screen: "closed", focusRequest: "header" });
  });

  it("移動先マップを変えると親の選択と誤りを消す", () => {
    const failed = failBranchMoveDialog(selectBranchMoveParentTarget(opened, "5"), "失敗");
    expect(selectBranchMoveTargetMap(failed, "b")).toMatchObject({
      targetMapId: "b",
      parentTarget: "",
      error: { message: null },
    });
  });

  it("親を選ぶと誤りを消す", () => {
    const failed = failBranchMoveDialog(opened, "失敗");
    expect(selectBranchMoveParentTarget(failed, "5")).toMatchObject({ parentTarget: "5", error: { message: null } });
  });

  it("同じ誤りでも読み上げ直せるように sequence を進める", () => {
    const first = failBranchMoveDialog(opened, "失敗");
    const second = failBranchMoveDialog(first, "失敗");
    expect(second.error.sequence).toBe(first.error.sequence + 1);
  });

  it("フォーカスの要求が無ければ同じ状態を返す", () => {
    const consumed = consumeBranchMoveFocusRequest(opened);
    expect(consumed.focusRequest).toBeNull();
    expect(consumeBranchMoveFocusRequest(consumed)).toBe(consumed);
  });

  it("古くなった誤りは状態を変えずに表示用の値を作る", () => {
    const error = { sequence: 3, message: null };
    expect(staleBranchMoveError(error)).toEqual({
      sequence: 4,
      message: "マップが更新されました。閉じてから移動する枝を選び直してください。",
    });
    expect(error.sequence).toBe(3);
  });
});

describe("toBranchMoveParentId", () => {
  it("新しいルートは null、それ以外はノードIDにする", () => {
    expect(toBranchMoveParentId(BRANCH_MOVE_ROOT_TARGET)).toBeNull();
    expect(toBranchMoveParentId("5")).toBe(5);
  });
});

describe("canSubmitBranchMove", () => {
  const source = createTestNode({ id: 2, parentId: 1 });
  const candidate = createTestNode({ id: 5, parentId: null });
  const state: BranchMoveDialogState = selectBranchMoveParentTarget(opened, "5");
  const valid = {
    state,
    source,
    stale: false,
    mapMoveTargets: [{ id: "a", name: "A", updatedAt: "" }, { id: "b", name: "B", updatedAt: "" }],
    sameMap: true,
    allowRoot: true,
    parentCandidates: [candidate],
  };

  it("同じマップで候補の親を選んでいれば確定できる", () => {
    expect(canSubmitBranchMove(valid)).toBe(true);
  });

  it.each([
    ["閉じている", { state: closeBranchMoveDialog(state) }],
    ["文書が更新された", { stale: true }],
    ["移動元が無い", { source: undefined }],
    ["移動先マップが一覧に無い", { state: selectBranchMoveTargetMap(state, "gone"), sameMap: false }],
    ["親が未選択", { state: selectBranchMoveParentTarget(state, "") }],
    ["親が候補に無い", { state: selectBranchMoveParentTarget(state, "9") }],
    ["根の枝を新しいルートへ移す", { state: selectBranchMoveParentTarget(state, BRANCH_MOVE_ROOT_TARGET), allowRoot: false }],
  ])("%sときは確定できない", (_name, override) => {
    expect(canSubmitBranchMove({ ...valid, ...override })).toBe(false);
  });

  it("別のマップへは親を選ばなくても確定できる", () => {
    expect(canSubmitBranchMove({
      ...valid,
      state: selectBranchMoveTargetMap(state, "b"),
      sameMap: false,
    })).toBe(true);
  });
});
