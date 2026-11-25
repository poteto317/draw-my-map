import {
  classifyStorageChange,
  createConflictCopyName,
  isDocumentContentEqual,
  type ConflictState,
} from "../mapConflict";
import {
  CONFLICT_MOVE_BRANCH_REJECTED_MESSAGE,
  CONFLICT_NOTICE_MESSAGE,
  CONFLICT_RESTORE_REJECTED_MESSAGE,
  CONFLICT_SWITCH_MAP_REJECTED_MESSAGE,
  EXPORT_JSON_BUTTON_LABEL,
  EXTERNALLY_DELETED_NOTICE_MESSAGE,
  EXTERNAL_UPDATE_NOTICE_MESSAGE,
  RELOAD_CONFIRM_ACTION_LABEL,
  RELOAD_CONFIRM_CANCEL_LABEL,
  RELOAD_CONFIRM_MESSAGE,
  RELOAD_CONFIRM_TITLE,
  RELOAD_EXTERNAL_BUTTON_LABEL,
  RELOAD_EXTERNAL_CONTENT_BUTTON_LABEL,
  RELOAD_SUCCESS_MESSAGE,
  SAVE_AS_COPY_BUTTON_LABEL,
  conflictBranchMoveRejectedNotice,
  conflictNotice,
  conflictReloadSuccessNotice,
  conflictRestoreRejectedNotice,
  conflictSwitchMapRejectedNotice,
  externallyDeletedNotice,
  externalUpdateNotice,
} from "../mapConflictMessages";
import type { MapDocumentV3 } from "@/types/mapDocument";

describe("mapConflict", () => {
  describe("classifyStorageChange", () => {
    it("自マップ本体が更新され未保存編集がある場合は conflict を返す", () => {
      const result: ConflictState = classifyStorageChange({
        isCurrentMapBodyKey: true,
        isMapIndexKey: false,
        newValue: JSON.stringify({ version: 3, layoutMode: "manual", nodes: [] }),
        hasPendingEdits: true,
        isCurrentMapInIndex: true,
      });
      expect(result).toBe("conflict");
    });

    it("自マップ本体が更新され未保存編集がない場合は externalUpdate を返す", () => {
      const result: ConflictState = classifyStorageChange({
        isCurrentMapBodyKey: true,
        isMapIndexKey: false,
        newValue: JSON.stringify({ version: 3, layoutMode: "manual", nodes: [] }),
        hasPendingEdits: false,
        isCurrentMapInIndex: true,
      });
      expect(result).toBe("externalUpdate");
    });

    it("自マップ本体キーが削除された (newValue === null) 場合は externallyDeleted を返す", () => {
      const withEdits = classifyStorageChange({
        isCurrentMapBodyKey: true,
        isMapIndexKey: false,
        newValue: null,
        hasPendingEdits: true,
        isCurrentMapInIndex: true,
      });
      expect(withEdits).toBe("externallyDeleted");

      const withoutEdits = classifyStorageChange({
        isCurrentMapBodyKey: true,
        isMapIndexKey: false,
        newValue: null,
        hasPendingEdits: false,
        isCurrentMapInIndex: true,
      });
      expect(withoutEdits).toBe("externallyDeleted");
    });

    it("マップ一覧キー更新時に現在マップが一覧から消えている場合は externallyDeleted を返す", () => {
      const result = classifyStorageChange({
        isCurrentMapBodyKey: false,
        isMapIndexKey: true,
        newValue: JSON.stringify({ version: 1, currentMapId: "other", maps: [] }),
        hasPendingEdits: true,
        isCurrentMapInIndex: false,
      });
      expect(result).toBe("externallyDeleted");
    });

    it("マップ一覧キー更新時に現在マップが一覧に残っている場合は none を返す", () => {
      const result = classifyStorageChange({
        isCurrentMapBodyKey: false,
        isMapIndexKey: true,
        newValue: JSON.stringify({
          version: 1,
          currentMapId: "map-123",
          maps: [{ id: "map-123", name: "マップ1", createdAt: "", updatedAt: "" }],
        }),
        hasPendingEdits: true,
        isCurrentMapInIndex: true,
      });
      expect(result).toBe("none");
    });

    it("自マップ本体でもマップ一覧でもないキー変更は none を返す", () => {
      const result = classifyStorageChange({
        isCurrentMapBodyKey: false,
        isMapIndexKey: false,
        newValue: "{}",
        hasPendingEdits: true,
        isCurrentMapInIndex: true,
      });
      expect(result).toBe("none");
    });
  });

  describe("isDocumentContentEqual", () => {
    const baseDoc: MapDocumentV3 = {
      version: 3,
      layoutMode: "manual",
      nodes: [
        {
          id: 1,
          parentId: null,
          x: 0,
          y: 0,
          width: 100,
          height: 40,
          label: "ルート",
          importance: "medium",
        },
        {
          id: 2,
          parentId: 1,
          x: 120,
          y: 0,
          width: 80,
          height: 30,
          label: "子ノード",
          importance: "high",
          illustration: "data:image/png;base64,abc",
        },
      ],
    };

    it("同一内容のドキュメントは true を返す", () => {
      const cloned: MapDocumentV3 = JSON.parse(JSON.stringify(baseDoc));
      expect(isDocumentContentEqual(baseDoc, cloned)).toBe(true);
    });

    it("ノードの配列順序が異なっていても同じノード集合であれば true を返す", () => {
      const reversedDoc: MapDocumentV3 = {
        ...baseDoc,
        nodes: [baseDoc.nodes[1], baseDoc.nodes[0]],
      };
      expect(isDocumentContentEqual(baseDoc, reversedDoc)).toBe(true);
    });

    it("layoutMode が異なる場合は false を返す", () => {
      const different: MapDocumentV3 = {
        ...baseDoc,
        layoutMode: "auto",
      };
      expect(isDocumentContentEqual(baseDoc, different)).toBe(false);
    });

    it("version が異なる場合は false を返す", () => {
      const differentVersion = {
        ...baseDoc,
        version: 2 as unknown as 3,
      };
      expect(isDocumentContentEqual(baseDoc, differentVersion)).toBe(false);
    });

    it("ノード数が異なる場合は false を返す", () => {
      const fewerNodes: MapDocumentV3 = {
        ...baseDoc,
        nodes: [baseDoc.nodes[0]],
      };
      expect(isDocumentContentEqual(baseDoc, fewerNodes)).toBe(false);
    });

    it("ノード数が同じでも id が異なる場合は false を返す", () => {
      const diffId: MapDocumentV3 = {
        ...baseDoc,
        nodes: [
          baseDoc.nodes[0],
          { ...baseDoc.nodes[1], id: 99 },
        ],
      };
      expect(isDocumentContentEqual(baseDoc, diffId)).toBe(false);
    });

    it("ノードのフィールド値が異なる場合は false を返す", () => {
      const diffLabel: MapDocumentV3 = {
        ...baseDoc,
        nodes: [
          { ...baseDoc.nodes[0], label: "変更済み" },
          baseDoc.nodes[1],
        ],
      };
      expect(isDocumentContentEqual(baseDoc, diffLabel)).toBe(false);

      const diffImportance: MapDocumentV3 = {
        ...baseDoc,
        nodes: [
          baseDoc.nodes[0],
          { ...baseDoc.nodes[1], importance: "low" },
        ],
      };
      expect(isDocumentContentEqual(baseDoc, diffImportance)).toBe(false);

      const diffX: MapDocumentV3 = {
        ...baseDoc,
        nodes: [
          { ...baseDoc.nodes[0], x: 999 },
          baseDoc.nodes[1],
        ],
      };
      expect(isDocumentContentEqual(baseDoc, diffX)).toBe(false);

      const diffY: MapDocumentV3 = {
        ...baseDoc,
        nodes: [
          { ...baseDoc.nodes[0], y: 999 },
          baseDoc.nodes[1],
        ],
      };
      expect(isDocumentContentEqual(baseDoc, diffY)).toBe(false);

      const diffParent: MapDocumentV3 = {
        ...baseDoc,
        nodes: [
          baseDoc.nodes[0],
          { ...baseDoc.nodes[1], parentId: null },
        ],
      };
      expect(isDocumentContentEqual(baseDoc, diffParent)).toBe(false);

      const diffWidth: MapDocumentV3 = {
        ...baseDoc,
        nodes: [
          { ...baseDoc.nodes[0], width: 999 },
          baseDoc.nodes[1],
        ],
      };
      expect(isDocumentContentEqual(baseDoc, diffWidth)).toBe(false);

      const diffHeight: MapDocumentV3 = {
        ...baseDoc,
        nodes: [
          { ...baseDoc.nodes[0], height: 999 },
          baseDoc.nodes[1],
        ],
      };
      expect(isDocumentContentEqual(baseDoc, diffHeight)).toBe(false);

      const diffIllustration: MapDocumentV3 = {
        ...baseDoc,
        nodes: [
          baseDoc.nodes[0],
          { ...baseDoc.nodes[1], illustration: undefined },
        ],
      };
      expect(isDocumentContentEqual(baseDoc, diffIllustration)).toBe(false);
    });

    it("illustration が未定義とオプショナル未定義で等価であることを判定する", () => {
      const docA: MapDocumentV3 = {
        version: 3,
        layoutMode: "manual",
        nodes: [
          {
            id: 1,
            parentId: null,
            x: 0,
            y: 0,
            width: 100,
            height: 40,
            label: "A",
            importance: "medium",
          },
        ],
      };
      const docB: MapDocumentV3 = {
        version: 3,
        layoutMode: "manual",
        nodes: [
          {
            id: 1,
            parentId: null,
            x: 0,
            y: 0,
            width: 100,
            height: 40,
            label: "A",
            importance: "medium",
            illustration: undefined,
          },
        ],
      };
      expect(isDocumentContentEqual(docA, docB)).toBe(true);
    });

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

    it("URL だけが違う 2 文書は別物と判定する（別タブで変えた URL の競合を見逃さない）", () => {
      const withLinks: MapDocumentV3 = {
        ...baseDoc,
        nodes: [baseDoc.nodes[0], { ...baseDoc.nodes[1], links: ["https://example.com/a"] }],
      };
      const reordered: MapDocumentV3 = {
        ...baseDoc,
        nodes: [baseDoc.nodes[0], { ...baseDoc.nodes[1], links: ["https://example.com/b", "https://example.com/a"] }],
      };
      const ordered: MapDocumentV3 = {
        ...baseDoc,
        nodes: [baseDoc.nodes[0], { ...baseDoc.nodes[1], links: ["https://example.com/a", "https://example.com/b"] }],
      };

      expect(isDocumentContentEqual(baseDoc, withLinks)).toBe(false);
      expect(isDocumentContentEqual(withLinks, ordered)).toBe(false);
      expect(isDocumentContentEqual(ordered, reordered)).toBe(false);
    });

    it("links は要素ごとに比べ、別の配列でも内容が同じなら等価。未定義とオプショナル未定義も等価", () => {
      const left: MapDocumentV3 = {
        ...baseDoc,
        nodes: [baseDoc.nodes[0], { ...baseDoc.nodes[1], links: ["https://example.com/a"] }],
      };
      const right: MapDocumentV3 = {
        ...baseDoc,
        nodes: [baseDoc.nodes[0], { ...baseDoc.nodes[1], links: ["https://example.com/a"] }],
      };
      const explicitUndefined: MapDocumentV3 = {
        ...baseDoc,
        nodes: [{ ...baseDoc.nodes[0], links: undefined }, baseDoc.nodes[1]],
      };

      expect(isDocumentContentEqual(left, right)).toBe(true);
      expect(isDocumentContentEqual(baseDoc, explicitUndefined)).toBe(true);
    });

    it("タグだけが違う 2 文書は別物と判定する（表記・順の違いも別物。別タブで変えたタグの競合を見逃さない）", () => {
      const withTags: MapDocumentV3 = {
        ...baseDoc,
        nodes: [baseDoc.nodes[0], { ...baseDoc.nodes[1], tags: ["Python"] }],
      };
      const otherSpelling: MapDocumentV3 = {
        ...baseDoc,
        nodes: [baseDoc.nodes[0], { ...baseDoc.nodes[1], tags: ["python"] }],
      };
      const ordered: MapDocumentV3 = {
        ...baseDoc,
        nodes: [baseDoc.nodes[0], { ...baseDoc.nodes[1], tags: ["Python", "重要"] }],
      };
      const reordered: MapDocumentV3 = {
        ...baseDoc,
        nodes: [baseDoc.nodes[0], { ...baseDoc.nodes[1], tags: ["重要", "Python"] }],
      };

      expect(isDocumentContentEqual(baseDoc, withTags)).toBe(false);
      expect(isDocumentContentEqual(withTags, otherSpelling)).toBe(false);
      expect(isDocumentContentEqual(ordered, reordered)).toBe(false);
    });

    it("tags は要素ごとに比べ、別の配列でも内容が同じなら等価。未定義とオプショナル未定義も等価", () => {
      const left: MapDocumentV3 = {
        ...baseDoc,
        nodes: [baseDoc.nodes[0], { ...baseDoc.nodes[1], tags: ["重要"] }],
      };
      const right: MapDocumentV3 = {
        ...baseDoc,
        nodes: [baseDoc.nodes[0], { ...baseDoc.nodes[1], tags: ["重要"] }],
      };
      const explicitUndefined: MapDocumentV3 = {
        ...baseDoc,
        nodes: [{ ...baseDoc.nodes[0], tags: undefined }, baseDoc.nodes[1]],
      };

      expect(isDocumentContentEqual(left, right)).toBe(true);
      expect(isDocumentContentEqual(baseDoc, explicitUndefined)).toBe(true);
    });

    it("マップ間リンクだけが違う 2 文書は別物と判定する（リンク先・ノード指定・順の違いも別物。別タブで変えたリンクの競合を見逃さない）", () => {
      const withMapLinks = (mapLinks: { targetMapId: string; targetNodeId?: number }[]): MapDocumentV3 => ({
        ...baseDoc,
        nodes: [baseDoc.nodes[0], { ...baseDoc.nodes[1], mapLinks }],
      });

      expect(isDocumentContentEqual(baseDoc, withMapLinks([{ targetMapId: "map-b" }]))).toBe(false);
      expect(
        isDocumentContentEqual(withMapLinks([{ targetMapId: "map-b" }]), withMapLinks([{ targetMapId: "map-c" }])),
      ).toBe(false);
      expect(
        isDocumentContentEqual(
          withMapLinks([{ targetMapId: "map-b" }]),
          withMapLinks([{ targetMapId: "map-b", targetNodeId: 3 }]),
        ),
      ).toBe(false);
      expect(
        isDocumentContentEqual(
          withMapLinks([{ targetMapId: "map-b", targetNodeId: 3 }, { targetMapId: "map-c" }]),
          withMapLinks([{ targetMapId: "map-c" }, { targetMapId: "map-b", targetNodeId: 3 }]),
        ),
      ).toBe(false);
    });

    it("mapLinks は要素ごとに比べ、別の配列・別オブジェクトでも内容が同じなら等価。未定義とオプショナル未定義も等価", () => {
      const left: MapDocumentV3 = {
        ...baseDoc,
        nodes: [baseDoc.nodes[0], { ...baseDoc.nodes[1], mapLinks: [{ targetMapId: "map-b", targetNodeId: 3 }] }],
      };
      const right: MapDocumentV3 = {
        ...baseDoc,
        nodes: [baseDoc.nodes[0], { ...baseDoc.nodes[1], mapLinks: [{ targetMapId: "map-b", targetNodeId: 3 }] }],
      };
      const explicitUndefined: MapDocumentV3 = {
        ...baseDoc,
        nodes: [{ ...baseDoc.nodes[0], mapLinks: undefined }, baseDoc.nodes[1]],
      };

      expect(isDocumentContentEqual(left, right)).toBe(true);
      expect(isDocumentContentEqual(baseDoc, explicitUndefined)).toBe(true);
    });

    it("出典だけが違う 2 文書は別物と判定する（表記・順・ページの違いも別物。別タブで変えた出典の競合を見逃さない）", () => {
      const withSources: MapDocumentV3 = {
        ...baseDoc,
        nodes: [baseDoc.nodes[0], { ...baseDoc.nodes[1], sources: [{ title: "Python" }] }],
      };
      const otherSpelling: MapDocumentV3 = {
        ...baseDoc,
        nodes: [baseDoc.nodes[0], { ...baseDoc.nodes[1], sources: [{ title: "python" }] }],
      };
      const ordered: MapDocumentV3 = {
        ...baseDoc,
        nodes: [
          baseDoc.nodes[0],
          { ...baseDoc.nodes[1], sources: [{ title: "Python" }, { title: "設計", page: "1" }] },
        ],
      };
      const reordered: MapDocumentV3 = {
        ...baseDoc,
        nodes: [
          baseDoc.nodes[0],
          { ...baseDoc.nodes[1], sources: [{ title: "設計", page: "1" }, { title: "Python" }] },
        ],
      };

      expect(isDocumentContentEqual(baseDoc, withSources)).toBe(false);
      expect(isDocumentContentEqual(withSources, otherSpelling)).toBe(false);
      expect(isDocumentContentEqual(ordered, reordered)).toBe(false);
    });

    it("sources は内容ごとに比べ、別の配列・別オブジェクトでも内容が同じなら等価。未定義と空配列・オプショナル未定義も等価", () => {
      const left: MapDocumentV3 = {
        ...baseDoc,
        nodes: [baseDoc.nodes[0], { ...baseDoc.nodes[1], sources: [{ title: "設計", page: "12" }] }],
      };
      const right: MapDocumentV3 = {
        ...baseDoc,
        nodes: [baseDoc.nodes[0], { ...baseDoc.nodes[1], sources: [{ title: "設計", page: "12" }] }],
      };
      const explicitUndefined: MapDocumentV3 = {
        ...baseDoc,
        nodes: [{ ...baseDoc.nodes[0], sources: undefined }, baseDoc.nodes[1]],
      };
      const emptyArray: MapDocumentV3 = {
        ...baseDoc,
        nodes: [{ ...baseDoc.nodes[0], sources: [] }, baseDoc.nodes[1]],
      };

      expect(isDocumentContentEqual(left, right)).toBe(true);
      expect(isDocumentContentEqual(baseDoc, explicitUndefined)).toBe(true);
      expect(isDocumentContentEqual(baseDoc, emptyArray)).toBe(true);
    });
  });

  describe("createConflictCopyName", () => {
    it("短い名前に「（退避）」を付与する", () => {
      expect(createConflictCopyName("旅行計画")).toBe("旅行計画（退避）");
    });

    it("空文字の場合は「（退避）」を返す", () => {
      expect(createConflictCopyName("")).toBe("（退避）");
    });

    it("ベース名がちょうど46文字の場合、46文字＋4文字で50文字となる", () => {
      const base = "あ".repeat(46);
      const result = createConflictCopyName(base);
      expect(result).toBe(`${base}（退避）`);
      expect(Array.from(result).length).toBe(50);
    });

    it("ベース名が47文字の場合、先頭46文字に切り詰められて50文字となる", () => {
      const base = "あ".repeat(47);
      const result = createConflictCopyName(base);
      expect(result).toBe(`${"あ".repeat(46)}（退避）`);
      expect(Array.from(result).length).toBe(50);
    });

    it("ベース名が100文字の場合、先頭46文字に切り詰められて50文字となる", () => {
      const base = "あ".repeat(100);
      const result = createConflictCopyName(base);
      expect(result).toBe(`${"あ".repeat(46)}（退避）`);
      expect(Array.from(result).length).toBe(50);
    });

    it("サロゲートペア（絵文字）を含む場合もコードポイント数で計算される", () => {
      const emojiBase = "🗾".repeat(48);
      const result = createConflictCopyName(emojiBase);
      expect(result).toBe(`${"🗾".repeat(46)}（退避）`);
      expect(Array.from(result).length).toBe(50);
    });
  });

  describe("isDocumentContentEqual（relations / groups）", () => {
    const baseDoc: MapDocumentV3 = {
      version: 3,
      layoutMode: "manual",
      nodes: [
        {
          id: 1,
          parentId: null,
          x: 0,
          y: 0,
          width: 100,
          height: 40,
          label: "ルート",
          importance: "medium",
        },
        {
          id: 2,
          parentId: 1,
          x: 120,
          y: 0,
          width: 80,
          height: 30,
          label: "子",
          importance: "high",
        },
      ],
    };

    it("relations だけ違うと false", () => {
      expect(
        isDocumentContentEqual(baseDoc, {
          ...baseDoc,
          relations: [{ id: 10, fromId: 1, toId: 2, kind: "related", directed: false }],
        }),
      ).toBe(false);
    });

    it("groups だけ違うと false", () => {
      expect(
        isDocumentContentEqual(baseDoc, {
          ...baseDoc,
          groups: [{ id: 20, nodeIds: [1, 2], label: "" }],
        }),
      ).toBe(false);
    });

    it("未定義と空・配列順違いは等価", () => {
      expect(isDocumentContentEqual(baseDoc, { ...baseDoc, relations: [] })).toBe(true);
      expect(isDocumentContentEqual(baseDoc, { ...baseDoc, groups: [] })).toBe(true);
      const left: MapDocumentV3 = {
        ...baseDoc,
        relations: [
          { id: 10, fromId: 1, toId: 2, kind: "related", directed: false },
          { id: 11, fromId: 2, toId: 1, kind: "dependency", directed: true },
        ],
      };
      const right: MapDocumentV3 = {
        ...baseDoc,
        relations: [
          { id: 11, fromId: 2, toId: 1, kind: "dependency", directed: true },
          { id: 10, fromId: 1, toId: 2, kind: "related", directed: false },
        ],
      };
      expect(isDocumentContentEqual(left, right)).toBe(true);
    });
  });

  describe("isDocumentContentEqual（tour）", () => {
    const baseDoc: MapDocumentV3 = {
      version: 3,
      layoutMode: "manual",
      nodes: [
        {
          id: 1,
          parentId: null,
          x: 0,
          y: 0,
          width: 100,
          height: 40,
          label: "ルート",
          importance: "medium",
        },
      ],
    };
    const snapshot = {
      viewport: { offsetX: 0, offsetY: 0, scale: 1 },
      selectedNodeId: null,
      selectedNodeIds: [] as number[],
      focusRootId: null,
      collapsedNodeIds: [] as number[],
      resolutionMode: "all" as const,
      autoResolutionLevel: "all" as const,
    };

    it("tour だけ違うと false", () => {
      expect(
        isDocumentContentEqual(baseDoc, {
          ...baseDoc,
          tour: {
            version: 1,
            title: "t",
            steps: [{ id: "s1", snapshot }],
          },
        }),
      ).toBe(false);
    });
  });

  describe("mapConflictMessages", () => {
    it("定数値が設計書と整合していること", () => {
      expect(CONFLICT_NOTICE_MESSAGE).toBe(
        "別タブでこのマップが更新されました。上書きを防ぐため自動保存を停止しています。",
      );
      expect(EXTERNALLY_DELETED_NOTICE_MESSAGE).toBe(
        "このマップは別タブで削除されました。",
      );
      expect(EXTERNAL_UPDATE_NOTICE_MESSAGE).toBe(
        "別タブでこのマップが更新されました。",
      );
      expect(SAVE_AS_COPY_BUTTON_LABEL).toBe("別名で保存");
      expect(RELOAD_EXTERNAL_BUTTON_LABEL).toBe("最新を読み込む");
      expect(RELOAD_EXTERNAL_CONTENT_BUTTON_LABEL).toBe("最新の内容を読み込む");
      expect(EXPORT_JSON_BUTTON_LABEL).toBe("JSON書き出し");

      expect(RELOAD_CONFIRM_MESSAGE).toBe(
        "現在のタブの未保存の変更は失われます。別タブの最新内容を読み込みますか？",
      );
      expect(RELOAD_CONFIRM_TITLE).toBe("最新の内容を読み込む");
      expect(RELOAD_CONFIRM_ACTION_LABEL).toBe("最新の内容を読み込む");
      expect(RELOAD_CONFIRM_CANCEL_LABEL).toBe("キャンセル");
      expect(RELOAD_SUCCESS_MESSAGE).toBe("別タブの最新内容を読み込みました。");

      expect(CONFLICT_SWITCH_MAP_REJECTED_MESSAGE).toBe(
        "競合中のため切り替えられません。『別名で保存』または『最新を読み込む』で解決してください。",
      );
      expect(CONFLICT_MOVE_BRANCH_REJECTED_MESSAGE).toBe(
        "別タブでマップが更新または削除されているため、枝を移動できませんでした。",
      );
      expect(CONFLICT_RESTORE_REJECTED_MESSAGE).toBe(
        "別タブで競合または更新が発生しているため、一括復元できませんでした。",
      );
    });

    it("通知生成ヘルパー関数が正しい OperationNotice を返すこと", () => {
      expect(conflictNotice()).toEqual({
        kind: "warning",
        message: CONFLICT_NOTICE_MESSAGE,
      });
      expect(externallyDeletedNotice()).toEqual({
        kind: "error",
        message: EXTERNALLY_DELETED_NOTICE_MESSAGE,
      });
      expect(externalUpdateNotice()).toEqual({
        kind: "status",
        message: EXTERNAL_UPDATE_NOTICE_MESSAGE,
      });
      expect(conflictReloadSuccessNotice()).toEqual({
        kind: "status",
        message: RELOAD_SUCCESS_MESSAGE,
      });
      expect(conflictSwitchMapRejectedNotice()).toEqual({
        kind: "warning",
        message: CONFLICT_SWITCH_MAP_REJECTED_MESSAGE,
      });
      expect(conflictBranchMoveRejectedNotice()).toEqual({
        kind: "error",
        message: CONFLICT_MOVE_BRANCH_REJECTED_MESSAGE,
      });
      expect(conflictRestoreRejectedNotice()).toEqual({
        kind: "error",
        message: CONFLICT_RESTORE_REJECTED_MESSAGE,
      });
    });
  });
});
