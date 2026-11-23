import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { FALLBACK_NODE_LABEL } from "@/config/nodeLabel";
import {
  MAX_ILLUSTRATION_DATA_URL_LENGTH,
  MAX_ILLUSTRATION_UPLOAD_BYTES,
  MAX_ILLUSTRATION_UPLOAD_DIMENSION,
} from "@/config/illustration";
import { IllustrationPanel } from "@/components/layout/IllustrationPanel";
import { createIllustrationThumbnail } from "@/services/illustration/illustrationThumbnail";
import { createJpegDataUrl } from "@/testing/jpegFixture";
import { createPngDataUrl } from "@/testing/pngFixture";

jest.mock("@/services/illustration/illustrationThumbnail", () => {
  const actual = jest.requireActual("@/services/illustration/illustrationThumbnail");
  return { ...actual, createIllustrationThumbnail: jest.fn() };
});

const mockCreateThumbnail = createIllustrationThumbnail as jest.MockedFunction<
  typeof createIllustrationThumbnail
>;

const THUMB = "data:image/jpeg;base64,THUMB";

function renderPanel(props: Partial<ComponentProps<typeof IllustrationPanel>> = {}) {
  const {
    selectedNode = { id: 3, label: "予算" },
    generation = { status: "idle" as const },
    onGenerate = jest.fn(),
    onAttach = jest.fn(),
    onRemove = jest.fn(),
    ...rest
  } = props;
  const result = render(
    <IllustrationPanel
      selectedNode={selectedNode}
      generation={generation}
      onGenerate={onGenerate}
      onAttach={onAttach}
      onRemove={onRemove}
      {...rest}
    />,
  );
  return { onGenerate, onAttach, onRemove, ...result };
}

function imageFileInput(container: HTMLElement): HTMLInputElement {
  return container.querySelector<HTMLInputElement>('input[type="file"][accept="image/*"]')!;
}

describe("IllustrationPanel", () => {
  beforeEach(() => {
    mockCreateThumbnail.mockReset();
    mockCreateThumbnail.mockResolvedValue(THUMB);
  });

  it("名前付きの領域（section）として表示し、見出しを持つ（外側の補足領域はノードの詳細のパネルが持つ）", () => {
    render(<IllustrationPanel selectedNode={null} generation={{ status: "idle" }} onGenerate={jest.fn()} onAttach={jest.fn()} onRemove={jest.fn()} />);

    const region = screen.getByRole("region", { name: "イラスト" });
    expect(region.tagName).toBe("SECTION");
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(screen.getByRole("heading", { name: "イラスト" })).toBeInTheDocument();
  });

  it("ノード未選択のときは案内を表示し、生成ボタンを無効にする", () => {
    render(<IllustrationPanel selectedNode={null} generation={{ status: "idle" }} onGenerate={jest.fn()} onAttach={jest.fn()} onRemove={jest.fn()} />);

    expect(screen.getByText("ノードを選択してください")).toBeVisible();
    expect(screen.getByRole("button", { name: "イラストを生成" })).toBeDisabled();
  });

  it("選択中のノードのラベルを表示し、生成ボタンを有効にする", () => {
    render(
      <IllustrationPanel
        selectedNode={{ id: 3, label: "企画の背景" }}
        generation={{ status: "idle" }} onGenerate={jest.fn()} onAttach={jest.fn()} onRemove={jest.fn()}
      />,
    );

    expect(screen.getByText("企画の背景")).toBeVisible();
    expect(screen.queryByText("ノードを選択してください")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "イラストを生成" })).toBeEnabled();
  });

  it("ラベルが空のノードでは共通のフォールバックラベルを表示し、titleは付けない", () => {
    render(
      <IllustrationPanel selectedNode={{ id: 4, label: "" }} generation={{ status: "idle" }} onGenerate={jest.fn()} onAttach={jest.fn()} onRemove={jest.fn()} />,
    );

    const text = screen.getByText(FALLBACK_NODE_LABEL);
    expect(text).toBeVisible();
    expect(text).not.toHaveAttribute("title");
    expect(screen.getByRole("button", { name: "イラストを生成" })).toBeEnabled();
  });

  it("生成ボタンのクリックで、選択中のノードIDを1回通知する", async () => {
    const user = userEvent.setup();
    const onGenerate = jest.fn();
    render(
      <IllustrationPanel selectedNode={{ id: 7, label: "目標" }} generation={{ status: "idle" }} onGenerate={onGenerate} onAttach={jest.fn()} onRemove={jest.fn()} />,
    );

    await user.click(screen.getByRole("button", { name: "イラストを生成" }));

    expect(onGenerate).toHaveBeenCalledTimes(1);
    expect(onGenerate).toHaveBeenCalledWith(7);
  });

  it("無効なボタンのクリックでは通知しない", async () => {
    const user = userEvent.setup();
    const onGenerate = jest.fn();
    render(<IllustrationPanel selectedNode={null} generation={{ status: "idle" }} onGenerate={onGenerate} onAttach={jest.fn()} onRemove={jest.fn()} />);

    await user.click(screen.getByRole("button", { name: "イラストを生成" }));

    expect(onGenerate).not.toHaveBeenCalled();
  });

  it("長いラベルは全文をtitleで確認できる", () => {
    const label = "とても長いラベルのノード".repeat(10);
    render(<IllustrationPanel selectedNode={{ id: 1, label }} generation={{ status: "idle" }} onGenerate={jest.fn()} onAttach={jest.fn()} onRemove={jest.fn()} />);

    expect(screen.getByText(label)).toHaveAttribute("title", label);
  });

  it("幅・縁・背景は親（NodeDetailPanel）が持ち、自身は持たない", () => {
    render(<IllustrationPanel selectedNode={null} generation={{ status: "idle" }} onGenerate={jest.fn()} onAttach={jest.fn()} onRemove={jest.fn()} />);

    const region = screen.getByRole("region", { name: "イラスト" });
    expect(region).not.toHaveClass("w-60");
    expect(region).not.toHaveClass("border-l");
  });

  it("生成中は、ボタンを無効にして『生成中…』と表示する", () => {
    render(
      <IllustrationPanel
        selectedNode={{ id: 1, label: "目標" }}
        generation={{ status: "generating", nodeId: 1, label: "目標" }}
        onGenerate={jest.fn()} onAttach={jest.fn()} onRemove={jest.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "生成中…" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("生成中です");
  });

  it("別のノードを生成中のときも、ボタンは無効（二重実行の防止）で、選択中のノードには生成中の表示を出さない", () => {
    render(
      <IllustrationPanel
        selectedNode={{ id: 2, label: "予算" }}
        generation={{ status: "generating", nodeId: 1, label: "目標" }}
        onGenerate={jest.fn()} onAttach={jest.fn()} onRemove={jest.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "生成中…" })).toBeDisabled();
    expect(screen.queryByText("生成中です")).not.toBeInTheDocument();
  });

  it("生成中のボタンのクリックでは通知しない", async () => {
    const user = userEvent.setup();
    const onGenerate = jest.fn();
    render(
      <IllustrationPanel
        selectedNode={{ id: 1, label: "目標" }}
        generation={{ status: "generating", nodeId: 1, label: "目標" }}
        onGenerate={onGenerate}
        onAttach={jest.fn()} onRemove={jest.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "生成中…" }));

    expect(onGenerate).not.toHaveBeenCalled();
  });

  it("選択中のノードの生成結果を画像で表示する", () => {
    render(
      <IllustrationPanel
        selectedNode={{ id: 1, label: "目標" }}
        generation={{ status: "succeeded", nodeId: 1, label: "目標", dataUrl: "data:image/jpeg;base64,AAA" }}
        onGenerate={jest.fn()} onAttach={jest.fn()} onRemove={jest.fn()}
      />,
    );

    const image = screen.getByRole("img", { name: "目標のイラスト" });
    expect(image).toHaveAttribute("src", "data:image/jpeg;base64,AAA");
    expect(screen.getByRole("button", { name: "イラストを生成" })).toBeEnabled();
  });

  it("ラベルが空のノードの画像は、代替文言を使った説明を持つ", () => {
    render(
      <IllustrationPanel
        selectedNode={{ id: 1, label: "" }}
        generation={{ status: "succeeded", nodeId: 1, label: "", dataUrl: "data:image/jpeg;base64,AAA" }}
        onGenerate={jest.fn()} onAttach={jest.fn()} onRemove={jest.fn()}
      />,
    );

    expect(screen.getByRole("img", { name: `${FALLBACK_NODE_LABEL}のイラスト` })).toBeInTheDocument();
  });

  it("別のノードの生成結果は、表示しない", () => {
    render(
      <IllustrationPanel
        selectedNode={{ id: 2, label: "予算" }}
        generation={{ status: "succeeded", nodeId: 1, label: "目標", dataUrl: "data:image/jpeg;base64,AAA" }}
        onGenerate={jest.fn()} onAttach={jest.fn()} onRemove={jest.fn()}
      />,
    );

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("選択中のノードの失敗を、alertで表示する", () => {
    render(
      <IllustrationPanel
        selectedNode={{ id: 1, label: "目標" }}
        generation={{ status: "failed", nodeId: 1, message: "生成に失敗しました" }}
        onGenerate={jest.fn()} onAttach={jest.fn()} onRemove={jest.fn()}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("生成に失敗しました");
  });

  it("別のノードの失敗は、表示しない", () => {
    render(
      <IllustrationPanel
        selectedNode={{ id: 2, label: "予算" }}
        generation={{ status: "failed", nodeId: 1, message: "生成に失敗しました" }}
        onGenerate={jest.fn()} onAttach={jest.fn()} onRemove={jest.fn()}
      />,
    );

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  describe("ノードに設定", () => {
    it("生成結果のプレビューがあるとき、「ノードに設定」で、ノード ID と画像を渡す", async () => {
      const onAttach = jest.fn();
      render(<IllustrationPanel
        selectedNode={{ id: 3, label: "予算" }}
        generation={{ status: "succeeded", nodeId: 3, label: "予算", dataUrl: "data:image/jpeg;base64,AAAA" }}
        onGenerate={jest.fn()} onAttach={onAttach} onRemove={jest.fn()} />);
      await userEvent.click(screen.getByRole("button", { name: "ノードに設定" }));
      expect(onAttach).toHaveBeenCalledWith(3, "data:image/jpeg;base64,AAAA");
    });

    it("生成後にノードのテキストが変わったら、プレビューも「ノードに設定」も出さない", () => {
      render(<IllustrationPanel selectedNode={{ id: 3, label: "予算（変更後）" }}
        generation={{ status: "succeeded", nodeId: 3, label: "予算", dataUrl: "data:image/jpeg;base64,AAAA" }}
        onGenerate={jest.fn()} onAttach={jest.fn()} onRemove={jest.fn()} />);
      expect(screen.queryByRole("button", { name: "ノードに設定" })).toBeNull();
      expect(screen.queryByRole("img")).toBeNull();
    });

    it("別のノードの生成結果では、「ノードに設定」を出さない", () => {
      render(<IllustrationPanel selectedNode={{ id: 4, label: "x" }}
        generation={{ status: "succeeded", nodeId: 3, label: "予算", dataUrl: "data:image/jpeg;base64,AAAA" }}
        onGenerate={jest.fn()} onAttach={jest.fn()} onRemove={jest.fn()} />);
      expect(screen.queryByRole("button", { name: "ノードに設定" })).toBeNull();
    });

    it("プレビューが無く、ノードに設定済みのイラストがあるときは、それを表示する", () => {
      render(<IllustrationPanel selectedNode={{ id: 4, label: "予算", illustration: "data:image/jpeg;base64,BBBB" }}
        generation={{ status: "idle" }} onGenerate={jest.fn()} onAttach={jest.fn()} onRemove={jest.fn()} />);
      expect(screen.getByAltText("予算の設定済みイラスト")).toHaveAttribute("src", "data:image/jpeg;base64,BBBB");
      expect(screen.queryByRole("button", { name: "ノードに設定" })).toBeNull();
    });

    it("生成中・失敗のときは、「ノードに設定」を出さない", () => {
      const { rerender } = render(<IllustrationPanel selectedNode={{ id: 1, label: "a" }}
        generation={{ status: "generating", nodeId: 1, label: "a" }} onGenerate={jest.fn()} onAttach={jest.fn()} onRemove={jest.fn()} />);
      expect(screen.queryByRole("button", { name: "ノードに設定" })).toBeNull();
      rerender(<IllustrationPanel selectedNode={{ id: 1, label: "a" }}
        generation={{ status: "failed", nodeId: 1, message: "x" }} onGenerate={jest.fn()} onAttach={jest.fn()} onRemove={jest.fn()} />);
      expect(screen.queryByRole("button", { name: "ノードに設定" })).toBeNull();
    });
  });

  it("設定済みのイラストがあるとき、「設定済みのイラストを削除」で、ノードの ID を渡す", async () => {
    const onRemove = jest.fn();
    render(<IllustrationPanel
      selectedNode={{ id: 5, label: "予算", illustration: "data:image/jpeg;base64,AAAA" }}
      generation={{ status: "idle" }} onGenerate={jest.fn()} onAttach={jest.fn()} onRemove={onRemove} />);
    await userEvent.click(screen.getByRole("button", { name: "設定済みのイラストを削除" }));
    expect(onRemove).toHaveBeenCalledWith(5);
  });

  it("イラストが無いとき、未選択のときは、「設定済みのイラストを削除」を出さない", () => {
    const { rerender } = render(<IllustrationPanel selectedNode={{ id: 1, label: "a" }}
      generation={{ status: "idle" }} onGenerate={jest.fn()} onAttach={jest.fn()} onRemove={jest.fn()} />);
    expect(screen.queryByRole("button", { name: "設定済みのイラストを削除" })).toBeNull();
    rerender(<IllustrationPanel selectedNode={null}
      generation={{ status: "idle" }} onGenerate={jest.fn()} onAttach={jest.fn()} onRemove={jest.fn()} />);
    expect(screen.queryByRole("button", { name: "設定済みのイラストを削除" })).toBeNull();
  });

  it("イラストがあるノードでは、生成ボタンが「イラストを再生成」になり、押すと生成を呼ぶ", async () => {
    const onGenerate = jest.fn();
    render(<IllustrationPanel
      selectedNode={{ id: 5, label: "予算", illustration: "data:image/jpeg;base64,AAAA" }}
      generation={{ status: "idle" }} onGenerate={onGenerate} onAttach={jest.fn()} onRemove={jest.fn()} />);
    expect(screen.queryByRole("button", { name: "イラストを生成" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "イラストを再生成" }));
    expect(onGenerate).toHaveBeenCalledWith(5);
  });

  it("生成中は、ボタンが「生成中…」で無効になる（再生成でも同じ）", () => {
    render(<IllustrationPanel
      selectedNode={{ id: 5, label: "予算", illustration: "data:image/jpeg;base64,AAAA" }}
      generation={{ status: "generating", nodeId: 5, label: "予算" }} onGenerate={jest.fn()} onAttach={jest.fn()} onRemove={jest.fn()} />);
    expect(screen.getByRole("button", { name: "生成中…" })).toBeDisabled();
  });

  it("プレビュー表示中でも、「設定済みのイラストを削除」が出て、押すとノードの ID を渡す", async () => {
    const onRemove = jest.fn();
    render(<IllustrationPanel
      selectedNode={{ id: 1, label: "a", illustration: "data:image/jpeg;base64,AAAA" }}
      generation={{ status: "succeeded", nodeId: 1, label: "a", dataUrl: "data:image/jpeg;base64,BBBB" }}
      onGenerate={jest.fn()} onAttach={jest.fn()} onRemove={onRemove} />);
    expect(screen.getByRole("button", { name: "ノードに設定" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "設定済みのイラストを削除" }));
    expect(onRemove).toHaveBeenCalledWith(1);
  });

  describe("画像ファイルの添付", () => {
    const SOURCE_DATA_URL = createPngDataUrl(200, 100);

    function mockReadImageFile() {
      return jest.fn(async () => SOURCE_DATA_URL);
    }

    function renderUploadPanel(
      props: Partial<ComponentProps<typeof IllustrationPanel>> = {},
    ) {
      return renderPanel(props);
    }

    it("「画像を添付」と accept=image/* のファイル入力を持つ", () => {
      const { container } = renderUploadPanel();
      expect(screen.getByRole("button", { name: "画像を添付" })).toBeEnabled();
      expect(imageFileInput(container)).toHaveAttribute("accept", "image/*");
    });

    it("ファイル選択でサムネイル化した data URL を onAttach に渡す", async () => {
      const user = userEvent.setup();
      const readImageFile = mockReadImageFile();
      const { container, onAttach } = renderUploadPanel({ readImageFile });
      const file = new File(["png"], "photo.png", { type: "image/png" });

      await user.upload(imageFileInput(container), file);

      await waitFor(() => {
        expect(readImageFile).toHaveBeenCalledWith(file);
        expect(mockCreateThumbnail).toHaveBeenCalledWith(SOURCE_DATA_URL);
        expect(onAttach).toHaveBeenCalledWith(3, THUMB);
      });
    });

    it("設定済みイラストがあるとき上書き確認をキャンセルすると onAttach しない", async () => {
      const user = userEvent.setup();
      const confirmOverwrite = jest.fn(() => false);
      const readImageFile = mockReadImageFile();
      const { container, onAttach } = renderUploadPanel({
        selectedNode: { id: 3, label: "予算", illustration: "data:image/jpeg;base64,OLD" },
        confirmOverwrite,
        readImageFile,
      });

      await user.upload(
        imageFileInput(container),
        new File(["png"], "photo.png", { type: "image/png" }),
      );

      expect(confirmOverwrite).toHaveBeenCalledTimes(1);
      expect(readImageFile).not.toHaveBeenCalled();
      expect(onAttach).not.toHaveBeenCalled();
    });

    it("設定済みイラストがあるとき上書き確認を承認すると添付する", async () => {
      const user = userEvent.setup();
      const confirmOverwrite = jest.fn(() => true);
      const readImageFile = mockReadImageFile();
      const { container, onAttach } = renderUploadPanel({
        selectedNode: { id: 3, label: "予算", illustration: "data:image/jpeg;base64,OLD" },
        confirmOverwrite,
        readImageFile,
      });

      await user.upload(
        imageFileInput(container),
        new File(["png"], "photo.png", { type: "image/png" }),
      );

      await waitFor(() => {
        expect(confirmOverwrite).toHaveBeenCalledTimes(1);
        expect(onAttach).toHaveBeenCalledWith(3, THUMB);
      });
    });

    it("サムネイル後の data URL が長さ上限を超えると添付せずエラーを出す", async () => {
      const user = userEvent.setup();
      const tooLong = `data:image/jpeg;base64,${"A".repeat(MAX_ILLUSTRATION_DATA_URL_LENGTH)}`;
      mockCreateThumbnail.mockResolvedValue(tooLong);
      const { container, onAttach } = renderUploadPanel({
        readImageFile: mockReadImageFile(),
      });

      await user.upload(
        imageFileInput(container),
        new File(["png"], "photo.png", { type: "image/png" }),
      );

      await waitFor(() => {
        expect(screen.getByRole("alert")).toHaveTextContent("画像を添付できませんでした");
      });
      expect(onAttach).not.toHaveBeenCalled();
    });

    it("File.size が上限超過なら読取せずエラーを出す", async () => {
      const user = userEvent.setup();
      const readImageFile = mockReadImageFile();
      const { container, onAttach } = renderUploadPanel({ readImageFile });
      const huge = new File(
        [new Uint8Array(MAX_ILLUSTRATION_UPLOAD_BYTES + 1)],
        "huge.png",
        { type: "image/png" },
      );

      await user.upload(imageFileInput(container), huge);

      await waitFor(() => {
        expect(screen.getByRole("alert")).toHaveTextContent("画像を添付できませんでした");
      });
      expect(readImageFile).not.toHaveBeenCalled();
      expect(onAttach).not.toHaveBeenCalled();
    });

    it("JPEG のヘッダ寸法が上限超過ならサムネイルせずエラーを出す", async () => {
      const user = userEvent.setup();
      const over = MAX_ILLUSTRATION_UPLOAD_DIMENSION + 1;
      const jpegSource = createJpegDataUrl(over, 128);
      const readImageFile = jest.fn(async () => jpegSource);
      const { container, onAttach } = renderUploadPanel({ readImageFile });

      await user.upload(
        imageFileInput(container),
        new File(["jpeg"], "wide.jpg", { type: "image/jpeg" }),
      );

      await waitFor(() => {
        expect(screen.getByRole("alert")).toHaveTextContent("画像を添付できませんでした");
      });
      expect(mockCreateThumbnail).not.toHaveBeenCalled();
      expect(onAttach).not.toHaveBeenCalled();
    });

    it("PNG の IHDR 寸法が上限超過ならサムネイルせずエラーを出す", async () => {
      const user = userEvent.setup();
      const over = MAX_ILLUSTRATION_UPLOAD_DIMENSION + 1;
      const pngSource = createPngDataUrl(over, 100);
      const readImageFile = jest.fn(async () => pngSource);
      const { container, onAttach } = renderUploadPanel({ readImageFile });

      await user.upload(
        imageFileInput(container),
        new File(["png"], "wide.png", { type: "image/png" }),
      );

      await waitFor(() => {
        expect(screen.getByRole("alert")).toHaveTextContent("画像を添付できませんでした");
      });
      expect(mockCreateThumbnail).not.toHaveBeenCalled();
      expect(onAttach).not.toHaveBeenCalled();
    });

    it("locked（disabled）のとき画像添付・生成・削除を無効にする", () => {
      renderPanel({
        selectedNode: { id: 5, label: "予算", illustration: "data:image/jpeg;base64,AAAA" },
        disabled: true,
      });

      expect(screen.getByRole("button", { name: "画像を添付" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "イラストを再生成" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "設定済みのイラストを削除" })).toBeDisabled();
    });

    it("AI 生成と削除はファイル添付追加後も従来どおり動く", async () => {
      const user = userEvent.setup();
      const { onGenerate, onRemove } = renderPanel({
        selectedNode: { id: 5, label: "予算", illustration: "data:image/jpeg;base64,AAAA" },
      });

      await user.click(screen.getByRole("button", { name: "イラストを再生成" }));
      expect(onGenerate).toHaveBeenCalledWith(5);

      await user.click(screen.getByRole("button", { name: "設定済みのイラストを削除" }));
      expect(onRemove).toHaveBeenCalledWith(5);
    });

    it("未選択のときは画像を添付を無効にする", () => {
      renderPanel({ selectedNode: null });
      expect(screen.getByRole("button", { name: "画像を添付" })).toBeDisabled();
    });
  });
});
