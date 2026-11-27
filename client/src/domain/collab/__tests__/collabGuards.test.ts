import {
  resolveCollabEntryBlocked,
  resolveCollabInputBlocked,
  resolveCollabStartBlocked,
} from "@/domain/collab/collabGuards";
import { COLLAB_MESSAGES } from "@/domain/collab/collabMessages";
import type { CollabSessionUi } from "@/domain/collab/collabSessionUi";

const idle: CollabSessionUi = { status: "idle" };
const connecting: CollabSessionUi = { status: "connecting" };
const active: CollabSessionUi = { status: "active", sessionId: "s1", role: "owner" };
const reconnecting: CollabSessionUi = {
  status: "reconnecting",
  sessionId: "s1",
  since: 1,
};
const error: CollabSessionUi = { status: "error", error: "x" };

describe("resolveCollabEntryBlocked（inventory active 中の拒否）", () => {
  it.each([
    "save",
    "learn",
    "presentation",
    "voice",
    "comments",
    "protect",
    "mapSwitch",
    "outlineImport",
    "jsonImport",
    "aiAssist",
    "bulkEdit",
  ] as const)("active 中は %s を拒否する", (entry) => {
    expect(resolveCollabEntryBlocked(entry, active)).toBe(COLLAB_MESSAGES.blockedByCollab);
    expect(resolveCollabEntryBlocked(entry, idle)).toBeNull();
  });

  it("active 中の publish は拒否し、shareDialogOpen は許可する", () => {
    expect(resolveCollabEntryBlocked("publish", active)).toBe(COLLAB_MESSAGES.blockedByCollab);
    expect(resolveCollabEntryBlocked("shareDialogOpen", active)).toBeNull();
  });

  it("reconnecting 中は shareDialogOpen と outlineExport を拒否する", () => {
    expect(resolveCollabEntryBlocked("shareDialogOpen", reconnecting)).toBe(
      COLLAB_MESSAGES.blockedWhileReconnecting,
    );
    expect(resolveCollabEntryBlocked("outlineExport", reconnecting)).toBe(
      COLLAB_MESSAGES.blockedWhileReconnecting,
    );
  });

  it("active 中の outlineExport は許可する（読取のみ）", () => {
    expect(resolveCollabEntryBlocked("outlineExport", active)).toBeNull();
  });

  it("inventory 交差の代表: 保存・学習・JSON 読込は connecting でも拒否", () => {
    expect(resolveCollabEntryBlocked("save", connecting)).toBe(
      COLLAB_MESSAGES.blockedWhileConnecting,
    );
    expect(resolveCollabEntryBlocked("learn", connecting)).toBe(
      COLLAB_MESSAGES.blockedWhileConnecting,
    );
    expect(resolveCollabEntryBlocked("jsonImport", connecting)).toBe(
      COLLAB_MESSAGES.blockedWhileConnecting,
    );
  });
});

describe("resolveCollabInputBlocked", () => {
  it("reconnecting / connecting / error は入力ブロック、active / idle は許可", () => {
    expect(resolveCollabInputBlocked(idle)).toBeNull();
    expect(resolveCollabInputBlocked(active)).toBeNull();
    expect(resolveCollabInputBlocked(connecting)).toBe(COLLAB_MESSAGES.blockedWhileConnecting);
    expect(resolveCollabInputBlocked(reconnecting)).toBe(COLLAB_MESSAGES.blockedWhileReconnecting);
    expect(resolveCollabInputBlocked(error)).toBe(COLLAB_MESSAGES.statusError);
  });
});

describe("resolveCollabStartBlocked", () => {
  const base = {
    shareSession: { userId: "u1" },
    isProtectedMode: false,
    learningActive: false,
    playingPresentation: false,
    voiceListening: false,
    hasMapConflict: false,
    isMapExternallyDeleted: false,
    collabSession: idle,
  };

  it("保護・学習・プレゼン・音声・競合・未ログインを拒否する", () => {
    expect(resolveCollabStartBlocked({ ...base, shareSession: null })).toBe("unauthenticated");
    expect(resolveCollabStartBlocked({ ...base, isProtectedMode: true })).toBe("protected");
    expect(resolveCollabStartBlocked({ ...base, learningActive: true })).toBe("learning");
    expect(resolveCollabStartBlocked({ ...base, playingPresentation: true })).toBe("presentation");
    expect(resolveCollabStartBlocked({ ...base, voiceListening: true })).toBe("voice");
    expect(resolveCollabStartBlocked({ ...base, hasMapConflict: true })).toBe("conflict");
    expect(resolveCollabStartBlocked({ ...base, collabSession: active })).toBe("busy");
  });
});
