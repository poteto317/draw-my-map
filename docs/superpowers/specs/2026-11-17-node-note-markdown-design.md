# Markdownメモ（候補053）設計

作成日: 2026-11-17。対象: Phase 18 の候補053「Markdownメモ」（かんばんカード #105）。前提: 候補011「詳細メモ」（右パネル「ノードの詳細」の `NodeNoteSection`・`NodeNoteEditor`・`useNodeNoteEditing`、保存形式 V3 の任意項目 `note`）、候補012「URLの添付」（URL 検証の先例 `nodeLink.ts`）。状態: サブエージェントレビュー 2 周通過・自動承認済み（設計確定）。

## 決めたこと（ユーザー確認済み）

1. **Markdown の描画方法**: **`react-markdown` + `remark-gfm` を依存に追加**する。生 HTML を解釈しない安全な既定動作（`rehype-raw` は使わない）を採用する。
2. **詳細メモ欄の UI**: **「編集」「プレビュー」の切り替えタブ**を設ける。既定は「編集」。既存の自動反映（入力停止 300ms デバウンス・連続入力時最長 2 秒）・`blur` で 1 回の Undo / Redo にまとめる確定・`Escape` による取り消しの挙動はそのまま維持する。
3. **対応する記法の範囲**: **CommonMark + GFM（表・打ち消し線・タスクリストの表示のみ）**。画像は読み込まずリンク文字として出し、リンクは新しいタブ（`target="_blank" rel="noopener noreferrer"`）で `http` / `https` / `mailto` のみ有効にする。
4. **範囲の追加**: **追加しない**（右パネル「詳細メモ」節内の描画のみ。保存形式 V3 は変えず `note` はプレーン文字列のまま保持する。アウトラインの Markdown 書き出しへのメモ追加・キャンバスの「メモあり」の印・ノード検索へのメモ追加は含めない）。

### 設計中に決めたこと

- **タブを出す条件と状態の寿命**:
  - 「編集」「プレビュー」のタブは**ノードが選択されているときだけ**表示する。ノード未選択のときは従来どおりタブを出さず、無効化（`disabled`）された `<textarea>` と文字数表示だけを描く（無効なタブ要素を置いてフォーカスが `body` に落ちる事故を防ぐ。L-157）。
  - タブの表示モード（`NodeNoteViewMode = "edit" | "preview"`、初期値 `"edit"`）は `NodeNoteEditor` が `useState<NodeNoteViewMode>("edit")` で持つ。`NodeNoteEditor` は `NodeDetailPanel` から `key={`${selectedNode.id}:${documentRevision}`}` で描かれるため、選択ノードが変わったときや、Undo / Redo・JSON 取り込み・別タブ同期で `documentRevision` が進んだときは自動で `"edit"` に戻る（Undo / Redo は `useNodes` の `markDocumentRestored` で選択自体も解除するため、プレビュー中のタブからフォーカスが外れて `Delete` で選択ノードが消えることはない。L-155・L-588）。
- **WAI-ARIA タブパターンとキーボード操作（L-552・L-395）**:
  - `role="tablist"` に `aria-label="詳細メモの表示切替"` を付け、子要素には「編集」「プレビュー」の 2 つの `<button type="button" role="tab">` だけを置く（タブ以外のボタンや文字数を `tablist` の中に入れない。L-395）。
  - 各 `role="tab"` に `id`・`aria-selected`・`aria-controls` を付け、選択中のタブのみ `tabIndex={0}`、非選択のタブは `tabIndex={-1}`（roving tabindex）にする。
  - `role="tablist"` の `onKeyDown`: 修飾キー（`altKey`・`ctrlKey`・`metaKey`）が押されていない `ArrowRight` / `ArrowLeft` で前後のタブへ循環移動し、`Home` で「編集」、`End` で「プレビュー」へ切り替え、切り替え先の `<button role="tab">` に `.focus()` を移す（automatic activation）。`Alt+Arrow` などの修飾キー付きキー入力は何もしない。
  - 対応する 2 つの `<div role="tabpanel">`（編集パネルとプレビューパネル）は、**条件分岐で DOM から消さず常に両方とも DOM に残し、非選択側は `hidden` 属性で隠す**（`aria-controls` の参照先を常に DOM に保ち、かつ `<textarea>` を破棄しないことでブラウザ標準のテキスト欄内 Undo 履歴も保つ。L-552）。各 `tabpanel` には `id` と `aria-labelledby`（対応する `tab` の `id`）を付け、`tabIndex` は付けない。
  - ただし、プレビューパネルの内側の `<NodeNoteMarkdown>` は `mode === "preview"` のときだけ描画する（編集中に 1 文字打つたび最大 10,000 文字の Markdown 解析が走るのを防ぐ。L-411）。
- **編集からプレビューへ切り替えるときの確定（L-473）**:
  - マウスで「プレビュー」タブを押すときや `Shift+Tab` でタブへフォーカスを移すときは、ブラウザが先に `<textarea>` の `blur` を起こすため、`useNodeNoteEditing.onBlur` により未反映の下書きが即座にマップへ反映され、履歴グループが 1 回の Undo 単位として閉じる。
  - 万一 `<textarea>` にフォーカスが残ったままタブ切り替えが呼ばれた場合（プログラム的な呼び出しや環境差）でも確実に確定させるため、`NodeNoteSection` で `<textarea>` の `ref` を持ち、「プレビュー」へ切り替えるハンドラの冒頭で `document.activeElement === textareaRef.current` なら `textareaRef.current.blur()` を呼んでから `onModeChange("preview")` を呼ぶ（`useNodeNoteEditing.onBlur` は下書きを `null` にして消費するため、二重確定は起きない。L-473）。
  - プレビューに渡す文字列は `editing.value` とする（`blur` 後は確定済みの `node.note ?? ""` と一致し、常に編集欄と同じ最新の内容を表す。L-018）。
- **空のメモのプレビュー表示**:
  - `const normalized = normalizeNodeNote(editing.value)` を求め、`normalized === undefined`（空文字、または空白・改行のみ、末尾の孤立上位サロゲート除去後に空になる場合を含む）のときは、Markdown パーサーを通さず「メモはありません」（`<p className="text-sm text-zinc-500 dark:text-zinc-400">メモはありません</p>`）を表示し、非空時は正規化後の `normalized` を `<ReactMarkdown>` に渡す（保存時に空白だけのメモを「メモなし」とみなし末尾の孤立上位サロゲートを削る規則と揃える。L-018・L-636）。
- **文字数と上限通知の位置**:
  - 「N / 10,000 文字」と上限到達時の「上限に達しました」（`role="status"`）は、タブパネルの外（下）に常時表示する。「編集」と「プレビュー」を切り替えても文字数が確認でき、ライブリージョンが DOM から再マウントされない。
- **URL の安全性検査（`domain/nodes/nodeNoteMarkdownUrl.ts`）**:
  - `react-markdown` の既定の `urlTransform` に任せず、ドメイン層の純粋関数 `toSafeNoteMarkdownLinkHref(rawUrl: string): string | null`（リンク用: `http:` / `https:` / `mailto:`）と `toSafeNoteMarkdownImageHref(rawUrl: string): string | null`（画像のリンク化用: `http:` / `https:`）で検査・正規化する（L-018・L-032・L-443・L-834）。
  - 検査の順: ①前後の空白を `trim()` し、空なら `null`。②長さの上限 `NODE_NOTE_MAX_LENGTH`（10,000 文字）を `new URL` より先に判定し、超えたら `null`（L-443）。③制御文字（`U+0000`〜`U+001F`、`U+007F`〜`U+009F`）を含めば `null`。④`new URL(trimmed)` で解析し、例外（相対 URL `/path`、`#hash`、スキーム無し `example.com`、不正な形式）はすべて `null`。⑤`url.protocol` が許可リスト外（`javascript:`・`data:`・`vbscript:`・`file:`・`blob:` など）なら `null`。⑥`http:` / `https:` で資格情報（`url.username !== ""` または `url.password !== ""`）を含めば `null`（候補012 の `nodeLink.ts` と同じ基準。L-032）。⑦`url.href` の長さが `NODE_NOTE_MAX_LENGTH` を超えたら `null`。⑧成功時は正規化済みの `url.href` を返す（検証した URL と実際に `href` 属性へ入れる文字列を完全一致させる。L-018・L-834）。
  - `react-markdown` には `urlTransform={(url) => url}` を渡して既定の URL 書き換えを止め、カスタムの `a` / `img` コンポーネント側で上記関数を呼ぶ。これにより、危険な URL が `<a href="">` のような空リンクとして残るのを防ぎ、`<a>` 自体を作らず `<span>` のプレーンテキストに落とせる。
- **画像・リンク内の画像・タスクリストの描画（L-835・L-157）**:
  - 画像記法 `![alt](src)` は `<img>` を一切描画しない（外部通信・トラッキング・パネル内の高さ崩れを防ぐ）。表示文字列は `alt` を `trim()` して非空なら `[画像: ${trimmedAlt}]`、空なら `[画像]` とする。`toSafeNoteMarkdownImageHref(src)` が非 `null` のときは `<a href={safeHref} target="_blank" rel="noopener noreferrer">{表示文字列}</a>` として新しいタブで開けるリンク文字にし、`null` のときは `<span>{表示文字列}</span>` の文字だけにする。
  - **リンクの中に画像が書かれた場合（`[![alt](img)](link)`）**: `<a>` の内側にさらに `<a>` を描くと HTML 仕様違反となり DOM 構造と支援技術が壊れるため（L-835）、`NodeNoteMarkdown` 内で React Context（`InsideMarkdownLinkContext`）を使い、`<a>` の内側にある `img` は `src` の安全性にかかわらず常に `<span>{表示文字列}</span>` で描く（外側の `<a>` がクリック先を受け持つ）。
  - GFM タスクリスト（`- [ ]` / `- [x]`）が生成する `<input type="checkbox">` は `disabled={true}`・`readOnly={true}`・`tabIndex={-1}` に固定し、表示専用にする（クリックしてもメモは書き換えない）。
- **ショートカット・フォーカスとの整合（L-522）**:
  - プレビューパネル（`role="tabpanel"`）、コードブロック（`<pre>`）、表（`<table>` のラッパー）には `tabIndex` を付けず、独立したスクロールコンテナ（`overflow-x-auto` / `overflow-y-auto`）も作らない。Chromium 等ではスクロール可能な要素がキーボードフォーカス可能になり、そこにフォーカスがある状態で `Delete` / `Backspace` を押すと `isInteractiveTarget`（`button, input, textarea, select, a[href], [contenteditable]`）に該当せず選択中のノードが削除されてしまうため、コードブロックは `whitespace-pre-wrap break-words`、表は `w-full table-fixed break-words` で右パネルの幅（`w-72`）の中に折り返して収める（L-522・L-821）。
  - タブの `<button>` とプレビュー内の `<a href=...>` は `isInteractiveTarget` に該当するため、フォーカス中に `Delete` / `Backspace` / `Enter` / `Tab` / `Alt+Arrow` を押してもマップのノード削除やツリー変更は発火しない。
- **Jest で実物の `react-markdown` + `remark-gfm` を動かす（L-059・L-727）**:
  - `react-markdown` や `remark-gfm` をテストでモックすると、生 HTML の非解釈・リンクや画像の変換・GFM 記法の描画が実物で検証できなくなる（L-059・L-727）。
  - `next/jest` は既定で `/node_modules/` を SWC 変換から除外するため、ESM のみの `react-markdown` / `remark-gfm` とその推移的依存を Jest が読み込めるよう、`client/jest.config.ts` で `createJestConfig(config)` が返す設定の `transformIgnorePatterns` を調整し、実物のパッケージをテストで動かす。

---

## 1. 目的と境界

詳細メモ（候補011）に保存したテキストを、見出し・箇条書き・番号付きリスト・太字・斜体・打ち消し線・インラインコード・コードブロック・引用・水平線・表・タスクリスト・リンクとして整形表示できるようにし、長い説明や整理したメモを右パネルで読みやすくする。

### 対象外（YAGNI）

- 保存形式の変更（V3 の `note?: string` のまま。Markdown の AST や HTML は保存しない）。
- リッチテキスト（WYSIWYG）エディタ、ツールバーによる記法挿入ボタン、編集とプレビューの同時並列表示、クリックで編集に切り替わるインライン方式。
- タスクリストのチェックボックスをプレビュー上でクリックしてメモ本文の `[ ]` / `[x]` を書き換える機能。
- 画像（`<img>`）の読み込み・表示（外部 URL や `data:` URL の画像を読み込まない）。
- 生 HTML（`<div>`, `<script>`, `<iframe>`, `<style>` など）の解釈、数式（KaTeX / MathJax）、Mermaid 図、シンタックスハイライトライブラリの導入。
- アウトライン表示やキャンバス上のノードラベルでの Markdown 描画、アウトラインの Markdown 書き出しへのメモの反映、キャンバスの「メモあり」の印、ノード検索へのメモの追加。

## 2. 既存実装の調査と制約

- **詳細メモの部品構成**:
  - `NodeDetailPanel.tsx`（`<aside aria-label="ノードの詳細">`、`w-72`）が、ノード未選択時は `<NodeNoteSection targetLabel={null} selectionCount={selectionCount} editing={null} />` を、選択時は `<NodeNoteEditor key={`${selectedNode.id}:${documentRevision}`} ... />` を先頭に描く。
  - `NodeNoteEditor.tsx` は `useNodeNoteEditing` を呼び、`NodeNoteSection` に `targetLabel`・`selectionCount`・`editing` を渡す。
  - `NodeNoteSection.tsx` は現在フックを持たない表示部品（`useId` のみ使用）で、見出し「詳細メモ」、対象ノード名、複数選択の案内、`<label className="sr-only">詳細メモ</label>`、`<textarea>`、文字数「N / 10,000 文字」、上限の `role="status"` を描く。
- **ショートカットのガード**:
  - `interactiveTarget.ts` の `isInteractiveTarget` は `button, input, textarea, select, a[href], [contenteditable]` の内側を判定する。`useNodeKeyboardShortcuts`（`Delete` / `Backspace` / `Tab` / `Enter`）や `treeEditShortcutGuard`（`Alt+Arrow` / `Alt+Enter`）はこれで対話要素上のキー入力を無視する。
  - `editableTarget.ts` の `isEditableTarget` は `input, textarea, select, [contenteditable]` を判定し、`useMapHistoryShortcuts`（`Cmd/Ctrl+Z` / `Y`）や `useMapViewportShortcut`（`F`）が使う。タブの `<button>` やプレビュー内の `<a>` にフォーカスがあるときに `Cmd/Ctrl+Z` を押すとマップの Undo が動く（既存の `NodeLinksSection`・`NodeTagsSection` と同じ）。
  - `useMapClipboardEvents.ts` は `window.getSelection()?.isCollapsed === false` のときにブラウザ標準のコピーに任せるため、プレビュー内の文字を選択してコピーしても枝のコピーに奪われない。
- **スタイリング**:
  - Tailwind CSS v4（`@tailwindcss/postcss`・`@tailwindcss/cli`）。`@tailwindcss/typography` は入っていないため、要素ごとに Tailwind のユーティリティクラスを当てる。`npm run tailwind:scan` が `client/src` 内のクラスを検査する。
- **テスト環境**:
  - Jest 30 + `jest-environment-jsdom` + `next/jest.js`。`next/jest.js` が作る `transformIgnorePatterns` の先頭要素は `/node_modules/(?!.pnpm)(?!(geist)/)` となっており、カスタム設定の `transformIgnorePatterns` は末尾に追記されるだけなので、`jest.config.ts` で解決後の配列を書き換える必要がある。

## 3. ドメイン（`domain/nodes/nodeNoteMarkdownUrl.ts`）

Markdown プレビュー内のリンク URL と画像 URL の安全性を検査・正規化する純粋関数を `client/src/domain/nodes/nodeNoteMarkdownUrl.ts` に置く。

- 許可スキーム定数:
  - `ALLOWED_LINK_PROTOCOLS: ReadonlySet<string> = new Set(["http:", "https:", "mailto:"])`
  - `ALLOWED_IMAGE_PROTOCOLS: ReadonlySet<string> = new Set(["http:", "https:"])`
- 制御文字判定関数 `hasControlCharacter(value: string): boolean`: ESLint の `no-control-regex` 回避および既存実装（`nodeTag.ts`）との統一のため、正規表現ではなく `charCodeAt` ループで `code <= 0x1f || (code >= 0x7f && code <= 0x9f)` を検査する（L-018）。
- 内部共通関数 `normalizeSafeMarkdownUrl(rawUrl: string, allowedProtocols: ReadonlySet<string>): string | null`:
  1. `const trimmed = rawUrl.trim();`
  2. `if (trimmed.length === 0 || trimmed.length > NODE_NOTE_MAX_LENGTH) return null;`（長さの先行判定。L-443）
  3. `if (hasControlCharacter(trimmed)) return null;`
  4. `let parsed: URL; try { parsed = new URL(trimmed); } catch { return null; }`
  5. `if (!allowedProtocols.has(parsed.protocol)) return null;`
  6. `if ((parsed.protocol === "http:" || parsed.protocol === "https:") && (parsed.username !== "" || parsed.password !== "")) return null;`（資格情報つき URL を拒否。L-032）
  7. `if (parsed.href.length > NODE_NOTE_MAX_LENGTH) return null;`（パーセントエンコード後の長さも検査。L-836）
  8. `return parsed.href;`
- 公開関数:
  - `toSafeNoteMarkdownLinkHref(rawUrl: string): string | null` — `normalizeSafeMarkdownUrl(rawUrl, ALLOWED_LINK_PROTOCOLS)`
  - `toSafeNoteMarkdownImageHref(rawUrl: string): string | null` — `normalizeSafeMarkdownUrl(rawUrl, ALLOWED_IMAGE_PROTOCOLS)`
  - `formatNoteMarkdownImageLabel(alt: string | undefined): string` — `const trimmed = alt?.trim() ?? ""; return trimmed === "" ? "[画像]" : `[画像: ${trimmed}]`;`

## 4. コンポーネント

### 4.1 `components/layout/NodeNoteMarkdown.tsx`（新設）

Markdown 文字列を受け取り、安全に整形表示する部品。

- Props: `{ markdown: string }`
- `const normalized = normalizeNodeNote(markdown);` を求め、`normalized === undefined`（空文字または空白・改行のみ、末尾の孤立上位サロゲート除去後に空になる場合を含む）のときは、`<p className="text-sm text-zinc-500 dark:text-zinc-400">メモはありません</p>` を返す。
- 非空のときは `<div className="flex flex-col gap-2 break-words text-sm text-zinc-800 dark:text-zinc-100">` の中に `<ReactMarkdown remarkPlugins={REMARK_PLUGINS} urlTransform={identityUrlTransform} components={MARKDOWN_COMPONENTS}>{normalized}</ReactMarkdown>` を描く（検証・正規化した文字列をそのまま描画に使う。L-018・L-636。`REMARK_PLUGINS = [remarkGfm]`、`identityUrlTransform = (url: string) => url`、`MARKDOWN_COMPONENTS` はすべてモジュールスコープの定数とし、再描画のたびに新しい配列・関数を作らない）。
- `InsideMarkdownLinkContext = createContext(false)`:
  - `a` コンポーネント: `href`（文字列以外は `""`）を `toSafeNoteMarkdownLinkHref` に通す。
    - 非 `null`（`safeHref`）なら、`<InsideMarkdownLinkContext.Provider value={true}><a href={safeHref} target="_blank" rel="noopener noreferrer" className=" break-all text-blue-600 underline hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300">{children}</a></InsideMarkdownLinkContext.Provider>` を返す。
    - `null` なら、`<span>{children}</span>` を返す（`<a>` を作らない）。
  - `img` コンポーネント: `useContext(InsideMarkdownLinkContext)` で `isInsideLink` を読む。`label = formatNoteMarkdownImageLabel(alt)`。`<img>` タグは絶対に出さない。
    - `isInsideLink` が `true` のときは、`src` にかかわらず `<span>{label}</span>` を返す（`<a>` の入れ子を防ぐ。L-835）。
    - `isInsideLink` が `false` のときは、`typeof src === "string" ? toSafeNoteMarkdownImageHref(src) : null` を求め、非 `null`（`safeHref`）なら `<a href={safeHref} target="_blank" rel="noopener noreferrer" className="break-all text-blue-600 underline hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300">{label}</a>`、`null` なら `<span className="text-zinc-600 dark:text-zinc-400">{label}</span>` を返す。
  - `input` コンポーネント: `type === "checkbox"` のときだけ `<input type="checkbox" checked={Boolean(checked)} disabled readOnly tabIndex={-1} className="mr-1.5 align-middle" />` を返し、それ以外の `type` は `null` を返す。
  - その他の要素のスタイル（すべて右パネル `w-72` 内で折り返し、独立スクロールを作らない。ダークモード対応）:
    - `h1`: `text-base font-bold text-zinc-900 dark:text-zinc-50`
    - `h2`: `text-sm font-bold text-zinc-900 dark:text-zinc-50`
    - `h3`, `h4`, `h5`, `h6`: `text-sm font-semibold text-zinc-800 dark:text-zinc-100`
    - `p`: `leading-relaxed whitespace-pre-wrap break-words`
    - `ul`: `list-disc pl-5 space-y-1`
    - `ol`: `list-decimal pl-5 space-y-1`
    - `li`: `break-words`
    - `blockquote`: `border-l-2 border-zinc-300 pl-3 text-zinc-600 dark:border-zinc-600 dark:text-zinc-300`
    - `pre`: `whitespace-pre-wrap break-words rounded-md bg-zinc-100 p-2 font-mono text-xs text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100`
    - `code`: インラインとブロックの両方で使えるよう `rounded bg-zinc-100 px-1 py-0.5 font-mono text-xs text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100`（`pre` の中の `code` でも背景色が同じ `zinc-100` / `dark:bg-zinc-900` なので見た目が崩れない）
    - `table`: `w-full table-fixed border-collapse text-xs`
    - `th`: `border border-zinc-300 bg-zinc-100 px-2 py-1 text-left font-semibold break-words dark:border-zinc-600 dark:bg-zinc-900`
    - `td`: `border border-zinc-300 px-2 py-1 break-words dark:border-zinc-600`
    - `hr`: `border-zinc-200 dark:border-zinc-700`
    - `del`: `line-through text-zinc-500 dark:text-zinc-400`

### 4.2 `components/layout/NodeNoteSection.tsx` と `NodeNoteEditor.tsx`

- `NodeNoteViewMode = "edit" | "preview"` を `NodeNoteSection.tsx` で定義・export する。
- `NodeNoteSectionProps` に省略可能な `mode?: NodeNoteViewMode`（既定値 `"edit"`）と `onModeChange?: (mode: NodeNoteViewMode) => void` を追加する（未選択時は `editing === null` でタブ自体を描かないため省略可能でよいが、`NodeNoteEditor` からは必ず `mode` と `onModeChange` を明示的に渡す。L-060）。
- `NodeNoteEditor.tsx`:
  - `const [mode, setMode] = useState<NodeNoteViewMode>("edit");` を持ち、`NodeNoteSection` に `mode={mode}` と `onModeChange={setMode}` を渡す。
- `NodeNoteSection.tsx`:
  - `editing === null`（ノード未選択時）:
    - 従来どおりタブ（`role="tablist"`）を描かず、`<label htmlFor={textareaId} className="sr-only">詳細メモ</label>` と `disabled` の `<textarea>`、文字数、上限ステータスを描く。
  - `editing !== null`（ノード選択時）:
    - `<div role="tablist" aria-label="詳細メモの表示切替" className="flex gap-1" onKeyDown={handleTabListKeyDown}>` を描く。
    - タブボタン 2 つ:
      - 「編集」タブ: `id={editTabId}`, `role="tab"`, `type="button"`, `aria-selected={activeMode === "edit"}`, `aria-controls={editPanelId}`, `tabIndex={activeMode === "edit" ? 0 : -1}`
      - 「プレビュー」タブ: `id={previewTabId}`, `role="tab"`, `type="button"`, `aria-selected={activeMode === "preview"}`, `aria-controls={previewPanelId}`, `tabIndex={activeMode === "preview" ? 0 : -1}`
      - スタイルは選択中タブと非選択タブで分岐ごとにクラスを分ける（同じプロパティの条件付きクラスを重複させない。L-703）。
    - タブ切り替え処理 `selectMode(nextMode: NodeNoteViewMode)`:
      - `if (nextMode === "preview" && textareaRef.current !== null && document.activeElement === textareaRef.current) { textareaRef.current.blur(); }`
      - `if (nextMode !== activeMode) { onModeChange?.(nextMode); }`
    - キーボードでのタブ切り替え `handleTabListKeyDown`:
      - `if (event.altKey || event.ctrlKey || event.metaKey) return;`
      - `ArrowRight` / `ArrowLeft`: もう一方のモードを求め、`event.preventDefault()`、`selectMode(nextMode)`、対応するタブボタンの `ref.current?.focus()` を呼ぶ。
      - `Home`: `event.preventDefault()`、`selectMode("edit")`、`editTabRef.current?.focus()`。
      - `End`: `event.preventDefault()`、`selectMode("preview")`、`previewTabRef.current?.focus()`。
    - 編集タブパネル:
      - `<div id={editPanelId} role="tabpanel" aria-labelledby={editTabId} hidden={activeMode !== "edit"}>` の中に既存の `<label className="sr-only">` と `<textarea ref={textareaRef} ... />` を置く。
    - プレビュータブパネル:
      - `<div id={previewPanelId} role="tabpanel" aria-labelledby={previewTabId} hidden={activeMode !== "preview"} className="min-h-40 rounded-md border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-700 dark:bg-zinc-900">` の中に、`{activeMode === "preview" ? <NodeNoteMarkdown markdown={editing.value} /> : null}` を置く。
    - 文字数表示と上限の `role="status"` は両タブパネルの下にそのまま置く。

## 5. Jest 設定と依存パッケージ

- `client/package.json` の `dependencies` に `"react-markdown"` と `"remark-gfm"` を追加する。
- `client/jest.config.ts`:
  - `next/jest.js` の `createJestConfig(config)` が返す非同期関数をラップし、`resolvedConfig.transformIgnorePatterns` のうち `/node_modules/` を除外するパターンを、`react-markdown` / `remark-gfm` とその ESM 依存パッケージを変換対象に含めるパターン（または ESM パッケージ群の negative lookahead）に差し替える。
  - これにより、`npm test` と `npm run verify`（`tailwind:scan`・`lint`・`typecheck`・`test`・`build`）のすべてで実物の `react-markdown` と `remark-gfm` が動作する。

## 6. 既存機能との接続

| 機能 | 扱い |
| --- | --- |
| 保存・読み込み・JSON | 変更なし。`note` は V3 のプレーン文字列（最大 10,000 文字）のまま往復する |
| Undo / Redo | 変更なし。編集タブでの入力は 300ms デバウンスで途中反映し、プレビュータブへの切り替え時（`blur`）またはフォーカス離脱時に 1 回の履歴として確定する。Undo / Redo 実行時は `documentRevision` が進み選択も解除される |
| Escape による取り消し | 変更なし。編集タブの `<textarea>` で `Escape`（IME 変換中を除く）を押すとフォーカス開始時の内容に戻して `blur` する |
| 複製・コピー＆貼り付け・分割・統合・競合検出 | 変更なし。`note` 文字列をそのまま扱う（統合では `"\n\n"` で連結されるため、Markdown の段落や見出しの区切りとも自然に整合する） |
| ノードの属性ポリシー（`nodeAttributePolicy.ts`） | 変更なし（新しい属性を増やさないため） |
| キーボードショートカット | タブの `<button>` とプレビュー内の `<a href>` は `isInteractiveTarget` に該当し、`Delete` / `Backspace` / `Tab` / `Enter` / `Alt+Arrow` はマップを動かさない。`tabpanel`・`<pre>`・`<table>` には `tabIndex` も独立スクロールも持たせないため、非対話要素へのフォーカスによる `Delete` 誤発火も起きない |
| クリップボード（枝のコピー） | プレビュー内のテキストを選択して `Cmd/Ctrl+C` を押したときは、`useMapClipboardEvents` の `window.getSelection()?.isCollapsed === false` によりブラウザ標準のテキストコピーが動く |
| 検索・一括置換・アウトライン／画像書き出し・キャンバス | 変更なし（対象外） |

## 7. テスト方針

- **ドメイン単体テスト（TDD）**（`client/src/domain/nodes/__tests__/nodeNoteMarkdownUrl.test.ts`）:
  - `toSafeNoteMarkdownLinkHref`: `https://`・`http://`・`mailto:` を許可し正規化後の `href` を返すこと、大文字スキーム `HTTPS://Example.COM/Path` の正規化、前後の空白除去、URL 内に括弧を含む Wikipedia 形式 URL（`https://ja.wikipedia.org/wiki/Markdown_(記法)`）の保持（L-834）、空文字・空白のみ・相対パス（`/foo`, `./bar`, `#sec`）・スキーム無し（`example.com`）・`javascript:`・`data:`・`vbscript:`・`file:`・`blob:`・制御文字入り・資格情報入り（`https://user:pass@example.com`）・10,000 文字超過（入力が 10,001 文字、および入力は 10,000 文字以内だがエンコード後の `href` が 10,000 文字を超えるケース）をすべて `null` にすること。
  - `toSafeNoteMarkdownImageHref`: `https://`・`http://` のみ許可し、`mailto:`・`javascript:`・`data:`・資格情報入り・上限超過などをすべて `null` にすること。
  - `formatNoteMarkdownImageLabel`: `alt` あり・前後の空白あり・空文字・空白のみ・`undefined` の各ケース。
- **コンポーネント単体テスト（TDD）**（`client/src/components/layout/__tests__/NodeNoteMarkdown.test.tsx`）:
  - 実物の `react-markdown` + `remark-gfm` を使い（モックしない。L-059・L-727）、見出し（`#`〜`######`）・段落・太字・斜体・打ち消し線（`~~`）・箇条書き・番号付きリスト・引用（`>`）・インラインコード・コードブロック（` ``` `）・水平線・GFM 表（`| a | b |`）・タスクリスト（`- [ ]` / `- [x]`）が対応する HTML 要素として描画されること。
  - タスクリストのチェックボックスが `disabled` かつ `tabIndex={-1}` であること。
  - リンク: `https://`・`http://`・`mailto:`（および GFM 自動リンク）が `target="_blank"` かつ `rel="noopener noreferrer"` の `<a>` になること。括弧を含む URL が途中で切れずに `href` に入ること（L-834）。
  - XSS・危険スキームの拒否（構造検査。L-727）: `[x](javascript:alert(1))`・`[x](<javascript:alert(1)>)`・`[x](jav&#x09;ascript:alert(1))`・`[x](data:text/html,<script>alert(1)</script>)`・`[x](vbscript:msgbox)`・`[x](/relative)`・`[x](https://user:pass@example.com)`（および資格情報つき GFM 自動リンク）で `<a>` 要素が 1 つも作られずラベル文字だけが表示されること。
  - 生 HTML の非解釈（構造検査。L-727）: `<script>alert(1)</script>`・`<img src=x onerror=alert(1)>`・`<iframe src="https://example.com"></iframe>`・`<a href="javascript:alert(1)">evil</a>` を入れても `<script>`・`<img>`・`<iframe>`・`<a>` 要素が DOM に作られず、テキストとしてエスケープ表示されること。
  - 画像の非読み込みとリンク文字化: `![構成図](https://example.com/diagram.png)` で `<img>` 要素が作られず、`[画像: 構成図]` というテキストの `<a href="https://example.com/diagram.png" target="_blank" rel="noopener noreferrer">` が描かれること。`![](https://example.com/a.png)` は `[画像]` になること。`![罠](javascript:alert(1))` や `![罠](data:image/png;base64,xxx)` は `<img>` も `<a>` も作られず `[画像: 罠]` の `<span>` になること。
  - リンク内の画像の入れ子防止（L-835）: `[![バナー](https://example.com/banner.png)](https://example.com/dest)` で `<a>` が外側の 1 つだけ（`href="https://example.com/dest"`）作られ、`<a>` の中に別の `<a>` や `<img>` が作られないこと。
  - 空メモ・空白のみのメモ（末尾の孤立上位サロゲート除去後に空になるものを含む）で「メモはありません」が表示され、本文末尾に孤立上位サロゲートがあるときは除去された文字列が描画されること（L-018・L-636）。
- **`NodeNoteSection` / `NodeNoteEditor` のテスト**（`NodeNoteSection.test.tsx`, `NodeNoteEditor.test.tsx`）:
  - 未選択時（`editing === null`）は `role="tablist"` を出さず、無効な `<textarea>` のみを出すこと。
  - 選択時は「編集」「プレビュー」の `role="tab"` が描かれ、初期状態は「編集」が `aria-selected="true"`・`tabIndex={0}`、「プレビュー」が `aria-selected="false"`・`tabIndex={-1}` であり、両方の `role="tabpanel"` が DOM に存在してプレビュー側だけ `hidden` であること（L-552）。
  - 「プレビュー」タブをクリックするとプレビューパネルが表示されて Markdown が整形描画され、編集パネルが `hidden` になり（DOM からは消えない）、文字数表示は引き続き見えること。
  - `role="tablist"` 上での `ArrowRight` / `ArrowLeft` / `Home` / `End` による切り替えとフォーカス移動が動くこと、および `Alt+ArrowRight` など修飾キー付きでは切り替わらないこと。
  - `NodeNoteEditor` で `<textarea>` に入力した直後（300ms のデバウンス満了前、かつ `<textarea>` にフォーカスがある状態）に「プレビュー」タブに切り替えると、`blur` を経て即座に下書きが確定・プレビューに反映されること（L-473・L-737）。
  - ノード ID または `documentRevision` が変わるとタブが「編集」に戻ること（L-588）。
- **ページ結合テスト**（`client/src/app/__tests__/pageNodeNote.test.tsx`）:
  - メモ欄に Markdown（見出し・箇条書き・リンク・画像）を入力して「プレビュー」タブへ切り替えると整形表示され、ヘッダーの「元に戻す」1 回でメモの変更が元に戻ること。
  - 「プレビュー」タブのボタンおよびプレビュー内のリンク（`<a>`）にフォーカスがある状態で `Delete` / `Backspace` を押しても、選択中のノードが削除されないこと（L-522）。

## 8. 知見（実装時に気をつける ID）

L-018（検証した URL と描画に使う `href` を一致させる）、L-032（資格情報を含む URL や危険スキームを許可リスト方式で拒否する）、L-443・L-836（長さの上限判定を URL 解析より先に行い、正規化後の `href` にも上限を掛ける）、L-834（括弧を含む URL が途中で切れないことをテストで固定する）、L-835（`<a>` の中に `<a>` を入れ子にしない）、L-552・L-395（WAI-ARIA の `tablist` / `tab` / `tabpanel`、非表示パネルを DOM に残して `hidden` で隠す、roving tabindex、矢印・Home・End キー操作）、L-473（プレビュー切り替え時の `blur` 確定で二重確定を起こさない）、L-588（ノード ID・`documentRevision` の変化で表示モードを持ち越さない）、L-155・L-157（無効な要素にフォーカスを移さない、未選択時はタブを描かない）、L-522（プレビュー領域に不要な `tabIndex` や独立スクロールを持たせず、`Delete` キーでノードが消えないようにする）、L-411（編集中は Markdown パーサーを走らせない）、L-703（Tailwind の条件付きクラスを分岐ごとに整理する）、L-059・L-727・L-737（`react-markdown` をモックせず実物でテストし、XSS は DOM 要素が生成されない構造検査で確かめ、DOM イベント接続もテストする）、L-060（省略可能 props の配線漏れ防止）、L-203（仕様書・README・ロードマップ・ブラウザテスト手順書の同期）。

## 9. ドキュメント更新

- `docs/specifications/features.md`: 24 章（詳細メモ）に「編集 / プレビュー切り替えと Markdown 表示」の仕様（対応記法、リンク・画像・生 HTML・タスクリストの扱い、キーボード操作、ショートカットとの整合）を追記し、冒頭の機能一覧と Phase 18 の説明を更新する。
- `docs/architecture/overview.md`: 技術スタック表に `react-markdown` / `remark-gfm` を追記し、`src/domain/nodes/` と `src/components/layout/` のファイル一覧・件数（`nodeNoteMarkdownUrl.ts`、`NodeNoteMarkdown.tsx`）および右パネルの説明を更新する。
- `docs/testing/browser-test-cases.md`: AI 節「Markdownメモ（Phase 18・候補053）」（AI-01〜AI-07: 見出し・リスト・コード・表・タスクリストの表示、リンクの新しいタブ遷移、危険スキームと生 HTML の無害化、画像のリンク文字化、編集→プレビュー切り替え時の自動確定と Undo、タブのキーボード操作と `Delete` キーの安全性、空メモ・ノード切り替え・アウトライン表示・ダークモード）と結果の集計表を追加する。
- `ROADMAP.md`: 候補053「Markdownメモ」を `- [x]` にし、「現在地」の Phase 18 の進捗と次の未完了項目（候補054「出典情報」）、および「最終更新」の日付を更新する。
- `README.md`・`client/README.md`・`docs/README.md`: Phase 18 の機能説明に Markdown メモを反映する。
