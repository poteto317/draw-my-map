# マウス接続機能の単一責任リファクタリング設計

## 背景

`main` からの差分では、Shift+ドラッグによる既存ノード接続、接続先候補の表示、循環防止、親の付け替えが追加された。動作とテストは揃っているが、ポインター操作の状態管理、Reactとの統合、ツリー更新の一部に複数の変更理由が集まっている。

本リファクタリングは、マウス接続機能追加後の外部動作と公開APIを維持したまま、差分内の責務境界を明確にする。PR全体では接続機能のために公開APIを追加するが、リファクタリングではそのAPI契約を変更しない。自動コミットは行わない。

## 目標

- `main` から変更された全ファイルを確認し、構造変更の要否を明示する。
- 移動ジェスチャーと接続ジェスチャーを独立して理解・変更・テストできるようにする。
- PixiJSイベントの購読とジェスチャー固有ロジックを分離する。
- `MapStage` を構成と描画指示に限定し、ReactとPixiJS操作の同期を専用Hookへ移す。
- 親子接続の検証と変更を純粋なドメイン処理へ集約する。
- 各責務を直接検証するユニットテストを追加する。

## 非目標

- Shift+ドラッグ、通常ドラッグ、候補表示、選択状態などの外部動作を変更しない。
- 接続機能に必要な `MapStage.onConnectNodes` と `useNodes.connectNodes` の追加を除き、公開APIを変更しない。
- 接続線のプレビュー、接続解除UI、複数親、キャンバスのパンを追加しない。
- reducer、状態管理ライブラリ、新しいランタイム依存関係を導入しない。
- `main` から変更されていない領域を便乗して整理しない。
- 自動コミットを行わない。

## 差分全件の分類

### 責務分離を行うファイル

- `client/src/components/map/MapStage.tsx`
  - 最新値ref、接続候補状態、PixiJSイベント購読を専用Hookへ移す。
- `client/src/components/map/pixi/stageInteractions.ts`
  - 移動・接続アルゴリズムを個別ジェスチャーへ移し、イベントの振り分けだけを残す。
- `client/src/hooks/useNodes.ts`
  - 親子関係の変更アルゴリズムをドメインへ委譲する。
- `client/src/domain/nodes/nodeTree.ts`
  - 接続可否判定に加え、有効な接続の親付け替えを純粋関数として提供する。
- 上記に対応するテスト
  - ジェスチャー単位のテストを新設し、既存の統合テストを境界確認へ絞る。

### 確認済みで構造変更しないファイル

- `ROADMAP.md`: プロジェクト進捗だけを記述している。
- `client/src/app/page.tsx`: アプリケーション構成だけを担当している。
- `client/src/components/layout/AppHeader.tsx`: ヘッダー表示だけを担当している。
- `client/src/components/layout/__tests__/AppHeader.test.tsx`: ヘッダーの公開表示を確認している。
- `client/src/components/map/pixi/renderMapNodes.ts`: ノードのPixiJS投影と表示状態を担当している。
- `client/src/components/map/pixi/__tests__/renderMapNodes.test.ts`: ノード投影の表示契約を確認している。
- `client/src/components/map/pixi/__tests__/renderMapScene.test.ts`: 描画順序の契約を確認している。
- `client/src/components/map/__tests__/MapStage.test.tsx`: React・PixiJS境界の統合動作を確認している。
- `client/src/hooks/__tests__/useNodes.test.ts`: Hookの公開状態遷移を確認している。
- `client/src/domain/nodes/__tests__/nodeTree.test.ts`: ツリー規則を確認している。

構造変更しないテストも、抽出後のAPIやfixtureに必要な機械的変更と回帰ケース追加は行う。

## 採用するアプローチ

既存アーキテクチャを維持し、責務単位で抽出する。

- 最小限の関数抽出では、ポインター操作の状態とイベント購読が同じモジュールに残り、今後のパン操作追加で再び肥大化する。
- reducerや包括的な状態マシンへの移行は、今回の範囲に対して抽象化と動作変更リスクが大きい。
- 責務単位の抽出なら、既存のコールバック方式と最新値refを維持しながら、変更理由とテスト境界を分けられる。

## 生成後の構成

```text
client/src/
├── components/map/
│   ├── MapStage.tsx
│   ├── useMapStageInteractions.ts
│   └── pixi/
│       ├── pointerGesture.ts
│       ├── nodeMoveGesture.ts
│       ├── nodeConnectionGesture.ts
│       └── stageInteractions.ts
├── domain/nodes/
│   └── nodeTree.ts
└── hooks/
    └── useNodes.ts
```

## 各単位の責務

### `MapStage.tsx`

- DOMコンテナを提供する。
- PixiJSランタイム、編集、キーボード、ステージ操作Hookを構成する。
- ダブルクリックをノード編集またはルート追加へ振り分ける。
- 現在の状態を `renderMapScene` へ渡す。
- 編集中だけ `NodeLabelEditor` を表示する。

最新値ref、接続候補状態、PixiJSイベント登録の実装は持たない。

### `useMapStageInteractions.ts`

- コミット済みの最新ノードとコールバックをrefへ同期する。
- `createStageInteractions` のインスタンスをReactライフサイクル中に維持する。
- PixiJSステージへイベントを登録し、クリーンアップする。
- 接続先候補IDをReact状態として保持する。
- `MapStage` へノードpointerdownハンドラーと接続先候補IDを返す。

レンダリング、ツリー検証、ジェスチャー計算は行わない。

### `pointerGesture.ts`

アクティブなポインタージェスチャーの共通契約だけを定義する。

```ts
type PointerGesture = {
  move(event: FederatedPointerEvent): void;
  end(event: FederatedPointerEvent): void;
  cancel(): void;
};
```

### `nodeMoveGesture.ts`

- 開始時のノード座標とポインター座標を取得する。
- 移動閾値を判定する。
- 閾値到達後の変位を最新の移動コールバックへ渡す。
- ノードが存在しない場合はジェスチャーを生成しない。

接続候補、Shift判定、イベント購読は扱わない。

### `nodeConnectionGesture.ts`

- 開始ノードを接続元として保持する。
- 現在位置のノードをヒットテストし、接続可能な候補だけを通知する。
- 通常のpointerupではドロップ位置を再評価して接続を確定する。
- 空白、自己、循環、存在しない対象では接続しない。
- キャンセルと完了時に候補表示を解除する。

ノード移動、Shift判定、イベント購読は扱わない。

### `stageInteractions.ts`

- ノードpointerdown時に選択を更新する。
- Shiftの有無で接続または移動ジェスチャーを生成する。
- ステージのpointermove、pointerup、pointerupoutsideを現在のジェスチャーへ委譲する。
- ステージ直下のpointerdownだけ選択解除へ送る。
- 登録したリスナーを同一参照で解除する。

ジェスチャー固有の座標計算や接続判定は持たない。

### `nodeTree.ts`

- 子孫IDを探索する。
- 親子接続が存在・自己参照・循環の条件を満たすか判定する。
- 有効な場合だけ対象子ノードの `parentId` を変更した新しい配列を返す。
- 無効な場合は `null` を返し、入力を変更しない。

React状態や選択状態は扱わない。

### `useNodes.ts`

- React上のノード配列と選択IDを管理する。
- ドメイン処理の結果を状態へ反映する。
- 有効な接続後に子ノードを選択する。
- 無効な接続では状態と選択を変更せず `false` を返す。

接続可否や親付け替えのアルゴリズムは持たない。

## データフロー

1. PixiJSノードのpointerdownが `stageInteractions` へ渡る。
2. `stageInteractions` はノードを選択し、Shiftの有無でジェスチャーを選ぶ。
3. 通常ドラッグでは `nodeMoveGesture` が閾値と変位を計算し、`moveNode` を呼ぶ。
4. Shiftドラッグでは `nodeConnectionGesture` が接続先候補を通知し、`useMapStageInteractions` が候補IDをReact状態へ反映する。
5. `MapStage` は候補IDを `renderMapScene` へ渡し、候補ノードが強調表示される。
6. 有効な対象上でpointerupすると、接続コールバックが `useNodes` へ渡る。
7. `useNodes` はドメイン関数へ検証と親付け替えを委譲し、成功時だけノード配列と選択を更新する。
8. 再描画されたエッジは更新後の `parentId` から導出される。

## 防御動作

- 通常ドラッグは4px未満の移動を無視する。
- Shiftドラッグ中はノード座標を変更しない。
- 自己接続、子孫を親にする循環接続、欠損ノードへの接続を拒否する。
- 空白上のpointerupとpointerupoutsideでは接続しない。
- pointerup時は最後のpointermove結果に依存せず、ドロップ位置を再評価する。
- 接続完了・キャンセルでは候補IDを `null` に戻す。
- コールバックとノード配列は、破棄されたReactレンダーではなく最新のコミット済み値を参照する。
- ドメイン処理は入力配列と入力ノードを変更しない。

## テスト設計

### 新規ユニットテスト

- `nodeMoveGesture.test.ts`
  - ノード欠損時は生成しない。
  - 4px未満では移動しない。
  - xまたはyが4pxに達したら移動する。
  - 開始座標からの変位を保持する。
  - 最新の移動コールバックを使用する。
- `nodeConnectionGesture.test.ts`
  - 有効な候補の開始・変更・解除を通知する。
  - pointermoveなしでもpointerup位置から接続できる。
  - 自己接続と循環接続を候補にしない。
  - 空白pointerupとcancelでは接続しない。
  - 完了とcancelで候補を解除する。
  - 最新の候補通知・接続コールバックを使用する。

### 既存テストの整理と拡充

- `stageInteractions.test.ts`
  - ステージ直下の選択解除、ノード選択、Shiftによるジェスチャー振り分け、pointerupoutsideのcancel、リスナー解除に絞る。
- `nodeTree.test.ts`
  - 有効接続、親の付け替え、対象子以外の参照維持、無効接続時の `null` と入力非変更を追加する。
- `useNodes.test.ts`
  - 接続成功時の状態・選択、失敗時の非変更、同一React batch、安定したコールバック参照を維持する。
- `MapStage.test.tsx`
  - 実際の `useNodes` とPixiJS境界を通したShift接続、破棄レンダーからのref汚染防止を維持する。

テストは実装の内部構造ではなく、各単位の入力と観測可能な結果を確認する。

## 検証

各抽出はテストを先に追加・移動して失敗理由を確認した後、最小実装で成功させる。最終的に `client/` で次を実行する。

```bash
npm run verify
```

さらに `git diff --check` と `git diff main` を確認し、差分全件を再分類して未分離の責務が残っていないことを監査する。

## 受け入れ条件

- 設計書追加前に存在した `main` との差分全15ファイルが、対応済みまたは構造変更不要として説明できる。
- 移動と接続の状態・計算が異なるモジュールに分かれている。
- `stageInteractions.ts` はイベント購読とジェスチャー選択・委譲だけを行う。
- `MapStage.tsx` は最新値refとPixiJSリスナー登録を直接管理しない。
- `useNodes.ts` は接続可否・循環判定・親付け替えを実装しない。
- Shift接続、候補表示、通常ドラッグ、循環防止、親の付け替えの動作が維持される。
- 新規ユニットテストがジェスチャーとドメイン更新を直接検証する。
- `npm run verify` と `git diff --check` が成功する。
- 新しい依存関係と自動コミットがない。
