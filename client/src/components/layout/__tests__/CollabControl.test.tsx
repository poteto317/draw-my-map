import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CollabControl, type CollabControlProps } from "@/components/layout/CollabControl";
import { COLLAB_MESSAGES } from "@/domain/collab/collabMessages";
import type { CollabSessionUi } from "@/domain/collab/collabSessionUi";

/** L-060: 必須 props が型上省略不可であることをコンパイル時に担保する参照 */
const REQUIRED_COLLAB_CONTROL_PROP_KEYS = [
  "collabSession",
  "participants",
  "participantsState",
  "onStartCollab",
  "onLeaveCollab",
  "onEndCollab",
  "shareSession",
] as const satisfies ReadonlyArray<keyof CollabControlProps>;

function createProps(overrides: Partial<CollabControlProps> = {}): CollabControlProps {
  return {
    collabSession: { status: "idle" },
    participants: [],
    participantsState: "ready",
    onStartCollab: jest.fn(async () => ({ ok: true as const, value: { sessionId: "s1" } })),
    onLeaveCollab: jest.fn(async () => ({ ok: true as const, value: undefined })),
    onEndCollab: jest.fn(async () => ({ ok: true as const, value: undefined })),
    shareSession: { userId: "u1", email: "a@example.com" , displayName: null },
    ...overrides,
  };
}

describe("CollabControl", () => {
  it("L-060: 必須 props キーが揃っている（未配線 RED 用の正本）", () => {
    const props = createProps();
    for (const key of REQUIRED_COLLAB_CONTROL_PROP_KEYS) {
      expect(props[key]).toBeDefined();
    }
    render(<CollabControl {...props} />);
    expect(screen.getByTestId("collab-control")).toBeInTheDocument();
  });

  it("L-060 外し変異: 必須 props を欠落させると型エラー（コンパイル時）", () => {
    const full = createProps();
    // shareSession 欠落は型エラー（空成功に倒さない）
    // @ts-expect-error L-060: shareSession は必須
    const missingShare: CollabControlProps = {
      collabSession: full.collabSession,
      participants: full.participants,
      participantsState: full.participantsState,
      onStartCollab: full.onStartCollab,
      onLeaveCollab: full.onLeaveCollab,
      onEndCollab: full.onEndCollab,
    };
    // participantsState 欠落は型エラー（loading を ready 空に倒さないための面）
    // @ts-expect-error L-060: participantsState は必須
    const missingState: CollabControlProps = {
      collabSession: full.collabSession,
      participants: full.participants,
      onStartCollab: full.onStartCollab,
      onLeaveCollab: full.onLeaveCollab,
      onEndCollab: full.onEndCollab,
      shareSession: full.shareSession,
    };
    void missingShare;
    void missingState;
    expect(REQUIRED_COLLAB_CONTROL_PROP_KEYS).toContain("shareSession");
    expect(REQUIRED_COLLAB_CONTROL_PROP_KEYS).toContain("participantsState");
    expect(REQUIRED_COLLAB_CONTROL_PROP_KEYS).not.toContain(
      "dialogMouseClickedAtRef" as keyof CollabControlProps,
    );
  });

  it("participantsState: loading は空配列 ready と別表示（L-002）", () => {
    render(
      <CollabControl
        {...createProps({
          participants: [],
          participantsState: "loading",
        })}
      />,
    );
    expect(screen.getByTestId("collab-participants")).toHaveAttribute(
      "data-participants-state",
      "loading",
    );
    expect(screen.getByText(COLLAB_MESSAGES.participantsLoading)).toBeInTheDocument();
    expect(screen.queryByText(COLLAB_MESSAGES.participantsEmpty)).not.toBeInTheDocument();
  });

  it("idle: 開始ボタンを出し、退出・終了は出さない", () => {
    render(<CollabControl {...createProps()} />);
    expect(screen.getByRole("button", { name: COLLAB_MESSAGES.start })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: COLLAB_MESSAGES.leave })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: COLLAB_MESSAGES.end })).not.toBeInTheDocument();
  });

  it("未ログインでは開始を disabled にする（成功扱いにしない）", () => {
    render(<CollabControl {...createProps({ shareSession: null })} />);
    expect(screen.getByRole("button", { name: COLLAB_MESSAGES.start })).toBeDisabled();
  });

  it("active owner: 終了を出し開始は出さない", () => {
    const session: CollabSessionUi = {
      status: "active",
      sessionId: "s1",
      role: "owner",
    };
    render(<CollabControl {...createProps({ collabSession: session })} />);
    expect(screen.queryByRole("button", { name: COLLAB_MESSAGES.start })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: COLLAB_MESSAGES.end })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: COLLAB_MESSAGES.leave })).not.toBeInTheDocument();
  });

  it("active editor: 退出を出し終了は出さない", () => {
    const session: CollabSessionUi = {
      status: "active",
      sessionId: "s1",
      role: "editor",
    };
    render(<CollabControl {...createProps({ collabSession: session })} />);
    expect(screen.getByRole("button", { name: COLLAB_MESSAGES.leave })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: COLLAB_MESSAGES.end })).not.toBeInTheDocument();
  });

  it("reconnecting: 退出可・終了不可（inventory §2.2）", () => {
    const session: CollabSessionUi = {
      status: "reconnecting",
      sessionId: "s1",
      since: Date.now(),
    };
    render(<CollabControl {...createProps({ collabSession: session })} />);
    expect(screen.getByRole("button", { name: COLLAB_MESSAGES.leave })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: COLLAB_MESSAGES.end })).not.toBeInTheDocument();
  });

  it("参加者一覧の色が data-color に出る（awareness と一致させる配線）", () => {
    render(
      <CollabControl
        {...createProps({
          participants: [
            { userId: "u2", displayName: "花子", color: "#0369a1" },
          ],
          participantsState: "ready",
        })}
      />,
    );
    expect(screen.getByTestId("collab-participant-u2")).toHaveAttribute("data-color", "#0369a1");
    expect(screen.getByText("花子")).toBeInTheDocument();
  });

  it("error dropped-grace: 再参加導線を出す", () => {
    render(
      <CollabControl
        {...createProps({
          collabSession: { status: "error", error: "dropped-grace" },
        })}
      />,
    );
    expect(screen.getByTestId("collab-rejoin-hint")).toHaveTextContent(COLLAB_MESSAGES.droppedGrace);
    expect(screen.getByRole("button", { name: COLLAB_MESSAGES.retry })).toBeInTheDocument();
  });

  it("開始クリックで onStartCollab を呼ぶ", async () => {
    const user = userEvent.setup();
    const onStartCollab = jest.fn(async () => ({ ok: true as const, value: { sessionId: "s1" } }));
    render(<CollabControl {...createProps({ onStartCollab })} />);
    await user.click(screen.getByRole("button", { name: COLLAB_MESSAGES.start }));
    expect(onStartCollab).toHaveBeenCalledTimes(1);
  });
});
