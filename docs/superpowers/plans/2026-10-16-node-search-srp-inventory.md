# Phase 10 ノード検索: SRP 監査一覧

監査日: 2026-10-16

基準: `git diff origin/main`（36ファイル）

範囲: リファクタリング着手前の全差分監査。初期判定と実施方針を記録する。

## 結論

- **対応必要: 1件（2ファイル）** — `NodeSearchListItem` の所有場所を、`useNodeLabelSearch` から検索機能の共有型へ移す。現在はレイアウトコンポーネントがフック実装から表示契約をimportしており、依存方向と変更理由が逆転している。
- **対応不要: 34ファイル** — 新規productionコードは、検索の純粋計算、検索状態、選択ユースケース、フォーカス要求、combobox、配線に分かれている。関数・フックの長さだけを理由にさらに割ると、ライフサイクルとDOM操作の契約が散り、テストの重複が増える。
- **テスト追加候補（初期監査）: 1件** — 共有型移動は型だけの変更なので専用runtime testは不要。既存の `NodeSearchBox` / `useNodeLabelSearch` testsと`npm run verify`でコンパイル上の配線を検証する。任意の堅牢化として、修飾キー付き `ArrowUp` / `ArrowDown` / `Escape` も純関数のtable testへ足せるが、今回のSRP変更に必須ではない。

## 全36ファイル判定表

| # | ファイル | 判定 | 根拠（要約） |
|---:|---|---|---|
| 1 | `README.md` | 不要 | 利用者向けPhase 10概要の追記 |
| 2 | `ROADMAP.md` | 不要 | 完了状況・現在地・次項目の同期 |
| 3 | `client/README.md` | 不要 | frontend概要とdirectory treeの更新 |
| 4 | `client/src/app/__tests__/pageSearch.test.tsx` | 不要 | Home境界の検索結合シナリオに限定 |
| 5 | `client/src/app/page.tsx` | 不要 | composition rootとしてhookとUIを配線 |
| 6 | `client/src/components/layout/AppHeader.tsx` | 不要 | header slotの配置のみ |
| 7 | `client/src/components/layout/NodeSearchBox.tsx` | **必要** | `NodeSearchListItem`をhookからimportする逆向きの型依存を解消する。component自体の分割は不要 |
| 8 | `client/src/components/layout/ResolutionFilterSelector.tsx` | 不要 | 共通label config参照への置換のみ |
| 9 | `client/src/components/layout/__tests__/AppHeader.test.tsx` | 不要 | header slot配置の境界test |
| 10 | `client/src/components/layout/__tests__/NodeSearchBox.test.tsx` | 不要 | combobox DOM/ARIA/focus contractのcomponent test |
| 11 | `client/src/components/layout/__tests__/nodeSearchKeyAction.test.ts` | 不要 | pure key resolverのtable test |
| 12 | `client/src/components/layout/nodeSearchKeyAction.ts` | 不要 | key事実からactionを返す純関数のみ |
| 13 | `client/src/components/map/MapStage.tsx` | 不要 | focus要求を専用hookへ渡す配線のみ |
| 14 | `client/src/components/map/__tests__/MapStage.test.tsx` | 不要 | MapStage境界のfocus適用だけを追加 |
| 15 | `client/src/components/map/__tests__/MapStageContextMenu.test.tsx` | 不要 | 必須propへのfixture追随のみ |
| 16 | `client/src/components/map/__tests__/MapStageHistory.test.tsx` | 不要 | 必須propへのharness追随のみ |
| 17 | `client/src/components/map/__tests__/MapStageVisibility.test.tsx` | 不要 | 必須propへのfixture追随のみ |
| 18 | `client/src/components/map/__tests__/useNodeFocusRequest.test.tsx` | 不要 | focus要求の状態遷移を専用検証 |
| 19 | `client/src/components/map/testing/AutoLayoutMapStageHarness.tsx` | 不要 | 必須propへのharness追随のみ |
| 20 | `client/src/components/map/useNodeFocusRequest.ts` | 不要 | 世代付き要求を一度適用する単一のlifecycle責務 |
| 21 | `client/src/config/resolutionLevelLabels.ts` | 不要 | 表示段階labelだけを持つ静的config |
| 22 | `client/src/domain/nodes/__tests__/nodeResolution.test.ts` | 不要 | resolution policyの対応表test |
| 23 | `client/src/domain/nodes/nodeResolution.ts` | 不要 | node resolutionの純粋policy |
| 24 | `client/src/domain/search/__tests__/nodeLabelSearch.test.ts` | 不要 | 純粋検索規則と線形性のtest |
| 25 | `client/src/domain/search/nodeLabelSearch.ts` | 不要 | 正規化・索引・検索の純粋domain責務 |
| 26 | `client/src/hooks/__tests__/useNodeLabelSearch.test.ts` | 不要 | memo/state境界のhook test |
| 27 | `client/src/hooks/__tests__/useNodeSearchNavigation.test.ts` | 不要 | 結果選択use caseのhook test |
| 28 | `client/src/hooks/useNodeLabelSearch.ts` | **必要** | #7と同じ1件。表示用共有型の所有をhook外へ移す |
| 29 | `client/src/hooks/useNodeSearchNavigation.ts` | 不要 | 選択時の一連の副作用を順序づける単一use case |
| 30 | `client/src/types/nodeFocusRequest.ts` | 不要 | Home/MapStage間の共有契約のみ |
| 31 | `docs/README.md` | 不要 | 文書index・対応範囲の更新 |
| 32 | `docs/architecture/overview.md` | 不要 | 依存関係と処理flowのarchitecture記録 |
| 33 | `docs/specifications/features.md` | 不要 | ノード検索の外部仕様記録 |
| 34 | `docs/superpowers/plans/2026-10-14-phase10-node-search.md` | 不要 | 実装task・制約・検証を定義する計画書 |
| 35 | `docs/superpowers/specs/2026-10-14-phase10-node-search-design.md` | 不要 | 採用方針と責務境界を定義する設計書 |
| 36 | `docs/testing/browser-test-cases.md` | 不要 | jsdom外の手動確認を記録 |

## Productionコードの責務評価

### `client/src/app/page.tsx` — 対応不要

Homeは既存どおり各feature hookとUI slotを組み立てるcomposition rootで、今回の差分は検索hookの生成、`NodeSearchBox`、通知、`focusRequest`の配線に限定される。検索、表示段階の決定、viewport移動の詳細は下位へ移されており、純粋計算や副作用をHomeへ持ち込んでいない。ページ結合テストが、表示中／非表示の選択、Enter遮断、ダブルクリック、Undo/import、世代失効を確認している。

### `client/src/components/layout/AppHeader.tsx` — 対応不要

差分は必須の`searchControls` slotをタイトル直後へ配置するだけで、ヘッダーのレイアウト責務に収まる。検索ロジックへ依存せずReactNode境界を保っている。AppHeader testでDOM順と狭幅時の折り返しを確認済み。

### `client/src/components/layout/NodeSearchBox.tsx` — 対応必要（型所有のみ）

comboboxの表示、開閉、候補IDによる選択、DOM focus、`scrollIntoView`、ARIAを一つのアクセシブルなUI部品として調停している。これらは同じ操作契約とライフサイクルを共有するため、controller hookと結果描画componentへ分ける案は採らない。キー判断は既に`resolveNodeSearchKeyAction`へ純粋分離されており、DOM副作用はcomponent境界に残っている。175行という長さだけで割ると、blur/mousedown/focus、active descendant、選択状態の整合条件が複数ファイルへ散る。

ただしpropsの`NodeSearchListItem`を`@/hooks/useNodeLabelSearch`からimportしており、表示層がデータ生成hookの公開型へ依存している。検索結果の共有契約（`nodeId`, `label`, `parentLabel`, `hidden`）を検索機能の中立な型へ移し、hookとcomponentが同じ型へ依存する形にする。既存の`NodeSearchMatch`との重複を避け、型名・配置は実装時に一貫させる。型移動後も既存component testsを維持する。

### `client/src/components/layout/ResolutionFilterSelector.tsx` — 対応不要

差分は共通表示名をconfigへ寄せたもの。selectorは表示と入力通知だけを担当し、検索通知との文言重複を解消している。依存方向もUIから静的configで妥当。

### `client/src/components/layout/nodeSearchKeyAction.ts` — 対応不要

ブラウザイベントから集めた事実を純粋なactionへ変換する責務だけを持つ。IME、修飾キー、repeat、開閉、結果有無を判定し、DOM副作用を持たない。L-317の「事実収集→純粋判定→副作用」を満たす。table testは主要分岐とIME全キーを網羅している。任意で修飾キー付き矢印／Escapeの回帰caseを加えられるが、実装分離は不要。

### `client/src/components/map/MapStage.tsx` — 対応不要

差分は必須`focusRequest`を専用hookへ渡す配線だけ。viewport stateやgesture所有者であるMapStageがhookへ必要なcapabilityを渡すのは既存のcomposition責務に沿い、要求処理の詳細はcomponentから分離済み。MapStage boundary testが外部要求の中央移動と再実行抑止を確認している。

### `client/src/components/map/useNodeFocusRequest.ts` — 対応不要

このhookの責務は「世代付きfocus要求をMapStageの現在のruntimeへ一度だけ適用する」こと。世代不一致、重複、対象消失、screen待ち、gesture取消、focus実行は同じ状態遷移の一部であり、別々の変更理由ではない。判定だけをpure functionへ抜く案も検討したが、`processedSequenceRef`、commit済みcallback、screen準備というReact lifecycleの状態と不可分で、戻り値actionを導入してもeffectの複雑さは減らない。専用hook testsが保留、消失、世代失効、重複、取消順を直接固定しているため、追加分離は機械的になる。

### `client/src/config/resolutionLevelLabels.ts` — 対応不要

表示段階のラベルだけを持つ静的config。selectorと検索通知が同じ語彙へ依存するため、変更理由は表示文言の変更に限定される。

### `client/src/domain/nodes/nodeResolution.ts` — 対応不要

既存の解像度可視性判定に、重要度から最小表示段階を返す純関数を追加した。どちらもnode resolution policyで同じ変更理由を持つ。I/O・React依存なし。高／中／低の対応表は既存unit testで網羅される。

### `client/src/domain/search/nodeLabelSearch.ts` — 対応不要

NFKC正規化、索引作成、部分一致検索という一つの検索domain責務。すべて純関数で、親ラベル取得を索引作成時に済ませ、queryごとの走査から分離している。UI、React、可視性、副作用に依存しない。正規化、空ラベル、順序、親表示、上限、総数、線形アクセス、公開形状がunit testで固定されている。

### `client/src/hooks/useNodeLabelSearch.ts` — 対応必要（`NodeSearchBox.tsx`と同じ1件）

query state、nodes参照ごとの索引memo、queryごとの検索memo、visible setごとの`hidden`付与を調停する検索UI state hookとしてまとまっている。純粋計算はdomainへ委譲済み。ただし`NodeSearchListItem`をこのhookが宣言し、それをlayout componentがimportする依存は逆向きなので、共有型へ移す。索引の再作成条件とhiddenだけの更新はhook testsで確認済み。

### `client/src/hooks/useNodeSearchNavigation.ts` — 対応不要

責務は「検索結果を選択した」という単一ユースケースの調停。実在再確認、必要な表示段階への切替、通知、選択、世代付きfocus要求は仕様上同一イベント内で順序を保って行う必要がある。`resolveMinimumVisibleLevel`は既に純関数、notice lifecycleは既存`useRevisionScopedNotice`へ委譲されている。さらにaction resolverを作る案は、nodes/visibleの検索結果と副作用順を別表現へ写すだけで、73行のhookに新しい独立責務を見出せないため採らない。visible、hidden medium/low、missing、世代変更、連番はhook testsで網羅済み。

### `client/src/types/nodeFocusRequest.ts` — 対応不要

Home側とMapStage側の境界契約を表す型だけを持つ。`nodeId`、単調増加`sequence`、`documentRevision`が要求の同一性と世代を明示しており、配置も既存の共有types方針に合う。

## Test・Harnessの責務評価

### `client/src/app/__tests__/pageSearch.test.tsx` — 対応不要

実Home境界で、検索hook・解像度filter・MapStageの配線を検証する結合test。unit testと重なる個別計算ではなく、表示モードを変えない移動、非表示の再表示、閉じた一覧のEnter、ダブルクリック、Undo/import、初期化待ち世代失効という境界故障を対象にしている。長さは複数の利用者シナリオによるもので、production責務の混在ではない。

### `client/src/components/layout/__tests__/AppHeader.test.tsx` — 対応不要

既存header contractへ検索slotの表示を追加。検索動作をここで再試験せず、slot配置だけを見るため適切。

### `client/src/components/layout/__tests__/NodeSearchBox.test.tsx` — 対応不要

combobox component boundaryに集中し、ARIA、親／root／hidden表示、循環、Enter、Escape、IME、ID選択、mouse/focus、Tab、scroll API不在を網羅する。pure key matrixは別testへ分離され、責務境界が明確。

### `client/src/components/layout/__tests__/nodeSearchKeyAction.test.ts` — 対応不要

純粋key resolver専用のtable test。component testから分岐網羅を分離している。任意追加候補は修飾キー付き矢印／Escapeだが、現行実装の先頭guard自体は修飾Enterで確認済み。

### `client/src/components/map/__tests__/MapStage.test.tsx` — 対応不要

既存default propsへ必須`focusRequest`を追加し、MapStage境界で外部要求を1回だけ適用するtestを追加。hookの細かな状態遷移は専用testへ任せている。

### `client/src/components/map/__tests__/MapStageContextMenu.test.tsx` — 対応不要

必須prop追加へのfixture追随だけ。末尾空行削除にも責務上の変更はない。context menu testへ検索固有caseを混ぜていない。

### `client/src/components/map/__tests__/MapStageHistory.test.tsx` — 対応不要

必須prop追加へのharness追随だけ。検索のfocus要求を履歴testへ持ち込まず、既存の履歴責務を維持する。

### `client/src/components/map/__tests__/MapStageVisibility.test.tsx` — 対応不要

必須prop追加へのfixture追随だけ。検索navigationの可視性切替はpage/hook test側で検証し、このtestのfade/hidden interaction責務を広げていない。

### `client/src/components/map/__tests__/useNodeFocusRequest.test.tsx` — 対応不要

focus要求hook専用。最新座標、同一sequence、screen保留、対象消失、documentRevision失効、gesture取消順、nullを直接検証しており、effectと判定を別unitへ分ける必要がない。

### `client/src/components/map/testing/AutoLayoutMapStageHarness.tsx` — 対応不要

必須`focusRequest={null}`を追加しただけ。自動layout harnessの責務は変わらない。

### `client/src/domain/nodes/__tests__/nodeResolution.test.ts` — 対応不要

既存resolution policy testへ最小表示段階の全importance caseを追加。純関数の表を直接検証している。

### `client/src/domain/search/__tests__/nodeLabelSearch.test.ts` — 対応不要

検索domain専用test。仕様caseと計算量を同じ純関数境界で検証する。Proxyによる読み取り回数testは実装詳細の完全固定ではなく、線形性という非機能契約を確認している。

### `client/src/hooks/__tests__/useNodeLabelSearch.test.ts` — 対応不要

hookのmemo/state境界専用。domain検索内容の再試験を抑え、索引再作成条件、nodes差替、visible差替、空queryを検証している。共有型移動後もruntime test変更は原則不要。

### `client/src/hooks/__tests__/useNodeSearchNavigation.test.ts` — 対応不要

navigation use case専用。visible、hidden medium/low、missing、documentRevision、focus sequence、noticeを検証する。副作用順の必要箇所はfocus hook testとpage testで補完される。

## 文書の責務評価

### `README.md` — 対応不要

利用者向け機能概要へPhase 10を追加。実装構造や内部責務を過度に混ぜず、操作・保存／履歴への影響・確認済み環境を記録している。

### `ROADMAP.md` — 対応不要

Phase 10の完了、現在地、次項目、最終更新を同期するroadmap責務。Phase 11以降を完了扱いにしていない。

### `client/README.md` — 対応不要

frontend技術概要とdirectory treeへ検索を追記。root READMEより実装寄りの説明という既存責務に合う。

### `docs/README.md` — 対応不要

文書indexとPhase対応範囲の更新。検索仕様そのものを重複実装せず、詳細文書へ案内する役割を保つ。

### `docs/architecture/overview.md` — 対応不要

検索domain、hook、focus要求の依存と処理flowをarchitectureとして記録。利用者操作の詳細はfeatures/browser casesへ分けている。

### `docs/specifications/features.md` — 対応不要

ノード検索の外部仕様、検索規則、操作、hidden nodeの挙動をfeature specificationとして追加。内部コード配置はarchitecture/designへ委譲されている。

### `docs/superpowers/plans/2026-10-14-phase10-node-search.md` — 対応不要

実装task、Global Constraints、TDD、検証、ROADMAP更新を定義する計画書。実装後も設計判断と検証根拠を残すartifactであり、production分割対象ではない。

### `docs/superpowers/specs/2026-10-14-phase10-node-search-design.md` — 対応不要

採用方針、検索規則、選択時flow、focus要求、ARIA、責務分割を一つの機能設計として記録。実装の責務境界と一致している。

### `docs/testing/browser-test-cases.md` — 対応不要

jsdomで再現できないIME、実keyboard、Safari focus、touch、overlay、themeを手動test責務として追加。unit testで代替できない制約を明示している。

## 初期監査での具体案

1. `NodeSearchListItem`の共有契約を検索hookの外へ移す。`NodeSearchMatch`とフィールド定義が二重化しない場所を選び、`NodeSearchBox`が`@/hooks/useNodeLabelSearch`をimportしない構造にする。
2. `useNodeLabelSearch`と`NodeSearchBox`のimportを共有型へ付け替える。runtime behaviorは変えない。
3. 専用testの新設はせず、既存関連testと`client`の`npm run verify`で型・配線・挙動を確認する。必要なら`nodeSearchKeyAction.test.ts`へ修飾キー付き矢印／Escapeをtable caseとして追加する。
4. `NodeSearchBox`のcontroller/presentation分割、`useNodeSearchNavigation`のaction resolver化、`useNodeFocusRequest`の判定pure function化は行わない。現時点では同じ状態遷移を複数抽象へ写すだけで、独立した変更理由や再利用先がない。

## 実施方針

ユーザーのテスト拡充依頼に従い、修飾キーの組合せ・nodesと可視集合の同時更新・候補とcallback更新を追加検証する。型移動だけのため、REDは新規型importのtypecheckで確認し、runtimeテストは既存動作の特性テストとして先に追加する。

## 実施結果

- 共有型を `client/src/types/nodeSearch.ts` へ移し、生成hookとUIが参照。runtimeの振る舞いは変更なし。
- ユニットテスト5件追加（修飾キー9組合せを3ケース、nodes/visible集合の同時更新1ケース、候補/callback更新と消失fallback1ケース）。
- 仕様適合と品質の独立レビュー、最終全体レビューともに指摘なし。SRP確認は4周、修正後3周連続で追加指摘ゼロ。
- 最終 `npm run verify` 成功: 171 suites / 1879 tests、Tailwind scan・lint・typecheck・production build成功。`git diff --check`成功。
- ROADMAPは既存Phase10完了状態と一致し、更新不要。HEADは977c91aのまま、コミット・stage・pushなし。
