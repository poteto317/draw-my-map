import { render, screen, waitFor } from "@testing-library/react";
import { CollabEditorPage } from "@/app/collab/[token]/CollabEditorPage";
import type { CollabJoinShellProps } from "@/app/collab/[token]/CollabJoinShell";
import { COLLAB_MESSAGES } from "@/domain/collab/collabMessages";

const mockUseShareSession = jest.fn();

jest.mock("@/hooks/useShareSession", () => ({
  useShareSession: () => mockUseShareSession(),
}));

jest.mock("next-auth/react", () => ({
  signIn: jest.fn(),
}));

jest.mock("@/components/map/MapEditor", () => ({
  MapEditor: (props: { collabJoinToken?: string | null; mapId: string }) => (
    <div
      data-testid="collab-map-editor"
      data-collab-join-token={props.collabJoinToken ?? ""}
      data-map-id={props.mapId}
    />
  ),
}));

describe("CollabEditorPage", () => {
  beforeEach(() => {
    mockUseShareSession.mockReset();
  });

  it("loading 中はログイン導線を出さない", () => {
    mockUseShareSession.mockReturnValue({ status: "loading", session: null });
    render(<CollabEditorPage token="tok-edit-1" />);
    expect(screen.getByTestId("collab-session-loading")).toHaveTextContent(
      COLLAB_MESSAGES.sessionLoading,
    );
    expect(screen.queryByText(COLLAB_MESSAGES.loginRequired)).not.toBeInTheDocument();
    expect(screen.queryByTestId("collab-map-editor")).not.toBeInTheDocument();
  });

  it("未ログインはログインのみ（MapEditor を出さない）", () => {
    mockUseShareSession.mockReturnValue({ status: "ready", session: null });
    render(<CollabEditorPage token="tok-edit-1" />);
    expect(screen.getByText(COLLAB_MESSAGES.loginRequired)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: COLLAB_MESSAGES.loginButton })).toBeInTheDocument();
    expect(screen.queryByTestId("collab-map-editor")).not.toBeInTheDocument();
  });

  it("ログイン済みは MapEditor を共同編集モードでマウントする（L-060）", async () => {
    mockUseShareSession.mockReturnValue({
      status: "ready",
      session: { userId: "u1", email: "a@example.com", displayName: null },
    });
    render(<CollabEditorPage token="tok-edit-1" />);
    await waitFor(() => {
      expect(screen.getByTestId("collab-map-editor")).toBeInTheDocument();
    });
    expect(screen.getByTestId("collab-map-editor")).toHaveAttribute(
      "data-collab-join-token",
      "tok-edit-1",
    );
    expect(screen.getByTestId("collab-join-shell")).toBeInTheDocument();
  });

  it("L-060 外し変異: CollabJoinShell 必須 props（token / dialogMouseClickedAtRef）欠落は型エラー", async () => {
    const ref = { current: null as number | null };
    // @ts-expect-error L-060: token は必須（省略を空 join 成功に倒さない）
    const missingToken: CollabJoinShellProps = {
      shareSession: { userId: "u1", email: "a@example.com", displayName: null },
      shareSessionStatus: "ready",
      dialogMouseClickedAtRef: ref,
    };
    // @ts-expect-error L-060: dialogMouseClickedAtRef は必須
    const missingRef: CollabJoinShellProps = {
      token: "tok-edit-1",
      shareSession: { userId: "u1", email: "a@example.com", displayName: null },
      shareSessionStatus: "ready",
    };
    void missingToken;
    void missingRef;
    mockUseShareSession.mockReturnValue({
      status: "ready",
      session: { userId: "u1", email: "a@example.com", displayName: null },
    });
    render(<CollabEditorPage token="tok-edit-1" />);
    await waitFor(() => {
      expect(screen.getByTestId("collab-map-editor")).toHaveAttribute(
        "data-collab-join-token",
        "tok-edit-1",
      );
    });
  });
});
