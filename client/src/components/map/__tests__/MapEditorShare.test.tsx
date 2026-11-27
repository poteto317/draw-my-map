import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RefObject } from "react";
import { MapEditor } from "@/components/map/MapEditor";
import {
  renderReady,
  resetMapStageTestRuntime,
} from "@/components/map/testing/mapStageTestRuntime";
import { createEmptyMapLibraryMeta } from "@/domain/mapLibrary/mapLibraryMeta";
import { SHARE_MESSAGES } from "@/domain/share/shareMessages";
import type { ShareSession } from "@/domain/share/shareSession";
import { createTestStorageSession, type TestStorageSession } from "@/testing/createTestStorageSession";

jest.mock("pixi.js", () => {
  const runtime = jest.requireActual<typeof import("@/components/map/testing/mapStageTestRuntime")>(
    "@/components/map/testing/mapStageTestRuntime",
  );
  return runtime.createMockPixiModule();
});

jest.mock("@/services/illustration/illustrationGeneration", () => {
  const actual = jest.requireActual("@/services/illustration/illustrationGeneration");
  return { ...actual, generateIllustrationThumbnail: jest.fn() };
});

jest.mock("@/services/imageExport/mapTextMeasurement", () => ({
  createMapTextMeasurer: () => (text: string) => text.length * 8,
}));

const baseNodesJson = JSON.stringify({
  version: 3,
  layoutMode: "manual",
  nodes: [
    { id: 1, parentId: null, label: "ルート", importance: "high", x: 100, y: 100, width: 100, height: 60 },
  ],
});

type RenderOptions = {
  storage?: TestStorageSession;
  shareSession?: ShareSession;
  shareSessionStatus?: "loading" | "ready";
  shareDialogOpen?: boolean;
  onShareDialogOpenChange?: (open: boolean) => void;
  onShareRequest?: () => void;
  onShareLogin?: () => void;
  dialogMouseClickedAtRef?: RefObject<number | null>;
};

async function renderEditor({
  storage = createTestStorageSession({ initialJson: baseNodesJson }),
  shareSession = null,
  shareSessionStatus = "ready",
  shareDialogOpen = false,
  onShareDialogOpenChange = jest.fn(),
  onShareRequest = jest.fn(),
  onShareLogin = jest.fn(),
  dialogMouseClickedAtRef = { current: null },
}: RenderOptions = {}) {
  return {
    ...(await renderReady(
      <MapEditor
        mapId={storage.session.mapId}
        exportButtonRef={{ current: null }}
        mapMoveTargets={[
          {
            id: storage.session.mapId,
            name: "テストのマップ",
            createdAt: "2026-10-31T00:00:00.000Z",
            updatedAt: "2026-10-31T00:00:00.000Z",
          },
        ]}
        libraryMeta={createEmptyMapLibraryMeta()}
        onMoveBranchToMap={() => ({ ok: false, notice: { kind: "error", message: "移動先がありません。" } })}
        onExtractBranchToNewMap={() => ({ ok: false, notice: { kind: "error", message: "切り出せません。" } })}
        mapName="テストのマップ"
        storageSession={storage.session}
        storageMode="persistent"
        mapControls={null}
        shortcutsEnabled
        dialogMouseClickedAtRef={dialogMouseClickedAtRef}
        pendingNavigation={null}
        onConsumePendingNavigation={() => {}}
        onSwitchToMapTarget={() => {}}
        brokenLinksDialogRequest={0}
        onBrokenLinksDialogClosed={() => {}}
        shareSession={shareSession}
        shareSessionStatus={shareSessionStatus}
        shareDialogOpen={shareDialogOpen}
        onShareDialogOpenChange={onShareDialogOpenChange}
        onShareRequest={onShareRequest}
        onShareLogin={onShareLogin}
      />,
    )),
    onShareRequest,
    onShareLogin,
    onShareDialogOpenChange,
  };
}

beforeEach(() => {
  resetMapStageTestRuntime();
  globalThis.fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ ok: true, value: [] }),
  })) as unknown as typeof fetch;
});

afterEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
  delete (globalThis as { fetch?: typeof fetch }).fetch;
});

describe("MapEditor share wiring (L-060)", () => {
  it("ヘッダーに共有入口を配線する", async () => {
    await renderEditor();
    expect(screen.getByRole("button", { name: "共有" })).toBeInTheDocument();
  });

  it("共有ボタンで onShareRequest を呼び、未ログイン時は親がログイン導線を担当する", async () => {
    const user = userEvent.setup();
    const onShareRequest = jest.fn();
    await renderEditor({ shareSession: null, onShareRequest });
    await user.click(screen.getByRole("button", { name: "共有" }));
    expect(onShareRequest).toHaveBeenCalledTimes(1);
  });

  it("shareDialogOpen 時に ShareDialog 必須 props が揃ってマウントされる", async () => {
    await renderEditor({
      shareSession: { userId: "u1", email: "a@example.com", displayName: null },
      shareDialogOpen: true,
    });
    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: SHARE_MESSAGES.dialogTitle })).toBeInTheDocument();
    });
    expect(screen.getByTestId("share-dialog")).toHaveAttribute(
      "data-map-id",
      expect.any(String),
    );
  });

  it("未ログインでダイアログを開いても共有開始は出さずログイン導線のみ", async () => {
    await renderEditor({ shareSession: null, shareDialogOpen: true });
    expect(screen.getByText(SHARE_MESSAGES.loginRequired)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: SHARE_MESSAGES.createShare })).not.toBeInTheDocument();
  });

  it("session loading 中にダイアログを開いてもログイン導線を出さない", async () => {
    await renderEditor({
      shareSession: null,
      shareSessionStatus: "loading",
      shareDialogOpen: true,
    });
    expect(screen.getByTestId("share-session-loading")).toHaveTextContent(
      SHARE_MESSAGES.sessionLoading,
    );
    expect(screen.queryByText(SHARE_MESSAGES.loginRequired)).not.toBeInTheDocument();
  });

  it("ShareDialog に onCreateCommentLink を配線し、comment 権限でリンクを発行する", async () => {
    const user = userEvent.setup();
    const storage = createTestStorageSession({ initialJson: baseNodesJson });
    const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/share/maps" && init?.method === "GET") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            value: [
              {
                id: "sm-1",
                localMapId: storage.session.mapId,
                title: "テストのマップ",
                currentRevisionId: "r1",
                createdAt: "2026-11-01T00:00:00.000Z",
                updatedAt: "2026-11-01T00:00:00.000Z",
                links: [],
              },
            ],
          }),
        };
      }
      if (url === "/api/share/maps/sm-1/links" && init?.method === "POST") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            value: {
              linkId: "l-c",
              url: "https://example.com/share/tc",
              token: "tc",
              permission: "comment",
            },
          }),
        };
      }
      return { ok: true, status: 200, json: async () => ({ ok: false, reason: "unexpected" }) };
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await renderEditor({
      storage,
      shareSession: { userId: "u1", email: "a@example.com", displayName: null },
      shareDialogOpen: true,
    });
    const button = await screen.findByRole("button", { name: SHARE_MESSAGES.createCommentLink });
    await waitFor(() => expect(button).toBeEnabled());
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByTestId("share-issued-link")).toHaveTextContent("https://example.com/share/tc");
    });
    const linkCall = fetchMock.mock.calls.find(([input]) => String(input) === "/api/share/maps/sm-1/links");
    expect(JSON.parse(String(linkCall?.[1]?.body))).toEqual({ permission: "comment" });
    expect(screen.getByTestId("share-issued-link-permission")).toHaveTextContent(
      SHARE_MESSAGES.permissionComment,
    );
  });

  it("ShareDialog に onCreateEditLink を配線し、edit 権限で /collab URL を発行する", async () => {
    const user = userEvent.setup();
    const storage = createTestStorageSession({ initialJson: baseNodesJson });
    const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/share/maps" && init?.method === "GET") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            value: [
              {
                id: "sm-1",
                localMapId: storage.session.mapId,
                title: "テストのマップ",
                currentRevisionId: "r1",
                createdAt: "2026-11-01T00:00:00.000Z",
                updatedAt: "2026-11-01T00:00:00.000Z",
                links: [],
              },
            ],
          }),
        };
      }
      if (url === "/api/share/maps/sm-1/links" && init?.method === "POST") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            value: {
              linkId: "l-e",
              url: "https://example.com/collab/te",
              token: "te",
              permission: "edit",
            },
          }),
        };
      }
      return { ok: true, status: 200, json: async () => ({ ok: false, reason: "unexpected" }) };
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await renderEditor({
      storage,
      shareSession: { userId: "u1", email: "a@example.com", displayName: null },
      shareDialogOpen: true,
    });
    const button = await screen.findByRole("button", { name: SHARE_MESSAGES.createEditLink });
    await waitFor(() => expect(button).toBeEnabled());
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByTestId("share-issued-link")).toHaveTextContent("https://example.com/collab/te");
    });
    const linkCall = fetchMock.mock.calls.find(([input]) => String(input) === "/api/share/maps/sm-1/links");
    expect(JSON.parse(String(linkCall?.[1]?.body))).toEqual({ permission: "edit" });
    expect(screen.getByTestId("share-issued-link-permission")).toHaveTextContent(
      SHARE_MESSAGES.permissionEdit,
    );
  });
});
