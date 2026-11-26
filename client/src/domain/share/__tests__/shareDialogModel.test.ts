import {
  formatShareLocalMetaSummary,
  listActiveShareLinksForMap,
} from "@/domain/share/shareDialogModel";
import { SHARE_MESSAGES } from "@/domain/share/shareMessages";

describe("formatShareLocalMetaSummary", () => {
  it("missing / read-error / present を区別する", () => {
    expect(formatShareLocalMetaSummary({ status: "missing" })).toBe(SHARE_MESSAGES.notShared);
    expect(formatShareLocalMetaSummary({ status: "read-error", error: "x" })).toBe(
      SHARE_MESSAGES.localMetaReadError,
    );
    expect(formatShareLocalMetaSummary({
      status: "present",
      value: {
        sharedMapId: "sm-1",
        lastPublishedAt: "2026-11-01T00:00:00.000Z",
        linkActive: true,
      },
    })).toBe(`${SHARE_MESSAGES.lastPublished}: 2026-11-01T00:00:00.000Z / ${SHARE_MESSAGES.linkActive}`);
    expect(formatShareLocalMetaSummary({
      status: "present",
      value: {
        sharedMapId: "sm-1",
        lastPublishedAt: null,
        linkActive: false,
      },
    })).toBe(`${SHARE_MESSAGES.neverPublished} / ${SHARE_MESSAGES.linkInactive}`);
  });
});

describe("listActiveShareLinksForMap", () => {
  const list = [
    {
      id: "sm-1",
      localMapId: "map-1",
      links: [
        { id: "l1", createdAt: "2026-11-01T00:00:00.000Z", revokedAt: null },
        { id: "l0", createdAt: "2026-10-01T00:00:00.000Z", revokedAt: "2026-10-02T00:00:00.000Z" },
      ],
    },
  ];

  it("present でない・一覧に無いときは空", () => {
    expect(listActiveShareLinksForMap(list, "map-1", { status: "missing" })).toEqual([]);
    expect(listActiveShareLinksForMap(list, "map-1", { status: "read-error", error: "e" })).toEqual([]);
    expect(listActiveShareLinksForMap(list, "map-other", {
      status: "present",
      value: { sharedMapId: "sm-other", lastPublishedAt: null, linkActive: true },
    })).toEqual([]);
  });

  it("有効リンクだけ返す（revoked 除外）", () => {
    expect(listActiveShareLinksForMap(list, "map-1", {
      status: "present",
      value: { sharedMapId: "sm-1", lastPublishedAt: null, linkActive: true },
    })).toEqual([{ id: "l1", createdAt: "2026-11-01T00:00:00.000Z" }]);
  });
});
