import { render, screen } from "@testing-library/react";
import { NodeNoteMarkdown } from "@/components/layout/NodeNoteMarkdown";

describe("NodeNoteMarkdown", () => {
  it("空文字や空白・改行のみのときは「メモはありません」を表示する", () => {
    const { rerender } = render(<NodeNoteMarkdown markdown="" />);
    expect(screen.getByText("メモはありません")).toBeInTheDocument();

    rerender(<NodeNoteMarkdown markdown={"  \n\t  "} />);
    expect(screen.getByText("メモはありません")).toBeInTheDocument();

    // 空白＋末尾の孤立上位サロゲート（U+D83D）も normalizeNodeNote で削られて空になり「メモはありません」になる（L-018・L-636）
    rerender(<NodeNoteMarkdown markdown={"  \uD83D"} />);
    expect(screen.getByText("メモはありません")).toBeInTheDocument();
  });

  it("末尾に孤立した上位サロゲートがあるときは normalizeNodeNote で削った文字列を描画する（L-018・L-636）", () => {
    render(<NodeNoteMarkdown markdown={"本文の末尾\uD83D"} />);

    const paragraph = screen.getByText("本文の末尾");
    expect(paragraph.textContent).toBe("本文の末尾");
  });

  it("見出し・太字・斜体・打ち消し線・箇条書き・番号付きリスト・引用・コード・水平線・表・タスクリストを描画する", () => {
    const md = [
      "# 見出し1",
      "## 見出し2",
      "### 見出し3",
      "#### 見出し4",
      "##### 見出し5",
      "###### 見出し6",
      "",
      "段落の**太字**と*斜体*と~~打ち消し~~と`inlineCode`。",
      "",
      "- 箇条A",
      "- 箇条B",
      "",
      "1. 番号1",
      "2. 番号2",
      "",
      "> 引用文",
      "",
      "```ts",
      "const x = 1;",
      "```",
      "",
      "---",
      "",
      "| 列1 | 列2 |",
      "| --- | --- |",
      "| 値A | 値B |",
      "",
      "- [ ] 未完了タスク",
      "- [x] 完了タスク",
    ].join("\n");

    const { container } = render(<NodeNoteMarkdown markdown={md} />);

    expect(screen.getByRole("heading", { level: 1, name: "見出し1" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "見出し2" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "見出し3" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 4, name: "見出し4" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 5, name: "見出し5" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 6, name: "見出し6" })).toBeInTheDocument();
    expect(container.querySelector("strong")).toHaveTextContent("太字");
    expect(container.querySelector("em")).toHaveTextContent("斜体");
    expect(container.querySelector("del")).toHaveTextContent("打ち消し");
    expect(container.querySelector("p code")).toHaveTextContent("inlineCode");
    const pre = container.querySelector("pre");
    expect(pre).not.toBeNull();
    expect(pre).not.toHaveAttribute("tabindex");
    expect(pre).not.toHaveClass("overflow-x-auto");
    expect(container.querySelector("pre code")).toHaveTextContent("const x = 1;");
    expect(container.querySelector("blockquote")).toHaveTextContent("引用文");
    expect(container.querySelector("hr")).not.toBeNull();
    const table = screen.getByRole("table");
    expect(table).toBeInTheDocument();
    expect(table).not.toHaveAttribute("tabindex");
    expect(table).not.toHaveClass("overflow-x-auto");
    expect(screen.getByRole("columnheader", { name: "列1" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "値A" })).toBeInTheDocument();

    const checkboxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0]).not.toBeChecked();
    expect(checkboxes[0]).toBeDisabled();
    expect(checkboxes[0]).toHaveAttribute("tabindex", "-1");
    expect(checkboxes[1]).toBeChecked();
    expect(checkboxes[1]).toBeDisabled();
    expect(checkboxes[1]).toHaveAttribute("tabindex", "-1");
  });

  it("http / https / mailto のリンクを target=_blank かつ rel=noopener noreferrer で描画し、括弧付き URL も保持する（L-834）", () => {
    const md = [
      "[公式サイト](https://example.com/docs)",
      "[連絡先](mailto:info@example.com)",
      "[Wiki](https://ja.wikipedia.org/wiki/Markdown_(%E8%A8%98%E6%B3%95))",
    ].join("\n\n");

    render(<NodeNoteMarkdown markdown={md} />);

    const docsLink = screen.getByRole("link", { name: "公式サイト" });
    expect(docsLink).toHaveAttribute("href", "https://example.com/docs");
    expect(docsLink).toHaveAttribute("target", "_blank");
    expect(docsLink).toHaveAttribute("rel", "noopener noreferrer");

    const mailLink = screen.getByRole("link", { name: "連絡先" });
    expect(mailLink).toHaveAttribute("href", "mailto:info@example.com");
    expect(mailLink).toHaveAttribute("target", "_blank");
    expect(mailLink).toHaveAttribute("rel", "noopener noreferrer");

    const wikiLink = screen.getByRole("link", { name: "Wiki" });
    expect(wikiLink).toHaveAttribute(
      "href",
      "https://ja.wikipedia.org/wiki/Markdown_(%E8%A8%98%E6%B3%95)",
    );
  });

  it("危険なスキーム・相対 URL・資格情報つき URL は <a> 要素を作らず文字だけを表示する（L-032・L-727）", () => {
    const md = [
      "[JSリンク](javascript:alert(1))",
      "[山括弧JS](<javascript:alert(1)>)",
      "[実体参照JS](jav&#x09;ascript:alert(1))",
      "[Dataリンク](data:text/html,<script>alert(1)</script>)",
      "[VBリンク](vbscript:msgbox)",
      "[相対リンク](/internal/path)",
      "[秘密リンク](https://user:pass@example.com/secret)",
    ].join("\n\n");

    const { container } = render(<NodeNoteMarkdown markdown={md} />);

    expect(container.querySelectorAll("a")).toHaveLength(0);
    expect(screen.getByText("JSリンク")).toBeInTheDocument();
    expect(screen.getByText("山括弧JS")).toBeInTheDocument();
    expect(screen.getByText("実体参照JS")).toBeInTheDocument();
    expect(screen.getByText("Dataリンク")).toBeInTheDocument();
    expect(screen.getByText("VBリンク")).toBeInTheDocument();
    expect(screen.getByText("相対リンク")).toBeInTheDocument();
    expect(screen.getByText("秘密リンク")).toBeInTheDocument();
  });

  it("生 HTML（script / img / iframe / a など）を DOM 要素として解釈せず、テキストとして表示する（L-727）", () => {
    const md = [
      "<script>window.__xss = true;</script>",
      '<img src="x" onerror="alert(1)">',
      '<iframe src="https://example.com"></iframe>',
      '<a href="javascript:alert(1)">悪意あるHTMLリンク</a>',
    ].join("\n\n");

    const { container } = render(<NodeNoteMarkdown markdown={md} />);

    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector("a")).toBeNull();
    expect(screen.getByText(/<script>window\.__xss = true;<\/script>/)).toBeInTheDocument();
  });

  it("画像記法は <img> を描画せず、安全な http/https URL ならリンク文字、それ以外はテキストとして表示する", () => {
    const md = [
      "![システム構成図](https://example.com/arch.png)",
      "![](https://example.com/no-alt.png)",
      "![危険な画像](javascript:alert(1))",
      "![データ画像](data:image/png;base64,aaaa)",
    ].join("\n\n");

    const { container } = render(<NodeNoteMarkdown markdown={md} />);

    expect(container.querySelector("img")).toBeNull();
    const archLink = screen.getByRole("link", { name: "[画像: システム構成図]" });
    expect(archLink).toHaveAttribute("href", "https://example.com/arch.png");
    expect(archLink).toHaveAttribute("target", "_blank");
    expect(archLink).toHaveAttribute("rel", "noopener noreferrer");

    const noAltLink = screen.getByRole("link", { name: "[画像]" });
    expect(noAltLink).toHaveAttribute("href", "https://example.com/no-alt.png");

    expect(screen.getByText("[画像: 危険な画像]").tagName).toBe("SPAN");
    expect(screen.getByText("[画像: データ画像]").tagName).toBe("SPAN");
  });

  it("リンクの中に画像が書かれた場合（[![alt](img)](link)）に <a> を入れ子にしない（L-835）", () => {
    const md = "[![バナー](https://example.com/banner.png)](https://example.com/landing)";
    const { container } = render(<NodeNoteMarkdown markdown={md} />);

    const links = container.querySelectorAll("a");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "https://example.com/landing");
    expect(links[0]).toHaveTextContent("[画像: バナー]");
    expect(links[0].querySelector("a")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
  });

  it("GFM の自動リンク（autolink literal）も安全な URL のみ <a> にし、資格情報つき自動リンクは <a> にしない（L-032）", () => {
    const md = [
      "URL: https://example.com/auto",
      "WWW: www.example.com/auto",
      "Mail: auto@example.com",
      "Secret: https://user:pass@example.com/secret",
    ].join("\n\n");

    const { container } = render(<NodeNoteMarkdown markdown={md} />);

    const autoLink = screen.getByRole("link", { name: "https://example.com/auto" });
    expect(autoLink).toHaveAttribute("href", "https://example.com/auto");
    expect(autoLink).toHaveAttribute("target", "_blank");
    expect(autoLink).toHaveAttribute("rel", "noopener noreferrer");

    const wwwLink = screen.getByRole("link", { name: "www.example.com/auto" });
    expect(wwwLink).toHaveAttribute("href", "http://www.example.com/auto");

    const mailLink = screen.getByRole("link", { name: "auto@example.com" });
    expect(mailLink).toHaveAttribute("href", "mailto:auto@example.com");

    expect(container.querySelectorAll("a")).toHaveLength(3);
    expect(screen.getByText("https://user:pass@example.com/secret").tagName).toBe("SPAN");
  });
});
