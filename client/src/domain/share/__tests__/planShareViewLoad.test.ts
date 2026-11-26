import {
  planShareViewDocumentParse,
  planShareViewLoad,
  planShareViewLoadCaughtError,
  shareViewLoadFailureMessage,
} from "@/domain/share/planShareViewLoad";
import { SHARE_MESSAGES } from "@/domain/share/shareMessages";
import { createMapDocument, serializeMapDocument } from "@/domain/persistence/mapDocumentCodec";

describe("shareViewLoadFailureMessage", () => {
  it("not-found は viewNotFound、それ以外は viewLoadFailed", () => {
    expect(shareViewLoadFailureMessage("not-found")).toBe(SHARE_MESSAGES.viewNotFound);
    expect(shareViewLoadFailureMessage("storage-error")).toBe(SHARE_MESSAGES.viewLoadFailed);
    expect(shareViewLoadFailureMessage("network-error")).toBe(SHARE_MESSAGES.viewLoadFailed);
  });
});

describe("planShareViewLoad", () => {
  it("API 失敗は error LoadState", () => {
    expect(planShareViewLoad({ ok: false, reason: "not-found" })).toEqual({
      status: "error",
      document: null,
      loadError: SHARE_MESSAGES.viewNotFound,
    });
  });

  it("成功＋妥当 JSON は ready", () => {
    const document = createMapDocument([], "manual");
    const plan = planShareViewLoad({
      ok: true,
      value: { documentJson: serializeMapDocument(document) },
    });
    expect(plan.status).toBe("ready");
    if (plan.status === "ready") {
      expect(plan.document.nodes).toEqual([]);
      expect(plan.loadError).toBeNull();
    }
  });

  it("成功だが不正 JSON は error", () => {
    expect(planShareViewLoad({
      ok: true,
      value: { documentJson: "{not-json" },
    })).toEqual({
      status: "error",
      document: null,
      loadError: SHARE_MESSAGES.viewLoadFailed,
    });
  });
});

describe("planShareViewDocumentParse / planShareViewLoadCaughtError", () => {
  it("パース失敗と例外経路は固定文言", () => {
    expect(planShareViewDocumentParse({
      ok: false,
      error: SHARE_MESSAGES.viewLoadFailed,
    })).toEqual({
      status: "error",
      document: null,
      loadError: SHARE_MESSAGES.viewLoadFailed,
    });
    expect(planShareViewLoadCaughtError()).toEqual({
      status: "error",
      document: null,
      loadError: SHARE_MESSAGES.viewLoadFailed,
    });
  });
});
