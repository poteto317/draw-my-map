import { isCollabJoinAtCapacity } from "@/domain/collab/collabJoinAdmission";

describe("isCollabJoinAtCapacity", () => {
  it("接続数または参加者数が上限以上なら true", () => {
    expect(
      isCollabJoinAtCapacity({
        connectionCount: 8,
        participantCount: 1,
        maxConnections: 8,
      }),
    ).toBe(true);
    expect(
      isCollabJoinAtCapacity({
        connectionCount: 1,
        participantCount: 8,
        maxConnections: 8,
      }),
    ).toBe(true);
  });

  it("どちらも未満なら false", () => {
    expect(
      isCollabJoinAtCapacity({
        connectionCount: 7,
        participantCount: 7,
        maxConnections: 8,
      }),
    ).toBe(false);
  });
});
