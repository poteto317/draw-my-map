import {
  applyReissueToShareList,
  applyRevokeToShareList,
  shareListHasActiveLink,
} from "@/domain/share/shareListMutations";

const list = [
  {
    id: "sm-1",
    localMapId: "map-1",
    title: "A",
    currentRevisionId: "r1",
    updatedAt: "u",
    createdAt: "c",
    links: [
      { id: "l1", permission: "view", createdAt: "c1", revokedAt: null as string | null, expiresAt: null as null },
      { id: "l0", permission: "view", createdAt: "c0", revokedAt: null as string | null, expiresAt: null as null },
    ],
  },
  {
    id: "sm-2",
    localMapId: "map-2",
    title: "B",
    currentRevisionId: null,
    updatedAt: "u",
    createdAt: "c",
    links: [],
  },
];

describe("shareListMutations", () => {
  it("applyRevokeToShareList は対象リンクだけ失効し他マップは不変", () => {
    const next = applyRevokeToShareList(list, "sm-1", "l1", "2026-11-26T00:00:00.000Z");
    expect(next[0].links[0].revokedAt).toBe("2026-11-26T00:00:00.000Z");
    expect(next[0].links[1].revokedAt).toBeNull();
    expect(next[1]).toBe(list[1]);
    expect(shareListHasActiveLink(next, "sm-1")).toBe(true);
  });

  it("全リンク失効後は hasActiveLink=false", () => {
    const once = applyRevokeToShareList(list, "sm-1", "l1", "t1");
    const twice = applyRevokeToShareList(once, "sm-1", "l0", "t2");
    expect(shareListHasActiveLink(twice, "sm-1")).toBe(false);
  });

  it("applyReissueToShareList は旧失効＋新追加", () => {
    const next = applyReissueToShareList(
      list,
      "sm-1",
      "l1",
      { id: "l2", permission: "view", createdAt: "c2", revokedAt: null, expiresAt: null },
      "2026-11-26T00:00:00.000Z",
    );
    expect(next[0].links.find((l) => l.id === "l1")?.revokedAt).toBe("2026-11-26T00:00:00.000Z");
    expect(next[0].links.find((l) => l.id === "l2")).toEqual({
      id: "l2",
      permission: "view",
      createdAt: "c2",
      revokedAt: null,
      expiresAt: null,
    });
    expect(shareListHasActiveLink(next, "sm-1")).toBe(true);
  });
});
