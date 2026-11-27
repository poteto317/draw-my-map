import {
  collabSessionStatusLabel,
  resolveCollabControlVisibility,
} from "@/domain/collab/collabControlModel";
import { COLLAB_MESSAGES } from "@/domain/collab/collabMessages";
import type { CollabSessionUi } from "@/domain/collab/collabSessionUi";
import type { ShareSession } from "@/domain/share/shareSession";

const session: ShareSession = { userId: "u1", email: "a@example.com", displayName: null };

describe("resolveCollabControlVisibility", () => {
  it("idle は開始のみ、error は再試行と退出", () => {
    expect(
      resolveCollabControlVisibility({
        collabSession: { status: "idle" },
        shareSession: session,
      }),
    ).toMatchObject({
      showStart: true,
      showRetry: false,
      showEnd: false,
      showLeave: false,
      startDisabled: false,
    });

    expect(
      resolveCollabControlVisibility({
        collabSession: { status: "error", error: "connection-error" },
        shareSession: session,
      }),
    ).toMatchObject({
      showStart: false,
      showRetry: true,
      showLeave: true,
      showEnd: false,
      showDroppedGraceHint: false,
    });
  });

  it("active の所有者は終了、参加者は退出。reconnecting は退出可・終了不可", () => {
    const ownerActive: CollabSessionUi = {
      status: "active",
      sessionId: "s1",
      role: "owner",
    };
    const editorActive: CollabSessionUi = {
      status: "active",
      sessionId: "s1",
      role: "editor",
    };
    expect(resolveCollabControlVisibility({
      collabSession: ownerActive,
      shareSession: session,
    })).toMatchObject({ showEnd: true, showLeave: false, showStart: false });
    expect(resolveCollabControlVisibility({
      collabSession: editorActive,
      shareSession: session,
    })).toMatchObject({ showEnd: false, showLeave: true });
    expect(resolveCollabControlVisibility({
      collabSession: { status: "reconnecting", sessionId: "s1", since: 1 },
      shareSession: session,
    })).toMatchObject({ showLeave: true, showEnd: false, showRetry: false });
  });

  it("未ログインまたは startDisabledReason で開始を塞ぐ。dropped-grace ヒント", () => {
    expect(
      resolveCollabControlVisibility({
        collabSession: { status: "idle" },
        shareSession: null,
      }).startDisabled,
    ).toBe(true);
    expect(
      resolveCollabControlVisibility({
        collabSession: { status: "idle" },
        shareSession: session,
        startDisabledReason: "保護モード中",
      }).startDisabled,
    ).toBe(true);
    expect(
      resolveCollabControlVisibility({
        collabSession: { status: "error", error: "dropped-grace" },
        shareSession: session,
      }).showDroppedGraceHint,
    ).toBe(true);
  });
});

describe("collabSessionStatusLabel", () => {
  it("各状態の固定文言", () => {
    expect(collabSessionStatusLabel({ status: "idle" })).toBe(COLLAB_MESSAGES.statusIdle);
    expect(collabSessionStatusLabel({ status: "connecting" })).toBe(
      COLLAB_MESSAGES.statusConnecting,
    );
    expect(
      collabSessionStatusLabel({ status: "active", sessionId: "s", role: "owner" }),
    ).toBe(COLLAB_MESSAGES.statusActive);
    expect(
      collabSessionStatusLabel({ status: "reconnecting", sessionId: "s", since: 1 }),
    ).toBe(COLLAB_MESSAGES.statusReconnecting);
    expect(collabSessionStatusLabel({ status: "error", error: "x" })).toBe(
      COLLAB_MESSAGES.statusError,
    );
  });
});
