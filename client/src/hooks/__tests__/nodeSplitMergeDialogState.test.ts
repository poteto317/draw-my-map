import { MERGE_DEFAULT_SEPARATOR, SPLIT_DEFAULT_SEPARATOR } from "@/domain/nodes/nodeSeparator";
import { STALE_DIALOG_MESSAGE } from "@/hooks/dialogPreviewText";
import {
  closeNodeSplitMergeDialog,
  consumeNodeSplitMergeFocusRequest,
  createNodeSplitMergeDialogState,
  currentNodeSeparator,
  dismissNodeSplitMergeDialog,
  failNodeSplitMergeDialog,
  isNodeSplitMergeDialogOpen,
  openNodeSplitMergeDialog,
  setNodeSeparatorCustom,
  setNodeSeparatorPreset,
  staleNodeSplitMergeError,
  type NodeSplitMergeTarget,
} from "@/hooks/nodeSplitMergeDialogState";

const splitTarget: NodeSplitMergeTarget = { kind: "split", nodeId: 4 };
const mergeTarget: NodeSplitMergeTarget = { kind: "merge", ids: [2, 5, 7], primaryId: 5 };

function openedSplit(mapId = "a") {
  return openNodeSplitMergeDialog(createNodeSplitMergeDialogState(), {
    target: splitTarget,
    defaultSeparator: SPLIT_DEFAULT_SEPARATOR,
    revision: 3,
    mapId,
  });
}

function openedMerge(mapId = "a") {
  return openNodeSplitMergeDialog(createNodeSplitMergeDialogState(), {
    target: mergeTarget,
    defaultSeparator: MERGE_DEFAULT_SEPARATOR,
    revision: 3,
    mapId,
  });
}

describe("nodeSplitMergeDialogState", () => {
  it("分割で開くと、対象のノードと版を記録し、区切り文字を「、」にして、区切り文字へフォーカスを求める", () => {
    const state = openedSplit();

    expect(state).toMatchObject({
      screen: "open",
      mapId: "a",
      openedRevision: 3,
      target: { kind: "split", nodeId: 4 },
      separatorPreset: "ja-comma",
      focusRequest: "separator",
    });
    expect(currentNodeSeparator(state)).toBe("、");
  });

  it("統合で開くと、選択集合と主選択を記録し、区切り文字を半角スペースにする", () => {
    const state = openedMerge();

    expect(state.target).toEqual({ kind: "merge", ids: [2, 5, 7], primaryId: 5 });
    expect(state.separatorPreset).toBe("space");
    expect(currentNodeSeparator(state)).toBe(" ");
  });

  it("既定値がプリセットに無ければ「その他」にして、入力欄へその値を入れる", () => {
    const state = openNodeSplitMergeDialog(createNodeSplitMergeDialogState(), {
      target: splitTarget,
      defaultSeparator: "→",
      revision: 0,
      mapId: "a",
    });

    expect(state).toMatchObject({ separatorPreset: "custom", customSeparator: "→" });
    expect(currentNodeSeparator(state)).toBe("→");
  });

  it("開き直すと、前回のプリセットも「その他」の入力も持ち越さず既定値へ戻す", () => {
    const dirty = setNodeSeparatorCustom(setNodeSeparatorPreset(openedSplit(), "custom"), " | ");
    const reopened = openNodeSplitMergeDialog(closeNodeSplitMergeDialog(dirty), {
      target: splitTarget,
      defaultSeparator: SPLIT_DEFAULT_SEPARATOR,
      revision: 4,
      mapId: "a",
    });

    expect(reopened).toMatchObject({ separatorPreset: "ja-comma", customSeparator: "", openedRevision: 4 });
  });

  it("プリセットを選ぶと区切り文字が変わり、「その他」では入力欄の文字列になる（空のままなら空文字）", () => {
    const slash = setNodeSeparatorPreset(openedSplit(), "slash");
    expect(currentNodeSeparator(slash)).toBe("/");

    const custom = setNodeSeparatorPreset(slash, "custom");
    expect(currentNodeSeparator(custom)).toBe("");
    expect(currentNodeSeparator(setNodeSeparatorCustom(custom, " -> "))).toBe(" -> ");
  });

  it("知らないプリセットの id は無視して、状態をそのまま返す", () => {
    const state = openedSplit();

    expect(setNodeSeparatorPreset(state, "unknown")).toBe(state);
  });

  it("入力の変更はエラーを空にして sequence を進める", () => {
    const failed = failNodeSplitMergeDialog(openedSplit(), "失敗");
    const changed = setNodeSeparatorPreset(failed, "comma");

    expect(failed.error.message).toBe("失敗");
    expect(changed.error).toEqual({ sequence: failed.error.sequence + 1, message: null });
    expect(setNodeSeparatorCustom(failed, "x").error).toEqual({ sequence: failed.error.sequence + 1, message: null });
  });

  it("閉じるとヘッダーへのフォーカスを求め、フォーカス要求は一度で消える", () => {
    const closed = closeNodeSplitMergeDialog(openedSplit());

    expect(closed).toMatchObject({ screen: "closed", focusRequest: "header" });
    expect(consumeNodeSplitMergeFocusRequest(closed).focusRequest).toBeNull();
    expect(consumeNodeSplitMergeFocusRequest(consumeNodeSplitMergeFocusRequest(closed)).focusRequest).toBeNull();
  });

  it("外から閉じる（dismiss）と閉じた状態になり、フォーカスは求めない", () => {
    expect(dismissNodeSplitMergeDialog(openedMerge())).toMatchObject({ screen: "closed", focusRequest: null });
  });

  it("開いていても mapId が違えば開いていないとみなす（外から閉じた扱い）", () => {
    const state = openedSplit("a");

    expect(isNodeSplitMergeDialogOpen(state, "a")).toBe(true);
    expect(isNodeSplitMergeDialogOpen(state, "b")).toBe(false);
    expect(isNodeSplitMergeDialogOpen(closeNodeSplitMergeDialog(state), "a")).toBe(false);
  });

  it("stale のエラーは共有の固定の文言で、sequence を進める", () => {
    expect(staleNodeSplitMergeError({ sequence: 2, message: null })).toEqual({
      sequence: 3,
      message: STALE_DIALOG_MESSAGE,
    });
  });
});
