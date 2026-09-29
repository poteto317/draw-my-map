# Phase 6 単一責任リファクタリング設計

## 目的

`origin/main`（`f9c1a87`）から変更されたPhase 6の実装全体を対象に、外部挙動を維持したまま、状態遷移、React副作用、PixiJS描画、操作制御の責務境界を明確にする。

## 制約

- 自動・手動フィルター、祖先表示、操作制限、160msフェード、reduced motion、永続化・画像出力の既存仕様を変更しない。
- `MapStage`と`Home`の公開propsおよび利用者向けUI文言を維持する。
- 新しい依存パッケージを追加しない。
- テストを先に追加してREDを確認してから実装する。
- 自動コミット、ステージングを行わない。
- `ROADMAP.md`はPRマージ後の後処理まで更新しない。

## 差分全体の責務監査

### 分割対象

#### 1. 解像度判定と可視ノード探索

現状の`domain/nodes/nodeResolutionFilter.ts`は、ズーム倍率から表示段階を決める責務と、ツリーから可視IDを収集する責務を持つ。

- `nodeResolutionLevel.ts`: 初期しきい値、ヒステリシス、自動・手動段階の解決
- `nodeVisibility.ts`: 重要度条件と祖先を使った可視ノードIDの線形導出

既存の呼び出し元は新しい責務別モジュールを直接参照する。循環・欠損親・入力順・10,000ノードの線形走査を維持する。

#### 2. フィルター状態機械とReact調停

現状の`hooks/useMapResolutionFilter.ts`は、reducer、リセット中の倍率同期、React副作用、可視ID導出を同時に扱う。

- `mapResolutionFilterState.ts`: state、action、純粋reducer、適用倍率と段階の導出
- `useMapResolutionFilter.ts`: React effect、memo、公開Hook APIの調停

純粋状態遷移のテストを追加し、auto/high/medium/allの各モードからのマップ置換、保留倍率到達、明示モード変更をHookテストと分担する。

#### 3. 表示キーとブラウザ環境

現状の`useMapVisibilityTransition.ts`は、node/edgeキーの導出、RAF fallback、media query購読、animator lifecycleを扱う。

- `mapVisibilityKeys.ts`: node/edgeの安定キー生成と可視キー集合の導出
- `browserMapVisibilityEnvironment.ts`: 対になるframe request/cancelの選択とmedia query adapter
- `useMapVisibilityTransition.ts`: animatorのmount lifecycle、scene target差し替え、可視キー通知の調停

animatorはmountごとに一度だけ生成し、query差し替えでは再生成しない契約を維持する。

#### 4. MapStageの副作用

現状の`MapStage.tsx`へ、scene lifecycle、viewport transform、倍率通知、非表示ノードの一時状態解除が追加されている。

- `useRenderedMapScene.ts`: scene生成・差し替えとviewport transform適用
- `useViewportScaleNotification.ts`: 最新callback保持とscale変更時だけの通知
- `useHiddenNodeInteractionReset.ts`: 非表示になった選択・編集・gestureの同期解除
- `MapStage.tsx`: 各HookとUIの配線、可視ノードだけのdouble-click判定

選択解除と`eventMode="none"`はフェードの最初のframeより前に成立させる。

#### 5. PixiJS visibility target契約

`renderMapNodes.ts`と`renderMapEdges.ts`で、key生成とtarget adapter生成が重複している。

- `mapVisibilityKeys.ts`: `node:<id>`、`edge:<childId>`の生成
- `pixiVisibilityTarget.ts`: node container用とedge graphics用のadapter生成
- 各renderer: Pixiオブジェクトの生成とsceneへの追加

edge targetは常に非interactive、node targetは表示対象だけinteractiveとする。

#### 6. Reactとstage interaction controllerの境界

現状の`useMapStageInteractions.ts`は、最新propsのref同期、controller生成、stage bind、非表示化時のgesture取消を扱う。

- `useStageInteractionValues.ts`: nodes、visible IDs、callbackのlatest ref同期
- `useMapStageInteractions.ts`: controller lifetime、stage bind、active node非表示時の取消

`stageInteractions.ts`はPixiイベントからpointer/touch gestureへルーティングするcontrollerとして維持する。個別gestureは既に別ファイルであり、追加分割は行わない。

### 変更不要と判断した対象

- `app/page.tsx`: 状態とUIを結ぶComposition Rootであり、ドメイン処理を持たない。
- `AppHeader.tsx`: slotの配置だけを行う。
- `NodeImportanceSelector.tsx`、`ResolutionFilterSelector.tsx`: 表示とcallback通知だけを行う。
- `nodeConnectionGesture.ts`、`nodeMoveGesture.ts`、`pointerGesture.ts`: 各gestureの契約・処理に限定される。
- `mapVisibilityTween.ts`: 純粋な補間計算だけを行う。
- `mapVisibilityAnimator.ts`: 注入された依存を用いる表示状態機械として凝集している。
- `renderMapScene.ts`: edge/node sceneを合成する役割に限定される。

## テスト構成

- 責務別の新しい純粋モジュール・Hookごとに単体テストを追加する。
- 新APIを参照するテストを先に追加し、モジュール未存在または未実装によるREDを確認する。
- `MapStage.test.tsx`内のPhase 6 visibilityテストは、専用の`MapStageVisibility.test.tsx`へ移し、共通fixtureは既存のテストutilityへ寄せる。
- 移動だけでテストの検出力を失わないよう、対象テスト数とassert内容を移動前後で照合する。
- `page.test.tsx`、`stageInteractions.test.ts`は統合境界を検証するため維持する。
- 各責務のfocused test後に`npm run verify`を実行する。

## 完了条件

- 上記6対象が責務別モジュールまたはHookへ分離される。
- 変更不要と判断したファイルへ不要な抽象化を追加しない。
- 公開挙動と既存UIが変わらない。
- 新しい責務単位のテストが追加され、REDからGREENになる。
- 全Jestテスト、ESLint、TypeScript、本番ビルド、`git diff --check`が成功する。
- 最終状態が未コミット・未ステージのままである。
