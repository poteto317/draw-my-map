# Phase 3 ビューポート操作設計

## 目的

マップのワールド座標と画面座標を分離し、既存操作を壊さずにキャンバスのパン、ホイール／ピンチズーム、選択ノードへのフォーカス表示を提供する。

この設計の実装作業は次の2段階として計画したが、実装とレビュー対応はPR #3へ統合した。

1. ビューポート基盤と空白ドラッグによるパン
2. ホイール／ピンチズームと`F`キーによるフォーカス表示

## 現状と課題

現在は`Node.x`と`Node.y`をそのままPixiステージへ描画し、DOM上のラベル編集欄も同じ値で配置している。ポインターの`globalX`と`globalY`もノード座標として直接扱うため、画面全体を移動・拡大すると次の境界を同時に整合させる必要がある。

- Pixi上のノードとエッジの描画
- DOM上のラベル編集欄
- ダブルクリックによるノード追加と編集開始
- ノード移動の差分
- 接続候補のヒット判定
- 空白、ノード移動、接続、ピンチ間のpointer所有権

ビューポートは表示上の関心事であり、ノードの永続データへ保存しない。

## 要件

### パン

- キャンバスの空白部分を左ドラッグするとパンする。
- ノード上の通常ドラッグはノード移動を維持する。
- ノード上の`Shift`+ドラッグはノード接続を維持する。
- 空白のクリックは選択を解除する。
- 空白のダブルクリックは、その画面位置に対応するワールド座標へノードを追加する。
- 4px未満の移動はパンとして扱わない。
- 右・中ボタンの空白／ノードpointer downでは選択やgestureを開始しない。

### ズーム

- マウスホイールとトラックパッドのスクロールで連続的にズームする。
- タッチポインター2本のピンチでズームする。
- 倍率は`0.25`以上`4`以下に制限する。
- ホイールのポインター位置、またはピンチ開始時の中心が示すワールド座標を基準に倍率を変更する。
- ピンチ中は2本の現在位置の中点移動もoffsetへ反映する。
- ブラウザのページスクロールとタッチ操作はマップ領域内だけで抑止する。

### フォーカス

- 選択中ノードがある状態で`F`キーを押すと、ノード中心をキャンバス中央へ即時移動する。
- フォーカス時に倍率は変更しない。
- input、textarea、select、contenteditable、ラベル編集中では発動しない。
- 選択ノードが最新のノード一覧に存在しなければ何もしない。
- Ctrl／Meta／Alt付き`F`はブラウザ側へ委ねる。
- ノード選択時の自動フォーカスとアニメーションは行わない。

## 座標モデル

### 型

```ts
export type Point = { x: number; y: number };

export type Viewport = {
  offsetX: number;
  offsetY: number;
  scale: number;
};

export type ScreenSize = {
  width: number;
  height: number;
};
```

初期値は`{ offsetX: 0, offsetY: 0, scale: 1 }`とする。

### 変換

ワールド座標から画面座標への変換は次式とする。

```text
screen.x = world.x * viewport.scale + viewport.offsetX
screen.y = world.y * viewport.scale + viewport.offsetY
```

逆変換は次式とする。

```text
world.x = (screen.x - viewport.offsetX) / viewport.scale
world.y = (screen.y - viewport.offsetY) / viewport.scale
```

`Viewport`へ保存する値は有限値に限定する。倍率は常に`0.25`から`4`へclampし、ゼロ除算を発生させない。

### 純粋関数

`client/src/components/map/mapViewport.ts`は計算だけを担当し、React、DOM、Pixiへ依存しない。

```ts
export const INITIAL_VIEWPORT: Viewport;
export const MIN_VIEWPORT_SCALE = 0.25;
export const MAX_VIEWPORT_SCALE = 4;

export function worldToScreen(point: Point, viewport: Viewport): Point;
export function screenToWorld(point: Point, viewport: Viewport): Point;
export function panViewport(viewport: Viewport, dx: number, dy: number): Viewport;
export function zoomViewportAt(
  viewport: Viewport,
  anchor: Point,
  requestedScale: number,
): Viewport;
```

`client/src/components/map/nodeViewportFocus.ts`はノード中央表示の計算だけを担当する。

```ts
export function focusViewportOnNode(
  viewport: Viewport,
  node: Node,
  screen: ScreenSize,
): Viewport;
```

無効な数値を受け取った更新関数は入力`viewport`をそのまま返す。入力オブジェクトは変更しない。

## 状態管理

`client/src/components/map/useMapViewport.ts`がビューポート状態を所有する。

```ts
type UseMapViewportReturn = {
  viewport: Viewport;
  viewportRef: LatestValue<Viewport>;
  setViewport: (next: Viewport) => void;
  panBy: (dx: number, dy: number) => void;
  zoomAt: (anchor: Point, requestedScale: number) => void;
  focusNode: (node: Node, screen: ScreenSize) => void;
};
```

`setViewport`は、パンとピンチの開始時viewportから計算した絶対値を反映する内部向けcommandである。非有限値および倍率`0.25`未満・`4`超の値は拒否する。更新は`viewportRef.current`を同期的に進めた後にReact stateへ反映する。連続イベント、同一batch、Reactの保留レンダーが直前の更新を上書きしないよう、増分commandは最新Refを基準にする。公開commandの参照は再レンダー後も安定させる。clamp後の倍率が現在値と同じ場合は同じviewport参照を返し、不要な再描画を避ける。

`stageInteractions`は次の制御面を返し、wheelとkeyboardの境界から内部状態を直接変更させない。

```ts
type StageInteractionController = {
  bind: (stage: InteractiveStage) => () => void;
  handleNodePointerDown: (nodeId: number, event: FederatedPointerEvent) => void;
  cancelActiveGesture: () => void;
  hasActiveGesture: () => boolean;
};
```

`cancelActiveGesture`は所有中のgestureを一度だけ終了し、接続gestureなら候補表示も消去する。`hasActiveGesture`は`F`キーを無視すべきかを同期的に判定するために使う。

## 描画構造

Pixiの`app.stage`は画面座標のイベント面として維持する。`renderMapScene`はノード、選択、編集、接続候補のいずれかが変化したときに`worldContainer`を再作成する。viewportだけが変化した場合は既存の`worldContainer`へ次の変換だけを適用し、ノードとエッジを再生成しない。

```text
worldContainer.position = (viewport.offsetX, viewport.offsetY)
worldContainer.scale = viewport.scale
```

エッジとノードは`worldContainer`配下へ描画する。これにより、ノードとエッジは従来のワールド座標を維持する。

`NodeLabelEditor`はDOM要素のため、`worldToScreen`で左上を変換し、幅、高さ、line-height、font-sizeを倍率に合わせる。ビューポート変更中もPixiノードと同じ位置・サイズへ追従する。

## ポインター入力の正規化

Pixi固有イベントは`stageInteractions`の境界で次の形式へ変換する。

```ts
export type PointerSample = {
  pointerId: number;
  pointerType: string;
  screen: Point;
  world: Point;
};
```

`screen`はPixiのglobal座標、`world`はイベント受信時点の`viewportRef.current`による逆変換結果とする。

- パンgestureは`screen`の差分を使用する。
- ノード移動gestureは`screen`で4pxの開始閾値を判定し、`world`の差分で移動先を算出する。
- 接続gestureは`world`で接続候補を判定する。
- gestureはPixi型へ直接依存しない。

## 実装ステップ 1: ビューポート基盤とパン

### コンポーネント

- `mapViewport.ts`: 座標型、初期値、座標変換、パン計算
- `useMapViewport.ts`: 状態、最新Ref、`panBy`
- `pointerGesture.ts`: 正規化済み`PointerSample`とgesture契約
- `canvasPanGesture.ts`: 空白ドラッグの開始座標、閾値、終了・キャンセル
- `stageInteractions.ts`: Pixiイベントの正規化とgesture調停
- `renderMapScene.ts`: `worldContainer`と配下の描画要素の生成
- `applyViewportTransform.ts`: 既存`worldContainer`へのviewport変換の適用
- `MapStage.tsx`: ビューポートの配線、ダブルクリック座標変換
- `NodeLabelEditor.tsx`: DOM編集欄の画面座標表示

### パンgesture

パンgestureは開始時の画面座標と開始時のviewportを固定し、各moveで開始点からの総差分を計算する。前回moveからの増分を累積しないため、イベント欠落や再利用で誤差を増やさない。

空白pointer downでは選択解除を先に通知し、その処理が完了した時点でbindingとpointer所有権が有効な場合だけパン候補を開始する。ノード上のpointer downは従来どおりノード移動または接続を開始し、空白パンは開始しない。

`pointerupoutside`、`pointercancel`、runtime切替、unbindでは所有中のgestureを一度だけキャンセルする。cleanup済みbindingから届く遅延イベントは無視する。

mouseの複数ボタン操作では、Pointer Eventsの`pointerup`は全ボタンが解放されてactive buttons stateを抜けた時点で発火し、`button`は最後に解放したボタンを示す。左ボタンで開始したgesture中に右・中ボタンが最後に解放される場合もあるため、終了処理は`button`ではなく開始時に取得した`pointerId`の所有権で判定する。

## 実装ステップ 2: ズームとフォーカス

### ホイール

Pixi 8.16のwheel listenerは`passive: true`で登録されるため、ページスクロール抑止はPixiイベントへ依存しない。`client/src/components/map/useMapWheelZoom.ts`がcanvas DOM要素へ`passive: false`でwheel listenerを登録し、同じ関数とcapture設定で解除する。

`deltaMode`は次のようにピクセル相当へ正規化する。

- `DOM_DELTA_PIXEL`: `deltaY`
- `DOM_DELTA_LINE`: `deltaY * 16`
- `DOM_DELTA_PAGE`: `deltaY * app.screen.height`

倍率は次式で計算する。

```text
requestedScale = currentScale * exp(-pixelDeltaY * 0.001)
```

wheel開始時は進行中のpointer gestureをキャンセルしてからズームする。これにより、ズーム前後の座標系をまたいでノードやパンが跳ぶことを防ぐ。

### ピンチ

`touchGestureCoordinator`は有効なtouch pointerの画面位置をpointer IDごとに保持する。`stageInteractions`はPixiイベントを`PointerSample`へ正規化してcoordinatorへ委譲する。coordinatorが2本目のtouchを受け取った時点で、`stageInteractions`から渡されたcallbackによって進行中のパン、ノード移動、接続をキャンセルし、接続候補もクリアしてピンチを開始する。

ピンチ開始時に次を固定する。

- 2点の中点
- 2点間距離
- 開始viewport
- 開始中点が示すワールド座標

各moveでは開始倍率に距離比を掛けてclampし、開始中点のワールド座標が現在中点へ来るoffsetを計算する。現在距離がゼロなら最小倍率へ制限する。開始距離がゼロまたは非有限の場合は、最初の有限な正距離を新しい基準として保存し、その次のmoveから更新する。

ピンチ開始時の2つのpointer IDを終了まで固定し、3本目以降のtouchは倍率計算へ使用しない。固定したtouchのどちらかが`pointerup`、`pointerupoutside`、`pointercancel`になった時点でピンチを終了する。残ったtouchによるパンやノード移動は自動再開せず、すべてのtouchが離れた後の新しいpointer downを必要とする。mouseやpenの複数pointerではピンチを開始しない。

### フォーカス

`client/src/components/map/useMapViewportShortcut.ts`がwindowのkeydown listenerを所有する。純粋resolverと共有predicateが、修飾キーなしの`F`または`f`、編集可能要素、ラベル編集中、進行中gesture、最新の選択ノードを判定する。

ノード中心を現在倍率で画面中央へ置くoffsetは次式とする。

```text
offsetX = screen.width / 2 - nodeCenter.x * viewport.scale
offsetY = screen.height / 2 - nodeCenter.y * viewport.scale
```

選択状態と倍率は変更しない。既に同じoffsetで中央表示済みなら同じviewport参照を返す。

## レイアウト

ページshellは動的viewport高を上限とするflex columnとし、headerの実寸高を除いた残領域をMapへ割り当てる。overflowの抑止はMap領域だけに適用し、可変高headerやページ全体をclipしない。Map側は親領域の高さを使用し、固定header高の差し引きには依存しない。

## 操作競合規則

| 入力 | 開始する操作 | 進行中操作への扱い |
| --- | --- | --- |
| 空白の単一pointer down | 選択解除＋パン候補 | 同じ所有権内の旧gestureをキャンセル |
| ノードのpointer down | 移動、またはShift接続 | 旧gestureをキャンセル |
| 2本目のtouch down | ピンチ | 全pointer gestureをキャンセルして置換 |
| wheel | ズーム | pointer gestureをキャンセルしてから適用 |
| `F`キー | フォーカス | pointer gesture中は無視 |
| runtime切替・unbind | なし | gesture、touch追跡、接続候補を破棄 |

別pointerから届くmove、up、upoutsideは、その操作の所有pointerでなければ既存gestureを終了しない。コールバックが再入して新しい操作を開始した場合、古いイベント処理は新しい操作をキャンセルしない。

## エラー処理と安全性

- 欠損ノードは選択、移動、接続、フォーカスの対象にしない。
- `NaN`、`Infinity`、非正の倍率は状態へ保存しない。
- 有限な入力同士の演算でも、パン・ズーム・フォーカス・ノード移動の算出結果が非有限になれば状態更新を行わない。
- 同じstageへ二重bindしない。二重bind要求は既存契約どおり例外にする。
- cleanupは冪等とし、二度呼ばれてもコールバックを重複発火しない。
- gesture終了状態をコールバック呼び出し前に確定し、コールバックの例外や再入で古い操作が復活しないようにする。
- canvasが未初期化または破棄済みの場合、wheelとfocusは副作用を発生させない。

## テスト方針

### 純粋関数

- 初期viewportの往復変換
- offsetと非等倍を含む往復変換
- パンの総差分
- 倍率上下限と無効値
- zoom anchorのワールド座標不変性
- フォーカス後のノード中心
- 入力オブジェクト不変性

### Hook

- 同一batchの連続パン・ズームを蓄積
- 保留レンダーで最新確定値を上書きしない
- command参照の安定性
- wheel listenerの登録、`preventDefault`、解除
- `F`キー、編集可能要素、編集中、欠損選択の分岐

### gestureとPixi境界

- 4px未満のパン抑止
- 非等倍でのノード移動と接続候補判定
- node、blank、Shift、別pointerの競合
- wheelによるgestureキャンセル
- 2本指の倍率・中点移動
- 3本目のtouchを無視
- pinch終了後に単一gestureを再開しない
- runtime再bind、cleanup、遅延イベント、再入コールバック

### 統合

- パン後のダブルクリックが正しいワールド座標へノードを作る
- パン・ズーム後のノードダブルクリックが正しいノードを編集する
- PixiノードとDOM編集欄の位置・サイズが一致する
- パン・ズーム後も通常移動とShift接続が成立する
- フォーカス後に選択ノードが画面中央へ描画される

各実装ステップの対象テストに加え、統合PRでは`client`ディレクトリから`npm run verify`を実行する。

## ロードマップ更新

ロードマップは実装PRへ先行して変更しない。

- 統合PRのマージ後処理でパン、ズーム、フォーカスを完了にし、Phase 3を`3 / 4`、次項目を子孫一括移動へ更新する。

## 対象外

- 慣性スクロール
- フォーカス移動のアニメーション
- ズーム率表示、ズームリセットボタン、ミニマップ
- ビューポート状態の永続化
- 自動レイアウトと重なり回避
- 複数ノード選択
- Undo／Redo

## 完了条件

- パン、ホイール／ピンチズーム、`F`キーのフォーカスが仕様どおり動作する。
- 既存のノード追加、編集、選択、削除、移動、接続が任意のviewportで動作する。
- gestureの競合、cleanup、Reactの同時レンダーで古い状態が混入しない。
- 新しい外部依存を追加しない。
- すべての自動検証が成功する。
