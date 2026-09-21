# Phase 5 データ永続化設計

## 目的

作成したマインドマップをバージョン付きJSONとして書き出し・読み込みできるようにし、同じ形式を使ってブラウザの`localStorage`へ自動保存・自動復元する。保存先やファイル操作をノード編集ロジックから分離し、不正データで現在のマップを部分更新しない。

## スコープ

Phase 5の前半として次を実装する。

- マップデータのJSONエクスポート
- JSONファイルからのマップ全体のインポート
- `localStorage`への自動保存
- 起動時の`localStorage`からの自動復元
- 保存、復元、インポート結果の日本語通知

画像（PNG / SVG）エクスポートはPixiJS描画領域、背景、出力解像度を別途設計する必要があるため、Phase 5後半の独立した実装単位とする。

## 保存対象

保存する状態は次に限定する。

- ノード一覧
  - ID
  - 親ID
  - X座標、Y座標
  - 幅、高さ
  - ラベル
- レイアウトモード（`manual` / `auto`）

次の一時的なUI状態は保存しない。

- 選択中のノード
- 編集中のラベルと入力状態
- パン位置
- ズーム倍率
- ポインター操作中の状態
- 成功、警告、エラー通知

復元後はノード未選択、ラベル未編集中、標準viewportで開始する。

## ドキュメント形式

ノード状態は保存形式のversionから独立した`NodeMapState`として定義し、初期の永続化形式を`MapDocumentV1`として定義する。

```ts
type NodeMapState = {
  layoutMode: "manual" | "auto";
  nodes: Node[];
};

type MapDocumentV1 = NodeMapState & {
  version: 1;
};
```

- トップレベルの`version`は必須とする。
- 未対応のversionは推測変換せず拒否する。
- JSON生成時は既知フィールドだけを出力する。
- JSON解析時は必須フィールドを検証し、検証済みの新しいオブジェクトを構築する。
- ノード配列の順序はルート・兄弟順に影響するため維持する。
- 自動モードの保存座標もそのまま復元し、インポート直後の再配置は行わない。次回の構造変更またはモード切り替えから通常の自動整列を再開する。

`localStorage`のキーは`draw-my-map.map.v1`とする。ファイル名は`draw-my-map-YYYYMMDD-HHmmss.json`とし、内容は人が確認しやすいインデント付きJSONと末尾改行にする。

## 入力検証

CodecはブラウザAPIやReactへ依存しない純粋関数として、JSON解析と次の検証を行う。

### ドキュメント

- オブジェクトであること
- `version`が数値リテラル`1`であること
- `layoutMode`が`manual`または`auto`であること
- `nodes`が配列であること

### ノード

- `id`が0より大きい安全な整数であること
- `parentId`が`null`または0より大きい安全な整数であること
- `x`、`y`、`width`、`height`が有限数であること
- `width`と`height`が0より大きいこと
- `label`が文字列であること
- IDが重複しないこと
- `parentId`が存在するノードを参照すること
- 自分自身を親にしないこと
- 親子関係に循環がないこと

親が子より後に記録されている入力は受理する。深いツリーでもcall stackを消費しないよう、循環検出は非再帰で行う。いずれか1項目でも不正ならドキュメント全体を拒否し、部分的なノード配列を返さない。

Codecの結果は成功値または日本語のエラーメッセージを持つ判別可能なunionとし、UIが例外内容や内部実装へ依存しないようにする。

## 責務境界

### Map Document型

ノード状態型`NodeMapState`を`client/src/types/nodeMapState.ts`へ置く。永続化固有の型は`client/src/types/mapDocument.ts`へ置き、`MapDocumentV1`は`NodeMapState`へversionを追加する。CodecやUIからHookの内部型をimportせず、Hookも永続化形式へ依存しない。

### Map Document Codec

`client/src/domain/persistence/mapDocumentCodec.ts`へ次の純粋処理を置く。

- 現在状態から`MapDocumentV1`を構築する
- `MapDocumentV1`をJSON文字列へ変換する
- 未知のJSON値を解析・検証して`MapDocumentV1`へ正規化する
- 検証エラーを利用者向け日本語メッセージへ変換する

DOM、`File`、`Blob`、`localStorage`、React stateには依存しない。

永続化対象となるNodeの7フィールドへの投影は`mapDocumentNodeProjection.ts`へ分離し、JSON生成と入力正規化が同じフィールド定義を利用する。

### `useNodeLayoutState`

検証済みのノード一覧とレイアウトモードを同時に置き換える原子的なcommandを提供する。内部のstateと同期Refを同じcommand内で更新する。復元時は自動レイアウトを再計算せず、保存座標を維持する。

### `useNodes`

検証済み`NodeMapState`を受け取る`replaceMap` commandを公開する。永続化形式のversionは扱わない。

- ノードとレイアウトモードを原子的に置き換える
- 選択中ノードを解除する
- ID生成器を再初期化し、現在のノードが使用中のIDを飛ばして採番する
- 置き換え後に追加するルート、子、兄弟のIDが既存IDと衝突しないことを保証する

`useNodes`はJSON文字列、ファイル、`localStorage`を扱わない。
ID生成器の保持、再初期化、使用中IDの回避は`nodeIdAllocator.ts`へ分離し、`useNodes`は状態変更commandの調停だけを行う。

### ブラウザ保存アダプター

`client/src/services/persistence/mapStorage.ts`は`localStorage`の読み書きだけを担当する。Storage APIの例外を握り潰さず、Hookが警告・エラーへ変換できる結果として返す。

`client/src/services/persistence/mapFileTransfer.ts`は次だけを担当する。

- JSON文字列を`Blob`とobject URLからダウンロードする
- 選択された`File`を文字列として読み込む
- 使用後のobject URLを必ず解放する

ドキュメント検証やReact state更新は行わない。

### `useMapPersistence`

`client/src/hooks/useMapPersistence.ts`は検証済みCodec、Storageアダプター、ファイルアダプター、状態置換commandを調停する。

- 初回mountで保存値を1回復元する
- 復元処理が確定するまで自動保存を開始しない
- React Strict Modeでeffectが再実行されても、初期空マップによる保存値の上書きを起こさない
- ノードまたはレイアウトモード変更後300msで最新状態を保存する
- 連続変更時は以前のtimerを破棄する
- unmount時にtimerを破棄する
- JSONエクスポートcommandを提供する
- JSONインポートcommandを提供する
- 成功、警告、エラーの通知状態を提供する

### UI

`MapPersistenceControls`を独立コンポーネントとしてヘッダーへ配置する。

- 「JSON書き出し」ボタン
- 「JSON読み込み」ボタン
- `accept="application/json,.json"`を持つ非表示ファイル入力
- 同じファイルを連続選択できるよう、処理後にinput値をリセット
- ボタンは`type="button"`を指定

通知表示は操作部品から分離し、`role="status"`または`role="alert"`と`aria-live`で読み上げ可能にする。`AppHeader`はレイアウトモードUIと永続化UIを配置する責務だけを持ち、CodecやStorage APIを扱わない。

`MapStage`はマップ全体の置き換えを表す`resetRevision`を受け取る。値が変わったときは、`useLayoutEffect`でpaint前に、編集中ラベルとdraft、パン・ズーム、ドラッグ・接続などのポインター操作中状態を同期的に破棄して標準viewportへ戻す。永続化HookはPixiJSやキャンバス内部状態を直接扱わない。

### `page.tsx`

`page.tsx`は`useNodes`の現在状態と`replaceMap`を`useMapPersistence`へ接続し、返されたcommandと通知をヘッダーUIへ渡す。検証済みマップの置き換え成功ごとに`resetRevision`を進めて`MapStage`へ渡し、ドメイン状態と一時UI状態のリセットを調停する。マップの検証、ファイル処理、保存処理を直接実装しない。

## データフロー

### 起動時の自動復元

1. Storageアダプターから`draw-my-map.map.v1`を読む。
2. 保存値がなければ空マップを維持して復元完了とする。
3. 保存値があれば共通Codecで解析・検証する。
4. 正常なら`replaceMap`でノードとモードを一括復元する。
5. 不正なら保存値を変更せず、空マップを維持して日本語警告を表示する。
6. 復元処理が確定した後だけ自動保存を有効化する。

### 自動保存

1. ノードまたはレイアウトモードの変更を監視する。
2. 以前の300ms timerを破棄する。
3. 最新スナップショットをCodecでJSON化する。
4. Storageアダプターで保存する。
5. 容量超過、利用不可などの例外時は現在状態を維持して日本語エラーを表示する。

### JSONエクスポート

1. 現在状態から`MapDocumentV1`を構築する。
2. Codecでインデント付きJSONへ変換する。
3. Fileアダプターで日時付きファイルをダウンロードする。
4. 成功または失敗を通知する。

### JSONインポート

1. 選択されたファイルを文字列として読む。
2. 共通Codecで全体を解析・検証する。
3. 正常時だけ`replaceMap`を1回呼ぶ。
4. 選択、ラベル編集draft、viewport、ポインター操作中状態をリセットする。
5. 次の自動保存でlocalStorageへ反映する。
6. 不正JSON、未対応version、不正ツリー、読み込み失敗時は現在状態と一時UI状態を一切変更せず、日本語エラーを表示する。

## エラーと通知

利用者が次の行動を判断できる日本語メッセージを返す。

- 復元成功: 通常は常駐通知せず、必要な場合だけ短いstatusを表示する
- 壊れた自動保存: 「保存データを復元できませんでした。空のマップで開始します。」
- インポート成功: 「マップを読み込みました。」
- インポート失敗: 原因を要約し「現在のマップは変更されていません」を含める
- エクスポート成功: 「JSONファイルを書き出しました。」
- Storage保存失敗: 「ブラウザへ自動保存できませんでした。」

開発者向け例外詳細をそのまま画面へ表示しない。通知更新はマップ状態更新と分離し、通知失敗や再表示がノード配列へ影響しないようにする。

## テスト方針

### Codec単体テスト

- 空マップと複数階層マップのJSON往復
- ノード順、座標、サイズ、ラベル、親子関係、モードの維持
- 不正JSON
- 非オブジェクトのトップレベル値
- 未対応version
- 不正layout mode
- nodesの型不一致
- ID・parentIdの非整数、負数、非安全整数
- ID重複
- 親欠損
- 自己参照
- 複数ノードの循環
- 親が後に現れる正常ツリー
- 座標・サイズの型不一致と非有限値
- 0以下のサイズ
- ラベルの型不一致
- 入力値を変更しないこと

### Hook単体テスト

- マップ全体の置き換えでノードとモードを同時更新する
- 置き換え時に選択を解除する
- 自動モードのインポート座標を再配置しない
- インポート済みIDと`Date.now()`が一致する場合も、ルート、子、兄弟追加で使用中IDを飛ばす
- 起動時に正常な保存値を復元する
- 保存値がない場合は空状態を維持する
- 壊れた保存値を拒否し、初期空データで上書きしない
- 300msのデバウンス後に最新状態だけを保存する
- 連続変更とunmountでtimerを破棄する
- Strict Mode相当のeffect再実行で保存値を失わない
- Storage例外を通知へ変換する

### ファイルアダプター単体テスト

- JSONのMIME typeと日時付きファイル名
- download属性を持つリンクの起動
- object URLの解放
- File文字列読み込みの成功と失敗

### UI・統合テスト

- 書き出し・読み込みボタンの表示、type、callback
- file inputのaccept属性と処理後リセット
- 正常インポートで画面上のマップ状態を置き換える
- 不正インポートで既存マップを維持する
- 成功、警告、エラー通知のroleと読み上げ
- `page.tsx`が状態、置き換えcommand、永続化commandを正しく配線する

すべての実装は失敗するテストを先に追加し、対象実装でGREENにする。各PRで`client`ディレクトリから`npm run verify`を実行する。

## 実装とPRの分割

### PR 1: ドキュメントCodecと状態置換

- `MapDocumentV1`型
- JSON生成、解析、検証、正規化
- `useNodeLayoutState`の原子的置き換え
- `useNodes.replaceMap`
- 選択解除とID衝突防止
- ドメイン・Hookテスト

このPRだけでは利用者向けの保存UIを公開しない。後続PRが同じ検証境界を利用できる状態を作る。

### PR 2: JSONファイル操作とlocalStorage

- Storage・Fileアダプター
- `useMapPersistence`
- ヘッダーのJSON入出力UI
- 通知UI
- `page.tsx`の配線
- Hook・UI・統合テスト

マージ後にロードマップの「マップデータの JSON エクスポート / インポート」と「ブラウザの localStorage への自動保存」を完了にする。

### Phase 5後半: 画像エクスポート

PNG / SVG出力は別の設計とPRで実装する。JSON・Storage実装へPixiJS固有処理を混在させない。

## 対象外

- PNG / SVG画像エクスポート
- サーバー保存
- アカウント間同期
- 複数マップの一覧管理
- 自動保存履歴や世代管理
- JSONの部分マージ
- 旧versionからのマイグレーション
- 選択状態、編集中状態、viewportの永続化
- ファイルのドラッグ&ドロップ
- 暗号化や圧縮

## ロードマップ更新

各PRのマージ後処理で、完了した項目、Phase 5の進捗、現在地、次の未完了項目を`ROADMAP.md`へ反映する。実装PRには先回りで完了チェックを入れない。

## 完了条件

- 同じマップをJSONエクスポートして再インポートすると、保存対象の状態が一致する。
- 不正なJSONやツリーをインポートしても現在のマップが変化しない。
- 起動時に正常なlocalStorageデータを復元できる。
- 初期復元前の空マップで既存の保存値を上書きしない。
- 変更後300msで最新状態だけを自動保存する。
- インポート後に追加するノードIDが既存IDと衝突しない。
- 保存・復元・ファイル操作の失敗を日本語で通知できる。
- ノード状態管理がJSON、File、Storage APIへ依存しない。
- 新しい外部依存を追加しない。
- すべての自動検証が成功する。
