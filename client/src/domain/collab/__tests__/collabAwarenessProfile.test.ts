import { collabAwarenessProfileFromShareSession } from "@/domain/collab/collabAwarenessProfile";

describe("collabAwarenessProfileFromShareSession", () => {
  it("未ログインは null", () => {
    expect(collabAwarenessProfileFromShareSession(null)).toBeNull();
  });

  it("Google displayName があれば userId と表示名を返す（email は載せない）", () => {
    expect(
      collabAwarenessProfileFromShareSession({
        userId: "u1",
        email: "secret@example.com",
        displayName: "山田",
      }),
    ).toEqual({ userId: "u1", displayName: "山田" });
  });

  it("displayName 欠落・空は null（email フォールバックしない・L-002）", () => {
    expect(
      collabAwarenessProfileFromShareSession({
        userId: "u1",
        email: "secret@example.com",
        displayName: null,
      }),
    ).toBeNull();
    expect(
      collabAwarenessProfileFromShareSession({
        userId: "u1",
        email: "secret@example.com",
        displayName: "",
      }),
    ).toBeNull();
  });
});
