import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ShareViewerPage } from "@/app/share/[token]/ShareViewerPage";
import { SHARE_MESSAGES } from "@/domain/share/shareMessages";
import { createMapDocument, serializeMapDocument } from "@/domain/persistence/mapDocumentCodec";
import { createTestNode } from "@/testing/createTestNode";

jest.mock("pixi.js", () => {
  const runtime = jest.requireActual<typeof import("@/components/map/testing/mapStageTestRuntime")>(
    "@/components/map/testing/mapStageTestRuntime",
  );
  return runtime.createMockPixiModule();
});

function documentJson(): string {
  return serializeMapDocument(
    createMapDocument(
      [
        createTestNode({
          id: 1,
          parentId: null,
          label: "公開根",
          x: 0,
          y: 0,
          width: 120,
          height: 48,
        }),
      ],
      "manual",
    ),
  );
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe("ShareViewerPage", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("GET /api/share/view/[token] 成功で document を表示する", async () => {
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe("/api/share/view/tok-abc");
      return jsonResponse({ ok: true, value: { documentJson: documentJson() } });
    }) as typeof fetch;

    render(<ShareViewerPage token="tok-abc" />);
    expect(screen.getByRole("status")).toHaveTextContent(SHARE_MESSAGES.viewLoading);
    await waitFor(() => {
      expect(screen.getByTestId("share-map-view")).toBeInTheDocument();
    });
    // Pixi ラベルは DOM テキストに出ない。キャンバスが載っていることだけ見る
    expect(screen.getByTestId("share-map-view").querySelector("canvas")).toBeTruthy();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("404 / not-found は固定 viewNotFound（トークン非表示）", async () => {
    global.fetch = jest.fn(async () =>
      jsonResponse({ ok: false, reason: "not-found" }, 404),
    ) as typeof fetch;

    render(<ShareViewerPage token="secret-token-xyz" />);
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(SHARE_MESSAGES.viewNotFound);
    });
    expect(screen.queryByText("secret-token-xyz")).not.toBeInTheDocument();
    expect(screen.queryByText(SHARE_MESSAGES.viewEmpty)).not.toBeInTheDocument();
  });

  it("空ノード document は viewEmpty（loadError に倒さない）", async () => {
    global.fetch = jest.fn(async () =>
      jsonResponse({
        ok: true,
        value: { documentJson: serializeMapDocument(createMapDocument([], "manual")) },
      }),
    ) as typeof fetch;

    render(<ShareViewerPage token="tok-empty" />);
    await waitFor(() => {
      expect(screen.getByText(SHARE_MESSAGES.viewEmpty)).toBeInTheDocument();
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("fetch reject は viewLoadFailed（loading のまま固めない）", async () => {
    global.fetch = jest.fn(async () => {
      throw new Error("network down");
    }) as typeof fetch;

    render(<ShareViewerPage token="tok-reject" />);
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(SHARE_MESSAGES.viewLoadFailed);
    });
    expect(screen.queryByText(SHARE_MESSAGES.viewLoading)).not.toBeInTheDocument();
  });

  it("壊れた documentJson は viewLoadFailed", async () => {
    global.fetch = jest.fn(async () =>
      jsonResponse({ ok: true, value: { documentJson: "{" } }),
    ) as typeof fetch;

    render(<ShareViewerPage token="tok-bad-json" />);
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(SHARE_MESSAGES.viewLoadFailed);
    });
    expect(screen.queryByText(SHARE_MESSAGES.viewEmpty)).not.toBeInTheDocument();
  });

  it("map / outline をページ内 state で切替える", async () => {
    const user = userEvent.setup();
    global.fetch = jest.fn(async () =>
      jsonResponse({ ok: true, value: { documentJson: documentJson() } }),
    ) as typeof fetch;

    render(<ShareViewerPage token="tok-mode" />);
    await waitFor(() => {
      expect(screen.getByTestId("share-map-view")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "アウトライン" }));
    expect(screen.getByTestId("share-outline-view")).toBeInTheDocument();
    expect(screen.getByText("公開根")).toBeInTheDocument();
  });
});
