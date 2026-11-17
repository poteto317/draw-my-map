import {
  NODE_NOTE_PREVIEW_DELAY_MS,
  NODE_NOTE_PREVIEW_MAX_WAIT_MS,
  getNodeNotePreviewDelay,
} from "@/hooks/nodeNotePreviewDelay";

describe("getNodeNotePreviewDelay", () => {
  it("定数は 300ms と 2 秒", () => {
    expect(NODE_NOTE_PREVIEW_DELAY_MS).toBe(300);
    expect(NODE_NOTE_PREVIEW_MAX_WAIT_MS).toBe(2000);
  });

  it("未反映の入力が始まったばかりなら、デバウンスの時間だけ待つ", () => {
    expect(getNodeNotePreviewDelay(1000, 1000)).toBe(NODE_NOTE_PREVIEW_DELAY_MS);
  });

  it("打ち切りまでの残りがデバウンスより短ければ、残りだけ待つ", () => {
    expect(getNodeNotePreviewDelay(0, NODE_NOTE_PREVIEW_MAX_WAIT_MS - 120)).toBe(120);
  });

  it("打ち切りの時刻を過ぎていれば、すぐ反映する（負にしない）", () => {
    expect(getNodeNotePreviewDelay(0, NODE_NOTE_PREVIEW_MAX_WAIT_MS)).toBe(0);
    expect(getNodeNotePreviewDelay(0, NODE_NOTE_PREVIEW_MAX_WAIT_MS + 500)).toBe(0);
  });
});
