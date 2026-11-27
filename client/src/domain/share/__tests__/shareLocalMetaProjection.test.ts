import {
  shareLocalMetaAfterPublish,
  shareLocalMetaAfterRevoke,
  shareLocalMetaFromCreate,
  shareLocalMetaFromListItem,
  shareLocalMetaWithActiveLink,
} from "@/domain/share/shareLocalMetaProjection";

describe("shareLocalMetaFromCreate", () => {
  it("sharedMapId と公開時刻・linkActive=true を写す", () => {
    expect(shareLocalMetaFromCreate(
      {
        sharedMapId: "sm-1",
        link: { linkId: "l1", url: "https://example.com/share/t", token: "t", permission: "view" },
      },
      "2026-11-26T00:00:00.000Z",
    )).toEqual({
      sharedMapId: "sm-1",
      lastPublishedAt: "2026-11-26T00:00:00.000Z",
      linkActive: true,
    });
  });
});

describe("shareLocalMetaFromListItem", () => {
  it("currentRevisionId 無しは未公開・有効リンク有無を反映", () => {
    expect(shareLocalMetaFromListItem({
      id: "sm-1",
      currentRevisionId: null,
      updatedAt: "2026-11-02T00:00:00.000Z",
      links: [{ id: "l1", permission: "view", createdAt: "a", revokedAt: "b", expiresAt: null }],
    })).toEqual({
      sharedMapId: "sm-1",
      lastPublishedAt: null,
      linkActive: false,
    });
    expect(shareLocalMetaFromListItem({
      id: "sm-1",
      currentRevisionId: "r1",
      updatedAt: "2026-11-02T00:00:00.000Z",
      links: [{ id: "l1", permission: "view", createdAt: "a", revokedAt: null, expiresAt: null }],
    })).toEqual({
      sharedMapId: "sm-1",
      lastPublishedAt: "2026-11-02T00:00:00.000Z",
      linkActive: true,
    });
  });
});

describe("shareLocalMetaAfterPublish", () => {
  it("公開時刻を更新し linkActive は previous を維持する", () => {
    expect(shareLocalMetaAfterPublish(
      "sm-1",
      "2026-11-26T12:00:00.000Z",
      { sharedMapId: "sm-1", lastPublishedAt: "old", linkActive: false },
    )).toEqual({
      sharedMapId: "sm-1",
      lastPublishedAt: "2026-11-26T12:00:00.000Z",
      linkActive: false,
    });
  });

  it("previous 無しは linkActive=true", () => {
    expect(shareLocalMetaAfterPublish("sm-1", "2026-11-26T12:00:00.000Z", null)).toEqual({
      sharedMapId: "sm-1",
      lastPublishedAt: "2026-11-26T12:00:00.000Z",
      linkActive: true,
    });
  });
});

describe("shareLocalMetaWithActiveLink", () => {
  it("lastPublishedAt を維持し linkActive=true", () => {
    expect(shareLocalMetaWithActiveLink(
      "sm-1",
      { sharedMapId: "sm-1", lastPublishedAt: "2026-11-01T00:00:00.000Z", linkActive: false },
    )).toEqual({
      sharedMapId: "sm-1",
      lastPublishedAt: "2026-11-01T00:00:00.000Z",
      linkActive: true,
    });
  });
});

describe("shareLocalMetaAfterRevoke", () => {
  it("呼び出し側の linkActive を反映する", () => {
    expect(shareLocalMetaAfterRevoke(
      "sm-1",
      { sharedMapId: "sm-1", lastPublishedAt: "pub", linkActive: true },
      false,
    )).toEqual({
      sharedMapId: "sm-1",
      lastPublishedAt: "pub",
      linkActive: false,
    });
  });
});
