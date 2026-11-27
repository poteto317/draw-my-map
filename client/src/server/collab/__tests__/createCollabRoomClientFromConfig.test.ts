/** @jest-environment node */

import { createCollabRoomClientFromConfig } from "@/server/collab/createCollabApiDeps";
import { createUnimplementedCollabRoomClient } from "@/server/collab/collabRoomClient";

describe("createCollabRoomClientFromConfig", () => {
  it("serviceSecret 無しは未実装クライアント", async () => {
    const room = createCollabRoomClientFromConfig({
      wsOrigin: "wss://collab.example.test",
      serviceSecret: null,
    });
    expect(await room.seed("s", new Uint8Array([1]))).toEqual({
      ok: false,
      reason: "seed-failed",
    });
    // 差し替え可能であること（型・契約）
    const unimplemented = createUnimplementedCollabRoomClient();
    expect(typeof unimplemented.seed).toBe("function");
  });

  it("serviceSecret ありは HTTP クライアント（失敗も seed-failed）", async () => {
    const room = createCollabRoomClientFromConfig({
      wsOrigin: "https://collab.example.test",
      serviceSecret: "svc",
    });
    // 実ネットは叩かず、未到達で seed-failed になることだけ確認（fetch 失敗）
    const result = await room.seed("s", new Uint8Array([1]));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("seed-failed");
  });
});
