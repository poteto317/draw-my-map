import {
  applyBranchPlacement,
  calculateIndentTranslation,
  calculateOutdentTranslation,
  translateBranch,
} from "@/domain/nodes/nodeIndentPlacement";
import { calculateChildPlacement } from "@/domain/nodes/nodeManualPlacement";
import { createTestNode } from "@/testing/createTestNode";
import type { Node } from "@/types/node";

function node(id: number, parentId: number | null, x: number, y: number): Node {
  return createTestNode({ id, parentId, x, y });
}

// 例 M1: R の子 A（子 A1）と、R の子 T（子 Tc）
function createM1(): Node[] {
  return [
    node(1, null, 0, 0),
    node(2, 1, 220, 0),
    node(5, 2, 440, 0),
    node(4, 1, 220, 100),
    node(6, 4, 440, 100),
  ];
}

// 例 M2: M1 から A1 を除いたもの
function createM2(): Node[] {
  return [
    node(1, null, 0, 0),
    node(2, 1, 220, 0),
    node(4, 1, 220, 100),
    node(6, 4, 440, 100),
  ];
}

// 例 M4: A の子 A1・T・A3 のうち T を上げる
function createM4(): Node[] {
  return [
    node(1, null, 0, 0),
    node(2, 1, 220, 0),
    node(3, 1, 220, 200),
    node(5, 2, 440, 0),
    node(4, 2, 440, 100),
    node(9, 2, 440, 200),
    node(6, 4, 660, 100),
  ];
}

// 例 M5: ルート R の子 T を上げてルートにする
function createM5(): Node[] {
  return [node(1, null, 0, 0), node(4, 1, 220, 0), node(6, 4, 440, 0)];
}

function replaceNode(nodes: Node[], id: number, overrides: Partial<Node>): Node[] {
  return nodes.map((item) => (item.id === id ? { ...item, ...overrides } : item));
}

describe("calculateIndentTranslation", () => {
  it("例 M1: 新しい親に子があれば、子の下端の下へ動かす", () => {
    expect(calculateIndentTranslation(createM1(), 4, 2)).toEqual({
      rootX: 440,
      rootY: 100,
      dx: 220,
      dy: 0,
    });
  });

  it("例 M2: 新しい親に子が無ければ、親と同じ高さへ動かす", () => {
    expect(calculateIndentTranslation(createM2(), 4, 2)).toEqual({
      rootX: 440,
      rootY: 0,
      dx: 220,
      dy: -100,
    });
  });

  it("例 M3: 表示集合を受け取らず、隠れているかどうかに関わらず A1 を既存の子に数える", () => {
    // A が閉じていて A1 が隠れていても、入力は M1 と同じなので結果も M1 と同じ
    expect(calculateIndentTranslation(createM1(), 4, 2)).toEqual({
      rootX: 440,
      rootY: 100,
      dx: 220,
      dy: 0,
    });
  });

  it("新しい親の孫は既存の子に数えない", () => {
    const nodes = [...createM1(), node(11, 5, 660, 500)];

    expect(calculateIndentTranslation(nodes, 4, 2)?.rootY).toBe(100);
  });

  it("1,000 通りの入力で calculateChildPlacement と同じ位置になる", () => {
    let seed = 20261026;
    const next = (min: number, max: number) => {
      seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
      return min + (seed % (max - min + 1));
    };

    for (let trial = 0; trial < 1000; trial += 1) {
      const nodes: Node[] = [
        createTestNode({
          id: 1,
          x: next(0, 999),
          y: next(0, 999),
          width: next(50, 200),
          height: next(30, 120),
        }),
      ];
      const childCount = next(0, 5);
      for (let index = 0; index < childCount; index += 1) {
        nodes.push(
          createTestNode({
            id: 10 + index,
            parentId: 1,
            x: next(0, 999),
            y: next(0, 999),
            width: next(50, 200),
            height: next(30, 120),
          }),
        );
      }
      nodes.push(createTestNode({ id: 2, x: next(0, 999), y: next(0, 999) }));

      const translation = calculateIndentTranslation(nodes, 2, 1);
      const placement = calculateChildPlacement(nodes, 1);

      expect(translation).not.toBeNull();
      expect({ x: translation?.rootX, y: translation?.rootY }).toEqual(placement);
    }
  });

  it("目的の座標と丸めの範囲でずれていれば差を 0 とみなし、子孫を動かさない", () => {
    // 複製・貼り付けで作った根は、目的の座標（371.8218956071483）と 1 ulp ずれる
    const nodes = [
      node(1, null, 0, 0),
      node(2, 1, 220, 0),
      createTestNode({
        id: 3,
        parentId: 2,
        x: 440,
        y: 317.22666369513655,
        height: 14.595231912011759,
      }),
      node(4, 1, 440, 371.82189560714824),
      node(6, 4, 660, 1051.4452116460998),
    ];

    const translation = calculateIndentTranslation(nodes, 4, 2);

    expect(translation).toEqual({ rootX: 440, rootY: 371.8218956071483, dx: 0, dy: 0 });
    const result = translateBranch(nodes, 4, translation!);
    expect(result).not.toBeNull();
    expect(result![3]).toMatchObject({ id: 4, x: 440, y: 371.8218956071483 });
    expect(result![4]).toBe(nodes[4]);
  });

  it("根が 0 の近くでも、子孫の座標の大きさに応じた丸めの範囲で差を 0 とみなす", () => {
    // 複製・貼り付けで置いた根。根の y（97.2…）に比べて途中の計算の値が大きく、
    // 目的の座標と 2e-13 ずれる。子孫の y は 3000 を超える
    const nodes = [
      createTestNode({
        id: 2,
        x: 1502.4115868326307,
        y: -4939.08410002684,
        width: 178.89515561853716,
        height: 92.76700811630148,
      }),
      createTestNode({
        id: 3,
        parentId: 2,
        x: 1801.3067424511678,
        y: 19.765504431839553,
        height: 37.45244433496067,
      }),
      createTestNode({ id: 4, x: 4278.417470419807, y: 97.21794876680042 }),
      createTestNode({ id: 6, parentId: 4, x: 4498.417470419807, y: 3001.35474583393 }),
    ];

    const translation = calculateIndentTranslation(nodes, 4, 2)!;

    expect(translation.rootY).toBe(97.21794876680022);
    expect(translation.dy).toBe(0);
    const result = translateBranch(nodes, 4, translation);
    expect(result).not.toBeNull();
    expect(result![3].y).toBe(3001.35474583393);
  });

  it("x が目的の座標と丸めの範囲でずれていれば差を 0 とみなし、遠い子孫を動かさない", () => {
    // 目的の x は 0.1 + 100 + 120 = 220.1。T の x はそれと 1 ulp ずれ、子孫の x は 1e9
    const nodes = [
      node(1, null, 0, 0),
      node(2, 1, 0.1, 0),
      node(4, 1, 220.10000000000002, 0),
      node(6, 4, 1e9, 0),
    ];

    const translation = calculateIndentTranslation(nodes, 4, 2);

    expect(translation).toEqual({ rootX: 220.1, rootY: 0, dx: 0, dy: 0 });
    const result = translateBranch(nodes, 4, translation!);
    expect(result).not.toBeNull();
    expect(result![2]).toMatchObject({ id: 4, x: 220.1, y: 0 });
    expect(result![3]).toBe(nodes[3]);
  });

  it("1e-6 の本来の移動は、座標が 1e6 に近くても 0 とみなさない", () => {
    const nodes = [
      node(1, null, 0, 0),
      node(2, 1, 220, 1e6),
      node(4, 1, 440, 1e6 - 1e-6),
      node(6, 4, 660, 1e6),
    ];

    const translation = calculateIndentTranslation(nodes, 4, 2)!;

    expect(translation.dy).not.toBe(0);
    expect(translation.dy).toBeCloseTo(1e-6, 9);
  });

  it("例 M7: 丸めで間隔が取れなければ null", () => {
    const nodes = replaceNode(createM1(), 5, { y: 1e17 });

    expect(calculateIndentTranslation(nodes, 4, 2)).toBeNull();
  });

  it("丸めで x の間隔が 120 を下回れば null", () => {
    // 右端は 1e17 + 112、目的の x は 1e17 + 224 に丸まり、間隔は 112 になる
    const nodes = replaceNode(createM2(), 2, { x: 1e17 + 16 });

    expect(calculateIndentTranslation(nodes, 4, 2)).toBeNull();
  });

  it("例 M8: 新しい親の右端が桁落ちすれば null", () => {
    const nodes = replaceNode(createM2(), 2, { x: Number.MAX_VALUE });

    expect(calculateIndentTranslation(nodes, 4, 2)).toBeNull();
  });

  it("子の無い新しい親の y が NaN なら null", () => {
    const nodes = replaceNode(createM2(), 2, { y: Number.NaN });

    expect(calculateIndentTranslation(nodes, 4, 2)).toBeNull();
  });

  it("T の x が NaN なら null", () => {
    const nodes = replaceNode(createM2(), 4, { x: Number.NaN });

    expect(calculateIndentTranslation(nodes, 4, 2)).toBeNull();
  });

  it("新しい親の既存の子の下端が溢れれば null", () => {
    const nodes = [
      node(2, null, 220, 0),
      createTestNode({ id: 5, parentId: 2, y: Number.MAX_VALUE, height: Number.MAX_VALUE }),
      node(4, null, 220, 100),
    ];

    expect(calculateIndentTranslation(nodes, 4, 2)).toBeNull();
  });

  it("新しい親の既存の子の下端に間隔 40 を足すと桁落ちすれば null", () => {
    // 負の下端にすると、桁落ちの判定を外しても後段の間隔の判定（hasSufficientGap）では止まらない
    const nodes = [
      node(2, null, 220, 0),
      createTestNode({ id: 5, parentId: 2, y: -(2 ** 61), height: 2 ** 60 }),
      node(4, null, 220, 100),
    ];

    expect(calculateIndentTranslation(nodes, 4, 2)).toBeNull();
  });

  it("新しい親や T が無ければ null", () => {
    expect(calculateIndentTranslation(createM2(), 4, 99)).toBeNull();
    expect(calculateIndentTranslation(createM2(), 99, 2)).toBeNull();
  });

  it("新しい親の子が 10,000 件あっても値を返す", () => {
    const nodes: Node[] = [node(1, null, 0, 0)];
    for (let index = 0; index < 10000; index += 1) {
      nodes.push(node(10 + index, 1, 220, index * 100));
    }
    nodes.push(node(2, null, 0, 2000000));

    expect(calculateIndentTranslation(nodes, 2, 1)).toEqual({
      rootX: 220,
      rootY: 9999 * 100 + 60 + 40,
      dx: 220,
      dy: 9999 * 100 + 100 - 2000000,
    });
  });
});

describe("calculateOutdentTranslation", () => {
  it("例 M4: 親の枝（後ろの兄弟を含む）の下端の下へ動かす", () => {
    expect(calculateOutdentTranslation(createM4(), 4, 2)).toEqual({
      rootX: 220,
      rootY: 300,
      dx: -220,
      dy: 200,
    });
  });

  it("例 M4: 最も下の兄弟が配列の前にあっても、親の枝の下端の最大値を使う", () => {
    const m4 = createM4();
    const a3 = m4.find((item) => item.id === 9) as Node;
    const nodes = [a3, ...m4.filter((item) => item.id !== 9)];

    expect(calculateOutdentTranslation(nodes, 4, 2)).toEqual({
      rootX: 220,
      rootY: 300,
      dx: -220,
      dy: 200,
    });
  });

  it("例 M5: 上げてルートになる", () => {
    expect(calculateOutdentTranslation(createM5(), 4, 1)).toEqual({
      rootX: 0,
      rootY: 100,
      dx: -220,
      dy: 100,
    });
  });

  it("例 M6: 子が根より上にあれば、枝の上端で合わせる", () => {
    const nodes = [
      node(1, null, 0, 0),
      node(2, 1, 220, 0),
      node(4, 2, 440, 100),
      node(6, 4, 660, 50),
      node(7, 4, 660, 150),
    ];

    expect(calculateOutdentTranslation(nodes, 4, 2)).toEqual({
      rootX: 220,
      rootY: 150,
      dx: -220,
      dy: 50,
    });
  });

  it("T が枝の上端なら、根の y は式の値（親の枝の下端 + 40）そのもの", () => {
    // 33.6862 + (186.7053 - 33.6862) は 186.70529999999997 に丸まる
    const nodes = [
      createTestNode({ id: 1, x: 0, y: 86.7053 }),
      createTestNode({ id: 4, parentId: 1, x: 220, y: 33.6862 }),
    ];

    const translation = calculateOutdentTranslation(nodes, 4, 1);

    expect(translation?.rootY).toBe(186.7053);
  });

  it("x が目的の座標（親の x）と丸めの範囲でずれていれば差を 0 とみなし、遠い子孫を動かさない", () => {
    // 親の x は 220.1。T の x はそれと 1 ulp ずれ、子孫の x は 1e9。y は newTop（0 + 60 + 40）と同じ
    const nodes = [
      node(1, null, 0, 0),
      node(2, 1, 220.1, 0),
      node(4, 2, 220.10000000000002, 100),
      node(6, 4, 1e9, 100),
    ];

    const translation = calculateOutdentTranslation(nodes, 4, 2);

    expect(translation).toEqual({ rootX: 220.1, rootY: 100, dx: 0, dy: 0 });
    const result = translateBranch(nodes, 4, translation!);
    expect(result).not.toBeNull();
    expect(result![2]).toMatchObject({ id: 4, x: 220.1, y: 100 });
    expect(result![3]).toBe(nodes[3]);
  });

  it("枝の上端が目的の座標（newTop）と丸めの範囲でずれていれば差を 0 とみなし、遠い子孫を動かさない", () => {
    // newTop は 0.1 + 60 + 40 = 100.1。T の y（枝の上端）はそれと 1 ulp ずれ、子孫の y は 1e9
    const nodes = [
      node(1, null, 0, 0),
      node(2, 1, 220, 0.1),
      node(4, 2, 220, 100.10000000000001),
      node(6, 4, 440, 1e9),
    ];

    const translation = calculateOutdentTranslation(nodes, 4, 2);

    expect(translation).toEqual({ rootX: 220, rootY: 100.1, dx: 0, dy: 0 });
    const result = translateBranch(nodes, 4, translation!);
    expect(result).not.toBeNull();
    expect(result![2]).toMatchObject({ id: 4, x: 220, y: 100.1 });
    expect(result![3]).toBe(nodes[3]);
  });

  it("T の枝は親の枝の下端に数えない", () => {
    const nodes = replaceNode(createM5(), 6, { y: 900 });

    expect(calculateOutdentTranslation(nodes, 4, 1)).toEqual({
      rootX: 0,
      rootY: 100,
      dx: -220,
      dy: 100,
    });
  });

  it("後ろの兄弟の子孫を親の枝の下端に数える", () => {
    const nodes = [...createM4(), node(12, 9, 660, 400)];

    expect(calculateOutdentTranslation(nodes, 4, 2)).toEqual({
      rootX: 220,
      rootY: 500,
      dx: -220,
      dy: 400,
    });
  });

  it("丸めで親の枝の下端との間隔が 40 を下回れば null", () => {
    // 親の枝の下端は 1e17 + 64、目的の上端は 1e17 + 96 に丸まり、間隔は 32 になる
    const nodes = replaceNode(createM4(), 9, { y: 1e17 });

    expect(calculateOutdentTranslation(nodes, 4, 2)).toBeNull();
  });

  it("親が T の子孫（循環）なら null", () => {
    const nodes = [node(1, null, 0, 0), node(2, 4, 220, 0), node(4, 2, 440, 100)];

    expect(calculateOutdentTranslation(nodes, 4, 2)).toBeNull();
  });

  it("親の x が NaN なら null", () => {
    const nodes = replaceNode(createM4(), 2, { x: Number.NaN });

    expect(calculateOutdentTranslation(nodes, 4, 2)).toBeNull();
  });

  it.each([Number.NaN, Infinity])("枝の子孫の y が %s なら null", (y) => {
    // T が配列の先に来るので、枝の上端は T の y のままで、後段の差の計算では止まらない
    const nodes = [node(2, null, 220, 0), node(4, 2, 440, 100), node(6, 4, 660, y)];

    expect(calculateOutdentTranslation(nodes, 4, 2)).toBeNull();
  });

  it("親の枝のノードの下端が溢れれば null", () => {
    const nodes = [
      node(2, null, 220, 0),
      node(4, 2, 440, 100),
      createTestNode({ id: 5, parentId: 2, y: Number.MAX_VALUE, height: Number.MAX_VALUE }),
    ];

    expect(calculateOutdentTranslation(nodes, 4, 2)).toBeNull();
  });

  it("親の枝の下端に間隔 40 を足すと桁落ちすれば null", () => {
    // 負の下端と、T より上にある子により、桁落ちの判定を外しても間隔の判定と根の y の判定で止まらない
    const nodes = [
      createTestNode({ id: 2, x: 220, y: -(2 ** 61), height: 2 ** 60 }),
      node(4, 2, 440, 100),
      node(6, 4, 660, 0),
    ];

    expect(calculateOutdentTranslation(nodes, 4, 2)).toBeNull();
  });

  it("T の x が NaN で dx が求められなければ null", () => {
    const nodes = [node(2, null, 220, 0), node(4, 2, Number.NaN, 100)];

    expect(calculateOutdentTranslation(nodes, 4, 2)).toBeNull();
  });

  it("枝の上端との差が桁落ちして dy が求められなければ null", () => {
    // 目的の上端は 2 ** 53 + 40 で求まるが、枝の上端 0.5 を引くと丸めで失われる
    const nodes = [
      createTestNode({ id: 2, x: 220, y: 2 ** 52, height: 2 ** 52 }),
      node(4, 2, 440, 0.5),
    ];

    expect(calculateOutdentTranslation(nodes, 4, 2)).toBeNull();
  });

  it("T が枝の上端でなく、根の y に dy を足すと桁落ちすれば null", () => {
    // 枝の上端は子の 0 なので dy は 100 で求まり、T の y（2 ** 60）への加算だけが失われる
    const nodes = [node(2, null, 220, 0), node(4, 2, 440, 2 ** 60), node(6, 4, 660, 0)];

    expect(calculateOutdentTranslation(nodes, 4, 2)).toBeNull();
  });

  it("親や T が無ければ null", () => {
    expect(calculateOutdentTranslation(createM4(), 4, 99)).toBeNull();
    expect(calculateOutdentTranslation(createM4(), 99, 2)).toBeNull();
  });

  it("10,000 ノードの鎖の枝でも例外を出さない", () => {
    const nodes: Node[] = [node(1, null, 0, 0), node(2, 1, 220, 100)];
    for (let index = 0; index < 10000; index += 1) {
      nodes.push(node(3 + index, 2 + index, 440 + index * 220, 100));
    }

    const translation = calculateOutdentTranslation(nodes, 2, 1);

    expect(translation).toEqual({ rootX: 0, rootY: 100, dx: -220, dy: 0 });
    expect(() => translateBranch(nodes, 2, translation!)).not.toThrow();
    expect(translateBranch(nodes, 2, translation!)).not.toBeNull();
  });
});

describe("translateBranch", () => {
  it("例 M1 の結果を適用すると、T の枝だけが動き、ほかは同じオブジェクト", () => {
    const nodes = createM1();
    const before = JSON.parse(JSON.stringify(nodes)) as Node[];
    const translation = calculateIndentTranslation(nodes, 4, 2)!;

    const result = translateBranch(nodes, 4, translation)!;

    const byId = new Map(result.map((item) => [item.id, item]));
    expect(byId.get(4)).toMatchObject({ x: 440, y: 100 });
    expect(byId.get(6)).toMatchObject({ x: 660, y: 100 });
    expect(result[0]).toBe(nodes[0]);
    expect(result[1]).toBe(nodes[1]);
    expect(result[2]).toBe(nodes[2]);
    expect(result.map((item) => item.id)).toEqual([1, 2, 5, 4, 6]);
    expect(nodes).toEqual(before);
  });

  it("座標が変わらなければ、全要素が入力と同じオブジェクト", () => {
    const nodes = [
      node(1, null, 0, 0),
      node(2, 1, 220, 0),
      node(4, 1, 440, 0),
      node(6, 4, 660, 0),
    ];
    const translation = calculateIndentTranslation(nodes, 4, 2)!;
    expect(translation).toEqual({ rootX: 440, rootY: 0, dx: 0, dy: 0 });

    const result = translateBranch(nodes, 4, translation)!;

    expect(result).not.toBe(nodes);
    expect(result).toHaveLength(nodes.length);
    result.forEach((item, index) => expect(item).toBe(nodes[index]));
  });

  it("根が式の値と同じ位置にあれば同じオブジェクトのまま返し、遠い子孫があっても失敗しない", () => {
    const nodes = [
      node(1, null, 0, 0),
      createTestNode({ id: 2, parentId: 1, x: 0.1, y: 0, width: 0.2 }),
      node(4, 1, 0.1 + 0.2 + 120, 0),
      node(6, 4, 1e17, 0),
    ];
    const translation = calculateIndentTranslation(nodes, 4, 2)!;
    expect(translation).toEqual({ rootX: 0.1 + 0.2 + 120, rootY: 0, dx: 0, dy: 0 });

    const result = translateBranch(nodes, 4, translation);

    expect(result).not.toBeNull();
    result!.forEach((item, index) => expect(item).toBe(nodes[index]));
  });

  it("例 M8: 子孫の x が溢れたら、途中まで動いた配列を返さず null", () => {
    const nodes = replaceNode(createM2(), 6, { x: Number.MAX_VALUE });
    const translation = calculateIndentTranslation(nodes, 4, 2)!;
    expect(translation.dx).toBe(220);

    expect(translateBranch(nodes, 4, translation)).toBeNull();
  });

  it("根が無ければ null", () => {
    expect(
      translateBranch(createM2(), 99, { rootX: 0, rootY: 0, dx: 0, dy: 0 }),
    ).toBeNull();
  });
});

describe("applyBranchPlacement", () => {
  it("自動配置では計算を呼ばず、受け取った配列をそのまま返す", () => {
    const nodes = createM2();
    const calculate = jest.fn(() => ({ rootX: 1, rootY: 1, dx: 1, dy: 1 }));

    expect(applyBranchPlacement(nodes, 4, "auto", calculate)).toBe(nodes);
    expect(calculate).not.toHaveBeenCalled();
  });

  it("手動配置では計算した平行移動で枝を動かす", () => {
    const nodes = createM2();
    const translation = { rootX: 500, rootY: 600, dx: 10, dy: 20 };

    expect(applyBranchPlacement(nodes, 4, "manual", () => translation)).toEqual(
      translateBranch(nodes, 4, translation),
    );
  });

  it("手動配置で平行移動を求められなければ null を返す", () => {
    expect(applyBranchPlacement(createM2(), 4, "manual", () => null)).toBeNull();
  });

  it("手動配置で根が配列に無ければ null を返す", () => {
    expect(
      applyBranchPlacement(createM2(), 99, "manual", () => ({ rootX: 0, rootY: 0, dx: 0, dy: 0 })),
    ).toBeNull();
  });
});
