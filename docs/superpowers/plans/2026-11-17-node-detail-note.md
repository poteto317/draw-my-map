# 詳細メモ（候補011）実装プラン

> **状態:** 作成済み（サブエージェントレビュー前）。
>
> **For agentic workers:** このリポジトリでは AGENTS.md の規定により、サブエージェント駆動（`superpowers:subagent-driven-development`）で進める。インライン実行は使わない。Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ノードに任意の詳細メモ（プレーンテキスト、最大 10,000 文字）を持たせ、右パネルを「ノードの詳細」（上に詳細メモ、下にイラスト）にまとめて編集できるようにする。メモは保存・JSON・コピー＆貼り付け・複製・分割・統合・Undo / Redo と整合する。

**Architecture:** メモの正規化と更新の純関数（`domain/nodes/nodeNote.ts`）、保存形式の検証と書き出し（`mapDocumentNodeNote.ts`・`mapDocumentNode.ts`・`mapDocumentNodeProjection.ts`・`mapConflict.ts`）、配置モードに依存しない途中反映（`useNodeLayoutState.applyNonStructuralPreview`）とメモの唯一の更新経路（`useNodes.previewNodeNote`）、統合でのメモの連結（`nodeMerge.ts`・`nodeMergeMessages.ts`・`nodeMergePreview.ts`・`NodeMergeDialog.tsx`）、テキスト欄の下書き・途中反映・確定を受け持つフック（`useNodeNoteEditing`）、表示（`NodeNoteSection`）・接続（`NodeNoteEditor`）・パネル（`NodeDetailPanel`。`IllustrationPanel` は `section` 化）と `MapEditor` の配線の順に積む。途中反映は既存の履歴グループ（`beginMoveHistory`）の中で `preview` し、`blur` で 1 回の履歴にまとめる。

**Tech Stack:** Next.js（App Router、React Compiler 有効）、React 19、TypeScript、Jest（jsdom、`next/jest`）、Testing Library。

**設計書:** `docs/superpowers/specs/2026-11-17-node-detail-note-design.md`（以下「設計書」）

## Global Constraints

- 作業ディレクトリ: `/Users/mash/Desktop/draw-my-map/.worktrees/feat-phase18-node-note`。テストと検証は `client` ディレクトリで実行する。
- TDD: 実装コードより先にテストを書き、失敗（RED）を確認してから実装する。
- **コミットしない。** コミットは開発フローの後段 `/commit-ja` で責務ごとに行う。`git add` もしない。各タスクは「検証（該当テストと `npm run verify` の該当部分）」で終える。
- 上限: 1 ノードあたり **10,000 文字**（`NODE_NOTE_MAX_LENGTH = 10000`）。数え方は JS の `string.length`（UTF-16 のコード単位。textarea の `maxLength` と同じ。絵文字などは 2 文字分）。
- 保存形式: **V3 のまま**、ノードに任意の項目 `note?: string` を足す。版は上げない。メモが無いノードでは**項目ごと持たない**（`note: undefined` のキーを残さない）。旧データ（`note` なし）・V1 / V2 はそのまま読め、V1 / V2 の `note` は無視する。古いアプリへの書き戻し互換は対象外（L-459。古いアプリは `note` を知らず、保存し直すと落とす）。
- 空のメモ: 空文字、または空白だけ（`trim() === ""`）のメモは「メモなし」とみなし `undefined`（項目ごと持たない）。前後の空白・改行は、それ以外では削らない。末尾の対になっていない上位サロゲートは 1 単位削る（L-636）。上限を超える値は切り詰めない（呼び出し側が拒否する）。
- 統合: 残すノードのメモは、選択中のノードのメモを**配列順に**、空行 `"\n\n"`（`NODE_NOTE_MERGE_JOINER`）で連結したもの（メモの無いノードは飛ばす）。連結が上限を超えるときは**統合できない**（失敗の理由 `note-too-long`。検査は既存の最後 `different-parents` の後。黙って切り詰めない）。文言「メモをまとめると文字数の上限（10,000 文字）を超えるため、統合できません。」。
- 分割: 最初の断片（元のノード）にメモを残し、新しい断片はメモを持たない（`nodeSplit.ts` は変更しない）。複製・貼り付けはメモも写す（`nodeSubtreeInsertion.ts` は変更しない）。親の挿入の新しい親はメモを持たない。
- メモの更新経路は **`useNodes.previewNodeNote(id, note)` の 1 つだけ**（確定用の別 API は作らない）。履歴グループ中は履歴に積まず、グループ外では 1 回の履歴として確定する。戻り値は更新を受理したか（無変更・対象不在・上限超過は `false`）。グループの開始は既存の `beginMoveHistory`。
- 入力の反映: テキスト欄は手元の下書きを持ち、**入力が 300ms 止まるたびに**マップへ反映する（`NODE_NOTE_PREVIEW_DELAY_MS = 300`）。デバウンスの張り直しは、**直前の反映（反映がまだ無ければフォーカス）の後の最初の入力から 2 秒**を超えて先送りしない（`NODE_NOTE_PREVIEW_MAX_WAIT_MS = 2000`。L-399）。`blur` で残りを反映し、グループを閉じて 1 回の履歴にまとめる。IME 変換中は途中反映のタイマーを張らず、`compositionend` で張る（L-474）。`Escape`（変換中でない）はフォーカスを入れた時点の内容へ戻して欄から出る。その後の `blur` では何も反映しない（L-473）。アンマウント（`blur` なしで選択が変わる・文書の入れ替え）では、`lease.isActive()` が真で下書きがあるときだけ反映してからグループを閉じる（L-588）。
- テキスト欄: `<textarea maxLength={10000}>`（`NODE_NOTE_MAX_LENGTH`）、名前「詳細メモ」、`rows={8}`、`resize-y`、プレースホルダー「このノードの詳細な説明を書けます」、未選択では `disabled`。文字数は「{length} / 10,000 文字」を常に出し（数は `toLocaleString("ja-JP")` で 3 桁区切り）、上限に達したら「上限に達しました」（常設の `role="status"` の中身）を**併記**する。複数選択（マップ表示で 2 件以上）では「N 件選択中。主選択のノードのメモを編集します」。アウトライン表示では主選択だけ（`MapEditor` の `importanceTargetIds` と同じ規則）。
- パネル: `<aside aria-label="ノードの詳細">`、幅 **`w-72`**、`shrink-0`、`min-h-0`、`overflow-y-auto`。**上にメモ、下にイラスト**。`IllustrationPanel` の外側は **`<section aria-label="イラスト">`** にし、幅・縁・背景は親へ移す（中身と操作は変えない）。`NodeNoteEditor` は `key={`${node.id}:${documentRevision}`}` で作り直す。アウトライン表示でもパネルを出す。
- メモはプレーンテキストで、HTML として解釈しない。キャンバス・アウトラインへのメモの表示、検索・一括置換・アウトライン書き出し・画像書き出しへの反映、Markdown 描画、複数ノードへの一括編集は**実装しない**（設計書 §1）。
- ショートカットの競合は既存の判定（`isInteractiveTarget`・`isTextEntryTarget`・`isEditableTarget`）に任せ、新しい判定は足さない。テキスト欄の中の Undo はブラウザ標準に任せる。
- 気をつける知見: L-453（同一ハンドラ内の連続更新）、L-454（更新関数の省略引数が既存項目を消す）、L-135（同値の更新を履歴に積まない）、L-036（確定時の再計画をプレビューと照合する）、L-473（Enter/Escape と `blur` の二重確定）、L-474（IME 変換中の誤発火）、L-399（デバウンスの上限）、L-588（文書の入れ替え後に古い状態を当てない）、L-636（UTF-16 の途中で切る）、L-443（上限の判定を走査より先に）、L-160（上限を全件のように見せない）、L-522（ショートカットが入力先で誤判定）、L-737（部品とフックの接続をフックの単体テストだけで済ませない）、L-459（旧版が新しい項目を落とす: 本機能では対象外と明記）。
- 返答・コメント・ドキュメントは日本語。

---

### Task 1: メモの正規化と更新のドメイン（`nodeNote.ts`）

**Files:**
- Create: `client/src/domain/nodes/nodeNote.ts`
- Test: `client/src/domain/nodes/__tests__/nodeNote.test.ts`（新規）

**Interfaces:**
- Consumes: なし。`Node`（`@/types/node`）に `note` が無いと型が通らないため、**このタスクの Step 3 で `client/src/types/node.ts` に `note?: string;` の 1 行だけを先に足す**（コメントの整備は Task 2 で行う）
- Modify（追加）: `client/src/types/node.ts`（`note?: string;` の 1 行だけ）
- Produces（`@/domain/nodes/nodeNote`）:
  - `NODE_NOTE_MAX_LENGTH = 10000`
  - `NODE_NOTE_MERGE_JOINER = "\n\n"`
  - `normalizeNodeNote(value: string): string | undefined`
  - `isNodeNoteWithinLimit(value: string): boolean`
  - `replaceNodeNote(nodes: readonly Node[], id: number, note: string): Node[] | null`
  - `formatNodeNoteLength(length: number): string`（`length.toLocaleString("ja-JP")`。`10000` → `"10,000"`）

- [ ] **Step 1: 失敗するテストを書く**

`client/src/domain/nodes/__tests__/nodeNote.test.ts`:

```typescript
import {
  NODE_NOTE_MAX_LENGTH,
  NODE_NOTE_MERGE_JOINER,
  formatNodeNoteLength,
  isNodeNoteWithinLimit,
  normalizeNodeNote,
  replaceNodeNote,
} from "@/domain/nodes/nodeNote";
import { createTestNode } from "@/testing/createTestNode";
import type { Node } from "@/types/node";

const EMOJI = "😀"; // 😀（UTF-16 で 2 単位）
const LONE_HIGH = "\uD83D";

describe("定数", () => {
  it("上限は 10,000（UTF-16 のコード単位）、統合の区切りは空行", () => {
    expect(NODE_NOTE_MAX_LENGTH).toBe(10000);
    expect(NODE_NOTE_MERGE_JOINER).toBe("\n\n");
  });
});

describe("normalizeNodeNote", () => {
  it.each(["", " ", "\n\n", "\t", "　", " \n　\t "])("空文字・空白だけ（%j）は undefined（メモなし）", (value) => {
    expect(normalizeNodeNote(value)).toBeUndefined();
  });

  it("前後の空白・改行は削らずにそのまま返す", () => {
    expect(normalizeNodeNote("  本文\n2行目\n\n")).toBe("  本文\n2行目\n\n");
  });

  it("末尾の対になっていない上位サロゲートを 1 単位削る（maxLength で絵文字の途中を切られた場合。L-636）", () => {
    expect(normalizeNodeNote(`メモ${LONE_HIGH}`)).toBe("メモ");
  });

  it("削った結果が空なら undefined", () => {
    expect(normalizeNodeNote(LONE_HIGH)).toBeUndefined();
    expect(normalizeNodeNote(` ${LONE_HIGH}`)).toBeUndefined();
  });

  it("末尾が完全な絵文字なら削らない", () => {
    expect(normalizeNodeNote(`メモ${EMOJI}`)).toBe(`メモ${EMOJI}`);
  });

  it("上限を超える値も切り詰めずにそのまま返す（超過の判定は呼び出し側）", () => {
    const over = "a".repeat(NODE_NOTE_MAX_LENGTH + 1);

    expect(normalizeNodeNote(over)).toBe(over);
  });
});

describe("isNodeNoteWithinLimit", () => {
  it("ちょうど上限は真、1 超過は偽", () => {
    expect(isNodeNoteWithinLimit("a".repeat(NODE_NOTE_MAX_LENGTH))).toBe(true);
    expect(isNodeNoteWithinLimit("a".repeat(NODE_NOTE_MAX_LENGTH + 1))).toBe(false);
  });

  it("絵文字は 2 文字分として数える", () => {
    expect(isNodeNoteWithinLimit(EMOJI.repeat(NODE_NOTE_MAX_LENGTH / 2))).toBe(true);
    expect(isNodeNoteWithinLimit(`${EMOJI.repeat(NODE_NOTE_MAX_LENGTH / 2)}a`)).toBe(false);
  });
});

describe("formatNodeNoteLength", () => {
  it.each([[0, "0"], [999, "999"], [10000, "10,000"]])("%d は %s と表示する", (length, expected) => {
    expect(formatNodeNoteLength(length)).toBe(expected);
  });
});

describe("replaceNodeNote", () => {
  // 1: メモあり、2: メモなし。ラベルは全ノードで変える（L-168）
  const nodes: readonly Node[] = Object.freeze([
    Object.freeze(createTestNode({ id: 1, label: "メモあり", note: "元のメモ" })),
    Object.freeze(createTestNode({ id: 2, label: "メモなし", x: 200 })),
  ]);

  it("対象のノードだけにメモを設定し、ほかのノードは同じオブジェクトのまま", () => {
    const next = replaceNodeNote(nodes, 2, "新しいメモ");

    expect(next?.[1]).toEqual({ ...nodes[1], note: "新しいメモ" });
    expect(next?.[0]).toBe(nodes[0]);
  });

  it("正規化した値で設定する（末尾の対になっていない上位サロゲートを削る）", () => {
    expect(replaceNodeNote(nodes, 2, `途中${LONE_HIGH}`)?.[1].note).toBe("途中");
  });

  it("空白だけにすると note のキーごと外す（note: undefined を残さない）", () => {
    const next = replaceNodeNote(nodes, 1, " \n ");

    expect(next).not.toBeNull();
    expect("note" in next![0]).toBe(false);
    expect(next![0]).toEqual({ id: 1, parentId: null, x: 0, y: 0, width: 100, height: 60, label: "メモあり", importance: "medium" });
  });

  it("ちょうど上限は設定できる", () => {
    const max = "a".repeat(NODE_NOTE_MAX_LENGTH);

    expect(replaceNodeNote(nodes, 2, max)?.[1].note).toBe(max);
  });

  it.each<[string, number, string]>([
    ["対象が無い", 99, "メモ"],
    ["正規化後の値が今と同じ", 1, "元のメモ"],
    ["メモの無いノードを空白だけにする（どちらもメモなし）", 2, "   "],
    ["正規化後の値が上限を 1 超える", 2, "a".repeat(NODE_NOTE_MAX_LENGTH + 1)],
  ])("%s ときは null（何も変えない。L-135）", (_name, id, note) => {
    expect(replaceNodeNote(nodes, id, note)).toBeNull();
  });

  it("上限 + 1 でも、末尾の対になっていない上位サロゲートを削ると上限内なら設定できる", () => {
    const note = `${"a".repeat(NODE_NOTE_MAX_LENGTH)}${LONE_HIGH}`;

    expect(replaceNodeNote(nodes, 2, note)?.[1].note).toBe("a".repeat(NODE_NOTE_MAX_LENGTH));
  });

  it("元の配列を変えない", () => {
    replaceNodeNote(nodes, 1, "変更");

    expect(nodes[0].note).toBe("元のメモ");
  });
});
```

- [ ] **Step 2: RED を確認する**

Run: `cd client && npx jest src/domain/nodes/__tests__/nodeNote.test.ts`
Expected: FAIL（`Cannot find module '@/domain/nodes/nodeNote'`）

- [ ] **Step 3: 実装する**

`client/src/types/node.ts` の `illustration?: string;` の次に、次の 1 行だけを先に足す（コメントは Task 2 で整える）:

```typescript
  note?: string;
```

`client/src/domain/nodes/nodeNote.ts`:

```typescript
import type { Node } from "@/types/node";

// 詳細メモの上限。数え方は string.length（UTF-16 のコード単位。textarea の maxLength と同じで、絵文字などは 2 文字分）
export const NODE_NOTE_MAX_LENGTH = 10000;

// 統合で複数のノードのメモをつなぐ区切り（空行）
export const NODE_NOTE_MERGE_JOINER = "\n\n";

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

// メモの入力を保存する値にする。末尾が対になっていない上位サロゲートなら 1 単位削る（maxLength で絵文字の途中を
// 切られた場合の保護。L-636）。削った後が空白だけ（空文字を含む）なら「メモなし」として undefined。
// それ以外は値のまま返し、前後の空白・改行は削らない。上限を超える値も切り詰めない（超過の判定は呼び出し側）
export function normalizeNodeNote(value: string): string | undefined {
  const lastIndex = value.length - 1;
  const withoutLoneHigh = lastIndex >= 0 && isHighSurrogate(value.charCodeAt(lastIndex))
    ? value.slice(0, lastIndex)
    : value;
  return withoutLoneHigh.trim() === "" ? undefined : withoutLoneHigh;
}

export function isNodeNoteWithinLimit(value: string): boolean {
  return value.length <= NODE_NOTE_MAX_LENGTH;
}

// 文字数の表示（3 桁区切り）。パネルの「N / 10,000 文字」と統合のプレビューで共有する
export function formatNodeNoteLength(length: number): string {
  return length.toLocaleString("ja-JP");
}

// 1 ノードのメモを置き換える。note は正規化前の入力で、normalizeNodeNote を通した値で判定する。
// 対象が無い・正規化後の値が今と同じ・正規化後の値が上限超過のときは null（何も変えない。無変更は履歴に積まない。L-135）。
// メモなし（undefined）にするときは note のキーごと外す
export function replaceNodeNote(nodes: readonly Node[], id: number, note: string): Node[] | null {
  const target = nodes.find((node) => node.id === id);
  if (target === undefined) return null;
  const normalized = normalizeNodeNote(note);
  if (normalized !== undefined && !isNodeNoteWithinLimit(normalized)) return null;
  if (normalized === target.note) return null;

  return nodes.map((node) => {
    if (node.id !== id) return node;
    if (normalized !== undefined) return { ...node, note: normalized };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- 分割代入で note を除外するため
    const { note: _removed, ...rest } = node;
    return rest;
  });
}
```

- [ ] **Step 4: GREEN を確認する**

Run: `cd client && npx jest src/domain/nodes/__tests__/nodeNote.test.ts`
Expected: PASS

- [ ] **Step 5: このタスクの範囲を検証する**

Run: `cd client && npm run typecheck && npm run lint`
Expected: 型エラー・lint エラーなし。

---

### Task 2: 保存形式と、既存の操作でのメモの扱いの固定

**Files:**
- Create: `client/src/domain/persistence/mapDocumentNodeNote.ts`
- Modify: `client/src/domain/persistence/mapDocumentNode.ts`（`normalizeMapDocumentNodeNote` を呼び、`note` を `projectMapDocumentNode` へ渡す）
- Modify: `client/src/domain/persistence/mapDocumentNodeProjection.ts`（`note` があるときだけ出す）
- Modify: `client/src/domain/mapLibrary/mapConflict.ts`（`areNodesEqual` に `note`）
- Modify: `client/src/types/node.ts`（`note?: string` のコメントと、見直し箇所のコメント）
- Modify: `client/src/domain/nodes/nodePlacement.ts`（`createParentNode` のコメントに `note` も持たないことを追記。コードは変えない）
- Modify: `client/src/app/testing/pageTestHelpers.tsx`（`ExportedNode` に `note?: string`。`V3SeedNode` は `Partial<ExportedNode>` なので自動で受け付ける）
- Test: `client/src/domain/persistence/__tests__/mapDocumentNodeNote.test.ts`（新規）
- Test: `client/src/domain/persistence/__tests__/mapDocumentNode.test.ts`（追記）
- Test: `client/src/domain/persistence/__tests__/mapDocumentNodeProjection.test.ts`（追記）
- Test: `client/src/domain/persistence/__tests__/mapDocumentCodec.test.ts`（追記）
- Test: `client/src/domain/persistence/__tests__/mapDocumentDecoder.test.ts`（追記）
- Test: `client/src/domain/mapLibrary/__tests__/mapConflict.test.ts`（追記）
- Test: `client/src/domain/clipboard/__tests__/subtreeClipboardCodec.test.ts`（追記）
- Test: `client/src/domain/nodes/__tests__/nodeSubtreeInsertion.test.ts`（追記）
- Test: `client/src/domain/nodes/__tests__/nodeSplit.test.ts`（追記）
- Test: `client/src/domain/nodes/__tests__/nodeParentInsertion.test.ts`（追記）

**Interfaces:**
- Consumes（Task 1）: `NODE_NOTE_MAX_LENGTH`、`normalizeNodeNote(value: string): string | undefined`（`@/domain/nodes/nodeNote`）
- Produces:
  - `Node.note?: string`（`@/types/node`）
  - `normalizeMapDocumentNodeNote(note: unknown, index: number, version: MapDocumentVersion): MapDocumentResult<string | undefined>`（`@/domain/persistence/mapDocumentNodeNote`）
  - `ExportedNode.note?: string`（`@/app/testing/pageTestHelpers`）

- [ ] **Step 1: 失敗するテストを書く**

`client/src/domain/persistence/__tests__/mapDocumentNodeNote.test.ts`:

```typescript
import { NODE_NOTE_MAX_LENGTH } from "@/domain/nodes/nodeNote";
import { normalizeMapDocumentNodeNote } from "@/domain/persistence/mapDocumentNodeNote";

const ERROR = "node[2].noteは10000文字以内の文字列である必要があります。";

describe("normalizeMapDocumentNodeNote", () => {
  it.each([1, 2] as const)("V%d では note を無視して undefined を返す（不正な値でも失敗にしない）", (version) => {
    expect(normalizeMapDocumentNodeNote("メモ", 0, version)).toEqual({ ok: true, value: undefined });
    expect(normalizeMapDocumentNodeNote(123, 0, version)).toEqual({ ok: true, value: undefined });
  });

  it("V3 で undefined なら undefined", () => {
    expect(normalizeMapDocumentNodeNote(undefined, 0, 3)).toEqual({ ok: true, value: undefined });
  });

  it("V3 の文字列は、前後の空白・改行を削らずに返す", () => {
    expect(normalizeMapDocumentNodeNote("  本文\n", 0, 3)).toEqual({ ok: true, value: "  本文\n" });
  });

  it("V3 の空白だけのメモは undefined（項目ごと持たない）", () => {
    expect(normalizeMapDocumentNodeNote(" \n\t　", 0, 3)).toEqual({ ok: true, value: undefined });
  });

  it("V3 の末尾の対になっていない上位サロゲートは削る", () => {
    expect(normalizeMapDocumentNodeNote("メモ\uD83D", 0, 3)).toEqual({ ok: true, value: "メモ" });
  });

  it("ちょうど上限は受け付ける", () => {
    const max = "a".repeat(NODE_NOTE_MAX_LENGTH);

    expect(normalizeMapDocumentNodeNote(max, 0, 3)).toEqual({ ok: true, value: max });
  });

  it.each([null, 1, true, {}, ["a"], "a".repeat(NODE_NOTE_MAX_LENGTH + 1)])("V3 で不正な note（%p）は失敗", (note) => {
    expect(normalizeMapDocumentNodeNote(note, 2, 3)).toEqual({ ok: false, error: ERROR });
  });

  it("上限は入力の length で、正規化より先に判定する（削れば上限内になる値も拒否する。L-443）", () => {
    const note = `${"a".repeat(NODE_NOTE_MAX_LENGTH)}\uD83D`;

    expect(normalizeMapDocumentNodeNote(note, 2, 3)).toEqual({ ok: false, error: ERROR });
  });
});
```

`client/src/domain/persistence/__tests__/mapDocumentNode.test.ts` の末尾（最後の `});` の後）に追加する:

```typescript
describe("normalizeMapDocumentNode の note", () => {
  it("V3 の note を読み込む", () => {
    expect(normalizeMapDocumentNode({ ...validNode, note: "詳しい説明" }, 0, 3)).toEqual({
      ok: true,
      value: { ...validNode, note: "詳しい説明" },
    });
  });

  it("V3 の空白だけの note は、項目ごと持たない", () => {
    const result = normalizeMapDocumentNode({ ...validNode, note: "  \n" }, 0, 3);

    expect(result.ok && "note" in result.value).toBe(false);
  });

  it("V2 の note は無視する", () => {
    const result = normalizeMapDocumentNode({ ...validNode, note: "詳しい説明" }, 0, 2);

    expect(result).toEqual({ ok: true, value: validNode });
    expect(result.ok && "note" in result.value).toBe(false);
  });

  it("V3 の上限超過の note は、位置付きのエラーで拒否する", () => {
    expect(normalizeMapDocumentNode({ ...validNode, note: "a".repeat(10001) }, 4, 3)).toEqual({
      ok: false,
      error: "node[4].noteは10000文字以内の文字列である必要があります。",
    });
  });
});
```

`client/src/domain/persistence/__tests__/mapDocumentNodeProjection.test.ts` の `describe` の中、既存の `it` の後に追加する:

```typescript
  it("note があるときだけ項目を出す", () => {
    const base = {
      id: 1, parentId: null, x: 0, y: 0, width: 100, height: 60, label: "a", importance: "medium" as const,
    };

    expect(projectMapDocumentNode({ ...base, note: "メモ" })).toEqual({ ...base, note: "メモ" });
    expect("note" in projectMapDocumentNode(base)).toBe(false);
    expect("note" in projectMapDocumentNode({ ...base, note: undefined })).toBe(false);
  });
```

`client/src/domain/persistence/__tests__/mapDocumentCodec.test.ts` の `describe("MapDocument Codec", ...)` の中、既存の `it` の後に追加する:

```typescript
  it("V3 の詳細メモ（改行・前後の空白・絵文字を含む）を往復し、メモの無いノードは項目を持たない", () => {
    const withNote = createTestNode({ ...node(1, null, "high"), note: "  1行目\n\n2行目 😀\n" });
    const withoutNote = node(2, 1, "low");
    const document = createMapDocument([withNote, withoutNote], "manual");

    const parsed = parseMapDocumentJson(serializeMapDocument(document));

    expect(parsed).toEqual({ ok: true, value: document });
    expect(parsed.ok && parsed.value.nodes[0].note).toBe("  1行目\n\n2行目 😀\n");
    expect(parsed.ok && "note" in parsed.value.nodes[1]).toBe(false);
  });
```

`client/src/domain/persistence/__tests__/mapDocumentDecoder.test.ts` の末尾に追加する（既存の `baseNode`・`json` を使う）:

```typescript
describe("version 3 の詳細メモ", () => {
  it("version 3 の note を読み込む", () => {
    const parsed = parseMapDocumentJsonWithVersion(json(3, { ...baseNode, note: "メモ" }));

    expect(parsed.ok && parsed.value.document.nodes[0].note).toBe("メモ");
  });

  it.each([1, 2])("version %i の note は無視する", (version) => {
    const node = version === 1 ? { ...baseNode, note: "メモ", importance: undefined } : { ...baseNode, note: "メモ" };
    const parsed = parseMapDocumentJsonWithVersion(json(version, node));

    expect(parsed.ok && "note" in parsed.value.document.nodes[0]).toBe(false);
  });

  it("version 3 で上限超過の note は、読み込みを失敗にする", () => {
    expect(parseMapDocumentJsonWithVersion(json(3, { ...baseNode, note: "a".repeat(10001) }))).toEqual({
      ok: false,
      error: "node[0].noteは10000文字以内の文字列である必要があります。",
    });
  });
});
```

`client/src/domain/mapLibrary/__tests__/mapConflict.test.ts` の `describe("isDocumentContentEqual", ...)` の中、`"illustration が未定義とオプショナル未定義で等価であることを判定する"` の `it` の後に追加する:

```typescript
    it("メモだけが違う 2 文書は別物と判定する（別タブで変えたメモの競合を見逃さない）", () => {
      const withNote: MapDocumentV3 = {
        ...baseDoc,
        nodes: [baseDoc.nodes[0], { ...baseDoc.nodes[1], note: "別タブで書いたメモ" }],
      };
      const otherNote: MapDocumentV3 = {
        ...baseDoc,
        nodes: [baseDoc.nodes[0], { ...baseDoc.nodes[1], note: "このタブで書いたメモ" }],
      };

      expect(isDocumentContentEqual(baseDoc, withNote)).toBe(false);
      expect(isDocumentContentEqual(withNote, otherNote)).toBe(false);
    });

    it("note が未定義とオプショナル未定義は等価", () => {
      const explicitUndefined: MapDocumentV3 = {
        ...baseDoc,
        nodes: [{ ...baseDoc.nodes[0], note: undefined }, baseDoc.nodes[1]],
      };

      expect(isDocumentContentEqual(baseDoc, explicitUndefined)).toBe(true);
    });
```

`client/src/domain/clipboard/__tests__/subtreeClipboardCodec.test.ts` の `describe("encodeSubtreeClipboard / decodeSubtreeClipboard", ...)` の中、`"葉を単独でコピーできる"` の後に追加する:

```typescript
  it("詳細メモもコピーに含めて往復する（メモの無いノードは項目を持たない）", () => {
    const withNotes: Node[] = [
      node(1, null),
      node(2, 1, { note: "親のメモ\n2行目" }),
      node(3, 2),
    ];

    const decoded = encodeAndDecode(withNotes, 2);

    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.value.nodes.find((item) => item.id === 2)?.note).toBe("親のメモ\n2行目");
    expect("note" in decoded.value.nodes.find((item) => item.id === 3)!).toBe(false);
  });
```

`client/src/domain/nodes/__tests__/nodeSubtreeInsertion.test.ts` の `describe("insertNodeSubtree", ...)` の中、最初の `it` の後に追加する:

```typescript
  it.each(["paste", "duplicate"] as const)("%s では詳細メモも写し、メモの無いノードには付けない", (kind) => {
    const current = [createTestNode({ id: 1, label: "既存", note: "既存のメモ" })];
    const sources = [
      createTestNode({ id: 1, label: "根", note: "根のメモ" }),
      createTestNode({ id: 2, parentId: 1, x: 200, label: "子" }),
    ];

    const result = insertNodeSubtree(current, sources, 1, null, "manual", idsFrom([10, 11]), kind);

    expect(result).not.toBeNull();
    expect(findNode(result!.nodes, 10)?.note).toBe("根のメモ");
    expect("note" in findNode(result!.nodes, 11)!).toBe(false);
    expect(findNode(result!.nodes, 1)?.note).toBe("既存のメモ");
  });
```

`client/src/domain/nodes/__tests__/nodeSplit.test.ts` の `describe("splitNode", ...)` の中、`"新しいノードは重要度が元と同じで、大きさは既定、イラストを持たない"` の後に追加する:

```typescript
  it("詳細メモは元のノード（最初の断片）にだけ残し、新しい断片には付けない", () => {
    const withNote = rootNodes.map((item) => (item.id === 2 ? { ...item, note: "分割前のメモ" } : item));

    const { nodes } = success(withNote, 2, [101, 102]);

    expect(nodes.find((item) => item.id === 2)?.note).toBe("分割前のメモ");
    for (const id of [101, 102]) expect("note" in nodes.find((item) => item.id === id)!).toBe(false);
  });
```

`client/src/domain/nodes/__tests__/nodeParentInsertion.test.ts` の末尾に追加する（既存の `n`・`succeed` を使う。`succeed` の戻り値は `insertParentNode` の成功結果）:

```typescript
describe("親の挿入と詳細メモ", () => {
  it("新しい親はメモを持たず、対象のノードのメモは変わらない", () => {
    const nodes = [n(1, null, 0, 0), n(2, 1, 220, 0, { note: "対象のメモ" })];

    const result = succeed(nodes, 2, undefined, "manual");

    expect("note" in result.nodes.find((node) => node.id === 50)!).toBe(false);
    expect(result.nodes.find((node) => node.id === 2)?.note).toBe("対象のメモ");
  });
});
```

（`succeed(nodes, nodeId, visible = all(nodes), mode = "auto", newNodeId = 50)` は失敗で例外を投げ、成功の結果 `{ ok: true; nodes; insertedId }` を返す。新しい親の ID は 50）

- [ ] **Step 2: RED を確認する**

Run: `cd client && npx jest src/domain/persistence src/domain/mapLibrary/__tests__/mapConflict.test.ts src/domain/clipboard src/domain/nodes/__tests__/nodeSubtreeInsertion.test.ts src/domain/nodes/__tests__/nodeSplit.test.ts src/domain/nodes/__tests__/nodeParentInsertion.test.ts`
Expected: `mapDocumentNodeNote.test.ts` が `Cannot find module` で FAIL。次の追加分が FAIL する: V3 の `note` の読み込み・書き出し・JSON 往復（`expect(received).toEqual(expected)` で `note` が欠ける）、上限超過の `note` を拒否しない（`ok: true` が返る）、メモだけが違う 2 文書を `mapConflict` が別物と判定しない、クリップボードで `note` が落ちる。**次の追加分は、実装前でも PASS してよい**（現状の「`note` を出さない・比べない」と同じ結果を固定する検査）: 空白だけの `note` が項目ごと無い、V1/V2 の `note` は無視する、`projectMapDocumentNode` が `note` が無い・`undefined` のノードに項目を出さない、`mapConflict` で `note` 未定義と省略が等価、クリップボードのメモ無しのノード。`nodeSubtreeInsertion`・`nodeSplit`・`nodeParentInsertion` の追加分は**現状の挙動を固定するテスト**なので PASS してよい（設計書 §3.4。実装は変えない）。

- [ ] **Step 3: 実装する**

`client/src/domain/persistence/mapDocumentNodeNote.ts`:

```typescript
import { NODE_NOTE_MAX_LENGTH, normalizeNodeNote } from "@/domain/nodes/nodeNote";
import type { MapDocumentResult, MapDocumentVersion } from "@/types/mapDocument";

// 詳細メモは version 3 の任意項目。それ以前の version では、あっても無視する。
// 上限は入力の文字列の length で、正規化より先に判定する（L-443）。上限内なら正規化した値を返す
// （末尾の対になっていない上位サロゲートを削り、空白だけなら undefined）
export function normalizeMapDocumentNodeNote(
  note: unknown,
  index: number,
  version: MapDocumentVersion,
): MapDocumentResult<string | undefined> {
  if (version !== 3 || note === undefined) {
    return { ok: true, value: undefined };
  }
  if (typeof note !== "string" || note.length > NODE_NOTE_MAX_LENGTH) {
    return {
      ok: false,
      error: `node[${index}].noteは10000文字以内の文字列である必要があります。`,
    };
  }
  return { ok: true, value: normalizeNodeNote(note) };
}
```

`client/src/domain/persistence/mapDocumentNode.ts`:
- import に `import { normalizeMapDocumentNodeNote } from "@/domain/persistence/mapDocumentNodeNote";` を `normalizeMapDocumentNodeIllustration` の import の次に足す。
- `const illustration = illustrationResult.value;` の次に、次を足す:

```typescript
  const noteResult = normalizeMapDocumentNodeNote(node.note, index, version);
  if (!noteResult.ok) {
    return noteResult;
  }
  const note = noteResult.value;
```

- `projectMapDocumentNode({...})` の引数の `...(illustration === undefined ? {} : { illustration }),` の次に `...(note === undefined ? {} : { note }),` を足す。

`client/src/domain/persistence/mapDocumentNodeProjection.ts` の戻り値の最後の行の次に足す:

```typescript
    ...(node.note === undefined ? {} : { note: node.note }),
```

`client/src/domain/mapLibrary/mapConflict.ts` の `areNodesEqual` の最後の条件を次にする:

```typescript
    (a.illustration ?? "") === (b.illustration ?? "") &&
    (a.note ?? "") === (b.note ?? "")
```

`client/src/types/node.ts` を次にする（Task 1 で足した `note?: string;` の行にコメントを付け、型の上のコメントに見直し箇所を足す）:

```typescript
import type { NodeImportance } from "@/types/nodeImportance";

// マップのノード。属性を足すときは、ノードの分割・統合での扱いを決めて見直す
// （domain/nodes/nodeSplit.ts の断片のノード、domain/nodes/nodeMerge.ts の applyPlanToSurvivor・planNodeMerge・isSameNodeMergePlan）。
// 属性を値のまま写している次の場所も見直す: 枝の複製・コピー＆ペースト（domain/nodes/nodeSubtreeInsertion.ts の `...source`）、
// 保存形式の書き出しと検証（domain/persistence/mapDocumentNodeProjection.ts・mapDocumentNode.ts。
// コピー＆ペーストのクリップボードの形式も mapDocumentNode.ts を使う）、マップの競合判定（domain/mapLibrary/mapConflict.ts の
// areNodesEqual。項目を並べて比べている）、親の挿入（domain/nodes/nodePlacement.ts の createParentNode）、各エクスポート
export type Node = {
  id: number;
  parentId: number | null;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  importance: NodeImportance;
  // 縮小済みのイラストの data URL。無いノードでは、項目ごと持たない
  illustration?: string;
  // 詳細メモ（プレーンテキスト。上限は domain/nodes/nodeNote.ts の NODE_NOTE_MAX_LENGTH）。
  // 無いノード・空白だけのメモでは、項目ごと持たない。更新は domain/nodes/nodeNote.ts の replaceNodeNote。
  // 分割では元のノードにだけ残し、統合では選択中のメモを連結し、親の挿入では新しい親に持たせない
  note?: string;
};
```

`client/src/domain/nodes/nodePlacement.ts` の `createParentNode` の上のコメント 1 行目を次にする（コードは変えない）:

```typescript
// target の親・座標・重要度を写し、大きさ・ラベルは新しいノードの既定値にする。illustration・note（詳細メモ）は持たない。
```

`client/src/app/testing/pageTestHelpers.tsx` の `ExportedNode` の `illustration?: string;` の次に足す:

```typescript
  note?: string;
```

- [ ] **Step 4: GREEN を確認する**

Run: `cd client && npx jest src/domain/persistence src/domain/mapLibrary src/domain/clipboard src/domain/nodes src/domain/history`
Expected: PASS（既存のテストも含めて）

- [ ] **Step 5: このタスクの範囲を検証する**

Run: `cd client && npm run typecheck && npm run lint`
Expected: 型エラー・lint エラーなし。

---

### Task 3: 配置モードに依存しない途中反映と、メモの更新経路（`applyNonStructuralPreview`・`previewNodeNote`）

**Files:**
- Modify: `client/src/hooks/useNodeLayoutState.ts`（`applyNonStructuralPreview` を足す）
- Modify: `client/src/hooks/useNodes.ts`（`previewNodeNote` を足し、`beginMoveHistory` にコメント）
- Test: `client/src/hooks/__tests__/useNodeLayoutState.test.ts`（追記）
- Test: `client/src/hooks/__tests__/useNodesNote.test.ts`（新規）

**Interfaces:**
- Consumes（Task 1）: `replaceNodeNote(nodes: readonly Node[], id: number, note: string): Node[] | null`、`NODE_NOTE_MAX_LENGTH`
- Produces:
  - `useNodeLayoutState().applyNonStructuralPreview: (update: (currentNodes: readonly Node[]) => Node[] | null) => boolean`
  - `useNodes().previewNodeNote: (id: number, note: string) => boolean`
  - 既存: `useNodes().beginMoveHistory: () => MapHistoryGroupLease`（`MapHistoryGroupLease` は `@/domain/history/mapHistory` の `{ isActive: () => boolean; finish: () => void }`）

- [ ] **Step 1: 失敗するテストを書く**

`client/src/hooks/__tests__/useNodeLayoutState.test.ts` の `describe("履歴", ...)`（`"移動グループ中の手動移動は終了時に1操作として記録する"` を含む `describe`）の中、`"履歴操作の関数参照は更新後も安定している"` の前に追加する:

```typescript
    describe("applyNonStructuralPreview", () => {
      it("グループ中は表示上の現在値だけを更新し、終了時に1操作として記録する（途中の値は履歴に残らない）", () => {
        const { result } = renderHook(() => useNodeLayoutState());
        const start = [node(1, null, 50, 70)];
        act(() => { result.current.applyNonStructuralChange(() => start); });

        act(() => {
          const lease = result.current.beginMoveHistory();
          result.current.applyNonStructuralPreview((current) => current.map((item) => ({ ...item, label: "途中" })));
          result.current.applyNonStructuralPreview((current) => current.map((item) => ({ ...item, label: "最後" })));
          lease.finish();
        });
        expect(result.current.nodes[0].label).toBe("最後");

        act(() => { result.current.undo(); });
        expect(result.current.nodes).toBe(start);
        act(() => { result.current.undo(); });
        expect(result.current.nodes).toEqual([]);
        expect(result.current.canUndo).toBe(false);
      });

      it("グループ外では1操作として確定する", () => {
        const { result } = renderHook(() => useNodeLayoutState());
        const start = [node(1, null, 50, 70)];
        act(() => result.current.replaceLayoutState(start, "manual"));
        let applied!: boolean;

        act(() => {
          applied = result.current.applyNonStructuralPreview((current) => current.map((item) => ({ ...item, label: "確定" })));
        });

        expect(applied).toBe(true);
        expect(result.current.canUndo).toBe(true);
        act(() => { result.current.undo(); });
        expect(result.current.nodes).toBe(start);
      });

      it("自動配置でも候補を受理し、再配置しない（applyManualMove と違い配置モードに依存しない）", () => {
        const { result } = renderHook(() => useNodeLayoutState());
        act(() => result.current.replaceLayoutState([node(1, null, 900, 800)], "auto"));
        let applied!: boolean;

        act(() => {
          applied = result.current.applyNonStructuralPreview((current) => current.map((item) => ({ ...item, label: "メモ" })));
        });

        expect(applied).toBe(true);
        expect(result.current.nodes[0]).toMatchObject({ x: 900, y: 800, label: "メモ" });
        expect(result.current.layoutMode).toBe("auto");
      });

      it("null の候補は false を返し、状態と履歴を変えない", () => {
        const { result } = renderHook(() => useNodeLayoutState());
        const start = [node(1, null, 50, 70)];
        act(() => result.current.replaceLayoutState(start, "manual"));
        let applied!: boolean;

        act(() => { applied = result.current.applyNonStructuralPreview(() => null); });

        expect(applied).toBe(false);
        expect(result.current.nodes).toBe(start);
        expect(result.current.canUndo).toBe(false);
      });

      it("関数参照は更新後も安定している", () => {
        const { result } = renderHook(() => useNodeLayoutState());
        const { applyNonStructuralPreview } = result.current;

        act(() => { result.current.applyNonStructuralPreview(() => [node(1, null, 50, 70)]); });

        expect(result.current.applyNonStructuralPreview).toBe(applyNonStructuralPreview);
      });
    });
```

`client/src/hooks/__tests__/useNodesNote.test.ts`:

```typescript
import { act, renderHook } from "@testing-library/react";
import { NODE_NOTE_MAX_LENGTH } from "@/domain/nodes/nodeNote";
import { useNodes } from "@/hooks/useNodes";
import { createTestNode } from "@/testing/createTestNode";
import type { Node } from "@/types/node";
import type { NodeMapState } from "@/types/nodeMapState";

type Hook = ReturnType<typeof useNodes>;

// 1: 根、2: メモあり、3: メモなし。ラベルは全ノードで変える（L-168）
function initialMap(layoutMode: "manual" | "auto" = "manual"): NodeMapState {
  return {
    layoutMode,
    nodes: [
      createTestNode({ id: 1, label: "根" }),
      createTestNode({ id: 2, parentId: 1, label: "メモあり", x: 220, note: "元のメモ" }),
      createTestNode({ id: 3, parentId: 1, label: "メモなし", x: 220, y: 100 }),
    ],
  };
}

function renderNodes(initial: NodeMapState = initialMap()) {
  const view = renderHook(() => useNodes());
  act(() => view.result.current.replaceMap(initial));
  return view;
}

function nodeOf(current: Hook, id: number): Node {
  return current.nodes.find((item) => item.id === id)!;
}

describe("useNodes の previewNodeNote", () => {
  it("グループ外では 1 回の履歴として確定し、1 回の Undo で戻る。documentRevision は変えない", () => {
    const { result } = renderNodes();
    const revision = result.current.documentRevision;
    let accepted!: boolean;

    act(() => { accepted = result.current.previewNodeNote(3, "新しいメモ"); });

    expect(accepted).toBe(true);
    expect(nodeOf(result.current, 3).note).toBe("新しいメモ");
    expect(result.current.canUndo).toBe(true);
    expect(result.current.documentRevision).toBe(revision);

    act(() => { result.current.undo(); });
    expect("note" in nodeOf(result.current, 3)).toBe(false);
    expect(result.current.canUndo).toBe(false);
  });

  it("履歴グループ（beginMoveHistory）の中では履歴に積まず、終了で 1 回の履歴にまとまる", () => {
    const { result } = renderNodes();

    act(() => {
      const lease = result.current.beginMoveHistory();
      result.current.previewNodeNote(2, "途中");
      result.current.previewNodeNote(2, "途中の続き");
      result.current.previewNodeNote(2, "最終");
      lease.finish();
    });

    expect(nodeOf(result.current, 2).note).toBe("最終");
    act(() => { result.current.undo(); });
    expect(nodeOf(result.current, 2).note).toBe("元のメモ");
    expect(result.current.canUndo).toBe(false);
  });

  it("グループが他の操作で閉じた後の反映は、1 回の履歴として確定する（正しさは保つ）", () => {
    const { result } = renderNodes();

    act(() => {
      const lease = result.current.beginMoveHistory();
      result.current.previewNodeNote(2, "A");
      // 別の操作がグループを始めて閉じる。最初の lease は失効する
      result.current.beginMoveHistory().finish();
      expect(lease.isActive()).toBe(false);
      result.current.previewNodeNote(2, "B");
    });

    expect(nodeOf(result.current, 2).note).toBe("B");
    act(() => { result.current.undo(); });
    expect(nodeOf(result.current, 2).note).toBe("A");
    act(() => { result.current.undo(); });
    expect(nodeOf(result.current, 2).note).toBe("元のメモ");
  });

  it("空白だけにすると、メモの項目ごと外す", () => {
    const { result } = renderNodes();

    act(() => { result.current.previewNodeNote(2, " \n "); });

    expect("note" in nodeOf(result.current, 2)).toBe(false);
  });

  it("ちょうど上限のメモは受理する", () => {
    const { result } = renderNodes();
    let accepted!: boolean;

    act(() => { accepted = result.current.previewNodeNote(3, "a".repeat(NODE_NOTE_MAX_LENGTH)); });

    expect(accepted).toBe(true);
    expect(nodeOf(result.current, 3).note).toHaveLength(NODE_NOTE_MAX_LENGTH);
  });

  it.each<[string, number, string]>([
    ["同じ値", 2, "元のメモ"],
    ["メモの無いノードを空白だけにする", 3, "   "],
    ["対象が無い", 99, "メモ"],
    ["上限を 1 超える", 3, "a".repeat(NODE_NOTE_MAX_LENGTH + 1)],
  ])("%s ときは false を返し、何も変えず履歴も積まない（L-135）", (_name, id, note) => {
    const { result } = renderNodes();
    const before = result.current.nodes;
    let accepted!: boolean;

    act(() => { accepted = result.current.previewNodeNote(id, note); });

    expect(accepted).toBe(false);
    expect(result.current.nodes).toBe(before);
    expect(result.current.canUndo).toBe(false);
  });

  it("自動配置でも更新できる", () => {
    const { result } = renderNodes(initialMap("auto"));
    let accepted!: boolean;

    act(() => { accepted = result.current.previewNodeNote(3, "自動配置のメモ"); });

    expect(accepted).toBe(true);
    expect(nodeOf(result.current, 3).note).toBe("自動配置のメモ");
  });

  it("関数参照は更新後も安定している", () => {
    const { result } = renderNodes();
    const { previewNodeNote } = result.current;

    act(() => { result.current.previewNodeNote(3, "メモ"); });

    expect(result.current.previewNodeNote).toBe(previewNodeNote);
  });
});
```

- [ ] **Step 2: RED を確認する**

Run: `cd client && npx jest src/hooks/__tests__/useNodeLayoutState.test.ts src/hooks/__tests__/useNodesNote.test.ts`
Expected: FAIL（`applyNonStructuralPreview is not a function`、`previewNodeNote is not a function`）

- [ ] **Step 3: 実装する**

`client/src/hooks/useNodeLayoutState.ts`:
- `UseNodeLayoutStateReturn` の `applyNonStructuralChange: (update: NodeChange) => boolean;` の次に足す:

```typescript
  // 配置モードに依存しない非構造の変更。グループ中は表示上の現在値だけを更新し、グループ外では1操作として確定する
  applyNonStructuralPreview: (update: NodeChange) => boolean;
```

- `applyManualMove` の定義の前に足す:

```typescript
  // 履歴グループ中は表示上の現在値だけを更新し、グループ外では1操作として確定する。
  // applyManualMove と違い、自動配置でも受理する（詳細メモの途中反映に使う）
  const applyNonStructuralPreview = useCallback((update: NodeChange): boolean => {
    const current = getPresent();
    const nextNodes = update(current.nodes);
    if (!nextNodes) return false;

    preview({ layoutMode: current.layoutMode, nodes: nextNodes });
    return true;
  }, [getPresent, preview]);
```

- `return` の `applyNonStructuralChange,` の次に `applyNonStructuralPreview,` を足す。

`client/src/hooks/useNodes.ts`:
- import に `import { replaceNodeNote } from "@/domain/nodes/nodeNote";` を `replaceNodeLabels` の import の次に足す。
- `UseNodesReturn` の `removeIllustration: (id: number) => boolean;` の次に足す:

```typescript
  // 詳細メモの唯一の更新経路。履歴グループ中は履歴に積まず、グループ外では1操作として確定する。
  // 戻り値は更新を受理したか（無変更・対象不在・上限超過は false）。documentRevision は変えない
  previewNodeNote: (id: number, note: string) => boolean;
```

- `UseNodesReturn` の `beginMoveHistory: () => MapHistoryGroupLease;` の上に、次のコメントを足す:

```typescript
  // 履歴グループを始める。名前は移動由来だが、機構はグループ一般（詳細メモの途中反映もこのグループを使う）
```

- `useNodeLayoutState()` の分割代入の `applyNonStructuralChange,` の次に `applyNonStructuralPreview,` を足す。
- `removeIllustration` の定義の次に足す:

```typescript
  const previewNodeNote = useCallback((id: number, note: string) => (
    applyNonStructuralPreview((currentNodes) => replaceNodeNote(currentNodes, id, note))
  ), [applyNonStructuralPreview]);
```

- `return` の `removeIllustration,` の次に `previewNodeNote,` を足す。

- [ ] **Step 4: GREEN を確認する**

Run: `cd client && npx jest src/hooks/__tests__/useNodeLayoutState.test.ts src/hooks/__tests__/useNodesNote.test.ts src/hooks/__tests__/useNodesHistory.test.ts src/hooks/__tests__/useNodes.test.ts`
Expected: PASS

- [ ] **Step 5: このタスクの範囲を検証する**

Run: `cd client && npm run typecheck && npm run lint`
Expected: 型エラー・lint エラーなし。

---

### Task 4: 統合でのメモの連結（計画・失敗の理由・文言・プレビュー・ダイアログ）

**Files:**
- Modify: `client/src/domain/nodes/nodeMerge.ts`（`note`・`noteSourceCount`・`note-too-long`・`isSameNodeMergePlan`・`applyPlanToSurvivor`）
- Modify: `client/src/domain/nodes/nodeMergeMessages.ts`（`note-too-long` の文言）
- Modify: `client/src/hooks/nodeMergePreview.ts`（`noteText`）
- Modify: `client/src/components/layout/NodeMergeDialog.tsx`（プレビューの「メモ」の行）
- Test: `client/src/domain/nodes/__tests__/nodeMerge.test.ts`（既存の 1 件を更新し、追記）
- Test: `client/src/domain/nodes/__tests__/nodeMergeMessages.test.ts`（追記）
- Test: `client/src/hooks/__tests__/nodeMergePreview.test.ts`（既存の 1 件を更新し、追記）
- Test: `client/src/hooks/__tests__/useNodeMergeDialog.test.ts`（既存のプレビューの期待値を更新）
- Test: `client/src/hooks/__tests__/useNodesSplitMerge.test.ts`（追記）
- Test: `client/src/components/layout/__tests__/NodeMergeDialog.test.tsx`（fixture を更新し、追記）

**Interfaces:**
- Consumes（Task 1）: `NODE_NOTE_MERGE_JOINER`、`NODE_NOTE_MAX_LENGTH`、`isNodeNoteWithinLimit(value: string): boolean`、`formatNodeNoteLength(length: number): string`。（Task 3）`useNodes().previewNodeNote(id: number, note: string): boolean`（テストで確認の後にメモを変えるのに使う）
- Produces（`@/domain/nodes/nodeMerge`）:
  - `NodeMergeFailureReason` に `"note-too-long"`
  - `NodeMergePlan` の成功側に `note: string | undefined`（選択中のメモを配列順に `"\n\n"` で連結。1 つも無ければ `undefined`）と `noteSourceCount: number`（メモを持つノードの件数）
  - `isSameNodeMergePlan` は `note` と `noteSourceCount` も比べる
- Produces（`@/hooks/nodeMergePreview`）: `NodeMergePreview.noteText: string | null`（`"{noteSourceCount} 件のメモを連結（{formatNodeNoteLength(note.length)} 文字）"`。メモが無ければ `null`）
- `useNodes.mergeNodes` はコードを変えない（再計画の失敗の `reason` をそのまま返すので `note-too-long` も通る。テストで固定する）

- [ ] **Step 1: 失敗するテストを書き、既存の期待値を更新する**

`client/src/domain/nodes/__tests__/nodeMerge.test.ts`:
- import に `import { NODE_NOTE_MAX_LENGTH } from "@/domain/nodes/nodeNote";` を足す。
- 既存の `"主選択を残し、吸収されるノードを配列順に並べ、ラベル・重要度・付け替える子の件数を計画する"` の期待値の `movedChildCount: 1,` の次に `note: undefined,` と `noteSourceCount: 0,` を足す。
- `describe("planNodeMerge", ...)` の中、`describe("各 reason と、検査の順序", ...)` の前に追加する:

```typescript
  describe("メモの連結", () => {
    // 親 1 の下の兄弟 2・3・4・5。2 と 4 がメモを持ち、3・5 は持たない
    const withNotes = [
      node(1, null, "親"),
      node(2, 1, "a", { note: "メモA" }),
      node(3, 1, "b"),
      node(4, 1, "c", { note: "メモC\n2行目" }),
      node(5, 1, "d"),
    ];

    it("選択中のメモを配列順に空行で連結し、メモの無いノードは飛ばす（ids の順序に依存しない）", () => {
      expect(okPlan(withNotes, [4, 3, 2], 3)).toMatchObject({ note: "メモA\n\nメモC\n2行目", noteSourceCount: 2 });
    });

    it("主選択のメモも、配列上の位置に入る", () => {
      expect(okPlan(withNotes, [2, 4], 4)).toMatchObject({ note: "メモA\n\nメモC\n2行目", noteSourceCount: 2 });
    });

    it("メモが 1 つだけなら、そのまま", () => {
      expect(okPlan(withNotes, [3, 4], 3)).toMatchObject({ note: "メモC\n2行目", noteSourceCount: 1 });
    });

    it("誰もメモを持たなければ undefined と 0", () => {
      expect(okPlan(withNotes, [3, 5], 3)).toMatchObject({ note: undefined, noteSourceCount: 0 });
    });

    it("連結がちょうど上限なら統合できる", () => {
      const nodes = [
        node(1, null, "親"),
        node(2, 1, "a", { note: "a".repeat(5000) }),
        node(3, 1, "b", { note: "b".repeat(NODE_NOTE_MAX_LENGTH - 5000 - 2) }),
      ];

      expect(okPlan(nodes, [2, 3], 2).note).toHaveLength(NODE_NOTE_MAX_LENGTH);
    });

    it("連結が上限を 1 超えると note-too-long（黙って切り詰めない）", () => {
      const nodes = [
        node(1, null, "親"),
        node(2, 1, "a", { note: "a".repeat(5000) }),
        node(3, 1, "b", { note: "b".repeat(NODE_NOTE_MAX_LENGTH - 5000 - 1) }),
      ];

      expect(planNodeMerge(nodes, [2, 3], 2, " ", visibleOf(nodes))).toEqual({ ok: false, reason: "note-too-long" });
    });

    it("メモの長さの検査は different-parents の後（親が違えば、メモが長くても different-parents）", () => {
      const nodes = [
        node(1, null, "親"),
        node(2, 1, "a", { note: "a".repeat(NODE_NOTE_MAX_LENGTH) }),
        node(3, null, "b", { note: "b".repeat(NODE_NOTE_MAX_LENGTH) }),
      ];

      expect(planNodeMerge(nodes, [2, 3], 2, " ", visibleOf(nodes))).toEqual({ ok: false, reason: "different-parents" });
    });
  });
```

- `describe("isSameNodeMergePlan", ...)` の中、`"吸収されるノードの順が違えば偽"` の前に追加する:

```typescript
  it("連結したメモ・メモの件数が違えば偽（プレビューで見せた内容が確定時に変わっていない。L-036）", () => {
    expect(isSameNodeMergePlan(base, { ...base, note: "確認の後に書いたメモ" })).toBe(false);
    expect(isSameNodeMergePlan(base, { ...base, noteSourceCount: base.noteSourceCount + 1 })).toBe(false);
  });
```

- `describe("mergeNodes", ...)` の中、`describe("イラストと高さ", ...)` の前に追加する:

```typescript
  describe("詳細メモ", () => {
    const withNotes = [
      node(1, null, "親"),
      node(2, 1, "a", { note: "メモA" }),
      node(3, 1, "b"),
      node(4, 1, "c", { note: "メモC" }),
    ];

    it("残すノードのメモは、選択中のメモを配列順に空行で連結したもの（残すノードがメモを持たなくても付く）", () => {
      const survivor = byId(merged(withNotes, [2, 3, 4], 3).nodes, 3);

      expect(survivor.note).toBe("メモA\n\nメモC");
    });

    it("残すノードだけがメモを持つときは、そのメモのまま", () => {
      const survivor = byId(merged(withNotes, [2, 3], 2).nodes, 2);

      expect(survivor.note).toBe("メモA");
    });

    it("誰もメモを持たなければ note のキーを持たない", () => {
      const plain = [node(1, null, "親"), node(2, 1, "a"), node(3, 1, "b")];

      expect("note" in byId(merged(plain, [2, 3], 2).nodes, 2)).toBe(false);
    });

    it("連結が上限を超えるときは note-too-long を返し、統合しない", () => {
      const long = [
        node(1, null, "親"),
        node(2, 1, "a", { note: "a".repeat(6000) }),
        node(3, 1, "b", { note: "b".repeat(4000) }),
      ];

      expect(mergeNodes(long, [2, 3], 2, " ", visibleOf(long), "manual")).toEqual({ ok: false, reason: "note-too-long" });
    });

    it("連結したメモは保存と読み込みで往復する", () => {
      const result = merged(withNotes, [2, 3, 4], 3);
      const parsed = parseMapDocumentJson(serializeMapDocument(createMapDocument(result.nodes, "manual")));

      expect(parsed.ok && parsed.value.nodes.find((item) => item.id === 3)?.note).toBe("メモA\n\nメモC");
    });
  });
```

`client/src/domain/nodes/__tests__/nodeMergeMessages.test.ts` の `cases` の最後に足す:

```typescript
    ["note-too-long", "メモをまとめると文字数の上限（10,000 文字）を超えるため、統合できません。"],
```

`client/src/hooks/__tests__/nodeMergePreview.test.ts`:
- `"統合後のラベル・重要度の表示・付け替える子の件数・消えるノードのラベルを配列順にまとめる"` の期待値の `hiddenAbsorbedCount: 0,` の次に `noteText: null,` を足す。
- `describe("buildNodeMergePreview", ...)` の末尾に追加する:

```typescript
  describe("メモの連結", () => {
    it("メモのあるノードが 1 つ以上あれば、件数と連結後の文字数を示す（本文は出さない）", () => {
      const nodes = [node(1, "a", { note: "メモ1" }), node(2, "b"), node(3, "c", { note: "メモ3" })];

      // "メモ1" + "\n\n" + "メモ3" = 3 + 2 + 3 = 8
      expect(buildNodeMergePreview(nodes, okPlan(nodes, [1, 2, 3], 1))?.noteText).toBe("2 件のメモを連結（8 文字）");
    });

    it("文字数は 3 桁区切りで示す", () => {
      const nodes = [node(1, "a", { note: "a".repeat(10000) }), node(2, "b")];

      expect(buildNodeMergePreview(nodes, okPlan(nodes, [1, 2], 1))?.noteText).toBe("1 件のメモを連結（10,000 文字）");
    });

    it("メモが 1 つも無ければ null（行を出さない）", () => {
      const nodes = [node(1, "a"), node(2, "b")];

      expect(buildNodeMergePreview(nodes, okPlan(nodes, [1, 2], 1))?.noteText).toBeNull();
    });
  });

  it("note-too-long の計画はプレビューを作らず、状態文言は失敗の文言", () => {
    const plan: NodeMergePlan = { ok: false, reason: "note-too-long" };

    expect(buildNodeMergePreview([], plan)).toBeNull();
    expect(describeNodeMergeStatus(false, plan)).toBe("メモをまとめると文字数の上限（10,000 文字）を超えるため、統合できません。");
  });
```

`client/src/hooks/__tests__/useNodeMergeDialog.test.ts` の、開いた直後のプレビューの期待値（`expect(view.result.current.preview).toEqual({...})`）の `hiddenAbsorbedCount: 0,` の次に `noteText: null,` を足す。

`client/src/hooks/__tests__/useNodesSplitMerge.test.ts` の `describe("useNodes の mergeNodes", ...)` の中、`describe("失敗では何も変えず、選択も履歴も変えない", ...)` の中、最後の `it` の後に追加する:

```typescript
    it("連結したメモが上限を超えるときは note-too-long で、何も変えない", () => {
      const long: NodeMapState = {
        layoutMode: "manual",
        nodes: mergeMap().nodes.map((item) => {
          if (item.id === 2) return { ...item, note: "a".repeat(6000) };
          if (item.id === 3) return { ...item, note: "b".repeat(4000) };
          return item;
        }),
      };
      const { result } = renderNodes(long);
      const before = result.current;

      const outcome = merge(() => result.current, [2, 3], 3);

      expect(outcome).toEqual({ ok: false, reason: "note-too-long" });
      expect(result.current.nodes).toBe(before.nodes);
      expect(result.current.canUndo).toBe(false);
    });

    it("確認の後にメモが変わったら plan-changed（連結後のメモが警告なしに変わらない）", () => {
      const { result } = renderNodes(mergeMap());
      const shown = planNodeMerge(result.current.nodes, [2, 3], 3, " ", ALL);
      act(() => { result.current.previewNodeNote(2, "確認の後に書いたメモ"); });
      const before = result.current;

      let outcome!: MergeNodesResult;
      act(() => { outcome = result.current.mergeNodes([2, 3], 3, " ", ALL, shown); });

      expect(outcome).toEqual({ ok: false, reason: "plan-changed" });
      expect(result.current.nodes).toBe(before.nodes);
    });
```

`client/src/components/layout/__tests__/NodeMergeDialog.test.tsx`:
- `preview()` の fixture の `hiddenAbsorbedCount: 0,` の次に `noteText: null,` を足す。
- `describe("プレビュー", ...)` の中、最初の `it` の後に追加する:

```typescript
    it("メモを連結するときは「メモ」の行に件数と文字数を出す。見出しは縮まず、値は高さに上限がある", () => {
      renderDialog({ preview: preview({ noteText: "2 件のメモを連結（8 文字）" }) });

      const term = screen.getByText("メモ");
      expect(term.tagName).toBe("DT");
      expect(term).toHaveClass("shrink-0");
      expect(term.nextElementSibling).toHaveTextContent("2 件のメモを連結（8 文字）");
      expect(term.nextElementSibling).toHaveClass("max-h-40", "overflow-y-auto");
    });

    it("メモが無いときは「メモ」の行を出さない", () => {
      renderDialog({ preview: preview({ noteText: null }) });

      expect(screen.queryByText("メモ")).toBeNull();
    });
```

- [ ] **Step 2: RED を確認する**

Run: `cd client && npx jest src/domain/nodes/__tests__/nodeMerge.test.ts src/domain/nodes/__tests__/nodeMergeMessages.test.ts src/hooks/__tests__/nodeMergePreview.test.ts src/hooks/__tests__/useNodeMergeDialog.test.ts src/hooks/__tests__/useNodesSplitMerge.test.ts src/components/layout/__tests__/NodeMergeDialog.test.tsx`
Expected: FAIL（計画に `note`・`noteSourceCount` が無い、`note-too-long` が無い、プレビューに `noteText` が無い、ダイアログに「メモ」の行が無い）

- [ ] **Step 3: 実装する**

`client/src/domain/nodes/nodeMerge.ts`:
- import に `import { NODE_NOTE_MERGE_JOINER, isNodeNoteWithinLimit } from "@/domain/nodes/nodeNote";` を足す（`nodeLayoutForest` の import の次）。
- `NodeMergeFailureReason` の `| "placement-failed"` の次に足す:

```typescript
  // 選択中のメモを連結すると上限（NODE_NOTE_MAX_LENGTH）を超える。黙って切り詰めない
  | "note-too-long"
```

- `NodeMergePlan` の成功側の `movedChildCount: number;` の次に足す:

```typescript
    // 選択中のノードのメモを配列順に空行（NODE_NOTE_MERGE_JOINER）で連結したもの。メモの無いノードは飛ばし、
    // 1 つも無ければ undefined
    note: string | undefined;
    // メモを持つノードの件数（プレビューで見せる）
    noteSourceCount: number;
```

- `planNodeMerge` の `const illustrationCount = ...;` の次に足す:

```typescript
  const notes = selected.flatMap((node) => (node.note === undefined ? [] : [node.note]));
  const note = notes.length === 0 ? undefined : notes.join(NODE_NOTE_MERGE_JOINER);
  // 検査の順の最後（different-parents の後）
  if (note !== undefined && !isNodeNoteWithinLimit(note)) return failed("note-too-long");
```

- `planNodeMerge` の戻り値の `movedChildCount: ...,` の次に `note,` と `noteSourceCount: notes.length,` を足す。
- `isSameNodeMergePlan` の上のコメントを次にする:

```typescript
// 確定時の再計画とプレビューの計画が同じか。プレビューで見せた内容（残すノード・吸収されるノードの順・ラベル・重要度・
// イラストの扱いと引き継ぎ元・失われるイラストの件数・付け替える子の件数・連結したメモとその件数）で比べる（L-036）。
// 引き継ぐイラスト本体は illustrationFrom と引き継ぎ元で決まるので比べない。失敗した計画は同じとみなさない
```

- `isSameNodeMergePlan` の `&& a.movedChildCount === b.movedChildCount` の次に `&& a.note === b.note` と `&& a.noteSourceCount === b.noteSourceCount` を足す。
- `applyPlanToSurvivor` を次にする（コメントの見直しの指示は残す）:

```typescript
// 残すノードの属性を計画どおりに更新する。位置と大きさは変えない（イラストを引き継ぐときだけ、
// attachIllustration と同じ規則で高さをイラスト付きの高さにする）。メモは計画の連結結果で置き換え
// （残すノードのメモも連結に含まれるので失われない）、連結結果が無ければ note のキーを持たせない。
// Node に属性を足したときは、ここで残すノードの値を残すか、吸収されるノードの値を引き継ぐかを決める
// （何もしないと、吸収されるノードの値は警告なしに捨てられる）。計画・プレビュー・isSameNodeMergePlan も合わせて見直す
function applyPlanToSurvivor(survivor: Node, plan: Extract<NodeMergePlan, { ok: true }>): Node {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- 分割代入で元の note を除外するため
  const { note: _previousNote, ...rest } = survivor;
  const updated: Node = {
    ...rest,
    label: plan.label,
    importance: plan.importance,
    ...(plan.note === undefined ? {} : { note: plan.note }),
  };
  if (plan.illustrationFrom !== "absorbed" || plan.illustration === undefined) return updated;
  return { ...updated, illustration: plan.illustration, height: ILLUSTRATED_NODE_HEIGHT };
}
```

`client/src/domain/nodes/nodeMergeMessages.ts` の `case "placement-failed":` の `return` の次（`default` の前）に足す:

```typescript
    case "note-too-long":
      return { kind: "error", message: "メモをまとめると文字数の上限（10,000 文字）を超えるため、統合できません。" };
```

`client/src/hooks/nodeMergePreview.ts`:
- import に `import { formatNodeNoteLength } from "@/domain/nodes/nodeNote";` を足す。
- `NodeMergePreview` の `hiddenAbsorbedCount: number;` の次に足す:

```typescript
  // メモの連結の説明（「N 件のメモを連結（M 文字）」。本文は長くなるため出さない）。メモが無ければ null
  noteText: string | null;
```

- `describeIllustration` の次に足す:

```typescript
function describeNote(plan: Extract<NodeMergePlan, { ok: true }>): string | null {
  if (plan.note === undefined) return null;
  return `${plan.noteSourceCount} 件のメモを連結（${formatNodeNoteLength(plan.note.length)} 文字）`;
}
```

- `buildNodeMergePreview` の戻り値の `hiddenAbsorbedCount: ...,` の次に `noteText: describeNote(plan),` を足す。

`client/src/components/layout/NodeMergeDialog.tsx` の `<dl>` の中、「イラスト」の行（`<dt ...>イラスト</dt>` を含む `div`）の次に足す:

```tsx
              {preview.noteText !== null && (
                <div className="flex gap-2">
                  <dt className="shrink-0 font-medium">メモ</dt>
                  <dd className={boundedLabelClassName}>{preview.noteText}</dd>
                </div>
              )}
```

- [ ] **Step 4: GREEN を確認する**

Run: `cd client && npx jest src/domain/nodes src/hooks/__tests__/nodeMergePreview.test.ts src/hooks/__tests__/useNodeMergeDialog.test.ts src/hooks/__tests__/useNodesSplitMerge.test.ts src/components/layout/__tests__/NodeMergeDialog.test.tsx src/app/__tests__/pageNodeMerge.test.tsx`
Expected: PASS（`pageNodeMerge.test.tsx` は既存のまま通る。メモの無い統合ではプレビューに「メモ」の行が出ない）

- [ ] **Step 5: このタスクの範囲を検証する**

Run: `cd client && npm run typecheck && npm run lint`
Expected: 型エラー・lint エラーなし（`formatNodeMergeFailureNotice` の `never` による網羅性の検査も通る）。

---

### Task 5: テキスト欄の下書き・途中反映・確定のフック（`useNodeNoteEditing`）

**Files:**
- Create: `client/src/hooks/useNodeNoteEditing.ts`
- Test: `client/src/hooks/__tests__/useNodeNoteEditing.test.ts`（新規）

**Interfaces:**
- Consumes（Task 1）: `NODE_NOTE_MAX_LENGTH`。（既存）`MapHistoryGroupLease`（`@/domain/history/mapHistory`）、テスト用の `createMapHistoryLeaseSpy()`（`@/testing/createTestMapHistoryLease`。`{ lease: { isActive: jest.Mock; finish: jest.Mock }, onBeginNodeMove: jest.Mock<MapHistoryGroupLease>, expire: () => void }`）
- Produces（`@/hooks/useNodeNoteEditing`）:
  - `NODE_NOTE_PREVIEW_DELAY_MS = 300`、`NODE_NOTE_PREVIEW_MAX_WAIT_MS = 2000`
  - `type UseNodeNoteEditingOptions = { nodeId: number; note: string | undefined; previewNote: (id: number, note: string) => boolean; beginGroup: () => MapHistoryGroupLease }`
  - `type NodeNoteEditing = { value: string; length: number; isAtLimit: boolean; onFocus: () => void; onChange: (value: string) => void; onBlur: () => void; onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void; onCompositionStart: () => void; onCompositionEnd: () => void }`（`KeyboardEvent` は `react` の型）
  - `useNodeNoteEditing(options: UseNodeNoteEditingOptions): NodeNoteEditing`

- [ ] **Step 1: 失敗するテストを書く**

`client/src/hooks/__tests__/useNodeNoteEditing.test.ts`:

```typescript
import { act, renderHook } from "@testing-library/react";
import type { KeyboardEvent } from "react";
import { NODE_NOTE_MAX_LENGTH } from "@/domain/nodes/nodeNote";
import {
  NODE_NOTE_PREVIEW_DELAY_MS,
  NODE_NOTE_PREVIEW_MAX_WAIT_MS,
  useNodeNoteEditing,
} from "@/hooks/useNodeNoteEditing";
import { createMapHistoryLeaseSpy } from "@/testing/createTestMapHistoryLease";

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

function setup(note: string | undefined = undefined) {
  const previewNote = jest.fn<boolean, [number, string]>(() => true);
  const spy = createMapHistoryLeaseSpy();
  const view = renderHook(
    (props: { note: string | undefined }) => useNodeNoteEditing({
      nodeId: 7,
      note: props.note,
      previewNote,
      beginGroup: spy.onBeginNodeMove,
    }),
    { initialProps: { note } },
  );
  return { ...view, previewNote, spy };
}

function advance(ms: number) {
  act(() => { jest.advanceTimersByTime(ms); });
}

function keyEvent(key: string, options: { isComposing?: boolean; keyCode?: number } = {}) {
  const blur = jest.fn();
  const event = {
    key,
    keyCode: options.keyCode ?? 0,
    nativeEvent: { isComposing: options.isComposing ?? false },
    currentTarget: { blur },
  } as unknown as KeyboardEvent<HTMLTextAreaElement>;
  return { event, blur };
}

describe("useNodeNoteEditing", () => {
  it("定数は 300ms と 2 秒", () => {
    expect(NODE_NOTE_PREVIEW_DELAY_MS).toBe(300);
    expect(NODE_NOTE_PREVIEW_MAX_WAIT_MS).toBe(2000);
  });

  describe("表示する値", () => {
    it("下書きが無い間は現在のメモ（無ければ空文字）を出し、文字数は length", () => {
      const { result, rerender } = setup("abc");
      expect(result.current).toMatchObject({ value: "abc", length: 3, isAtLimit: false });

      rerender({ note: undefined });
      expect(result.current).toMatchObject({ value: "", length: 0 });
    });

    it("入力中は下書きを出す", () => {
      const { result } = setup("元");
      act(() => { result.current.onFocus(); result.current.onChange("下書き"); });

      expect(result.current.value).toBe("下書き");
    });

    it("絵文字は 2 文字分。上限ちょうどで isAtLimit が真、1 少なければ偽", () => {
      const { result } = setup();
      act(() => { result.current.onFocus(); result.current.onChange("😀"); });
      expect(result.current.length).toBe(2);

      act(() => { result.current.onChange("a".repeat(NODE_NOTE_MAX_LENGTH - 1)); });
      expect(result.current.isAtLimit).toBe(false);
      act(() => { result.current.onChange("a".repeat(NODE_NOTE_MAX_LENGTH)); });
      expect(result.current.isAtLimit).toBe(true);
    });
  });

  describe("途中反映（デバウンス）", () => {
    it("フォーカスで履歴グループを 1 回始め、入力が 300ms 止まったら反映する", () => {
      const { result, previewNote, spy } = setup();
      act(() => { result.current.onFocus(); });
      expect(spy.onBeginNodeMove).toHaveBeenCalledTimes(1);

      act(() => { result.current.onChange("abc"); });
      advance(299);
      expect(previewNote).not.toHaveBeenCalled();
      advance(1);
      expect(previewNote).toHaveBeenCalledTimes(1);
      expect(previewNote).toHaveBeenLastCalledWith(7, "abc");
      expect(spy.lease.finish).not.toHaveBeenCalled();
    });

    it("入力が続く間はタイマーを張り直し、最後の入力から 300ms 後に最新の下書きで 1 回だけ反映する", () => {
      const { result, previewNote } = setup();
      act(() => { result.current.onFocus(); result.current.onChange("a"); });
      advance(200);
      act(() => { result.current.onChange("ab"); });
      advance(200);
      expect(previewNote).not.toHaveBeenCalled();
      advance(100);
      expect(previewNote).toHaveBeenCalledTimes(1);
      expect(previewNote).toHaveBeenLastCalledWith(7, "ab");
    });

    it("入力が続いても、直前の反映の後の最初の入力から 2 秒を超えて先送りしない（L-399）", () => {
      const { result, previewNote } = setup();
      act(() => { result.current.onFocus(); });
      // 0, 250, ..., 1500ms に入力する（どの間隔も 300ms 未満）
      for (let index = 0; index < 7; index += 1) {
        act(() => { result.current.onChange(`v${index}`); });
        advance(250);
      }
      // 1750ms の入力。打ち切りが無ければ 2050ms まで先送りされる
      act(() => { result.current.onChange("v7"); });
      advance(249);
      expect(previewNote).not.toHaveBeenCalled();
      advance(1);
      expect(previewNote).toHaveBeenCalledTimes(1);
      expect(previewNote).toHaveBeenLastCalledWith(7, "v7");

      // 反映の後は打ち切りの起点を新しくし、次の入力は 300ms の待ちに戻る
      act(() => { result.current.onChange("v8"); });
      advance(299);
      expect(previewNote).toHaveBeenCalledTimes(1);
      advance(1);
      expect(previewNote).toHaveBeenLastCalledWith(7, "v8");
    });
  });

  describe("blur", () => {
    it("残りの下書きをすぐ反映してグループを閉じ、以後のタイマーでは反映しない（二重確定しない）", () => {
      const { result, previewNote, spy, rerender } = setup("元");
      act(() => { result.current.onFocus(); result.current.onChange("確定"); });

      act(() => { result.current.onBlur(); });
      expect(previewNote).toHaveBeenCalledTimes(1);
      expect(previewNote).toHaveBeenLastCalledWith(7, "確定");
      expect(spy.lease.finish).toHaveBeenCalledTimes(1);

      advance(1000);
      expect(previewNote).toHaveBeenCalledTimes(1);
      // 下書きを捨て、現在のメモ（反映後の値）を出す
      rerender({ note: "確定" });
      expect(result.current.value).toBe("確定");
    });

    it("入力が無ければ反映せず、グループだけを閉じる", () => {
      const { result, previewNote, spy } = setup("元");
      act(() => { result.current.onFocus(); });

      act(() => { result.current.onBlur(); });

      expect(previewNote).not.toHaveBeenCalled();
      expect(spy.lease.finish).toHaveBeenCalledTimes(1);
    });

    it("反映済みの後の blur では、同じ下書きをもう一度反映するだけで、グループは 1 回だけ閉じる", () => {
      const { result, previewNote, spy } = setup();
      act(() => { result.current.onFocus(); result.current.onChange("abc"); });
      advance(300);

      act(() => { result.current.onBlur(); });

      expect(previewNote.mock.calls).toEqual([[7, "abc"], [7, "abc"]]);
      expect(spy.lease.finish).toHaveBeenCalledTimes(1);
    });
  });

  describe("Escape", () => {
    it("フォーカスを入れた時点の内容へ戻して欄から出る。その後の blur では何も反映しない（L-473）", () => {
      const { result, previewNote, spy, rerender } = setup("元のメモ");
      act(() => { result.current.onFocus(); result.current.onChange("書き換え"); });
      advance(300);
      rerender({ note: "書き換え" });
      const { event, blur } = keyEvent("Escape");

      act(() => { result.current.onKeyDown(event); });
      expect(previewNote).toHaveBeenLastCalledWith(7, "元のメモ");
      expect(spy.lease.finish).toHaveBeenCalledTimes(1);
      expect(blur).toHaveBeenCalledTimes(1);

      act(() => { result.current.onBlur(); });
      advance(1000);
      expect(previewNote).toHaveBeenCalledTimes(2);
      expect(spy.lease.finish).toHaveBeenCalledTimes(1);
    });

    it("メモが無かったノードでは、空文字へ戻す", () => {
      const { result, previewNote } = setup(undefined);
      act(() => { result.current.onFocus(); result.current.onChange("書いた"); });

      act(() => { result.current.onKeyDown(keyEvent("Escape").event); });

      expect(previewNote).toHaveBeenLastCalledWith(7, "");
    });

    it("保留中のタイマーを止める", () => {
      const { result, previewNote } = setup("元");
      act(() => { result.current.onFocus(); result.current.onChange("途中"); });

      act(() => { result.current.onKeyDown(keyEvent("Escape").event); });
      advance(1000);

      expect(previewNote.mock.calls).toEqual([[7, "元"]]);
    });

    it.each([
      ["compositionstart の後", { composing: true, event: keyEvent("Escape") }],
      ["isComposing が真", { composing: false, event: keyEvent("Escape", { isComposing: true }) }],
      ["keyCode 229", { composing: false, event: keyEvent("Escape", { keyCode: 229 }) }],
    ])("IME 変換中（%s）の Escape は取り消さない", (_name, { composing, event }) => {
      const { result, previewNote, spy } = setup("元");
      act(() => { result.current.onFocus(); });
      if (composing) act(() => { result.current.onCompositionStart(); });
      act(() => { result.current.onChange("へんかん"); });

      act(() => { result.current.onKeyDown(event.event); });

      expect(previewNote).not.toHaveBeenCalled();
      expect(spy.lease.finish).not.toHaveBeenCalled();
      expect(event.blur).not.toHaveBeenCalled();
      expect(result.current.value).toBe("へんかん");
    });

    it("Escape 以外のキーでは何もしない", () => {
      const { result, previewNote } = setup("元");
      act(() => { result.current.onFocus(); });
      const { event, blur } = keyEvent("Enter");

      act(() => { result.current.onKeyDown(event); });

      expect(previewNote).not.toHaveBeenCalled();
      expect(blur).not.toHaveBeenCalled();
    });
  });

  describe("IME（L-474）", () => {
    it("変換中は途中反映のタイマーを張らず、compositionend の 300ms 後に反映する", () => {
      const { result, previewNote } = setup();
      act(() => { result.current.onFocus(); result.current.onCompositionStart(); });
      act(() => { result.current.onChange("にほん"); });
      act(() => { result.current.onChange("日本"); });
      advance(3000);
      expect(previewNote).not.toHaveBeenCalled();
      expect(result.current.value).toBe("日本");

      act(() => { result.current.onCompositionEnd(); });
      advance(299);
      expect(previewNote).not.toHaveBeenCalled();
      advance(1);
      expect(previewNote).toHaveBeenLastCalledWith(7, "日本");
    });

    it("変換を始めたら、変換前の入力で張ったタイマーを止める（変換中の文字をマップへ入れない）", () => {
      const { result, previewNote } = setup();
      act(() => { result.current.onFocus(); result.current.onChange("a"); });
      act(() => { result.current.onCompositionStart(); result.current.onChange("aに"); });
      advance(1000);

      expect(previewNote).not.toHaveBeenCalled();
    });
  });

  describe("アンマウント", () => {
    it("blur を起こさずに外れても（キャンバスで別のノードを選んだ）、有効なグループの下書きを反映してから閉じる", () => {
      const { result, previewNote, spy, unmount } = setup("元");
      act(() => { result.current.onFocus(); result.current.onChange("下書き"); });

      unmount();

      expect(previewNote).toHaveBeenCalledTimes(1);
      expect(previewNote).toHaveBeenLastCalledWith(7, "下書き");
      expect(spy.lease.finish).toHaveBeenCalledTimes(1);
      advance(1000);
      expect(previewNote).toHaveBeenCalledTimes(1);
    });

    it("文書の入れ替えでグループが失効していれば、古い下書きを書かない（L-588）", () => {
      const { result, previewNote, spy, unmount } = setup("元");
      act(() => { result.current.onFocus(); result.current.onChange("古い下書き"); });
      spy.expire();

      unmount();
      advance(1000);

      expect(previewNote).not.toHaveBeenCalled();
    });

    it("アンマウントの後に blur が届いても、下書きを書かない（L-473・L-588）", () => {
      const { result, previewNote, spy, unmount } = setup("元");
      act(() => { result.current.onFocus(); result.current.onChange("古い下書き"); });
      const { onBlur } = result.current;
      spy.expire();

      unmount();
      act(() => onBlur());
      advance(3000);

      expect(previewNote).not.toHaveBeenCalled();
    });

    it("有効なグループのアンマウントの後に blur が届いても、二重に反映しない（L-473）", () => {
      const { result, previewNote, unmount } = setup("元");
      act(() => { result.current.onFocus(); result.current.onChange("下書き"); });
      const { onBlur } = result.current;

      unmount();
      act(() => onBlur());
      advance(3000);

      expect(previewNote).toHaveBeenCalledTimes(1);
      expect(previewNote).toHaveBeenLastCalledWith(7, "下書き");
    });

    it("フォーカスしていなければ何もしない", () => {
      const { previewNote, spy, unmount } = setup("元");

      unmount();

      expect(previewNote).not.toHaveBeenCalled();
      expect(spy.lease.finish).not.toHaveBeenCalled();
    });

    it("blur の後のアンマウントでは、二重に反映しない", () => {
      const { result, previewNote, spy, unmount } = setup("元");
      act(() => { result.current.onFocus(); result.current.onChange("確定"); result.current.onBlur(); });

      unmount();

      expect(previewNote).toHaveBeenCalledTimes(1);
      expect(spy.lease.finish).toHaveBeenCalledTimes(1);
    });
  });
});
```

- [ ] **Step 2: RED を確認する**

Run: `cd client && npx jest src/hooks/__tests__/useNodeNoteEditing.test.ts`
Expected: FAIL（`Cannot find module '@/hooks/useNodeNoteEditing'`）

- [ ] **Step 3: 実装する**

`client/src/hooks/useNodeNoteEditing.ts`:

```typescript
"use client";

import { useCallback, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import type { MapHistoryGroupLease } from "@/domain/history/mapHistory";
import { NODE_NOTE_MAX_LENGTH } from "@/domain/nodes/nodeNote";

// 入力が止まってからマップへ反映するまでの時間
export const NODE_NOTE_PREVIEW_DELAY_MS = 300;
// 入力が続いても、直前の反映（反映がまだ無ければフォーカス）の後の最初の入力からこの時間を超えて先送りしない（L-399）
export const NODE_NOTE_PREVIEW_MAX_WAIT_MS = 2000;
// IME変換中のkeydownは、isComposingが立たないブラウザでもkeyCode 229になる
const IME_PROCESS_KEY_CODE = 229;

export type UseNodeNoteEditingOptions = {
  nodeId: number;
  note: string | undefined;
  // useNodes.previewNodeNote。グループ中は履歴に積まず、グループ外では1操作として確定する
  previewNote: (id: number, note: string) => boolean;
  // useNodes.beginMoveHistory
  beginGroup: () => MapHistoryGroupLease;
};

export type NodeNoteEditing = {
  value: string;
  length: number;
  isAtLimit: boolean;
  onFocus: () => void;
  onChange: (value: string) => void;
  onBlur: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onCompositionStart: () => void;
  onCompositionEnd: () => void;
};

// 詳細メモのテキスト欄の下書き・途中反映・確定を受け持つ。フォーカスで履歴グループを始め、入力が止まるたびに
// グループの中で反映し、blur で残りを反映してグループを閉じる（実変更があるときだけ1回の履歴になる）。
// 対象の ID と documentRevision が変わったら、呼び出し側（NodeNoteEditor の key）が作り直す
export function useNodeNoteEditing({ nodeId, note, previewNote, beginGroup }: UseNodeNoteEditingOptions): NodeNoteEditing {
  const [draft, setDraft] = useState<string | null>(null);
  // 同じイベントの中の連続操作でも最新を読むため、下書きは ref を正として state へ同じ値を渡す
  const draftRef = useRef<string | null>(null);
  const leaseRef = useRef<MapHistoryGroupLease | null>(null);
  // フォーカスを入れた時点のメモ（Escape で戻す先）
  const baseNoteRef = useRef("");
  const timerRef = useRef<number | null>(null);
  // 未反映の入力が始まった時刻（直前の反映・フォーカスの後の最初の入力）。反映したら null に戻す
  const pendingSinceRef = useRef<number | null>(null);
  const composingRef = useRef(false);
  // タイマーとアンマウントの反映が、最新の ID と更新関数を使うように、コミット後の値を同期する
  const latestRef = useRef({ nodeId, previewNote });
  useLayoutEffect(() => {
    latestRef.current = { nodeId, previewNote };
  });

  const clearTimer = useCallback(() => {
    if (timerRef.current === null) return;
    window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const replaceDraft = useCallback((next: string | null) => {
    draftRef.current = next;
    setDraft(next);
  }, []);

  // 下書きがあればマップへ反映する。履歴に積むかは previewNote（グループの有無）が決める
  const flush = useCallback(() => {
    clearTimer();
    pendingSinceRef.current = null;
    const pending = draftRef.current;
    if (pending === null) return;
    latestRef.current.previewNote(latestRef.current.nodeId, pending);
  }, [clearTimer]);

  const schedule = useCallback(() => {
    clearTimer();
    const now = Date.now();
    if (pendingSinceRef.current === null) pendingSinceRef.current = now;
    const remaining = pendingSinceRef.current + NODE_NOTE_PREVIEW_MAX_WAIT_MS - now;
    const delay = Math.max(0, Math.min(NODE_NOTE_PREVIEW_DELAY_MS, remaining));
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      flush();
    }, delay);
  }, [clearTimer, flush]);

  const finishGroup = useCallback(() => {
    const lease = leaseRef.current;
    leaseRef.current = null;
    lease?.finish();
  }, []);

  const onFocus = useCallback(() => {
    leaseRef.current = beginGroup();
    baseNoteRef.current = note ?? "";
    pendingSinceRef.current = null;
  }, [beginGroup, note]);

  const onChange = useCallback((value: string) => {
    replaceDraft(value);
    // 変換中は途中反映のタイマーを張らない（変換前の文字をマップへ入れない。L-474）。変換の確定で張る
    if (!composingRef.current) schedule();
  }, [replaceDraft, schedule]);

  const onBlur = useCallback(() => {
    flush();
    finishGroup();
    composingRef.current = false;
    replaceDraft(null);
  }, [flush, finishGroup, replaceDraft]);

  const onKeyDown = useCallback((event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Escape") return;
    if (composingRef.current || event.nativeEvent.isComposing || event.keyCode === IME_PROCESS_KEY_CODE) return;
    clearTimer();
    pendingSinceRef.current = null;
    latestRef.current.previewNote(latestRef.current.nodeId, baseNoteRef.current);
    finishGroup();
    // 下書きを先に消すので、続く blur では何も反映しない（L-473）
    replaceDraft(null);
    event.currentTarget.blur();
  }, [clearTimer, finishGroup, replaceDraft]);

  const onCompositionStart = useCallback(() => {
    composingRef.current = true;
    clearTimer();
  }, [clearTimer]);

  const onCompositionEnd = useCallback(() => {
    composingRef.current = false;
    schedule();
  }, [schedule]);

  // blur を起こさずに外れる（キャンバスでの選択の変更）ときも、有効なグループの下書きを反映してから閉じる。
  // 文書の入れ替え（reset）ではグループが失効しているので、古い下書きを新しい文書へ書かない（L-588）
  useLayoutEffect(() => () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    // 外れた後に blur が届いても（ブラウザによっては届く）、古い下書きを書かないよう、先に下書きを消費する（L-473・L-588）
    const pending = draftRef.current;
    draftRef.current = null;
    pendingSinceRef.current = null;
    composingRef.current = false;
    const lease = leaseRef.current;
    leaseRef.current = null;
    if (lease === null) return;
    if (lease.isActive() && pending !== null) {
      latestRef.current.previewNote(latestRef.current.nodeId, pending);
    }
    lease.finish();
  }, []);

  const value = draft ?? note ?? "";
  return {
    value,
    length: value.length,
    isAtLimit: value.length >= NODE_NOTE_MAX_LENGTH,
    onFocus,
    onChange,
    onBlur,
    onKeyDown,
    onCompositionStart,
    onCompositionEnd,
  };
}
```

これらの ref はハンドラの中で `.current` へ代入しているので、`react-hooks/exhaustive-deps` はアンマウントの後始末での読み取りに警告を出さない想定。もし警告が出たら、後始末の中の読み取りを変えずに、警告の出た行へ理由のコメント付きの `// eslint-disable-next-line react-hooks/exhaustive-deps -- アンマウント時点の最新の値を読むため` を付ける（挙動は変えない）。

- [ ] **Step 4: GREEN を確認する**

Run: `cd client && npx jest src/hooks/__tests__/useNodeNoteEditing.test.ts`
Expected: PASS

- [ ] **Step 5: このタスクの範囲を検証する**

Run: `cd client && npm run typecheck && npm run lint`
Expected: 型エラー・lint エラーなし（React Compiler の lint 規則を含む）。

---

### Task 6: パネル（`NodeNoteSection`・`NodeNoteEditor`・`NodeDetailPanel`）と `MapEditor` の配線、ページ統合テスト

**Files:**
- Create: `client/src/components/layout/NodeNoteSection.tsx`
- Create: `client/src/components/layout/NodeNoteEditor.tsx`
- Create: `client/src/components/layout/NodeDetailPanel.tsx`
- Modify: `client/src/components/layout/IllustrationPanel.tsx`（外側の `aside` を `section` に）
- Modify: `client/src/components/map/MapEditor.tsx`（`sidePanel` を `NodeDetailPanel` に）
- Test: `client/src/components/layout/__tests__/NodeNoteSection.test.tsx`（新規）
- Test: `client/src/components/layout/__tests__/NodeNoteEditor.test.tsx`（新規）
- Test: `client/src/components/layout/__tests__/NodeDetailPanel.test.tsx`（新規）
- Test: `client/src/app/__tests__/pageNodeNote.test.tsx`（新規）
- Modify（既存テストの更新）: `client/src/components/layout/__tests__/IllustrationPanel.test.tsx`、`client/src/app/testing/__tests__/pageTestHelpers.test.tsx`、`client/src/app/__tests__/pageOutlineImportKeyboard.test.tsx`、`client/src/app/__tests__/pageOutlineImport.test.tsx`、`client/src/app/__tests__/page.test.tsx`、`client/src/app/__tests__/pageMapLibrarySwitch.test.tsx`、`client/src/app/__tests__/pageClipboard.test.tsx`、`client/src/components/map/__tests__/MapEditorOutline.test.tsx`

**Interfaces:**
- Consumes（Task 1）: `NODE_NOTE_MAX_LENGTH`、`formatNodeNoteLength`。（Task 3）`useNodes().previewNodeNote(id: number, note: string): boolean`、`useNodes().beginMoveHistory(): MapHistoryGroupLease`。（Task 5）`useNodeNoteEditing(options: UseNodeNoteEditingOptions): NodeNoteEditing`、`type NodeNoteEditing`。（Task 2）`ExportedNode.note?: string`、`V3SeedNode` で `note` を種に使える。（Task 4）統合のプレビューの「メモ」の行（`dt`「メモ」の次の `dd` に「N 件のメモを連結（M 文字）」）
- Produces:
  - `NodeNoteSection({ targetLabel: string | null; selectionCount: number; editing: NodeNoteEditing | null })`（`@/components/layout/NodeNoteSection`）
  - `NodeNoteEditor({ node: Pick<Node, "id" | "label" | "note">; selectionCount: number; onPreviewNote: (id: number, note: string) => boolean; onBeginNoteEdit: () => MapHistoryGroupLease })`（`@/components/layout/NodeNoteEditor`）
  - `NodeDetailPanel({ selectedNode: Pick<Node, "id" | "label" | "note" | "illustration"> | null; selectionCount: number; documentRevision: number; onPreviewNote; onBeginNoteEdit; generation: IllustrationGenerationState; onGenerate: (nodeId: number) => void; onAttach: (nodeId: number, dataUrl: string) => void; onRemove: (nodeId: number) => void })`（`@/components/layout/NodeDetailPanel`）
  - 画面: `<aside aria-label="ノードの詳細">` の中に、見出し「詳細メモ」の `section` と `<section aria-label="イラスト">`（role は `region`）

- [ ] **Step 1: 失敗するテストを書く（部品）**

`client/src/components/layout/__tests__/NodeNoteSection.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { FALLBACK_NODE_LABEL } from "@/config/nodeLabel";
import { NodeNoteSection } from "@/components/layout/NodeNoteSection";
import type { NodeNoteEditing } from "@/hooks/useNodeNoteEditing";

function editing(overrides: Partial<NodeNoteEditing> = {}): NodeNoteEditing {
  return {
    value: "メモ",
    length: 2,
    isAtLimit: false,
    onFocus: jest.fn(),
    onChange: jest.fn(),
    onBlur: jest.fn(),
    onKeyDown: jest.fn(),
    onCompositionStart: jest.fn(),
    onCompositionEnd: jest.fn(),
    ...overrides,
  };
}

function box(): HTMLTextAreaElement {
  return screen.getByRole("textbox", { name: "詳細メモ" }) as HTMLTextAreaElement;
}

describe("NodeNoteSection", () => {
  it("未選択のときは案内を出し、テキスト欄を無効にして 0 文字と表示する", () => {
    render(<NodeNoteSection targetLabel={null} selectionCount={0} editing={null} />);

    expect(screen.getByRole("heading", { name: "詳細メモ" })).toBeInTheDocument();
    expect(screen.getByText("ノードを選択してください")).toBeVisible();
    expect(box()).toBeDisabled();
    expect(box()).toHaveValue("");
    expect(screen.getByText("0 / 10,000 文字")).toBeInTheDocument();
  });

  it("選択があるときは対象のラベル（title つき）と、ラベルの付いたテキスト欄を出す", () => {
    render(<NodeNoteSection targetLabel="企画の背景" selectionCount={1} editing={editing({ value: "背景の説明", length: 5 })} />);

    expect(screen.getByText("企画の背景")).toHaveAttribute("title", "企画の背景");
    expect(screen.queryByText("ノードを選択してください")).toBeNull();
    expect(box()).toBeEnabled();
    expect(box()).toHaveValue("背景の説明");
    expect(box()).toHaveAttribute("maxLength", "10000");
    expect(box()).toHaveAttribute("rows", "8");
    expect(box()).toHaveAttribute("placeholder", "このノードの詳細な説明を書けます");
    expect(box()).toHaveClass("resize-y");
    expect(screen.getByText("5 / 10,000 文字")).toBeInTheDocument();
  });

  it("ラベルが空のノードでは共通のフォールバックラベルを出し、title は付けない", () => {
    render(<NodeNoteSection targetLabel="" selectionCount={1} editing={editing()} />);

    expect(screen.getByText(FALLBACK_NODE_LABEL)).not.toHaveAttribute("title");
  });

  it("選択が 2 件以上のときだけ、主選択のメモを編集すると示す", () => {
    const { rerender } = render(<NodeNoteSection targetLabel="a" selectionCount={1} editing={editing()} />);
    expect(screen.queryByText(/件選択中/)).toBeNull();

    rerender(<NodeNoteSection targetLabel="a" selectionCount={3} editing={editing()} />);
    expect(screen.getByText("3 件選択中。主選択のノードのメモを編集します")).toBeInTheDocument();
  });

  it("上限に達したら、常設の status 領域に「上限に達しました」を出し、文字数の表示も残す（L-160）", () => {
    const { rerender } = render(<NodeNoteSection targetLabel="a" selectionCount={1} editing={editing({ length: 9999, isAtLimit: false })} />);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("");

    rerender(<NodeNoteSection targetLabel="a" selectionCount={1} editing={editing({ length: 10000, isAtLimit: true })} />);
    expect(screen.getByRole("status")).toBe(status);
    expect(status).toHaveTextContent("上限に達しました");
    expect(screen.getByText("10,000 / 10,000 文字")).toBeInTheDocument();
  });

  it("テキスト欄のイベントをそれぞれのハンドラへ渡す", () => {
    const handlers = editing();
    render(<NodeNoteSection targetLabel="a" selectionCount={1} editing={handlers} />);

    fireEvent.focus(box());
    fireEvent.change(box(), { target: { value: "入力" } });
    fireEvent.compositionStart(box());
    fireEvent.compositionEnd(box());
    fireEvent.keyDown(box(), { key: "Escape" });
    fireEvent.blur(box());

    expect(handlers.onFocus).toHaveBeenCalledTimes(1);
    expect(handlers.onChange).toHaveBeenCalledWith("入力");
    expect(handlers.onCompositionStart).toHaveBeenCalledTimes(1);
    expect(handlers.onCompositionEnd).toHaveBeenCalledTimes(1);
    expect(handlers.onKeyDown).toHaveBeenCalledTimes(1);
    expect(handlers.onBlur).toHaveBeenCalledTimes(1);
  });
});
```

`client/src/components/layout/__tests__/NodeNoteEditor.test.tsx`（実際の DOM イベントと fake timers で、部品とフックの接続を確かめる。L-737）:

```tsx
import { act, fireEvent, render, screen } from "@testing-library/react";
import { NodeNoteEditor } from "@/components/layout/NodeNoteEditor";
import { createMapHistoryLeaseSpy } from "@/testing/createTestMapHistoryLease";

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

function setup(note?: string) {
  const onPreviewNote = jest.fn<boolean, [number, string]>(() => true);
  const spy = createMapHistoryLeaseSpy();
  const view = render(
    <NodeNoteEditor
      node={{ id: 5, label: "対象", note }}
      selectionCount={1}
      onPreviewNote={onPreviewNote}
      onBeginNoteEdit={spy.onBeginNodeMove}
    />,
  );
  const box = () => screen.getByRole("textbox", { name: "詳細メモ" }) as HTMLTextAreaElement;
  return { ...view, onPreviewNote, spy, box };
}

function advance(ms: number) {
  act(() => { jest.advanceTimersByTime(ms); });
}

describe("NodeNoteEditor", () => {
  it("フォーカスで履歴グループを始め、入力から 300ms 後に反映する", () => {
    const { box, onPreviewNote, spy } = setup();
    act(() => box().focus());
    expect(spy.onBeginNodeMove).toHaveBeenCalledTimes(1);

    fireEvent.change(box(), { target: { value: "abc" } });
    expect(box()).toHaveValue("abc");
    advance(299);
    expect(onPreviewNote).not.toHaveBeenCalled();
    advance(1);
    expect(onPreviewNote).toHaveBeenLastCalledWith(5, "abc");
  });

  it("compositionstart〜compositionend の間は反映せず、compositionend の 300ms 後に反映する", () => {
    const { box, onPreviewNote } = setup();
    act(() => box().focus());
    fireEvent.compositionStart(box());
    fireEvent.change(box(), { target: { value: "日本" } });
    advance(1000);
    expect(onPreviewNote).not.toHaveBeenCalled();

    fireEvent.compositionEnd(box());
    advance(300);
    expect(onPreviewNote).toHaveBeenLastCalledWith(5, "日本");
  });

  it("blur ですぐ反映し、グループを閉じる", () => {
    const { box, onPreviewNote, spy } = setup();
    act(() => box().focus());
    fireEvent.change(box(), { target: { value: "即時" } });

    act(() => box().blur());

    expect(onPreviewNote).toHaveBeenCalledTimes(1);
    expect(onPreviewNote).toHaveBeenLastCalledWith(5, "即時");
    expect(spy.lease.finish).toHaveBeenCalledTimes(1);
    advance(1000);
    expect(onPreviewNote).toHaveBeenCalledTimes(1);
  });

  it("Escape でフォーカスした時点のメモへ戻して欄から出る。続く blur では反映しない", () => {
    const { box, onPreviewNote, spy } = setup("元のメモ");
    act(() => box().focus());
    fireEvent.change(box(), { target: { value: "書き換え" } });
    advance(300);

    fireEvent.keyDown(box(), { key: "Escape" });

    expect(onPreviewNote.mock.calls).toEqual([[5, "書き換え"], [5, "元のメモ"]]);
    expect(document.activeElement).not.toBe(box());
    expect(spy.lease.finish).toHaveBeenCalledTimes(1);
    expect(box()).toHaveValue("元のメモ");
  });

  it("IME 変換中の Escape（keyCode 229）は取り消さない", () => {
    const { box, onPreviewNote } = setup("元のメモ");
    act(() => box().focus());
    fireEvent.change(box(), { target: { value: "へんかん" } });

    fireEvent.keyDown(box(), { key: "Escape", keyCode: 229 });

    expect(onPreviewNote).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(box());
  });

  it("blur を起こさずに外れても（アンマウント）、下書きを反映してからグループを閉じる", () => {
    const { box, onPreviewNote, spy, unmount } = setup();
    act(() => box().focus());
    fireEvent.change(box(), { target: { value: "下書き" } });

    unmount();

    expect(onPreviewNote).toHaveBeenCalledTimes(1);
    expect(onPreviewNote).toHaveBeenLastCalledWith(5, "下書き");
    expect(spy.lease.finish).toHaveBeenCalledTimes(1);
  });

  it("文書の入れ替えでグループが失効していれば、アンマウントでも反映しない（L-588）", () => {
    const { box, onPreviewNote, spy, unmount } = setup();
    act(() => box().focus());
    fireEvent.change(box(), { target: { value: "古い下書き" } });
    spy.expire();

    unmount();

    expect(onPreviewNote).not.toHaveBeenCalled();
  });
});
```

`client/src/components/layout/__tests__/NodeDetailPanel.test.tsx`:

```tsx
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { NodeDetailPanel } from "@/components/layout/NodeDetailPanel";
import { createMapHistoryLeaseSpy, createTestMapHistoryLease } from "@/testing/createTestMapHistoryLease";

type Props = ComponentProps<typeof NodeDetailPanel>;

function renderPanel(overrides: Partial<Props> = {}) {
  const props: Props = {
    selectedNode: { id: 1, label: "りんご", note: "りんごのメモ" },
    selectionCount: 1,
    documentRevision: 0,
    onPreviewNote: jest.fn(() => true),
    onBeginNoteEdit: jest.fn(() => createTestMapHistoryLease()),
    generation: { status: "idle" },
    onGenerate: jest.fn(),
    onAttach: jest.fn(),
    onRemove: jest.fn(),
    ...overrides,
  };
  return { props, ...render(<NodeDetailPanel {...props} />) };
}

function panel(): HTMLElement {
  return screen.getByRole("complementary", { name: "ノードの詳細" });
}

function box(): HTMLTextAreaElement {
  return screen.getByRole("textbox", { name: "詳細メモ" }) as HTMLTextAreaElement;
}

describe("NodeDetailPanel", () => {
  it("名前付きの補足領域で、幅 w-72・縮まない・内容が高さを超えたら縦にスクロールする", () => {
    renderPanel();

    expect(panel()).toHaveClass("w-72", "shrink-0", "min-h-0", "overflow-y-auto");
  });

  it("上に詳細メモ、下にイラストを置く", () => {
    renderPanel();

    const headings = within(panel()).getAllByRole("heading").map((heading) => heading.textContent);
    expect(headings).toEqual(["詳細メモ", "イラスト"]);
    expect(within(panel()).getByRole("region", { name: "イラスト" })).toBeInTheDocument();
  });

  it("イラストの機能は従来どおり（生成ボタンで選択中のノード ID を通知する）", async () => {
    const user = userEvent.setup();
    const { props } = renderPanel();

    await user.click(screen.getByRole("button", { name: "イラストを生成" }));

    expect(props.onGenerate).toHaveBeenCalledWith(1);
  });

  it("未選択のときはメモの欄を無効にし、メモとイラストの両方に案内を出す", () => {
    renderPanel({ selectedNode: null, selectionCount: 0 });

    expect(box()).toBeDisabled();
    expect(within(panel()).getAllByText("ノードを選択してください")).toHaveLength(2);
  });

  it("選択中のノードのメモを出し、選択件数を渡す", () => {
    renderPanel({ selectionCount: 2 });

    expect(box()).toHaveValue("りんごのメモ");
    expect(screen.getByText("2 件選択中。主選択のノードのメモを編集します")).toBeInTheDocument();
  });

  it("選択の ID が変わると作り直す。フォーカスを外さずに変わっても、前のノードの下書きを反映してから切り替える", () => {
    const spy = createMapHistoryLeaseSpy();
    const { props, rerender } = renderPanel({ onBeginNoteEdit: spy.onBeginNodeMove });
    act(() => box().focus());
    fireEvent.change(box(), { target: { value: "下書き" } });

    rerender(<NodeDetailPanel {...props} selectedNode={{ id: 2, label: "みかん" }} />);

    expect(props.onPreviewNote).toHaveBeenCalledWith(1, "下書き");
    expect(box()).toHaveValue("");
  });

  it("documentRevision が変わると作り直し、文書の入れ替え（グループの失効）では古い下書きを書かない（L-588）", () => {
    const spy = createMapHistoryLeaseSpy();
    const { props, rerender } = renderPanel({ onBeginNoteEdit: spy.onBeginNodeMove });
    act(() => box().focus());
    fireEvent.change(box(), { target: { value: "古い下書き" } });
    spy.expire();

    rerender(<NodeDetailPanel {...props} documentRevision={1} selectedNode={{ id: 1, label: "りんご", note: "新しい文書のメモ" }} />);

    expect(props.onPreviewNote).not.toHaveBeenCalled();
    expect(box()).toHaveValue("新しい文書のメモ");
  });
});
```

`client/src/components/layout/__tests__/IllustrationPanel.test.tsx` の既存のテストを更新する:
- `"補足領域として名前付きで表示し、見出しを持つ"` を次に置き換える:

```tsx
  it("名前付きの領域（section）として表示し、見出しを持つ（外側の補足領域はノードの詳細のパネルが持つ）", () => {
    render(<IllustrationPanel selectedNode={null} generation={{ status: "idle" }} onGenerate={jest.fn()} onAttach={jest.fn()} onRemove={jest.fn()} />);

    const region = screen.getByRole("region", { name: "イラスト" });
    expect(region.tagName).toBe("SECTION");
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(screen.getByRole("heading", { name: "イラスト" })).toBeInTheDocument();
  });
```

- `"固定幅で、縮まない"` を次に置き換える:

```tsx
  it("幅・縁・背景は親（NodeDetailPanel）が持ち、自身は持たない", () => {
    render(<IllustrationPanel selectedNode={null} generation={{ status: "idle" }} onGenerate={jest.fn()} onAttach={jest.fn()} onRemove={jest.fn()} />);

    const region = screen.getByRole("region", { name: "イラスト" });
    expect(region).not.toHaveClass("w-60");
    expect(region).not.toHaveClass("border-l");
  });
```

- [ ] **Step 2: RED を確認する（部品）**

Run: `cd client && npx jest src/components/layout/__tests__/NodeNoteSection.test.tsx src/components/layout/__tests__/NodeNoteEditor.test.tsx src/components/layout/__tests__/NodeDetailPanel.test.tsx src/components/layout/__tests__/IllustrationPanel.test.tsx`
Expected: 新しい 3 ファイルが `Cannot find module` で FAIL。`IllustrationPanel.test.tsx` の更新した 2 件が FAIL（まだ `aside`）。

- [ ] **Step 3: 部品を実装する**

`client/src/components/layout/NodeNoteSection.tsx`:

```tsx
import { useId } from "react";
import { getNodeDisplayLabel } from "@/domain/nodes/nodeDisplayLabel";
import { NODE_NOTE_MAX_LENGTH, formatNodeNoteLength } from "@/domain/nodes/nodeNote";
import type { NodeNoteEditing } from "@/hooks/useNodeNoteEditing";

type NodeNoteSectionProps = {
  // 対象ノードのラベル。未選択のときは null
  targetLabel: string | null;
  // 選択件数（MapEditor の importanceTargetIds の件数。アウトライン表示では主選択だけなので最大 1）
  selectionCount: number;
  // 未選択のときは null（テキスト欄を無効にする）
  editing: NodeNoteEditing | null;
};

// 詳細メモの表示だけを受け持つ（フックを呼ばない）。値とハンドラは NodeNoteEditor が渡す
export function NodeNoteSection({ targetLabel, selectionCount, editing }: NodeNoteSectionProps) {
  const headingId = useId();
  const textareaId = useId();
  const countId = useId();
  const length = editing?.length ?? 0;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h2 id={headingId} className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">詳細メモ</h2>
      {targetLabel === null ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">ノードを選択してください</p>
      ) : (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">対象ノード</span>
          <p
            className="line-clamp-3 break-words text-sm text-zinc-800 dark:text-zinc-100"
            title={targetLabel || undefined}
          >
            {getNodeDisplayLabel(targetLabel)}
          </p>
        </div>
      )}
      {selectionCount >= 2 && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {`${selectionCount} 件選択中。主選択のノードのメモを編集します`}
        </p>
      )}
      {/* 見出しと同じ文言なので、ラベルは読み上げ用にだけ置く */}
      <label htmlFor={textareaId} className="sr-only">詳細メモ</label>
      <textarea
        id={textareaId}
        rows={8}
        maxLength={NODE_NOTE_MAX_LENGTH}
        disabled={editing === null}
        placeholder="このノードの詳細な説明を書けます"
        value={editing?.value ?? ""}
        aria-describedby={countId}
        onFocus={editing?.onFocus}
        onChange={(event) => editing?.onChange(event.target.value)}
        onBlur={editing?.onBlur}
        onKeyDown={editing?.onKeyDown}
        onCompositionStart={editing?.onCompositionStart}
        onCompositionEnd={editing?.onCompositionEnd}
        className="w-full resize-y rounded-md border border-zinc-300 bg-white p-2 text-sm text-zinc-900 placeholder:text-zinc-400 disabled:cursor-not-allowed disabled:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:disabled:bg-zinc-800"
      />
      <p id={countId} className="text-xs text-zinc-500 dark:text-zinc-400">
        {`${formatNodeNoteLength(length)} / ${formatNodeNoteLength(NODE_NOTE_MAX_LENGTH)} 文字`}
      </p>
      {/* ライブリージョンは常に描画し、中身だけを替える */}
      <p role="status" className="text-xs text-amber-700 dark:text-amber-300">
        {editing?.isAtLimit === true ? "上限に達しました" : ""}
      </p>
    </section>
  );
}
```

`client/src/components/layout/NodeNoteEditor.tsx`:

```tsx
"use client";

import { NodeNoteSection } from "@/components/layout/NodeNoteSection";
import type { MapHistoryGroupLease } from "@/domain/history/mapHistory";
import { useNodeNoteEditing } from "@/hooks/useNodeNoteEditing";
import type { Node } from "@/types/node";

type NodeNoteEditorProps = {
  node: Pick<Node, "id" | "label" | "note">;
  selectionCount: number;
  onPreviewNote: (id: number, note: string) => boolean;
  onBeginNoteEdit: () => MapHistoryGroupLease;
};

// 選択中のノードの詳細メモの編集。NodeDetailPanel が対象の ID と documentRevision を key にして作り直す
// （古い下書きを別のノード・新しい文書へ引き継がない。L-588）
export function NodeNoteEditor({ node, selectionCount, onPreviewNote, onBeginNoteEdit }: NodeNoteEditorProps) {
  const editing = useNodeNoteEditing({
    nodeId: node.id,
    note: node.note,
    previewNote: onPreviewNote,
    beginGroup: onBeginNoteEdit,
  });
  return <NodeNoteSection targetLabel={node.label} selectionCount={selectionCount} editing={editing} />;
}
```

`client/src/components/layout/NodeDetailPanel.tsx`:

```tsx
import { IllustrationPanel } from "@/components/layout/IllustrationPanel";
import { NodeNoteEditor } from "@/components/layout/NodeNoteEditor";
import { NodeNoteSection } from "@/components/layout/NodeNoteSection";
import type { MapHistoryGroupLease } from "@/domain/history/mapHistory";
import type { IllustrationGenerationState } from "@/types/illustrationGeneration";
import type { Node } from "@/types/node";

type NodeDetailPanelProps = {
  selectedNode: Pick<Node, "id" | "label" | "note" | "illustration"> | null;
  selectionCount: number;
  documentRevision: number;
  onPreviewNote: (id: number, note: string) => boolean;
  onBeginNoteEdit: () => MapHistoryGroupLease;
  generation: IllustrationGenerationState;
  onGenerate: (nodeId: number) => void;
  onAttach: (nodeId: number, dataUrl: string) => void;
  onRemove: (nodeId: number) => void;
};

// 右のパネル。上に詳細メモ、下にイラストを縦に積み、内容が高さを超えたら縦にスクロールする
export function NodeDetailPanel({
  selectedNode,
  selectionCount,
  documentRevision,
  onPreviewNote,
  onBeginNoteEdit,
  generation,
  onGenerate,
  onAttach,
  onRemove,
}: NodeDetailPanelProps) {
  return (
    <aside
      aria-label="ノードの詳細"
      className="flex min-h-0 w-72 shrink-0 flex-col gap-6 overflow-y-auto border-l border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800"
    >
      {selectedNode === null ? (
        <NodeNoteSection targetLabel={null} selectionCount={selectionCount} editing={null} />
      ) : (
        <NodeNoteEditor
          key={`${selectedNode.id}:${documentRevision}`}
          node={selectedNode}
          selectionCount={selectionCount}
          onPreviewNote={onPreviewNote}
          onBeginNoteEdit={onBeginNoteEdit}
        />
      )}
      <IllustrationPanel
        selectedNode={selectedNode}
        generation={generation}
        onGenerate={onGenerate}
        onAttach={onAttach}
        onRemove={onRemove}
      />
    </aside>
  );
}
```

`client/src/components/layout/IllustrationPanel.tsx` の外側を次にする（中身は変えない）:
- 開きタグ `<aside aria-label="イラスト" className="flex w-60 shrink-0 flex-col gap-3 border-l border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800">` を `<section aria-label="イラスト" className="flex flex-col gap-3">` にする。
- 閉じタグ `</aside>` を `</section>` にする。

- [ ] **Step 4: GREEN を確認する（部品）**

Run: `cd client && npx jest src/components/layout/__tests__/NodeNoteSection.test.tsx src/components/layout/__tests__/NodeNoteEditor.test.tsx src/components/layout/__tests__/NodeDetailPanel.test.tsx src/components/layout/__tests__/IllustrationPanel.test.tsx`
Expected: PASS

- [ ] **Step 5: 失敗するページ統合テストを書く**

`client/src/app/__tests__/pageNodeNote.test.tsx`:

```tsx
import { act, fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  dialog,
  exportedMap,
  headerButton,
  renderPage,
  selectNode,
  undoButton,
  v3Json,
} from "@/app/testing/pageTestHelpers";
import {
  mockNodePointerHandlers,
  mockStageHandlers,
  pointer,
  resetMapStageTestRuntime,
} from "@/components/map/testing/mapStageTestRuntime";
import { seedMapLibrary } from "@/testing/mapLibraryTestStorage";

// Pixi・イラスト生成・ダウンロード・画像化だけを差し替え、Home から MapEditor・右パネル・
// ヘッダー・ダイアログまでは本物を通す
jest.mock("pixi.js", () => (
  jest.requireActual<typeof import("@/app/testing/pageModuleMocks")>("@/app/testing/pageModuleMocks")
    .createPagePixiModuleMock()
));

jest.mock("@/services/illustration/illustrationGeneration", () => {
  const actual = jest.requireActual("@/services/illustration/illustrationGeneration");
  return { ...actual, generateIllustrationThumbnail: jest.fn() };
});

const mockDownloadMapJson = jest.fn();
jest.mock("@/services/persistence/mapJsonDownload", () => {
  const actual = jest.requireActual("@/services/persistence/mapJsonDownload");
  return {
    ...actual,
    downloadMapJson: (json: string, mapName: string) => mockDownloadMapJson(json, mapName),
  };
});

jest.mock("@/services/imageExport/mapTextMeasurement", () => (
  jest.requireActual<typeof import("@/app/testing/pageModuleMocks")>("@/app/testing/pageModuleMocks")
    .createMapTextMeasurementModuleMock()
));

jest.mock("@/services/imageExport/mapImageDownload", () => ({
  downloadMapImage: jest.fn(),
}));

jest.mock("@/services/imageExport/mapPngRasterizer", () => ({
  rasterizeMapSvgToPng: jest.fn(),
}));

beforeEach(() => {
  resetMapStageTestRuntime();
  window.localStorage.clear();
  mockDownloadMapJson.mockReset();
});

afterEach(() => jest.restoreAllMocks());

// 1: 親（ルート）、2: りんご（メモあり）、3: リンゴ（メモあり）、4: バナナ（メモなし）。2・3・4 は 1 の子で兄弟
function seed() {
  seedMapLibrary(window.localStorage, [
    {
      id: "a",
      name: "メモテスト",
      json: v3Json([
        { id: 1, label: "プロジェクト", x: 100, y: 100 },
        { id: 2, parentId: 1, label: "りんご", x: 300, y: 100, note: "りんごのメモ" },
        { id: 3, parentId: 1, label: "リンゴ", x: 300, y: 300, note: "リンゴのメモ" },
        { id: 4, parentId: 1, label: "バナナ", x: 300, y: 500 },
      ]),
    },
  ], { currentMapId: "a" });
}

const NODE_COUNT = 4;
const APPLE = 1;
const APPLE_KANA = 2;
const BANANA = 3;

// Cmd/Ctrl を押しながらノードを押して選択へ加える（index は 0 始まり）。押したノードが主選択になる
function toggleSelectNode(index: number, nodeCount: number) {
  act(() => {
    mockNodePointerHandlers.at(index - nodeCount)?.pointerdown?.(pointer(0, 0, { ctrlKey: true }));
    mockStageHandlers.pointerup?.(pointer(0, 0));
  });
}

function noteBox(): HTMLTextAreaElement {
  // ダイアログで根が inert でも取れるよう hidden を含めて探す
  return screen.getByRole("textbox", { name: "詳細メモ", hidden: true }) as HTMLTextAreaElement;
}

function nodesOf() {
  return exportedMap(mockDownloadMapJson).nodes;
}

function nodeOf(id: number) {
  return nodesOf().find((node) => node.id === id)!;
}

async function importMap(text: string) {
  const file = new File([text], "map.json", { type: "application/json" });
  Object.defineProperty(file, "text", { value: () => Promise.resolve(text) });
  await act(async () => fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } }));
}

describe("詳細メモ", () => {
  it("メモを書き、フォーカスを外さずに別のノードを選んで戻っても、メモが残り JSON にも入る", async () => {
    seed();
    await renderPage();
    selectNode(BANANA, NODE_COUNT);
    act(() => noteBox().focus());
    fireEvent.change(noteBox(), { target: { value: "バナナの説明\n2行目" } });

    // キャンバスで別のノードを選ぶ（blur を起こさない）
    selectNode(APPLE, NODE_COUNT);
    expect(noteBox()).toHaveValue("りんごのメモ");
    selectNode(BANANA, NODE_COUNT);

    expect(noteBox()).toHaveValue("バナナの説明\n2行目");
    expect(nodeOf(4).note).toBe("バナナの説明\n2行目");
  });

  it("フォーカスしてから外すまでの入力は、1 回の Undo で戻る", async () => {
    seed();
    await renderPage();
    selectNode(BANANA, NODE_COUNT);
    expect(undoButton()).toBeDisabled();
    act(() => noteBox().focus());
    fireEvent.change(noteBox(), { target: { value: "a" } });
    fireEvent.change(noteBox(), { target: { value: "ab" } });
    fireEvent.change(noteBox(), { target: { value: "abc" } });

    // userEvent は mousedown でボタンへフォーカスを移す。blur での反映 → click の Undo という実際の順序を通す
    const user = userEvent.setup();
    await user.click(undoButton());
    expect(nodeOf(4).note).toBeUndefined();

    expect("note" in nodeOf(4)).toBe(false);
    expect(undoButton()).toBeDisabled();
  });

  it("Escape で編集を取り消し、履歴を積まない", async () => {
    seed();
    await renderPage();
    selectNode(APPLE, NODE_COUNT);
    act(() => noteBox().focus());
    fireEvent.change(noteBox(), { target: { value: "書き換え" } });

    fireEvent.keyDown(noteBox(), { key: "Escape" });

    expect(noteBox()).toHaveValue("りんごのメモ");
    expect(document.activeElement).not.toBe(noteBox());
    expect(nodeOf(2).note).toBe("りんごのメモ");
    expect(undoButton()).toBeDisabled();
  });

  it("JSON に書き出したメモは、読み込むと戻る", async () => {
    seed();
    await renderPage();
    selectNode(BANANA, NODE_COUNT);
    act(() => noteBox().focus());
    fireEvent.change(noteBox(), { target: { value: "往復するメモ" } });
    act(() => noteBox().blur());
    fireEvent.click(screen.getByRole("button", { name: "JSON書き出し" }));
    const json = mockDownloadMapJson.mock.lastCall![0] as string;
    expect(JSON.parse(json).nodes.find((node: { id: number }) => node.id === 4).note).toBe("往復するメモ");

    // 別の内容に書き換えてから、書き出した JSON を読み込む
    act(() => noteBox().focus());
    fireEvent.change(noteBox(), { target: { value: "読み込み前の変更" } });
    act(() => noteBox().blur());
    await importMap(json);
    selectNode(BANANA, NODE_COUNT);

    expect(noteBox()).toHaveValue("往復するメモ");
  });

  it("統合では、選択中のメモが配列順に空行で連結され、プレビューに件数と文字数が出る", async () => {
    seed();
    await renderPage();
    selectNode(APPLE, NODE_COUNT);
    toggleSelectNode(APPLE_KANA, NODE_COUNT);
    fireEvent.click(headerButton("ノードを統合"));

    // "りんごのメモ"（6）+ "\n\n"（2）+ "リンゴのメモ"（6）= 14
    expect(dialog().getByText("メモ").nextElementSibling).toHaveTextContent("2 件のメモを連結（14 文字）");
    fireEvent.click(dialog().getByRole("button", { name: "統合する" }));

    expect(nodeOf(3).note).toBe("りんごのメモ\n\nリンゴのメモ");
    expect(noteBox()).toHaveValue("りんごのメモ\n\nリンゴのメモ");
  });

  it("テキスト欄の中の Delete・Tab・Enter・Ctrl/Cmd+Z ではマップを動かさない（L-522）", async () => {
    seed();
    await renderPage();
    selectNode(APPLE, NODE_COUNT);
    act(() => noteBox().focus());
    fireEvent.change(noteBox(), { target: { value: "追記したメモ" } });
    act(() => noteBox().blur());
    act(() => noteBox().focus());

    for (const init of [
      { key: "Delete" },
      { key: "Backspace" },
      { key: "Tab" },
      { key: "Enter" },
      { key: "z", ctrlKey: true },
      { key: "z", metaKey: true },
      { key: "z", ctrlKey: true, shiftKey: true },
    ]) {
      fireEvent.keyDown(noteBox(), init);
    }

    const nodes = nodesOf();
    expect(nodes.map((node) => node.id)).toEqual([1, 2, 3, 4]);
    expect(nodes.find((node) => node.id === 2)?.note).toBe("追記したメモ");
    expect(noteBox()).toHaveValue("追記したメモ");
  });

  it("ダイアログを開くと、右パネルも編集画面の根ごと inert になる", async () => {
    seed();
    await renderPage();
    selectNode(APPLE, NODE_COUNT);
    toggleSelectNode(APPLE_KANA, NODE_COUNT);

    fireEvent.click(headerButton("ノードを統合"));

    const root = document.querySelector("[data-map-id]");
    expect(root).toHaveAttribute("inert");
    expect(root).toContainElement(noteBox());
  });

  it("マップ表示の複数選択では主選択のメモを編集すると示し、アウトライン表示では件数を出さない", async () => {
    seed();
    await renderPage();
    selectNode(APPLE, NODE_COUNT);
    toggleSelectNode(APPLE_KANA, NODE_COUNT);
    expect(screen.getByText("2 件選択中。主選択のノードのメモを編集します")).toBeInTheDocument();
    expect(noteBox()).toHaveValue("リンゴのメモ");

    fireEvent.click(screen.getByRole("button", { name: "アウトライン" }));

    expect(screen.queryByText(/件選択中。主選択のノードのメモを編集します/)).toBeNull();
    expect(noteBox()).toHaveValue("リンゴのメモ");
  });
});
```

- [ ] **Step 6: RED を確認する（ページ）**

Run: `cd client && npx jest src/app/__tests__/pageNodeNote.test.tsx`
Expected: FAIL（右パネルにテキスト欄「詳細メモ」が無い）

- [ ] **Step 7: `MapEditor` を配線する**

`client/src/components/map/MapEditor.tsx`:
- `import { IllustrationPanel } from "@/components/layout/IllustrationPanel";` を `import { NodeDetailPanel } from "@/components/layout/NodeDetailPanel";` に置き換える。
- `useNodes()` の分割代入の `removeIllustration,` の次に `previewNodeNote,` を足す。
- `sidePanel={(...)}` の中の `<IllustrationPanel ... />` を次に置き換える:

```tsx
            <NodeDetailPanel
              selectedNode={selectedNode}
              // アウトライン表示では主選択だけ（キャンバスで残った複数選択の件数を見せない）
              selectionCount={importanceTargetIds.length}
              documentRevision={documentRevision}
              onPreviewNote={previewNodeNote}
              onBeginNoteEdit={beginMoveHistory}
              generation={generation}
              onGenerate={generateIllustration}
              onAttach={(nodeId, dataUrl) => {
                if (attachIllustration(nodeId, dataUrl)) dismissGeneration();
              }}
              onRemove={removeIllustration}
            />
```

- [ ] **Step 8: 既存のテストの、右パネルの探し方を直す**

外側が `aside aria-label="イラスト"` から `section aria-label="イラスト"`（role `region`）に変わり、未選択の案内「ノードを選択してください」と対象のラベルがメモとイラストの 2 か所に出るため、次を直す（期待する挙動は変えない。探す範囲だけを直す）:

- `client/src/app/testing/__tests__/pageTestHelpers.test.tsx`（59 行目付近）、`client/src/app/__tests__/pageOutlineImportKeyboard.test.tsx`（84 行目付近）、`client/src/app/__tests__/pageOutlineImport.test.tsx`（106 行目付近）の `selectedLabel()` の `screen.getByRole("complementary", { name: "イラスト" })` を `screen.getByRole("region", { name: "イラスト" })` にする。
- `client/src/app/__tests__/pageMapLibrarySwitch.test.tsx`（378 行目付近）の `screen.getByRole("complementary", { name: "イラスト" })` を `screen.getByRole("region", { name: "イラスト" })` にする。
- `client/src/components/map/__tests__/MapEditorOutline.test.tsx`（230 行目付近）の `screen.getByRole("complementary", { name: "イラスト" })` を `screen.getByRole("region", { name: "イラスト" })` にする。
- `client/src/app/__tests__/page.test.tsx`:
  - 415〜416 行目付近を次にする:

```tsx
      expect(screen.getByRole("complementary", { name: "ノードの詳細" })).toBeInTheDocument();
      expect(within(screen.getByRole("region", { name: "イラスト" })).getByText("ノードを選択してください")).toBeVisible();
```

  - 562 行目付近の `expect(screen.getByText("ノードを選択してください")).toBeVisible();` を `expect(within(screen.getByRole("region", { name: "イラスト" })).getByText("ノードを選択してください")).toBeVisible();` にする。
  - 571 行目付近の `const panel = screen.getByRole("complementary", { name: "イラスト" });` を `const panel = screen.getByRole("complementary", { name: "ノードの詳細" });` にする。
- `client/src/app/__tests__/page.test.tsx` の 426 行目付近の `screen.getByText(FALLBACK_NODE_LABEL)`（追加したノードのラベルが空のため、フォールバックのラベルがメモとイラストの 2 か所に出る）は、`within(screen.getByRole("region", { name: "イラスト" })).getByText(FALLBACK_NODE_LABEL)` にする。
- `client/src/app/__tests__/pageDuplication.test.tsx` の 366 行目付近の `screen.getByTitle("唯一")` は、`within(screen.getByRole("region", { name: "イラスト" })).getByTitle("唯一")` にする（`within` が import されていなければ足す）。
- `client/src/app/__tests__/pageClipboard.test.tsx`（298・308 行目付近）の `expect(screen.getByText("ノードを選択してください")).toBeInTheDocument();` を `expect(within(screen.getByRole("region", { name: "イラスト" })).getByText("ノードを選択してください")).toBeInTheDocument();` にする（`within` は既に import 済み）。

次で、`complementary` と「イラスト」の組み合わせや、パネルの文言を画面全体から探している箇所が残っていないことを確かめる:
`cd client && grep -rn 'complementary", { name: "イラスト"\|getByText("ノードを選択してください")\|getByText("対象ノード")\|getByText(FALLBACK_NODE_LABEL)\|getByTitle(' src --include='*.tsx' --include='*.ts'`
（`within(...)` の中で使っているもの、`NodeNoteSection.test.tsx`・`IllustrationPanel.test.tsx` の単体のものは対象外）

- [ ] **Step 9: GREEN を確認する**

Run: `cd client && npx jest src/components src/app`
Expected: PASS。`Found multiple elements` で落ちるテストが残っていたら、それは右パネルのメモの欄とイラストの欄の両方に同じラベルが出たためなので、Step 8 と同じく `within(screen.getByRole("region", { name: "イラスト" }))` で探す範囲を絞る（パネルの文言や構造を変えて通さない）。

- [ ] **Step 10: このタスクの範囲を検証する**

Run: `cd client && npm run tailwind:scan && npm run lint && npm run typecheck && npm test -- --runInBand`
Expected: すべて成功（全テストが通る）。

---

### Task 7: ドキュメントと ROADMAP の更新、全体検証

**Files:**
- Modify: `docs/specifications/features.md`
- Modify: `docs/architecture/overview.md`
- Modify: `docs/testing/browser-test-cases.md`
- Modify: `README.md`
- Modify: `client/README.md`
- Modify: `docs/README.md`
- Modify: `ROADMAP.md`

**Interfaces:**
- Consumes: Task 1〜6 の挙動と、Global Constraints の文言。設計書 §10。直近の候補035（`features.md` の 23 章、`overview.md` の件数、`browser-test-cases.md` の AE 節）を書式の手本にする。

- [ ] **Step 1: `features.md` を更新する**

次の `grep` で全箇所を確かめてから更新する（行番号は目安）:
`grep -n "Phase 0 〜 Phase 17\|23\. \[ノードの分割\|Phase 17\*\*\|illustration?: string\|固定幅 \*\*240px\*\*\|w-60\|右サイドパネル\|イラストパネル\|右のイラストパネル\|^| ノードの統合\|^| イラストの設定\|23.4 統合の規則\|23.7 失敗の文言\|### 23.5\|### 23.10" docs/specifications/features.md`

- 冒頭（3 行目）の「Phase 0 〜 Phase 17。…ノードの分割・統合を含む）」を「Phase 0 〜 Phase 18。…ノードの分割・統合、詳細メモを含む）」にする（Phase 18 は進行中で、実装済みは詳細メモだけ）。
- 目次の `23. [ノードの分割・統合](#23-ノードの分割統合)` の次に `24. [詳細メモ](#24-詳細メモ)` を足す。
- 1.1 節の表の Phase 17 の行の次に、次の行を足す:

```markdown
| **Phase 18** | 詳細情報と出典の蓄積（進行中。詳細メモ） | 右パネル「ノードの詳細」の上段で、選択中のノードに長い説明（プレーンテキスト、最大 10,000 文字）を保存。入力は 300ms ごとにマップへ反映し、フォーカスを外したときに 1 操作の Undo / Redo にまとめる。保存形式は V3 のまま任意項目 `note` を追加。複製・コピー＆貼り付け・分割・統合と整合（24 章） |
```

- 3.1 節の `Node` の型の `illustration?: string;      // 縮小済み JPEG data URL` の次に `note?: string;              // 詳細メモ（最大 10,000 文字。無ければ項目ごと持たない。24 章）` を足す。
- 3.x 節の「親の挿入（`createParentNode`）では…`illustration` は持たない」（233 行目付近）と 16.2 節（1745 行目付近）の「`illustration` も持ちません」を、「`illustration`・`note`（詳細メモ）も持ちません」にする。
- 6 章の保存形式で V3 の項目を説明している箇所（`grep -n "illustration" docs/specifications/features.md` で 6 章の範囲を確かめる）に、「V3 の任意項目 `note`（詳細メモ。文字列、10,000 文字以内。空白だけは項目ごと持たない。V1 / V2 の `note` は無視。上限超過・文字列以外は `node[i].noteは10000文字以内の文字列である必要があります。` で読み込み失敗）」を足す。
- 7.3 節の「右サイドパネルは固定幅 **240px**（Tailwind `w-60`）で常時表示されます。」を「右サイドパネル「ノードの詳細」（`NodeDetailPanel.tsx`。`<aside aria-label="ノードの詳細">`）は固定幅 **288px**（Tailwind `w-72`）で常時表示され、上に詳細メモ（24 章）、下にイラスト（`IllustrationPanel.tsx`。`<section aria-label="イラスト">`）を縦に積みます。内容が高さを超えたらパネルの中で縦にスクロールします。」にする（後続の「ノード未選択時は…」はそのまま）。
- 8.1 節の表の「ノードの統合」の行の説明の「ラベル・重要度・イラストの更新」を「ラベル・重要度・イラスト・詳細メモの更新」にし、「イラストの設定・再生成・削除」の行の前に次の行を足す:

```markdown
| 詳細メモの編集 | テキスト欄にフォーカスしてから外すまでを1操作（入力中に 300ms ごとにマップへ反映する途中の値は履歴に積まない。`Escape` で取り消したとき・内容が変わらなかったときは履歴を積まない。24 章） |
```

- 11 章のヘッダー・パネルのボタンの表の「イラストパネル」の行の前に、次の行を足す:

```markdown
| **ノードの詳細（詳細メモ）** | テキスト欄「詳細メモ」 | 選択中のノード（複数選択では主選択）の詳細メモを編集。入力は 300ms ごとに反映し、フォーカスを外すと 1 操作の履歴に確定。`Escape` で取り消し。最大 10,000 文字 |
```

- 19 章（2005 行目付近）の「右のイラストパネルは共通選択IDが対象です。」を「右のパネル（詳細メモ・イラスト）は共通選択IDが対象です（詳細メモの複数選択の文言も出しません）。」にする。
- 23.4 節（統合の規則）の属性の説明に「**詳細メモ**: 選択中のノードのメモを配列順に空行（`\n\n`）で連結します（メモの無いノードは飛ばします）。連結が 10,000 文字を超えるときは統合できません（24.5 節）。」を足し、23.3 節（分割の規則）に「詳細メモは元のノード（最初の断片）にだけ残り、新しい断片には付きません。」を足す。23.5 節のプレビューの項目に「メモ」（`N 件のメモを連結（M 文字）`。メモのあるノードが 1 つ以上のときだけ）を足し、23.7 節の失敗の文言の表に `note-too-long` の行（「メモをまとめると文字数の上限（10,000 文字）を超えるため、統合できません。」）を足す。23.10 節の表の「保存・JSON・画像」の行の「保存形式（V3）は変わりません」の後に「（詳細メモは 24 章の任意項目を使います）」を足す。
- 23 章の末尾（`### 23.11` の最後の項目の後）に、次の章を追加する:

````markdown
## 24. 詳細メモ

Phase 18・候補011。キャンバスには短い見出し（ラベル）だけを置き、長い説明は右パネル「ノードの詳細」の**詳細メモ**に保存します。メモはプレーンテキストで、HTML や Markdown としては解釈しません。

### 24.1 操作と表示

| 項目 | 内容 |
| :--- | :--- |
| 置き場所 | 右パネル「ノードの詳細」（`NodeDetailPanel.tsx`、`<aside aria-label="ノードの詳細">`、幅 `w-72`）の上段。下段はイラスト（7.3 節）。マップ表示・アウトライン表示のどちらでも出ます |
| 見出しと対象 | 見出し「詳細メモ」。ノード未選択では「ノードを選択してください」とし、テキスト欄は無効。選択中は「対象ノード」に表示ラベル（`getNodeDisplayLabel`、3 行まで、全文は `title`） |
| 複数選択 | 対象は**主選択の 1 ノード**。マップ表示で 2 件以上を選んでいるときだけ「N 件選択中。主選択のノードのメモを編集します」と出します。アウトライン表示は単一選択として扱い、キャンバスで残った複数選択の件数を出しません（重要度の一括変更と同じ規則。3.3 節） |
| テキスト欄 | `<label>`「詳細メモ」付きの `<textarea>`（8 行、縦にだけ広げられる）。プレースホルダー「このノードの詳細な説明を書けます」 |
| 文字数 | 「{入力済みの文字数} / 10,000 文字」を常に表示します。上限に達すると、その下に「上限に達しました」（`role="status"`）を併記します |

### 24.2 文字数の上限

- 1 ノードあたり **10,000 文字**（`NODE_NOTE_MAX_LENGTH`）。数え方は JavaScript の `string.length`（UTF-16 のコード単位）で、テキスト欄の `maxLength` と同じです。絵文字などは 2 文字分に数えます。
- 上限を超える入力・貼り付けは、ブラウザがテキスト欄で受け付けません（`maxLength`）。絵文字の途中で切られたときは、保存の前に末尾の半端な 1 単位を削ります。
- JSON 読み込み・貼り付けで上限を超えるメモは、切り詰めずに読み込み自体を失敗にします（24.4 節）。

### 24.3 入力の反映と履歴

| 操作 | 挙動 |
| :--- | :--- |
| フォーカス | 履歴のグループを始め、その時点のメモを控えます |
| 入力 | 入力が **300ms** 止まるたびにマップへ反映します（自動保存の対象になります）。入力が続いても、直前の反映の後の最初の入力から **2 秒**を超えて先送りしません。反映の途中は履歴に積みません |
| IME 変換中 | 変換中は反映しません。変換を確定してから 300ms 後に反映します |
| フォーカスを外す | 残りを反映し、フォーカスしてから外すまでを **1 回の履歴**にまとめます（内容が変わらなければ履歴を積みません） |
| `Escape` | 編集を取り消し、フォーカスを入れた時点の内容へ戻して欄から出ます（履歴を積みません）。IME 変換中の `Escape` は取り消しません |
| 別のノードを選ぶ | キャンバスで別のノードを選んでフォーカスが外れなかった場合も、それまでの入力を反映してから切り替えます |
| Undo / Redo | ヘッダーの「元に戻す」はマップの履歴を戻します（押す時点でテキスト欄のフォーカスが外れ、反映が終わっています）。テキスト欄の中の `Cmd`/`Ctrl`+`Z` はブラウザ標準のテキスト欄の Undo です |

- 空文字、または空白・改行だけのメモは「メモなし」とみなし、保存しません（`note` の項目ごと持ちません）。それ以外では前後の空白・改行も削りません。
- Undo / Redo・JSON 読み込み・マップの切り替えで文書が入れ替わったときは、入力中の下書きを新しい文書へ書きません。
- **既知の制限**: タブを閉じるなど、フォーカスも外れず部品も外れない終わり方では、最後の反映より後の入力（最大 2 秒分）は残りません。

### 24.4 保存形式

- 保存形式は **V3 のまま**で、ノードに任意の項目 `note`（文字列）を足します。版は上げません。メモの無いノードは項目を持ちません。
- 読み込み（JSON・自動保存・バックアップ・ゴミ箱・コピー＆貼り付けのクリップボード）では、V3 の `note` を検証します。文字列でない・10,000 文字を超える値は `node[i].noteは10000文字以内の文字列である必要があります。` で失敗します（上限は正規化の前の値で判定）。V1 / V2 の `note` は無視します。
- 古いアプリは `note` を知らないため、古いアプリで開いて保存し直すとメモは失われます（その環境はサポートしません）。
- 複数タブの競合検出（21 章）は、メモだけが違う 2 つの内容も別物として扱います。

### 24.5 既存機能との関係

| 機能 | 挙動 |
| :--- | :--- |
| 枝の複製・コピー＆貼り付け | メモも一緒に写ります |
| ノードの分割 | 元のノード（最初の断片）にメモを残し、新しい断片には付けません |
| ノードの統合 | 選択中のノードのメモを配列順に空行で連結して残すノードに付けます（メモの無いノードは飛ばします）。プレビューに「メモ: N 件のメモを連結（M 文字）」を出します。連結が 10,000 文字を超えるときは「メモをまとめると文字数の上限（10,000 文字）を超えるため、統合できません。」で統合できません（黙って切り詰めません） |
| 親の挿入 | 新しい親はメモを持ちません |
| ノードだけ削除・枝の移動・階層の上げ下げ・並べ替え | メモはノードと一緒に移ります |
| 検索・一括置換・アウトライン書き出し・画像書き出し | メモは対象にしません |
| ダイアログ表示中 | 編集画面の根ごと `inert` になり、テキスト欄も操作できません |
| ショートカット | テキスト欄の中の `Delete`・`Tab`・`Enter`・`Cmd`/`Ctrl`+`Z` などでマップを動かしません（既存の入力先の判定） |

### 24.6 検証範囲と対象外

- **検証範囲**: Jest（jsdom）で、ドメイン（`nodeNote.test.ts`、`mapDocumentNodeNote.test.ts`、`mapDocumentNode.test.ts`、`mapDocumentCodec.test.ts`、`mapDocumentDecoder.test.ts`、`mapConflict.test.ts`、`subtreeClipboardCodec.test.ts`、`nodeSubtreeInsertion.test.ts`、`nodeSplit.test.ts`、`nodeParentInsertion.test.ts`、`nodeMerge.test.ts`、`nodeMergeMessages.test.ts`）、フック（`useNodeLayoutState.test.ts`、`useNodesNote.test.ts`、`useNodesSplitMerge.test.ts`、`useNodeNoteEditing.test.ts`、`nodeMergePreview.test.ts`）、部品（`NodeNoteSection.test.tsx`、`NodeNoteEditor.test.tsx`、`NodeDetailPanel.test.tsx`、`IllustrationPanel.test.tsx`、`NodeMergeDialog.test.tsx`）、ページ統合（`pageNodeNote.test.tsx`）を確認しています。実ブラウザでの確認（[AF 節](../testing/browser-test-cases.md)）は未実施です。
- **対象外（YAGNI）**: キャンバス・アウトラインでのメモの有無や本文の表示、検索・一括置換・アウトライン書き出し・画像書き出しへのメモの反映、Markdown の描画（候補053）、URL（候補012）、タグ（候補023）、出典（候補054）、複数ノードへのメモの一括編集、版の引き上げ（V4）と古いアプリへの書き戻し互換。
````

- 追加後、`grep -n "上限に達しました\|件選択中。主選択のノードのメモを編集します\|メモをまとめると文字数の上限\|このノードの詳細な説明を書けます\|noteは10000文字以内" docs/specifications/features.md client/src -r` で、文言が実装と一致していることを突き合わせる。

- [ ] **Step 2: `overview.md` を更新する**

まず実際の件数を数える:

```bash
cd /Users/mash/Desktop/draw-my-map/.worktrees/feat-phase18-node-note/client/src
ls components/layout/*.ts* | wc -l   # レイアウト UI（想定 66）
ls hooks/*.ts | wc -l                # フック（想定 56）
ls domain/nodes/*.ts | wc -l         # domain/nodes（想定 52）
ls domain/persistence/*.ts | wc -l   # domain/persistence（想定 11）
ls domain/*/*.ts | wc -l             # domain 全体（想定 102）
```

数えた値で、`docs/architecture/overview.md` の「`src/components/layout/` 全 63 ファイル」「`src/hooks/` 全 55 ファイル」「構成サブパッケージ（全 100 ファイル）」「`domain/nodes/` (51 ファイル)」「`domain/persistence/` (10 ファイル)」を直す（想定と違う値が出たら、数えた値を書く）。

次を更新する（`grep -n "IllustrationPanel\|useNodes.ts\|useNodeLayoutState\|nodeMerge.ts\|nodeMergeMessages\|nodeMergePreview\|mapDocumentNodeIllustration\|nodeLabelUpdate.ts\|useMapHistory.ts" docs/architecture/overview.md` で位置を確かめる）:
- レイアウト UI の一覧の `IllustrationPanel.tsx` の項目（150 行目付近）を、「`NodeDetailPanel.tsx`: 右サイドパネル（`<aside aria-label="ノードの詳細">`、`w-72`、縦スクロール）。上に詳細メモ、下にイラストを積み、選択中のノードがあるときだけ `NodeNoteEditor` を `key={`${id}:${documentRevision}`}` で描く。`NodeNoteSection.tsx`: 詳細メモの表示だけの部品（見出し・対象・複数選択の文言・`<textarea maxLength={10000}>`・文字数・常設の `role="status"`）。`NodeNoteEditor.tsx`: `useNodeNoteEditing` を呼んで `NodeNoteSection` へ値を渡す接続の部品。」を足し、`IllustrationPanel.tsx` の説明の `<aside aria-label="イラスト">` を `<section aria-label="イラスト">`（幅・縁は `NodeDetailPanel` が持つ）に直す。
- フックの一覧に「`useNodeNoteEditing.ts`: 詳細メモのテキスト欄の下書き・途中反映（300ms のデバウンス、直前の反映の後の最初の入力から 2 秒の打ち切り、IME 変換中は張らず `compositionend` で張る）・`blur` での確定（履歴グループを閉じる）・`Escape` の取り消し・アンマウントでの反映（グループが有効なときだけ）。」を足す。`useNodes.ts` の説明に `previewNodeNote`（メモの唯一の更新経路。グループ中は履歴に積まない）を、`useNodeLayoutState.ts` の説明（191 行目付近・694 行目付近）に `applyNonStructuralPreview`（配置モードに依存しない `preview`）を足す。`nodeMergePreview.ts` の説明に `noteText` を足す。
- `domain/nodes/` の一覧に「`nodeNote.ts`: 詳細メモの上限（`NODE_NOTE_MAX_LENGTH = 10000`）・統合の区切り（`NODE_NOTE_MERGE_JOINER`）・正規化（`normalizeNodeNote`。末尾の対になっていない上位サロゲートを削り、空白だけは `undefined`）・上限判定・文字数の表示・更新（`replaceNodeNote`。無変更・不在・上限超過は `null`、メモなしはキーごと外す）。」を足し、`nodeMerge.ts` の説明に `note`・`noteSourceCount`・`note-too-long` を、`nodeMergeMessages.ts` に `note-too-long` の文言を足す。
- `domain/persistence/` の一覧の `mapDocumentNode.ts, ...` の項目に `mapDocumentNodeNote.ts`（V3 の `note` の検証。上限は正規化より先に判定）を足す。
- `domain/mapLibrary/` の `mapConflict.ts` の説明（あれば）に「`note` も比べる」を足す。
- 分割・統合の節（825 行目付近）に「統合はメモも連結する（上限超過は `note-too-long`）」を足し、その後に「詳細メモ（候補011）」の節を 1 つ足す（責務の分担: 規則は `domain/nodes/nodeNote.ts`、保存は `mapDocumentNodeNote.ts`、更新経路は `useNodes.previewNodeNote` → `useNodeLayoutState.applyNonStructuralPreview` → `useMapHistory.preview`、テキスト欄は `useNodeNoteEditing`、表示は `NodeNoteSection` / `NodeNoteEditor` / `NodeDetailPanel`。履歴: フォーカスで `beginMoveHistory`、`blur` で `finish`。文書の入れ替えでは `key` とグループの失効で古い下書きを書かない）。

- [ ] **Step 3: `browser-test-cases.md` に AF 節を追加する**

`## AE.` 節の後、`## 結果の集計` の前に、次の Markdown をそのまま追加する:

````markdown
## AF. 詳細メモ（Phase 18・候補011）

**2026-11-17 時点で AF-01〜AF-09 の実ブラウザ確認はすべて未実施です。** 自動テスト（Jest / jsdom）と `npm run verify` の成功を実ブラウザ確認済みとは扱いません。メモは右パネル「ノードの詳細」の上段のテキスト欄「詳細メモ」で編集します。保存内容は、ヘッダーの「JSON書き出し」で書き出した JSON の `nodes[].note` で確かめます。

### AF-01 メモを書いてフォーカスを外すと保存され、1 回の Undo で戻る【高】
- 前提: 手動配置。ルート「計画」とその子「調査」がある。どちらもメモなし。
- 手順: (1) 「調査」を選択する。(2) 右パネルの「詳細メモ」に「背景を調べる」と入力し、改行して「2 行目」と入力する。(3) キャンバスの空き地をクリックしてフォーカスを外す。(4) 「JSON書き出し」で書き出す。(5) 「調査」を選び直し、ヘッダーの「元に戻す」を 1 回押す。
- 期待: (2) 文字数が「12 / 10,000 文字」のように増える。(4) 「調査」の `note` が `"背景を調べる\n2行目"`、「計画」は `note` の項目を持たない。(5) メモが空に戻り、もう一度「元に戻す」を押すと、メモの入力より前の操作（ある場合）が戻る（メモの入力は 1 回の履歴）。
- 結果: -（未実施）

### AF-02 入力の途中で自動保存され、リロードしても残る【高】
- 前提: AF-01 の後。
- 手順: (1) 「調査」のメモに続けて「追記」と入力し、フォーカスを外さずに 1 秒待つ。(2) ヘッダーの保存状態の表示を見る。(3) ページを再読み込みする。
- 期待: (2) 入力が止まって 300ms 後にマップへ反映され、自動保存で「保存済み」になる。(3) 「調査」を選ぶと「追記」を含むメモが表示される。
- 結果: -（未実施）

### AF-03 `Escape` で取り消すと、フォーカスした時点の内容へ戻り、履歴を積まない【高】
- 前提: 「調査」にメモ「元のメモ」がある。
- 手順: (1) 「調査」を選び、メモの欄をクリックする。(2) 「書き換え」に置き換えて 1 秒待つ。(3) `Escape` を押す。(4) ヘッダーの「元に戻す」の状態を見る。
- 期待: (3) メモが「元のメモ」に戻り、テキスト欄からフォーカスが外れる。(4) この操作で履歴は増えていない（直前の別の操作が戻る、または無効のまま）。
- 結果: -（未実施）

### AF-04 フォーカスを外さずにキャンバスで別のノードを選んでも、入力が残る【高】
- 前提: ノード「A」「B」がある。どちらもメモなし。
- 手順: (1) 「A」を選び、メモに「A の説明」と入力する（フォーカスはテキスト欄のまま）。(2) すぐにキャンバスで「B」をクリックする。(3) 「A」を選び直す。
- 期待: (2) パネルが「B」に切り替わり、メモは空。(3) 「A の説明」が表示される。
- 結果: -（未実施）

### AF-05 JSON の書き出しと読み込みでメモが往復する【高】
- 前提: AF-01 の後。
- 手順: (1) 「JSON書き出し」で書き出す。(2) 「調査」のメモを別の内容に書き換えてフォーカスを外す。(3) (1) のファイルを「JSON読み込み」で読み込む。(4) 「調査」を選ぶ。
- 期待: (4) (1) の時点のメモが表示される。
- 結果: -（未実施）

### AF-06 統合でメモが配列順に空行で連結され、上限を超えると統合できない【高】
- 前提: 親「果物」の子「りんご」（メモ「赤い」）・「みかん」（メモなし）・「ぶどう」（メモ「紫」）がある。
- 手順: (1) 「りんご」「みかん」「ぶどう」を `Cmd`/`Ctrl`+クリックで選ぶ。(2) 「ノードを統合」を開き、プレビューの「メモ」の行を見る。(3) 「統合する」を押し、残ったノードのメモを見る。(4) 別の兄弟 2 つにそれぞれ 6,000 文字と 4,000 文字のメモを貼り付けてから、その 2 つで「ノードを統合」を開く。
- 期待: (2) 「2 件のメモを連結（6 文字）」。(3) メモは「赤い」「（空行）」「紫」の順。(4) 状態文言が「メモをまとめると文字数の上限（10,000 文字）を超えるため、統合できません。」で、「統合する」が無効。
- 結果: -（未実施）

### AF-07 日本語入力（IME）の変換中は反映されず、確定後に反映される【中】
- 前提: 日本語入力が有効。ノード「A」がある。
- 手順: (1) 「A」のメモ欄で「にほんご」と入力し、変換を確定せずに 1 秒待つ。(2) 変換中に `Escape` を押す。(3) もう一度入力して確定し、1 秒待ってから別のタブで同じマップを開く。
- 期待: (1) 変換中の文字は保存されない（保存状態が変わらない）。(2) 変換だけが取り消され、メモの編集は取り消されない（テキスト欄からフォーカスが外れない）。(3) 確定した文字が別のタブに反映されている。
- 結果: -（未実施）

### AF-08 長文と上限の表示【中】
- 前提: ノード「A」がある。
- 手順: (1) 10,000 文字を超える文章を貼り付ける。(2) 文字数の表示を見る。(3) さらに文字を入力する。(4) 絵文字を含む文章で上限付近まで入力する。
- 期待: (1) 10,000 文字までで切られる。(2) 「10,000 / 10,000 文字」と「上限に達しました」が並んで出る。(3) それ以上入力できない。(4) 絵文字は 2 文字分として数えられ、上限で絵文字が半端に残らない（保存後に読み直しても文字化けしない）。パネルは縦にスクロールして下のイラストの欄まで見られる。
- 結果: -（未実施）

### AF-09 テキスト欄の中のキーでマップが動かない・ダイアログ中は操作できない【中】
- 前提: ノード「A」とその子「B」がある。「A」を選び、メモ欄にフォーカスしている。
- 手順: (1) `Tab`・`Enter`・`Delete`・`Backspace`・`Cmd`/`Ctrl`+`Z` を押す。(2) フォーカスを外し、「A」「B」を複数選択して「ノードを統合」を開き、右パネルのメモ欄をクリックする。(3) ダイアログを閉じ、表示を「アウトライン」に切り替える。
- 期待: (1) ノードの追加・削除・Undo は起きず、テキスト欄の中だけで文字が変わる（`Cmd`/`Ctrl`+`Z` はテキスト欄の Undo）。(2) 右パネルは操作できない。(3) 複数選択の文言（「N 件選択中。…」）は出ず、主選択のメモが表示される。
- 結果: -（未実施）
````

「結果の集計」の表の AE 行の次に、次の AF 行を足す:

```markdown
| 未実施 | 2026-11-17 |  | 0 | 0 | 0 | 9 | Phase 18 AF-01〜AF-09（AF 節。詳細メモ）。実ブラウザの観測は未実施。Jest / jsdom の結果と区別する |
```

- [ ] **Step 4: `README.md`・`client/README.md`・`docs/README.md` を更新する**

- `README.md`: 機能一覧の「20. **複数選択と一括編集・一括置換・ノードの分割・統合（Phase 17 完了）**」の項目の後（`---` の前）に、次を足す:

```markdown
21. **詳細メモ（Phase 18 の候補011）**
   - 右パネル「ノードの詳細」の上段で、選択中のノードに長い説明（プレーンテキスト、最大 10,000 文字）を保存できます。キャンバスには短い見出しだけを置けます。
   - 入力は 300ms ごとに自動保存の対象になり、フォーカスを外すと 1 回の Undo / Redo にまとまります。`Escape` で取り消せます。
   - 複製・コピー＆貼り付け・JSON の書き出しと読み込みでメモも往復し、統合では選択中のメモが空行で連結されます。保存形式は V3 のままです。
   - 詳細は [features.md の 24 章](./docs/specifications/features.md#24-詳細メモ)。実ブラウザでの確認（[AF 節](./docs/testing/browser-test-cases.md)）は未実施です。
```

- `client/README.md`: 33 行目付近の「複数選択と一括編集（Phase 17）。…」の項目の次に、「詳細メモ（Phase 18・候補011）。右パネル「ノードの詳細」（`NodeDetailPanel`）の上段で選択中のノードの説明を最大 10,000 文字まで保存し、入力は 300ms ごとに反映、フォーカスを外すと 1 回の履歴にまとめます（`useNodeNoteEditing`・`useNodes.previewNodeNote`）。保存形式は V3 の任意項目 `note`。」を同じ書式で足す。
- `docs/testing/browser-test-cases.md`: 3 行目の「対象: Draw My Map（Phase 0〜17。…」を「Phase 0〜18（…、Phase 18 の詳細メモを含む）」にする（`grep -n '対象:' docs/testing/browser-test-cases.md | head -3` で該当行を確かめる）。
- `docs/README.md`: 36 行目付近の「Phase 0〜17（…）で実装された機能の詳細仕様。…ノードの分割・統合は23章。」を「Phase 0〜18（…、Phase 18 の詳細メモを含む）で実装された機能の詳細仕様。…ノードの分割・統合は23章、詳細メモは24章。」にする。87 行目付近の「（Phase 0〜17。…」を「（Phase 0〜18。…、詳細メモは AF 節」に、93 行目付近の「Phase 0〜17 は完了、Phase 18〜39 は未着手。次の未完了項目は Phase 18 の「詳細メモ」」を「Phase 0〜17 は完了、Phase 18 は進行中（詳細メモが完了）、Phase 19〜39 は未着手。次の未完了項目は Phase 18 の「URLの添付」」にする。

- [ ] **Step 5: `ROADMAP.md` を更新する**

- `最終更新:` を `2026-11-17` にする（既に同日なら変えない）。
- `## Phase 18: 詳細情報と出典の蓄積（未着手）` を `## Phase 18: 詳細情報と出典の蓄積（進行中）` にする。
- `- [ ] **詳細メモ**（候補011）` を `- [x] **詳細メモ**（候補011）` にする。ほかの Phase 18 の項目（候補012・023・053・054）は `[ ]` のまま。
- 「現在地」の 13 行目付近（ドキュメント体系の段落）の「および Phase 17 の…ノードの分割・統合に対応する」を「、Phase 17 の…ノードの分割・統合、および Phase 18 の詳細メモに対応する」にする。
- 「現在地」の Phase 17 の段落の末尾にある「次の未完了項目は Phase 18 の先頭「詳細メモ」（候補011）。Phase 18〜39 は未着手。」を「Phase 19〜39 は未着手。」に直す（次の未完了項目は、下の Phase 18 の段落に書く。`grep -n "次の未完了項目は Phase 18" ROADMAP.md` で該当箇所を確かめる）。
- 「現在地」の Phase 17 の段落の次に、次の段落を足す:

```markdown
- Phase 18（詳細情報と出典の蓄積）が進行中。候補011「詳細メモ」が完了。右パネルを「ノードの詳細」（上に詳細メモ、下にイラスト）にまとめ、選択中のノード（複数選択では主選択）に最大10,000文字のプレーンテキストのメモを保存できる。入力は300msごとにマップへ反映し、フォーカスを外すと1回のUndo / Redoにまとめ、`Escape`で取り消せる。保存形式はV3のまま任意項目`note`を追加し、複製・コピー＆貼り付け・JSON・分割（元のノードに残す）・統合（空行で連結、上限超過は統合できない）と整合する。Jest（jsdom）の自動テストと `npm run verify` で確認済み、実ブラウザ確認（`docs/testing/browser-test-cases.md` の AF 節）は未実施。次の未完了項目は Phase 18 の「URLの添付」（候補012）。
```

- [ ] **Step 6: 全体検証**

Run: `cd client && npm run verify`
Expected: tailwind:scan・lint・typecheck・test・build がすべて成功。

---

## 自己レビューの結果

- 設計書との対応: 「決めたこと」1（保存形式）→ Task 2、2（置き場所）→ Task 6、3（上限 10,000・`length`・表示）→ Task 1・6、4（範囲）→ Global Constraints の対象外。「設計中に決めたこと」の確定のしかた・`Escape`・IME → Task 5、空のメモ → Task 1、複数選択・アウトライン表示 → Task 6（`importanceTargetIds.length`、ページ統合テスト）、統合 → Task 4、分割 → Task 2、アウトライン表示でもパネル → Task 6、ショートカットの競合 → Task 6 のページ統合テスト。§3.1 → Task 1、§3.2 → Task 2、§3.3 → Task 4、§3.4 → Task 2、§4.1・§4.2 → Task 3、§4.3 → Task 5、§5.1・§5.2 → Task 6、§6 → Task 2（保存・複製・貼り付け・分割・親の挿入・競合）・Task 3（Undo）・Task 4（統合）・Task 6（ショートカット・`inert`）、§7 → Task 4、§8 → 各 Task のテスト、§9 → Global Constraints、§10 → Task 7。
- §8 のミューテーションの観点: 上限の境界（ちょうど・1 超過）→ `nodeNote.test.ts`・`mapDocumentNodeNote.test.ts`・`nodeMerge.test.ts`・`useNodesNote.test.ts`、上限判定が正規化より先 → `mapDocumentNodeNote.test.ts`（削れば上限内になる値を拒否）、`blur` の二重確定 → `useNodeNoteEditing.test.ts`（blur 後のタイマー・Escape 後の blur・blur 後のアンマウント）、デバウンスの打ち切り → `useNodeNoteEditing.test.ts`（打ち切りが無ければ 2050ms になる手順で 2000ms に反映）、キー除去 → `nodeNote.test.ts`・`useNodesNote.test.ts`・`nodeMerge.test.ts`（`"note" in`）。
- 型と名前の一貫性: `NODE_NOTE_MAX_LENGTH`・`NODE_NOTE_MERGE_JOINER`・`normalizeNodeNote`・`isNodeNoteWithinLimit`・`replaceNodeNote`・`formatNodeNoteLength`（Task 1）、`normalizeMapDocumentNodeNote`（Task 2）、`applyNonStructuralPreview`・`previewNodeNote`（Task 3）、`note`・`noteSourceCount`・`"note-too-long"`・`noteText`（Task 4）、`useNodeNoteEditing`・`NodeNoteEditing`・`UseNodeNoteEditingOptions`・`NODE_NOTE_PREVIEW_DELAY_MS`・`NODE_NOTE_PREVIEW_MAX_WAIT_MS`（Task 5）、`NodeNoteSection`（`targetLabel`・`selectionCount`・`editing`）・`NodeNoteEditor`（`node`・`selectionCount`・`onPreviewNote`・`onBeginNoteEdit`）・`NodeDetailPanel`（Task 6）を全タスクで同じ名前で使う。
- 設計書からの具体化・判断:
  - 文字数の表示は `formatNodeNoteLength`（`toLocaleString("ja-JP")`）で 3 桁区切りにした（上限の「10,000」と入力済みの数の書式を揃えるため。統合のプレビューの「M 文字」も同じ関数を使う）。
  - テキスト欄の `<label>` は見出し「詳細メモ」と同じ文言なので `sr-only` にした（名前は「詳細メモ」のまま）。メモの欄の対象の表示はイラストの欄と同じ「対象ノード」の形にした。
  - 「上限に達しました」の `role="status"` は常設の領域にし、中身だけを替える（ライブリージョンを後から差し込まない）。
  - アンマウントでの反映は `useLayoutEffect` の後始末で行う（既存の `useOutlineLabelDraft` と同じく ref を正とする）。StrictMode の擬似的なアンマウントでは `leaseRef` が空なので何もしない。
  - `onFocus` では、前の lease を明示的に閉じない（新しい `beginMoveHistory` が前のグループを閉じ、前の lease は失効する）。
  - Task 1 で `Node` に `note?: string` の 1 行だけを先に足し、コメントの整備は保存形式を扱う Task 2 で行う（Task 1 のテストと実装が型を通すため）。
  - セルフレビューで直した点: Task 1 で `types/node.ts` に先に 1 行足すことを Files に明記した。`nodeParentInsertion.test.ts` の `succeed` の戻り値を実コードで確かめ、曖昧な指示を消した。Task 5 の lint の扱いを、挙動を変えない具体的な手順に直した。
  - 設計書 §8 のフックの項の「アンマウントで反映せずグループを閉じる」は、文書の入れ替え（`lease` が失効している場合）を指す。`lease` が有効なアンマウント（キャンバスでの別ノードの選択）では §4.3 に従い反映する（設計書 §8 の文言も合わせて直した）。
  - 右パネルの文言が 2 か所（メモとイラスト）に出るため、画面全体から「ノードを選択してください」などを探していた既存のページテストは、`region`「イラスト」の中に絞る（期待する挙動は変えない）。
