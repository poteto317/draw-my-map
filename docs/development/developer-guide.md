# 開発者向けガイド

Draw My Map の開発に新しく参加する人が、最初の変更を安全に入れられるようにするための案内です。詳しい仕様と設計は、それぞれの文書へのリンクをたどってください。

- 機能の仕様: [features.md](../specifications/features.md)
- 設計とモジュールの責務: [architecture/overview.md](../architecture/overview.md)
- 保存形式: [data-model.md](../specifications/data-model.md)
- イラスト生成の API: [api.md](../specifications/api.md)
- 開発の運用ルール（計画・TDD・レビュー・コミット）: リポジトリ直下の [AGENTS.md](../../AGENTS.md)

---

## 1. セットアップ

### 1.1 必要なもの

- Node.js 20 以上と npm 10 以上
- アプリ本体はすべて `client/` にあります。npm のコマンドは `client/` で実行します。

```bash
git clone https://github.com/poteto317/draw-my-map.git
cd draw-my-map/client
npm install
npm run dev        # http://localhost:3000
```

### 1.2 イラスト生成（任意）

イラスト生成を試すときだけ、Cloudflare Workers AI の認証情報が必要です。設定しなくても、イラスト以外の機能はすべて動きます（イラストの生成は `not-configured` の通知になります）。

```bash
cp -n .env.example .env.local
# .env.local に CLOUDFLARE_ACCOUNT_ID と CLOUDFLARE_API_TOKEN を書く（コミットしない）
```

手順の詳細は [illustration-generation-setup.md](../setup/illustration-generation-setup.md) を参照してください。自動テストは Cloudflare に接続しません（後述の 3.4）。

### 1.3 よく使うコマンド

| コマンド | 内容 |
| :--- | :--- |
| `npm run dev` | 開発サーバー |
| `npm test` | Jest（全テスト）。`npx jest <パス>` で一部だけ実行できる |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint（Next.js と React Compiler 向けのルールを含む） |
| `npm run verify` | Tailwind のスキャン → lint → 型チェック → テスト（`--runInBand`）→ 本番ビルド。変更を終えたら必ず実行する |

`npm run verify` はビルドまで含むので時間がかかります。作業中は、変更したモジュールのテストと `npm run typecheck`・`npm run lint` を回し、最後に `verify` を流すのが効率的です。

### 1.4 作業の進め方

- 作業は `.worktrees/<ブランチ名>` の git worktree で行います（[AGENTS.md](../../AGENTS.md) の「実装完了後のブランチの扱い」）。
- 実装の前にテストを書き、失敗（RED）を確かめてから実装します（TDD）。
- コミットメッセージは Conventional Commits 形式（例: `feat(map): ...`、`test(server): ...`）です。
- 機能を実装し終えたら、同じブランチで `ROADMAP.md` のチェックと「現在地」を更新します。実装していない項目は完了にしません。

---

## 2. 主要な流れ

### 2.1 レイヤーと依存の向き

```text
app（ページ・Route Handler）
 └─ components（React の表示・Pixi のキャンバス）
     └─ hooks（状態・操作の順序）
         ├─ services（localStorage・fetch・Canvas などの副作用）
         └─ domain（純粋関数。React・DOM・ブラウザ API に依存しない）
server（Route Handler から呼ぶサーバー専用の処理）── domain
config・types は全レイヤーから参照する
```

新しい規則（ツリーの組み替え・配置・検証など）は、まず `domain/` に純粋関数として書き、フックからはそれを呼ぶだけにします。依存してよい組み合わせの一覧は [overview.md の 2.2 節](../architecture/overview.md#22-レイヤー間依存関係図マトリックス) にあります。

### 2.2 画面の構成

1. `app/page.tsx` の `Home`（シェル）が `useMapLibrary` で、マップの一覧・現在のマップ・保存先のセッションを持ちます。
2. 現在のマップごとに `<MapEditor key={マップの id}:{storageMode}>` を描画します。切り替えると `MapEditor` が作り直されるため、編集履歴・表示状態・エディタ内の非同期処理の結果は前のマップから引き継ぎません。
3. `MapEditor` の中で、`useNodes` がノードの配列・配置モード・選択・編集履歴を持ち、`MapStage` が Pixi.js でキャンバスを描きます。ヘッダーやパネルなどは DOM（React）で、キャンバスの上に重ねます。

### 2.3 ノードを編集する流れ

1. ボタンやショートカット（`components/` と `use*Action`・`use*Shortcut` のフック）が、`useNodes` の操作（`addChildNode`・`reorderSibling`・`changeNodeIndent`・`insertParentNode` など）を呼びます。
2. 構造を変える操作は、`useNodeLayoutState` の `applyTreeChange(update)` を1回だけ呼びます。`update` は確定時点の最新のノード配列を受け取り、新しい配列か `null`（変更しない）を返します。自動配置では、その後に `layoutNodeForest` で全体を並べ直します。
3. `applyTreeChange` が `commit` すると、編集履歴（`domain/history/mapHistory.ts`）に1操作として記録されます。1回のユーザー操作で `applyTreeChange` を2回呼ぶと、Undo が2回必要になってしまうので注意してください。
4. 新しいノードの ID は、`useNodes` が持つ採番器（`createNodeIdAllocator`）から、確定時点の配列を見て採番します。Undo で消えたノードの ID も再利用しません。

### 2.4 保存と読み込みの流れ

- ノードの配列は `MapDocument`（V3 の JSON）にして、`useMapStorageAutoSave` が自動保存します。`localStorage` を直接読み書きするのは `services/persistence/mapLibraryStorage.ts` だけです（例外は 4.5 節）。
- 読み込みは、`domain/persistence/mapDocumentDecoder.ts` の `parseMapDocumentJson` が `unknown` から検証して `Node[]` を作ります（V1・V2 は V3 へ移行）。インデックスは `domain/mapLibrary/mapIndex.ts` の `decodeMapIndex`、クリップボードは `domain/clipboard/subtreeClipboardCodec.ts` の `decodeSubtreeClipboard` が検証します。
- 保存は、マップの切り替えに使うセッション番号で照合します。切り替えの後に前のマップの保存待ちが届いても書き込みません。

### 2.5 イラスト生成の流れ

1. 右パネルや右クリックメニューから、`useIllustrationGeneration` が `services/illustration/illustrationClient.ts` の `requestIllustration` を呼び、`POST /api/illustrations` を送ります。
2. Route Handler（`app/api/illustrations/route.ts`）は、`server/illustration/handleIllustrationRequest.ts` に、環境変数と翻訳・画像生成の実装を渡すだけです。
3. `handleIllustrationRequest` は、本文の検証 → ラベルの検証 → 設定の確認 → 日本語なら翻訳（1回）→ 画像生成（NSFW の誤判定は最大3回まで試行）の順に処理し、失敗を HTTP ステータス（400・422・429・502・503）に変換します。
4. Cloudflare への呼び出しは `cloudflareRunModel.ts` に集約されています。応答の形は保証されないため、`unknown` のまま読んで分類します。
5. クライアントは受け取った画像を `illustrationThumbnail.ts` で 128px の JPEG に縮小してから、ノードに紐付けます。

---

## 3. テストの書き方

### 3.1 置き場所と名前

- テストは対象と同じディレクトリの `__tests__/` に、`<対象のファイル名>.test.ts(x)` で置きます（例: `domain/nodes/nodeTree.ts` → `domain/nodes/__tests__/nodeTree.test.ts`）。
- `describe` には対象の関数・フック名を、`it` には「条件 → 結果」を日本語で書きます（例: `it("success が false なら upstream-error", ...)`）。
- 入力だけが違うケースは `it.each` でまとめます。`%s` で表名を入れると、失敗したケースが分かりやすくなります。
- import はパスエイリアス `@/` を使います（`@/domain/nodes/nodeTree`）。

### 3.2 レイヤーごとの書き方

| 対象 | 書き方 |
| :--- | :--- |
| `domain/` | 入力と出力だけを比べる単体テスト。入力の配列を変えていないことも確かめる。境界値（上限ちょうど・1つ超え・空）と、不正な入力（`null`・配列・文字列・数値・欠けた項目）を並べる |
| `services/` | `fetchImpl` などの注入口に `jest.fn()` を渡すか、`jest.spyOn(globalThis, "fetch")` で差し替える。`localStorage` の例外は `DOMException`（`QuotaExceededError`・`SecurityError`）で再現する |
| `server/` | ファイル先頭に `/** @jest-environment node */` を書く（jsdom には `Request`・`Response`・`fetch` が無いため）。Cloudflare への通信は `fetchImpl` か `IllustrationRouteDeps` で差し替え、本物には接続しない |
| `hooks/` | `@testing-library/react` の `renderHook` と `act`。非同期の結果は `waitFor` で待つ |
| `components/` | React Testing Library。キャンバスは下の 3.3 のハーネスを使う |
| `app/`（ページ） | `src/app/testing/` の補助で `Home` を本物の `MapEditor`・`MapStage`・`localStorage` まで通し、Pixi・ダウンロード・画像化だけを差し替える |

### 3.3 共通の補助

- `src/testing/createTestNode.ts`: 既定値を持つテスト用の `Node`。必要な項目だけ上書きする（`createTestNode({ id: 2, parentId: 1 })`）。
- `src/testing/createTestStorageSession.ts`: フックのテスト用の偽の保存セッション。
- `src/testing/mapLibraryTestStorage.ts`: ページのテスト用に、インデックスと本体を書き込む・読む補助と、書き込みの順序を記録する偽の `Storage`。
- `src/testing/jpegFixture.ts`: 寸法を指定した最小の JPEG と data URL。
- `src/components/map/pixi/testing/pixiTestHarness.ts`: 描画関数の単体テスト用の偽の Pixi。
- `src/components/map/testing/mapStageTestRuntime.tsx`: `MapStage` の結合テスト用のランタイム（`createMockPixiModule`・`renderReady`・`pointer` など）。

各補助の詳細は [overview.md の 5.2 節](../architecture/overview.md#52-テストハーネスと共通フィクスチャの階層設計) にあります。

### 3.4 失敗経路のテスト

正常系と同じだけ、失敗の経路もテストします。とくに次の5つは、このリポジトリで抜けやすい箇所です。

1. **例外と拒否された Promise**: `mockRejectedValue`・`mockImplementation(() => { throw ... })` で失敗させ、利用者向けの通知・状態の後片付け（処理中の表示の解除、Object URL の解放、二重実行の防止の解除）まで確かめる。
2. **形の違う外部入力**: JSON として正しくても形が違う値（`null`・配列・文字列・数値・項目の型違い）を入れる。例: `server/illustration/__tests__/cloudflareRunModel.test.ts`、`domain/mapLibrary/__tests__/mapIndex.test.ts`。
3. **アンマウント・切り替えの後に届いた結果**: 遅れて解決した Promise が、ダウンロードや通知、別のマップへの書き込みをしないこと。
4. **時間切れ**: `jest.useFakeTimers()` で進める。`afterEach` で `jest.useRealTimers()` に戻す。
5. **数値の失敗経路**: `checkedAdd` などの `checked*` が `null` を返す経路は、`calculateOutdentTranslation` や `placeNodeForest` などの公開関数から確かめる。`Number.MAX_VALUE` で溢れさせる、`2 ** 60` のような大きな座標で小さな加算を丸めで失わせるなど、手前の別の判定で止まらない入力を選ぶ。どの経路も同じ `null` を返すので、対象の分岐を一時的に壊してテストが落ちることも確かめる。例: `domain/nodes/__tests__/nodeIndentPlacement.test.ts`。

### 3.5 リファクタリングの前に

振る舞いを変えないリファクタリングでは、先に今の振る舞いを固定するテスト（特性テスト）を追加し、変更前のコードで通ることを確かめてから書き換えます。

---

## 4. よくある落とし穴

### 4.1 外部入力は `as` で型を付けない

`JSON.parse`・`response.json()`・`localStorage`・クリップボードから受け取った値は `unknown` として扱い、`as` でキャストしません。`domain/shared/unknownRecord.ts` の型ガードを使います。

```ts
import { isRecord, readProperty } from "@/domain/shared/unknownRecord";

const body: unknown = await response.json().catch(() => null);
if (!isRecord(body)) return INVALID;          // null・配列・プリミティブを除く
const image = readProperty(body, "image");    // unknown のまま取り出し、typeof で確かめる
if (typeof image !== "string") return INVALID;
```

### 4.2 コールバックの中で代入した変数は `null` に絞り込まれる

`applyTreeChange` の更新関数の中で結果を代入しても、TypeScript は呼び出し後もその変数を初期値の `null` 型と見なします。結果付きの構造変更では、この代入を `hooks/treeChangeOutcome.ts` の `applyTreeChangeWithOutcome` に任せます。更新関数の代わりに、候補と結果の組 `{ nodes, outcome }` を返す `compute` を渡します（`nodes` が `null` なら確定しません）。呼び出しでは `applyTreeChangeWithOutcome<ReorderSiblingResult>(applyTreeChange, compute)` のように型引数を明示します。省くと成功と失敗で `R` の推論がずれ、TS2345 になります。

それ以外でコールバックの中で代入するときも、`as` でキャストせず、受け取る関数の型引数で結果の型を明示します（`treeChangeOutcome.ts` の `settleTreeChangeOutcome<R>(applied, outcome)`）。

### 4.3 非 null アサーション（`!`）の代わりに

- 2つの `Map` を同じキーで同期させると、片方の `get` に `!` が必要になります。値を組にして1つの `Map` で持ちます（`mapVisibilityAnimator.ts`）。
- 一度だけ作る値は、`useRef` と `!` ではなく `useState(() => create())` で持ちます（`useNodes.ts` の採番器）。

### 4.4 Pixi.js は jsdom で初期化できない

WebGL・Canvas が無いため、テストでは `pixi.js` を `jest.mock` で差し替えます。`jest.mock` のファクトリは巻き上げられるので、外の変数を直接参照できません。`src/app/testing/pageModuleMocks.ts` のように、ファクトリの中で `jest.requireActual` を使って読み込みます。

### 4.5 `localStorage` は1か所からだけ触る

`window.localStorage` を直接読み書きするのは `services/persistence/mapLibraryStorage.ts` だけです。読み書きは例外（容量超過・プライベートモードの `SecurityError`）を投げ得るため、このモジュールは例外を外へ出さず、結果型で返します。新しい保存先が必要なときも、このモジュールに関数を足してください。ただし枝の移動のジャーナルの書き込みと復旧は、途中で継続する手順があるので `services/persistence/branchMoveTransaction.ts` も、移動の前の補正待ちのインデックスの読み取りは `services/persistence/mapBranchTransfer.ts` の `readBranchMoveIndex` も、注入された storage を直接呼びます。この2か所は呼び出し元が注入する storage を使うので、ブラウザの `localStorage` を直接参照しません。

### 4.6 表示だけの状態を保存形式に入れない

枝の折りたたみ・検索・表示レベルの絞り込みは表示専用で、JSON・`localStorage`・編集履歴には入れません。保存形式（V3）を変える変更は、[data-model.md](../specifications/data-model.md) の移行の規則と合わせて設計が必要です。

### 4.7 非同期の結果は、開始時のマップと照合する

イラスト生成・JSON の読み込み・PNG の書き出しは、終わる前にマップが切り替わったり、コンポーネントがアンマウントされたりします。結果を使う前に、セッション番号・`AbortController`・アンマウントの印で、今も同じ対象かを確かめます。

### 4.8 キーボード操作と日本語入力

ショートカットは、IME の変換中（`event.isComposing`、または `keyCode === 229`）には反応させません。`Enter` の押し続け（`event.repeat`）で操作が何度も走らないようにも注意します（`components/layout/repeatedEnterClick.ts`）。

### 4.9 React Compiler と lint

`next.config.ts` で React Compiler（`reactCompiler: true`）を有効にしています。`useEffect` の中での `setState` などは `react-hooks` の lint ルールで指摘されます。ルールを無効にするときは、理由をコメントに書いてください。

### 4.10 `switch` の網羅性

結果の型（`ok: true | false` と `reason`）は `switch` で分け、`default` で `const unreachable: never = value;` を置いて、種類を足したときに型エラーで気付けるようにしています。この `default` はテストで到達できないため、カバレッジが 100% にならないのは想定どおりです。

### 4.11 `window` のハンドラから最新の値を読む

`window` にイベントを登録するフックは、登録をやり直さないよう、ハンドラから ref を通して最新の options を読みます。新しく書くときは `useLatestRef`（`hooks/useLatestRef.ts`）を使い、ハンドラが読む項目を落とさずに渡します（例: `components/map/useMapViewportShortcut.ts`）。`useLatestRef` の戻り値は `exhaustive-deps` が安定と判断しないので、effect の依存配列に ref を足してください。ref は常に同じオブジェクトなので、登録のやり直しは起きません。
