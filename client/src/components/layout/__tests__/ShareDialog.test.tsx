import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  ShareDialog,
  type ShareDialogProps,
} from "@/components/layout/ShareDialog";
import { SHARE_MESSAGES } from "@/domain/share/shareMessages";
import type { ShareLocalMetaRead } from "@/domain/share/shareLocalMeta";

function createProps(overrides: Partial<ShareDialogProps> = {}): ShareDialogProps {
  return {
    mapId: "map-1",
    mapTitle: "テストマップ",
    shareSession: { userId: "u1", email: "a@example.com" },
    shareSessionStatus: "ready",
    localMeta: { status: "missing" },
    listState: "ready",
    shareList: [],
    lastIssuedLink: null,
    notice: null,
    noticeSequence: 0,
    busy: false,
    onCreateShare: jest.fn(async () => ({ ok: true as const, value: {
      sharedMapId: "sm-1",
      link: { linkId: "l1", url: "https://example.com/share/t", token: "t" },
    } })),
    onPublish: jest.fn(async () => ({ ok: true as const, value: { revisionId: "r1" } })),
    onCreateLink: jest.fn(async () => ({
      ok: true as const,
      value: { linkId: "l2", url: "https://example.com/share/t2", token: "t2" },
    })),
    onRevokeLink: jest.fn(async () => ({ ok: true as const, value: undefined })),
    onReissueLink: jest.fn(async () => ({
      ok: true as const,
      value: { linkId: "l3", url: "https://example.com/share/t3", token: "t3" },
    })),
    onDeleteShare: jest.fn(async () => ({ ok: true as const, value: undefined })),
    onLogin: jest.fn(),
    onClose: jest.fn(),
    dialogMouseClickedAtRef: { current: null },
    ...overrides,
  };
}

/** L-060: 必須 props が型上省略不可であることをコンパイル時に担保する参照 */
const REQUIRED_SHARE_DIALOG_PROP_KEYS = [
  "mapId",
  "mapTitle",
  "shareSession",
  "shareSessionStatus",
  "localMeta",
  "listState",
  "onCreateShare",
  "onPublish",
  "onCreateLink",
  "onRevokeLink",
  "onReissueLink",
  "onDeleteShare",
  "onLogin",
  "dialogMouseClickedAtRef",
] as const satisfies ReadonlyArray<keyof ShareDialogProps>;

describe("ShareDialog", () => {
  it("L-060: 必須 props キーが揃っている（未配線 RED 用の正本）", () => {
    const props = createProps();
    for (const key of REQUIRED_SHARE_DIALOG_PROP_KEYS) {
      expect(props[key]).toBeDefined();
    }
    render(<ShareDialog {...props} />);
    expect(screen.getByRole("dialog", { name: SHARE_MESSAGES.dialogTitle })).toBeInTheDocument();
    expect(screen.getByTestId("share-dialog")).toHaveAttribute("data-map-id", "map-1");
  });

  it("未ログインでは共有開始ボタンを出さずログイン導線のみ（成功扱いにしない）", () => {
    render(<ShareDialog {...createProps({ shareSession: null })} />);
    expect(screen.getByText(SHARE_MESSAGES.loginRequired)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: SHARE_MESSAGES.loginButton })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: SHARE_MESSAGES.createShare })).not.toBeInTheDocument();
  });

  it("session loading 中はログイン導線を出さず未ログインと混同しない", () => {
    render(
      <ShareDialog
        {...createProps({ shareSession: null, shareSessionStatus: "loading" })}
      />,
    );
    expect(screen.getByTestId("share-session-loading")).toHaveTextContent(
      SHARE_MESSAGES.sessionLoading,
    );
    expect(screen.queryByText(SHARE_MESSAGES.loginRequired)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: SHARE_MESSAGES.loginButton })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: SHARE_MESSAGES.createShare })).not.toBeInTheDocument();
  });

  it("未ログインでログインを押すと onLogin のみ（onCreateShare は呼ばない）", async () => {
    const user = userEvent.setup();
    const props = createProps({ shareSession: null });
    render(<ShareDialog {...props} />);
    await user.click(screen.getByRole("button", { name: SHARE_MESSAGES.loginButton }));
    expect(props.onLogin).toHaveBeenCalledTimes(1);
    expect(props.onCreateShare).not.toHaveBeenCalled();
  });

  it("listState=error でも localMeta 表示を未共有に書き換えない", () => {
    const localMeta: ShareLocalMetaRead = {
      status: "present",
      value: {
        sharedMapId: "sm-1",
        lastPublishedAt: "2026-11-26T00:00:00.000Z",
        linkActive: true,
      },
    };
    render(<ShareDialog {...createProps({ listState: "error", localMeta })} />);
    expect(screen.getByText(SHARE_MESSAGES.listError)).toBeInTheDocument();
    expect(screen.getByTestId("share-local-meta")).toHaveTextContent(SHARE_MESSAGES.linkActive);
    expect(screen.queryByRole("button", { name: SHARE_MESSAGES.createShare })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: SHARE_MESSAGES.publish })).toBeInTheDocument();
  });

  it("listState!==ready（loading/error）かつ未共有では「共有を開始」を無効にする", async () => {
    const user = userEvent.setup();
    const onCreateShare = jest.fn(async () => ({
      ok: true as const,
      value: {
        sharedMapId: "sm-1",
        link: { linkId: "l1", url: "https://example.com/share/t", token: "t" },
      },
    }));

    const { rerender } = render(
      <ShareDialog
        {...createProps({
          listState: "loading",
          localMeta: { status: "missing" },
          onCreateShare,
        })}
      />,
    );
    const loadingButton = screen.getByRole("button", { name: SHARE_MESSAGES.createShare });
    expect(loadingButton).toBeDisabled();
    await user.click(loadingButton);
    expect(onCreateShare).not.toHaveBeenCalled();

    rerender(
      <ShareDialog
        {...createProps({
          listState: "error",
          localMeta: { status: "missing" },
          onCreateShare,
        })}
      />,
    );
    const errorButton = screen.getByRole("button", { name: SHARE_MESSAGES.createShare });
    expect(errorButton).toBeDisabled();
    await user.click(errorButton);
    expect(onCreateShare).not.toHaveBeenCalled();
  });

  it("localMeta read-error は未共有 createShare 導線に倒さず危険操作を止める", () => {
    render(
      <ShareDialog
        {...createProps({
          localMeta: { status: "read-error", error: "corrupt" },
          listState: "ready",
        })}
      />,
    );
    expect(screen.getByTestId("share-meta-read-error")).toHaveTextContent(
      SHARE_MESSAGES.localMetaReadError,
    );
    expect(screen.getByTestId("share-local-meta")).toHaveTextContent(
      SHARE_MESSAGES.localMetaReadError,
    );
    expect(screen.getByTestId("share-local-meta")).not.toHaveTextContent(SHARE_MESSAGES.listError);
    expect(screen.queryByRole("button", { name: SHARE_MESSAGES.createShare })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: SHARE_MESSAGES.publish })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: SHARE_MESSAGES.deleteShare })).not.toBeInTheDocument();
  });

  it("開いたとき dialog 先頭へ初期フォーカスする", async () => {
    render(<ShareDialog {...createProps({ shareSession: null })} />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: SHARE_MESSAGES.loginButton })).toHaveFocus();
    });
  });

  it("リンク操作ボタンに日時と linkId の aria-label を付ける", () => {
    const localMeta: ShareLocalMetaRead = {
      status: "present",
      value: {
        sharedMapId: "sm-1",
        lastPublishedAt: "2026-11-26T00:00:00.000Z",
        linkActive: true,
      },
    };
    render(
      <ShareDialog
        {...createProps({
          localMeta,
          shareList: [
            {
              id: "sm-1",
              localMapId: "map-1",
              links: [
                {
                  id: "link-42",
                  createdAt: "2026-11-20T12:00:00.000Z",
                  revokedAt: null,
                },
              ],
            },
          ],
        })}
      />,
    );
    expect(
      screen.getByRole("button", {
        name: `${SHARE_MESSAGES.revokeLink}（2026-11-20T12:00:00.000Z / link-42）`,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: `${SHARE_MESSAGES.reissueLink}（2026-11-20T12:00:00.000Z / link-42）`,
      }),
    ).toBeInTheDocument();
  });

  it("同一文言でも noticeSequence が進むと再読み上げ用に再表示する（L-166）", async () => {
    const props = createProps({
      notice: { kind: "status", message: "完了" },
      noticeSequence: 1,
    });
    const { rerender } = render(<ShareDialog {...props} />);
    await waitFor(() => {
      expect(screen.getByTestId("share-notice")).toHaveTextContent("完了");
    });
    rerender(
      <ShareDialog
        {...props}
        notice={{ kind: "status", message: "完了" }}
        noticeSequence={2}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("share-notice")).toHaveTextContent("完了");
    });
  });
});
