# Phase 3 単一責任リファクタリング設計

## 目的

`origin/main`から変更されたPhase 3のビューポート操作を、各本番モジュールが一つの変更理由だけを持つ構造へ整理する。

外部から観測できるパン、ホイール／ピンチズーム、選択ノードの中央表示、ノード移動、ノード接続、ラベル編集の挙動は変更しない。公開済みの`MapStageProps`、gesture callback、viewport commandの契約も維持する。

## 対象範囲

対象は`origin/main...HEAD`のコミット差分と、現在のワークツリーにある未コミット差分に含まれるファイルとする。

### リファクタリング対象

- `client/src/components/map/pixi/stageInteractions.ts`
- `client/src/components/map/pixi/pinchZoomGesture.ts`
- `client/src/components/map/useMapWheelZoom.ts`
- `client/src/components/map/useMapViewportShortcut.ts`
- `client/src/components/map/mapViewport.ts`
- `client/src/components/map/NodeLabelEditor.tsx`
- `client/src/components/map/MapStage.tsx`
- 上記に対応するテスト

### 監査済み・構造維持

- `client/src/app/page.tsx`: headerとMap領域を動的viewport高へ割り当てるcomposition shellだけを担当する。
- `client/src/components/layout/AppHeader.tsx`: 操作案内の表示だけを担当する。
- `client/src/components/map/useMapStageInteractions.ts`: Reactの状態・最新値とstage controllerを接続する。
- `client/src/components/map/useMapViewport.ts`: viewport状態と同期commandを所有する。
- `client/src/components/map/pixi/canvasPanGesture.ts`: 空白ドラッグによるパンgestureを扱う。
- `client/src/components/map/pixi/nodeMoveGesture.ts`: ノード移動gestureを扱う。
- `client/src/components/map/pixi/nodeConnectionGesture.ts`: ノード接続gestureを扱う。
- `client/src/components/map/pixi/pointerGesture.ts`: gesture間で共有する型契約を定義する。
- `client/src/components/map/pixi/renderMapScene.ts`: sceneの消去、world container設定、edge、nodeの描画順序を調停する。
- `client/src/components/map/pixi/usePixiApplication.ts`: Pixi applicationの生成、canvas初期設定、破棄を所有する。

## 採用方針

変更理由が実際に分かれている計算・状態調停だけを抽出する。全関数を一ファイルずつに分割する方式は依存関係と移動コストを増やすため採用しない。逆に`stageInteractions.ts`だけを分割する方式では、DOM listenerと入力計算、UI表示と投影計算の混在が残るため採用しない。

## 本番コードの責務境界

### `pixi/pointerSample.ts`

Pixiの`FederatedPointerEvent`を、gestureが使用する`PointerSample`へ変換する。

```ts
export function toPointerSample(
  event: Pick<FederatedPointerEvent,
    "globalX" | "globalY" | "pointerId" | "pointerType">,
  viewport: Viewport,
): PointerSample;
```

- `screen`へglobal座標を保存する。
- `world`は受け取ったviewportによって逆変換する。
- 空の`pointerType`は`"mouse"`へ正規化する。
- stage binding、gesture状態、Reactへ依存しない。

### `pixi/touchGestureCoordinator.ts`

touch pointerの集合、固定した2本のpinch pair、pinch終了後に全touchが離れるまでの抑止状態を所有する。

```ts
export type TouchGestureCoordinator = {
  pointerDown: (sample: PointerSample) => boolean;
  pointerMove: (sample: PointerSample) => boolean;
  pointerUp: (sample: PointerSample) => void;
  cancel: () => void;
  reset: () => void;
  hasActivePinch: () => boolean;
};
```

- `pointerDown`はtouchを登録し、2本目で進行中の単一pointer gestureをキャンセルしてpinchを開始する。
- pinch開始前のcancel callback後にgeneration、固定pair、stage binding、単一pointer所有権を再検証し、cleanupや新gesture開始で失効した場合はpinchを作らない。
- `pointerDown`で登録済みのpointerだけを`pointerMove`で更新し、未知pointerのmoveは追跡集合へ追加しない。
- 戻り値は、その入力をtouch coordinatorが所有してstage側の通常gesture開始を抑止すべきかを示す。
- 3本目は固定済みpairを変更しない。
- pairの片方が終了した後、残ったtouchからパンを再開しない。
- `cancel`は進行中pinchだけを終了する。外部のwheel操作で使用する。
- `reset`はpinchとtouch集合を破棄する。stage bindingのcleanupで使用する。
- Pixiイベント、stage binding、node選択を知らない。

### `pixi/stageInteractions.ts`

Pixi stageとgesture群のルーティングだけを所有する。

- stage listenerの登録・解除とbinding所有権
- blank／node pointer downの振り分け
- blankとnodeのprimary button判定。右・中ボタンは選択やgestureを開始しない。
- 単一pointer gesture中は、異なるpointerのblank downによる選択解除を行わない。
- 単一pointer gesture sessionへのイベント配送
- `pointerSample`と`touchGestureCoordinator`への委譲
- 再入可能callbackが新しいgestureやbindingを作った場合の所有権保護

touch一覧、中点・距離計算、画面からワールドへの変換式は保持しない。

### `pixi/pointerGestureSession.ts`

単一pointer gestureのlease、開始、move、end、cancelを所有する。end／cancel callbackの前に現在のleaseを解放し、callbackから開始された新しいgestureを古い処理で破棄しない。stage、node、touch、viewportを知らない。

### `pixi/dragActivation.ts`

pointer down時の画面座標とdrag閾値を固定し、閾値到達後に開始点からの総画面差分を返す。パンやノード座標、callback、gesture終了状態を知らない。`canvasPanGesture`と`nodeMoveGesture`はこの共通状態を利用し、それぞれviewport更新とノード移動先通知だけを担当する。

### `pixi/pinchViewport.ts`

pinch開始時と現在の2点から次のviewportを計算する。

```ts
export function calculatePinchViewport(
  startViewport: Viewport,
  startFirst: Point,
  startSecond: Point,
  currentFirst: Point,
  currentSecond: Point,
): Viewport | null;
```

- 開始距離に対する現在距離の比で倍率を求める。
- 開始中点のanchorを維持する。
- 現在中点の移動をoffsetへ反映する。
- 開始距離がゼロ、または入力・計算結果が非有限なら`null`を返す。
- 現在距離がゼロの場合は最小倍率へ制限する。
- 有限な正距離かどうかを純粋helperで判定し、座標差のoverflowも拒否する。
- 中点は各座標を半分にしてから加算し、同符号の大きな有限座標による加算overflowを避ける。
- 距離比を先に求めてから開始倍率を掛け、中点差・倍率・最終viewportのいずれかが非有限なら`null`を返す。
- pointer ID、active状態、callbackを持たない。

### `pixi/pinchZoomGesture.ts`

固定した2つのpointer ID、現在の画面座標、active状態、直前に通知した実効viewportだけを所有する。viewport計算は`calculatePinchViewport`へ委譲し、結果が`null`または直前の実効viewportと同値ならcallbackを呼ばない。開始距離がゼロまたは非有限の場合は、最初に得た有限な正距離を基準点として保存し、その次のmoveから計算する。

### `wheelZoom.ts`

wheel入力をviewport commandへ渡せる値へ変換する。

```ts
export type WheelZoomRequest = {
  anchor: Point;
  requestedScale: number;
};

export function calculateWheelZoomRequest(
  input: {
    clientX: number;
    clientY: number;
    deltaY: number;
    deltaMode: number;
    pageHeight: number;
    bounds: Pick<DOMRect, "left" | "top">;
  },
  currentScale: number,
): WheelZoomRequest | null;
```

- pixel、line、page単位をpixel相当へ正規化する。
- canvas相対anchorと指数的な要求倍率を返す。
- 非有限値や非正の現在倍率では`null`を返す。
- DOM listener、React、Pixi runtimeを所有しない。

### `useMapWheelZoom.ts`

canvasの非passive wheel listenerライフサイクルだけを所有する。有効なrequestの場合に限り、ブラウザ既定動作を抑止し、進行中gestureをキャンセルしてviewport commandを呼ぶ。

### `viewportFocusShortcut.ts`

keydown入力と現在状態から、フォーカス対象を解決する。shortcutキー・修飾キー判定は共有predicateとして公開し、resolverとHookの早期除外が同じ規則を利用する。window listenerやcallback実行は行わない。

```ts
export type ViewportFocusRequest = {
  node: Node;
  screen: ScreenSize;
};

export function resolveViewportFocusRequest(input: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  target: EventTarget | null;
  nodes: readonly Node[];
  selectedNodeId: number | null;
  isEditing: boolean;
  hasActiveGesture: boolean;
  screen: ScreenSize | null;
}): ViewportFocusRequest | null;
```

- `F`以外、Ctrl／Meta／Alt付き、編集中、編集可能要素、gesture中、screen欠損、選択欠損では`null`を返す。
- `contenteditable=""`、`contenteditable="plaintext-only"`を含む有効なcontenteditable配下を編集可能要素として扱う。
- 有効な場合だけ最新一覧の選択ノードとscreenを返す。

### `useMapViewportShortcut.ts`

windowのkeydown listenerライフサイクルと、有効なrequestの`preventDefault`・command呼び出しだけを所有する。nodesや選択・編集状態、screen、callbackはRefへ同期し、listenerは再登録せず最新値を参照する。発動条件と対象検索は`resolveViewportFocusRequest`へ委譲する。

### `nodeViewportFocus.ts`

Node固有の中心点からフォーカス後のviewportを計算する。

```ts
export function focusViewportOnNode(
  viewport: Viewport,
  node: Node,
  screen: ScreenSize,
): Viewport;
```

- 現在倍率を維持する。
- Nodeまたはscreenから得た値が非有限なら入力viewportを返す。
- 有限な入力同士の乗算で算出offsetがoverflowした場合も入力viewportを返す。
- 算出offsetが現在値と同じ場合は入力viewport参照を返す。
- `mapViewport.ts`はNode型へ依存しない。

### `mapViewport.ts`

viewport型、倍率制限、妥当性検査、画面・ワールド座標変換、パン、anchor基準ズームだけを所有する。有効なviewport倍率は`0.25`以上`4`以下とし、保存境界は範囲外の直接設定を拒否する。パンとズームの算出結果が非有限になる場合は入力viewportを返す。要求倍率を制限した結果が現在倍率と同じ場合は入力viewport参照を返し、不要な再描画を発生させない。

### `nodeLabelEditorLayout.ts`

NodeとviewportからHTML編集欄の投影値を計算する。

```ts
export type NodeLabelEditorLayout = {
  left: number;
  top: number;
  width: number;
  height: number;
  lineHeight: string;
  fontSize: number;
};

export function getNodeLabelEditorLayout(
  node: Node,
  viewport: Viewport,
): NodeLabelEditorLayout;
```

### `NodeLabelEditor.tsx`

inputの表示、draft変更、Enter／blur確定、Escapeキャンセル、double-click伝播抑止だけを所有する。viewport投影式は保持しない。

### `mapDoubleClickAction.ts`

DOMのdouble-click座標、container境界、viewport、ノード一覧から編集または追加actionを解決する。

```ts
export type MapDoubleClickAction =
  | { type: "edit"; nodeId: number }
  | { type: "add"; point: Point };

export function resolveMapDoubleClickAction(input: {
  client: Point;
  bounds: Pick<DOMRect, "left" | "top">;
  viewport: Viewport;
  nodes: readonly Node[];
}): MapDoubleClickAction | null;
```

### `MapStage.tsx`

feature単位のHook、scene描画、DOM editorを組み合わせるcomposition boundaryだけを所有する。double-clickの座標変換・hit判定・action選択は`resolveMapDoubleClickAction`へ委譲し、`null`は操作なしとして無視し、返されたactionだけをcallbackへ配送する。

Map領域の高さは固定header高を差し引かず、viewport高のflex shellが割り当てた残領域を`height: 100%`で使用する。操作説明の折り返しでheader高が変わってもページ全体をviewport内へ収める。

## データフロー

1. `stageInteractions`がPixiイベントを`toPointerSample`へ渡す。
2. touchなら`touchGestureCoordinator`が所有権を判定する。
3. pinchの座標更新は`pinchZoomGesture`から`calculatePinchViewport`へ委譲される。
4. mouse wheelは`useMapWheelZoom`が受け、`calculateWheelZoomRequest`の結果をviewport commandへ渡す。
5. keyboard入力は`useMapViewportShortcut`が受け、`resolveViewportFocusRequest`の結果をviewport commandへ渡す。
6. `useMapViewport`は汎用viewport計算を利用し、`focusViewportOnNode`を内部で呼ぶ`focusNode` commandを公開する。
7. `MapStage`はdouble-clickを`resolveMapDoubleClickAction`へ渡し、`null`を無視して有効な編集または追加actionだけをcallbackへ配送する。
8. `NodeLabelEditor`は`getNodeLabelEditorLayout`の投影値をinputへ適用する。

## エラー処理と互換性

- 非有限のpointer、wheel、viewport値をstateへ保存しない。
- ノード移動は開始・現在のscreen／world座標と算出先座標を検証し、非有限値をcallbackへ渡さない。
- pinch開始距離がゼロなら最初の正距離で基準を作り直し、その時点ではviewportを変更しない。
- 異なるpointer IDのmove／upは所有中gestureを変更しない。
- 進行中gestureのcallbackから再入しても、新しいgestureやbindingを古いcleanupで破棄しない。
- stage listener解除またはgesture cancelが例外を投げても、残りのlistener解除とtouch resetをすべて試行し、最初の例外を再送出する。
- `MapStageProps`と`useMapViewport`の戻り値は変更しない。`createStageInteractions`は`bind`と、現行bindingのleaseを捕捉する`createNodePointerDownHandler`を公開し、wheel／keyboard境界から使う`cancelActiveGesture`／`hasActiveGesture`も保持する。旧bindingに属するsceneから遅延したnode入力は拒否する。
- 新しいruntime依存は追加しない。

## テスト構成

### 新規の純粋単体テスト

- `pointerSample.test.ts`: screen／world変換、最新viewport、pointerType既定値
- `pointerGestureSession.test.ts`: 所有pointer、終了、キャンセル、再入時のlease保護
- `dragActivation.test.ts`: 閾値未満、各軸の閾値到達、開始後の総差分、開始座標の固定
- `pinchViewport.test.ts`: 距離比、中点移動、倍率制限、現在距離ゼロ、開始距離ゼロ、非有限値、有限値演算のoverflow
- `wheelZoom.test.ts`: pixel／line／page正規化、canvas相対anchor、要求倍率、無効値
- `viewportFocusShortcut.test.ts`: 共有shortcut predicate、発動条件、修飾キー、各contenteditable、gesture、選択解決
- `nodeViewportFocus.test.ts`: 中央表示、倍率維持、無効node／screen、算出offsetのoverflow
- `nodeLabelEditorLayout.test.ts`: offsetと倍率を含む位置・寸法・文字サイズ
- `mapDoubleClickAction.test.ts`: container相対座標、viewport逆変換、node hit、追加action、非有限な変換結果の拒否

### coordinator単体テスト

- `touchGestureCoordinator.test.ts`: 2本目でのpinch開始、単一pointer gestureキャンセル、固定pair、3本目、未知move、終了後抑止、cancel、reset、開始callback中のreset

### 既存テストの整理

- `stageInteractions.test.ts`はstage binding、通常pointer gesture、touch coordinatorとの接続だけを検証する。
- pinch切替時のcancel callbackからcleanupまたは新gesture開始が再入する統合境界は`stageInteractions.test.ts`で検証する。
- touch状態機械の詳細ケースは`touchGestureCoordinator.test.ts`へ移す。
- `pinchZoomGesture.test.ts`はpointer所有権とcallback lifecycleだけを検証する。
- `useMapWheelZoom.test.tsx`はlistener、preventDefault、callback、cleanupだけを検証する。
- `useMapViewportShortcut.test.tsx`はlistener、preventDefault、callback、cleanupだけを検証する。
- `mapViewport.test.ts`からNode固有フォーカスのテストを分離する。
- `NodeLabelEditor.test.tsx`はinputのユーザー操作と計算済みlayoutの適用境界を検証する。
- `MapStage.test.tsx`はwheel／focusに加え、パン／ズーム後のdouble-click、移動、接続と、wheel／Fが進行中gestureの所有権規則を守る統合テストを維持する。

各抽出では、移動先の契約を先に失敗テストとして追加し、REDを確認後に本番コードを移す。

## 完了条件

- `origin/main`から変更された本番ファイルをすべて、リファクタリング対象または構造維持として分類済みである。
- `stageInteractions.ts`がtouch状態、座標変換式、pinch計算を所有しない。
- `stageInteractions.ts`が単一pointer gestureのactive stateとlease管理を所有しない。
- `canvasPanGesture.ts`と`nodeMoveGesture.ts`がdrag開始判定を重複所有しない。
- `pinchZoomGesture.ts`が距離・中点・倍率計算を所有しない。
- `useMapWheelZoom.ts`がdelta正規化や倍率式を所有しない。
- `mapViewport.ts`がNode型へ依存しない。
- `NodeLabelEditor.tsx`がviewport投影式を所有しない。
- `MapStage.tsx`がdouble-clickの座標変換式、hit判定、action選択を所有しない。
- `useMapViewportShortcut.ts`が発動条件と対象ノード検索を所有しない。
- 既存の外部APIとユーザー操作を維持する。
- 追加・再配置したテストが各責務を直接検証する。
- `npm run verify`と`git diff --check origin/main...HEAD`が成功する。
- コミットを自動作成しない。

## 対象外

- 子孫ノードの一括移動
- 自動レイアウトと重なり回避
- ビューポート操作に必要な案内文を除く、UI文言や操作方法の変更
- reducerや外部状態管理ライブラリの導入
- 新しいruntime依存の追加
- PR作成、push、コミット
