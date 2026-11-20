import { act, renderHook } from "@testing-library/react";
import type { MapIndexEntry } from "@/domain/mapLibrary/mapIndex";
import { useCrossMapCorpus } from "@/hooks/useCrossMapCorpus";
import { mapBodyKey, type MapLibraryStorage } from "@/services/persistence/mapLibraryStorage";
import type { Node } from "@/types/node";

function createMemoryStorage(initial: Record<string, string> = {}): MapLibraryStorage {
  const store = new Map(Object.entries(initial));
  return {
    get length() {
      return store.size;
    },
    key: (index) => Array.from(store.keys())[index] ?? null,
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value);
    },
    removeItem: (key) => {
      store.delete(key);
    },
  };
}

function makeNode(id: number, label: string): Node {
  return {
    id,
    parentId: null,
    x: 100,
    y: 100,
    width: 100,
    height: 60,
    label,
    importance: "medium",
  };
}

function makeMapJson(nodes: readonly Node[]): string {
  return JSON.stringify({
    version: 3,
    layoutMode: "manual",
    nodes,
  });
}

const maps: readonly MapIndexEntry[] = [
  {
    id: "map-a",
    name: "マップA",
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-02T00:00:00.000Z",
  },
  {
    id: "map-b",
    name: "マップB",
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
  },
];

describe("useCrossMapCorpus", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("現在マップの nodes 変更では他マップを再読込せず、refreshCorpus() 呼び出し時のみ再読込する", () => {
    const storage = createMemoryStorage({
      [mapBodyKey("map-b")]: makeMapJson([makeNode(10, "初期B")]),
    });
    const getItemSpy = jest.spyOn(storage, "getItem");

    const initialNodes = [makeNode(1, "初期A")];
    const { result, rerender } = renderHook(
      (props: { currentNodes: readonly Node[] }) =>
        useCrossMapCorpus({
          maps,
          currentMapId: "map-a",
          currentMapName: "マップA",
          currentNodes: props.currentNodes,
          storage,
          storageMode: "persistent",
        }),
      { initialProps: { currentNodes: initialNodes } },
    );

    expect(getItemSpy).toHaveBeenCalledTimes(1);
    expect(getItemSpy).toHaveBeenLastCalledWith(mapBodyKey("map-b"));
    expect(result.current.corpus.readableMaps.map((m) => m.mapId)).toEqual(["map-a", "map-b"]);
    expect(result.current.corpus.readableMaps[0].nodes.map((n) => n.label)).toEqual(["初期A"]);
    expect(result.current.corpus.readableMaps[1].nodes.map((n) => n.label)).toEqual(["初期B"]);

    // ストレージ上の他マップを書き換え、現在マップの nodes だけを変更する
    storage.setItem(mapBodyKey("map-b"), makeMapJson([makeNode(10, "更新B")]));
    rerender({ currentNodes: [makeNode(1, "更新A")] });

    expect(getItemSpy).toHaveBeenCalledTimes(1);
    expect(result.current.corpus.readableMaps[0].nodes.map((n) => n.label)).toEqual(["更新A"]);
    expect(result.current.corpus.readableMaps[1].nodes.map((n) => n.label)).toEqual(["初期B"]);

    // refreshCorpus() で初めて他マップが再読込される
    act(() => {
      result.current.refreshCorpus();
    });

    expect(getItemSpy).toHaveBeenCalledTimes(2);
    expect(result.current.corpus.readableMaps[1].nodes.map((n) => n.label)).toEqual(["更新B"]);
  });

  it("保護モード時はストレージを読まず空の他マップコーパスを使い、現在マップのみ返す（L-002）", () => {
    const storage = createMemoryStorage({
      [mapBodyKey("map-b")]: makeMapJson([makeNode(10, "他マップB")]),
    });
    const getItemSpy = jest.spyOn(storage, "getItem");

    const { result } = renderHook(() =>
      useCrossMapCorpus({
        maps,
        currentMapId: "map-a",
        currentMapName: "マップA",
        currentNodes: [makeNode(1, "現在A")],
        storage,
        storageMode: "protected",
      }),
    );

    expect(getItemSpy).not.toHaveBeenCalled();
    expect(result.current.corpus.readableMaps).toHaveLength(1);
    expect(result.current.corpus.readableMaps[0]).toMatchObject({
      mapId: "map-a",
      mapName: "マップA",
      isCurrent: true,
    });
    expect(result.current.corpus.unreadableMaps).toEqual([]);

    act(() => {
      result.current.refreshCorpus();
    });

    expect(getItemSpy).not.toHaveBeenCalled();
    expect(result.current.corpus.readableMaps).toHaveLength(1);
  });

  describe("インデックスの変化と他マップの再読込", () => {
    const mapC: MapIndexEntry = {
      id: "map-c",
      name: "マップC",
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    };

    function setup() {
      const storage = createMemoryStorage({
        [mapBodyKey("map-b")]: makeMapJson([makeNode(10, "B")]),
        [mapBodyKey("map-c")]: makeMapJson([makeNode(20, "C")]),
      });
      const getItemSpy = jest.spyOn(storage, "getItem");
      const currentNodes = [makeNode(1, "A")];
      const view = renderHook(
        (props: { maps: readonly MapIndexEntry[] }) =>
          useCrossMapCorpus({
            maps: props.maps,
            currentMapId: "map-a",
            currentMapName: "マップA",
            currentNodes,
            storage,
            storageMode: "persistent",
          }),
        { initialProps: { maps: [...maps, mapC] } },
      );
      getItemSpy.mockClear();
      return { ...view, getItemSpy };
    }

    it("現在マップの updatedAt だけが変わった maps（自動保存）で rerender しても、他マップを読み直さない", () => {
      const view = setup();
      const before = view.result.current.corpus;

      view.rerender({ maps: [{ ...maps[0], updatedAt: "2026-12-01T00:00:00.000Z" }, maps[1], mapC] });
      view.rerender({ maps: [{ ...maps[0], updatedAt: "2026-12-02T00:00:00.000Z" }, maps[1], mapC] });

      expect(view.getItemSpy).not.toHaveBeenCalled();
      expect(view.result.current.corpus).toBe(before);
    });

    it("他マップの名前が変わったら読み直し、新しい名前を使う", () => {
      const view = setup();

      view.rerender({ maps: [maps[0], { ...maps[1], name: "改名B" }, mapC] });

      expect(view.getItemSpy).toHaveBeenCalledTimes(2);
      expect(view.result.current.corpus.readableMaps.map((m) => m.mapName)).toEqual(["マップA", "改名B", "マップC"]);
    });

    it("他マップが増えたら・減ったら読み直す", () => {
      const view = setup();

      view.rerender({ maps: [maps[0], maps[1]] });
      expect(view.getItemSpy).toHaveBeenCalledTimes(1);
      expect(view.result.current.corpus.readableMaps.map((m) => m.mapId)).toEqual(["map-a", "map-b"]);

      view.rerender({ maps: [maps[0], maps[1], mapC] });
      expect(view.getItemSpy).toHaveBeenCalledTimes(3);
      expect(view.result.current.corpus.readableMaps.map((m) => m.mapId)).toEqual(["map-a", "map-b", "map-c"]);
    });
  });
});
