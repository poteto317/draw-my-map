import {
  planShareLocalMetaClear,
  planShareLocalMetaPersist,
} from "@/domain/share/shareLocalMetaPersist";
import { SHARE_MESSAGES } from "@/domain/share/shareMessages";

const next = {
  sharedMapId: "sm-1",
  lastPublishedAt: "2026-11-01T00:00:00.000Z",
  linkActive: true,
};

describe("planShareLocalMetaPersist", () => {
  it("成功は present へ", () => {
    expect(planShareLocalMetaPersist({ ok: true }, next)).toEqual({
      notice: "success",
      localMeta: { status: "present", value: next },
    });
  });

  it("read-error は read-error メタと失敗 notice", () => {
    expect(planShareLocalMetaPersist({ ok: false, kind: "read-error", error: "corrupt" }, next)).toEqual({
      notice: "error",
      message: SHARE_MESSAGES.localMetaWriteFailed,
      localMeta: { status: "read-error", error: "corrupt" },
    });
  });

  it("write-error はメタを変えない（null）", () => {
    expect(planShareLocalMetaPersist({ ok: false, kind: "write-error", error: "quota" }, next)).toEqual({
      notice: "error",
      message: SHARE_MESSAGES.localMetaWriteFailed,
      localMeta: null,
    });
  });
});

describe("planShareLocalMetaClear", () => {
  it("成功は missing へ", () => {
    expect(planShareLocalMetaClear({ ok: true })).toEqual({
      notice: "success",
      localMeta: { status: "missing" },
    });
  });

  it("read-error は read-error メタと失敗 notice", () => {
    expect(planShareLocalMetaClear({ ok: false, kind: "read-error", error: "corrupt" })).toEqual({
      notice: "error",
      message: SHARE_MESSAGES.localMetaWriteFailed,
      localMeta: { status: "read-error", error: "corrupt" },
    });
  });

  it("write-error はメタを変えない（null）", () => {
    expect(planShareLocalMetaClear({ ok: false, kind: "write-error", error: "quota" })).toEqual({
      notice: "error",
      message: SHARE_MESSAGES.localMetaWriteFailed,
      localMeta: null,
    });
  });
});
