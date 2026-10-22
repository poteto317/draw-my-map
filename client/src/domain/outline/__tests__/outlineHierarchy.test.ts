import {
  assignOutlineDepths,
  determineOutlineUnitWidth,
  type OutlineDepthAssignment,
  type OutlineIndentedLine,
} from "../outlineHierarchy";

// [tabs, spaces] の並びから、行番号が1からの連番の行を作る。
function lines(
  indents: readonly (readonly [number, number])[],
): OutlineIndentedLine[] {
  return indents.map(([tabs, spaces], index) => ({
    lineNumber: index + 1,
    tabs,
    spaces,
  }));
}

// 空白だけの行（tabs = 0）を作る。
function spacesOnly(spaces: readonly number[]): OutlineIndentedLine[] {
  return lines(spaces.map((value) => [0, value] as const));
}

// W を決めてから深さを決める（解析と同じ順）。
function assign(input: readonly OutlineIndentedLine[]): OutlineDepthAssignment {
  return assignOutlineDepths(input, determineOutlineUnitWidth(input));
}

// 深さ・親の不変条件を確かめる。
function expectHierarchyInvariants(
  result: OutlineDepthAssignment,
  length: number,
): void {
  expect(result.depths).toHaveLength(length);
  expect(result.parentIndexes).toHaveLength(length);
  if (length === 0) return;
  expect(result.depths[0]).toBe(0);
  for (let index = 0; index < length; index += 1) {
    const depth = result.depths[index];
    const parentIndex = result.parentIndexes[index];
    if (index > 0)
      expect(depth).toBeLessThanOrEqual(result.depths[index - 1] + 1);
    if (depth === 0) {
      expect(parentIndex).toBeNull();
    } else {
      expect(parentIndex).not.toBeNull();
      expect(parentIndex as number).toBeLessThan(index);
      expect(result.depths[parentIndex as number]).toBe(depth - 1);
    }
  }
}

// 設計書の例の表のうち、階層の段階に関係する例（取り込む行の tabs・spaces）。
const DESIGN_EXAMPLES: {
  example: number;
  input: OutlineIndentedLine[];
  unitWidth: number;
  depths: number[];
  parentIndexes: (number | null)[];
  adjustedLineNumbers: number[];
}[] = [
  {
    example: 1,
    input: spacesOnly([0, 2, 2, 0]),
    unitWidth: 2,
    depths: [0, 1, 1, 0],
    parentIndexes: [null, 0, 0, null],
    adjustedLineNumbers: [],
  },
  {
    example: 2,
    input: lines([
      [0, 0],
      [1, 0],
      [2, 0],
    ]),
    unitWidth: 1,
    depths: [0, 1, 2],
    parentIndexes: [null, 0, 1],
    adjustedLineNumbers: [],
  },
  {
    example: 3,
    input: spacesOnly([0, 2, 4]),
    unitWidth: 2,
    depths: [0, 1, 2],
    parentIndexes: [null, 0, 1],
    adjustedLineNumbers: [],
  },
  {
    example: 4,
    input: spacesOnly([0, 0, 3]),
    unitWidth: 3,
    depths: [0, 0, 1],
    parentIndexes: [null, null, 1],
    adjustedLineNumbers: [],
  },
  {
    example: 8,
    input: spacesOnly([0, 2, 6, 2]),
    unitWidth: 2,
    depths: [0, 1, 2, 1],
    parentIndexes: [null, 0, 1, 0],
    adjustedLineNumbers: [3],
  },
  {
    example: 9,
    input: spacesOnly([0, 4, 2]),
    unitWidth: 4,
    depths: [0, 1, 0],
    parentIndexes: [null, 0, null],
    adjustedLineNumbers: [3],
  },
  {
    example: 10,
    input: spacesOnly([2, 4, 2]),
    unitWidth: 2,
    depths: [0, 1, 0],
    parentIndexes: [null, 0, null],
    adjustedLineNumbers: [],
  },
  {
    example: 11,
    input: spacesOnly([4, 4, 2, 0]),
    unitWidth: 1,
    depths: [0, 0, 0, 0],
    parentIndexes: [null, null, null, null],
    adjustedLineNumbers: [3, 4],
  },
  {
    example: 14,
    input: lines([
      [0, 0],
      [1, 0],
      [0, 4],
    ]),
    unitWidth: 4,
    depths: [0, 1, 1],
    parentIndexes: [null, 0, 0],
    adjustedLineNumbers: [],
  },
  {
    example: 18,
    input: lines([
      [0, 0],
      [3, 0],
    ]),
    unitWidth: 1,
    depths: [0, 1],
    parentIndexes: [null, 0],
    adjustedLineNumbers: [2],
  },
  {
    example: 21,
    input: spacesOnly([0, 2, 3]),
    unitWidth: 2,
    depths: [0, 1, 2],
    parentIndexes: [null, 0, 1],
    adjustedLineNumbers: [3],
  },
  {
    example: 22,
    input: spacesOnly([0, 4, 2, 2, 0]),
    unitWidth: 4,
    depths: [0, 1, 0, 0, 0],
    parentIndexes: [null, 0, null, null, null],
    adjustedLineNumbers: [3],
  },
];

// 乱数を使わない固定の100行の入力。
const FIXED_HUNDRED_LINES = lines(
  Array.from(
    { length: 100 },
    (_, index) => [index % 3 === 0 ? 1 : 0, (index * 7) % 11] as const,
  ),
);

describe("determineOutlineUnitWidth", () => {
  it.each(
    DESIGN_EXAMPLES.map((example) => [example.example, example] as const),
  )("設計書の例%iのWを決める", (_, example) => {
    expect(determineOutlineUnitWidth(example.input)).toBe(example.unitWidth);
  });

  it("隣り合う行の正の増分からWを決める", () => {
    expect(determineOutlineUnitWidth(spacesOnly([0, 2, 4]))).toBe(2);
  });

  it("全体に下駄があっても最小値ではなく増分からWを決める", () => {
    expect(determineOutlineUnitWidth(spacesOnly([2, 6, 10, 6]))).toBe(4);
  });

  it("増分が無ければ1にする", () => {
    expect(determineOutlineUnitWidth(spacesOnly([0, 0]))).toBe(1);
  });

  it("タブだけの入力では1にする", () => {
    expect(
      determineOutlineUnitWidth(
        lines([
          [0, 0],
          [1, 0],
          [2, 0],
        ]),
      ),
    ).toBe(1);
  });

  it("空の入力では1にする", () => {
    expect(determineOutlineUnitWidth([])).toBe(1);
  });

  it("最も多く現れた増分をWにする", () => {
    // 増分は 2, 2, 1, 2, 2
    expect(determineOutlineUnitWidth(spacesOnly([0, 2, 4, 5, 7, 9]))).toBe(2);
  });

  it("最も多い増分が同数なら先に現れた値にする", () => {
    expect(determineOutlineUnitWidth(spacesOnly([0, 2, 6]))).toBe(2);
    expect(determineOutlineUnitWidth(spacesOnly([0, 4, 6]))).toBe(4);
  });

  it("同数の値が後から並んでも、先に現れた値にする", () => {
    // 増分は 4, 2, 2, 4（4 と 2 が2回ずつで、先に現れたのは 4）
    expect(determineOutlineUnitWidth(spacesOnly([0, 4, 0, 2, 4, 0, 4]))).toBe(
      4,
    );
  });

  it("タブの行のSは0として増分を数える", () => {
    // 増分は 0→4 の1回だけ
    expect(
      determineOutlineUnitWidth(
        lines([
          [0, 0],
          [1, 0],
          [0, 4],
        ]),
      ),
    ).toBe(4);
  });
});

describe("assignOutlineDepths", () => {
  it.each(
    DESIGN_EXAMPLES.map((example) => [example.example, example] as const),
  )("設計書の例%iの深さ・親・補正の警告の行を決める", (_, example) => {
    const result = assign(example.input);

    expect(result.depths).toEqual(example.depths);
    expect(result.parentIndexes).toEqual(example.parentIndexes);
    expect(result.adjustedLineNumbers).toEqual(example.adjustedLineNumbers);
  });

  it("空の入力では空の結果を返す", () => {
    expect(assignOutlineDepths([], 1)).toEqual({
      depths: [],
      parentIndexes: [],
      adjustedLineNumbers: [],
      levelOperationCount: 0,
    });
  });

  it("最初の行はインデントされていても深さ0で警告しない", () => {
    const result = assignOutlineDepths(spacesOnly([6]), 2);

    expect(result.depths).toEqual([0]);
    expect(result.parentIndexes).toEqual([null]);
    expect(result.adjustedLineNumbers).toEqual([]);
  });

  describe("一致", () => {
    it("同じインデント値の行は同じ段の兄弟にし、警告しない", () => {
      const result = assignOutlineDepths(spacesOnly([0, 2, 2, 2]), 2);

      expect(result.depths).toEqual([0, 1, 1, 1]);
      expect(result.parentIndexes).toEqual([null, 0, 0, 0]);
      expect(result.adjustedLineNumbers).toEqual([]);
    });
  });

  describe("深い", () => {
    it("Wだけ深い行は1段深くし、警告しない", () => {
      const result = assignOutlineDepths(spacesOnly([0, 2]), 2);

      expect(result.depths).toEqual([0, 1]);
      expect(result.parentIndexes).toEqual([null, 0]);
      expect(result.adjustedLineNumbers).toEqual([]);
    });

    it("2段以上深い行も1段だけ深くし、警告する", () => {
      const result = assignOutlineDepths(spacesOnly([0, 6]), 2);

      expect(result.depths).toEqual([0, 1]);
      expect(result.parentIndexes).toEqual([null, 0]);
      expect(result.adjustedLineNumbers).toEqual([2]);
    });

    it("1段に満たない半端な深さの行も1段深くし、警告する", () => {
      const result = assignOutlineDepths(spacesOnly([0, 3]), 2);

      expect(result.depths).toEqual([0, 1]);
      expect(result.adjustedLineNumbers).toEqual([2]);
    });

    it("一致した行の後の深い行は、一致した行のインデント値からの増分で警告を判定する", () => {
      // W = 4。3行目で深さ0の段の values が {0, 2} になり、4行目の 0 は一致。5行目は 0 から W だけ深い
      const result = assign(spacesOnly([0, 4, 2, 0, 4]));

      expect(result.depths).toEqual([0, 1, 0, 0, 1]);
      expect(result.parentIndexes).toEqual([null, 0, null, null, 3]);
      expect(result.adjustedLineNumbers).toEqual([3]);
    });

    it("タブはWに換算して深さを比べる", () => {
      // v = 0, 2, 4（タブ1つ = W = 2）
      const result = assignOutlineDepths(
        lines([
          [0, 0],
          [1, 0],
          [1, 2],
        ]),
        2,
      );

      expect(result.depths).toEqual([0, 1, 2]);
      expect(result.adjustedLineNumbers).toEqual([]);
    });
  });

  describe("揃える", () => {
    it("段の間の行は浅いほうの段に揃え、深すぎる行と揃えた行に警告する", () => {
      const input = spacesOnly([0, 2, 6, 4]);
      const result = assign(input);

      expect(result.depths).toEqual([0, 1, 2, 1]);
      expect(result.parentIndexes).toEqual([null, 0, 1, 0]);
      expect(result.adjustedLineNumbers).toEqual([3, 4]);
    });

    it("最初の段より浅い行は深さ0の段に揃え、警告する", () => {
      const result = assign(spacesOnly([4, 4, 2, 0]));

      expect(result.depths).toEqual([0, 0, 0, 0]);
      expect(result.parentIndexes).toEqual([null, null, null, null]);
      expect(result.adjustedLineNumbers).toEqual([3, 4]);
    });

    it("同じ段の値の間の行はその段に揃え、警告する", () => {
      // W = 4。3行目の 2 で深さ0の段の values が {0, 2} になり、5行目の 1 はその間
      const result = assign(spacesOnly([0, 4, 2, 0, 1]));

      expect(result.depths).toEqual([0, 1, 0, 0, 0]);
      expect(result.parentIndexes).toEqual([null, 0, null, null, null]);
      expect(result.adjustedLineNumbers).toEqual([3, 5]);
    });

    it("揃えた後の同じインデントの行は兄弟として警告しない", () => {
      const result = assign(spacesOnly([0, 4, 2, 2, 0]));

      expect(result.depths).toEqual([0, 1, 0, 0, 0]);
      expect(result.adjustedLineNumbers).toEqual([3]);
    });
  });

  describe("警告の位置", () => {
    it("深すぎる行にだけ警告し、元の段に戻った行には警告しない", () => {
      expect(assign(spacesOnly([0, 2, 6, 2])).adjustedLineNumbers).toEqual([3]);
    });

    it("最も多い増分をWにするので、半端に深い行にだけ警告する", () => {
      expect(assign(spacesOnly([0, 2, 3])).adjustedLineNumbers).toEqual([3]);
    });

    it("警告の行番号は入力の行番号をそのまま使う", () => {
      const input: OutlineIndentedLine[] = [
        { lineNumber: 2, tabs: 0, spaces: 0 },
        { lineNumber: 5, tabs: 0, spaces: 6 },
        { lineNumber: 9, tabs: 0, spaces: 3 },
      ];

      expect(assignOutlineDepths(input, 2).adjustedLineNumbers).toEqual([5, 9]);
    });
  });

  describe("親", () => {
    it("深い段を取り除いた後の親は、残った段に最後に置いた項目にする", () => {
      const result = assign(spacesOnly([0, 2, 2, 0, 2]));

      expect(result.parentIndexes).toEqual([null, 0, 0, null, 3]);
    });
  });

  describe("不変条件", () => {
    it.each<[string, OutlineIndentedLine[]]>([
      ...DESIGN_EXAMPLES.map((example): [string, OutlineIndentedLine[]] => [
        `設計書の例${example.example}`,
        example.input,
      ]),
      ["一致", spacesOnly([0, 2, 2, 2])],
      ["深い（2段以上）", spacesOnly([0, 6])],
      ["深い（半端）", spacesOnly([0, 3])],
      ["段の間", spacesOnly([0, 2, 6, 4])],
      ["最初の段より浅い", spacesOnly([4, 4, 2, 0])],
      ["同じ段の値の間", spacesOnly([0, 4, 2, 0, 1])],
      ["親", spacesOnly([0, 2, 2, 0, 2])],
      ["一致の後の深い行", spacesOnly([0, 4, 2, 0, 4])],
      ["固定の100行", FIXED_HUNDRED_LINES],
    ])("%s: 深さは直前+1以下で、親は1段浅い前の項目", (_, input) => {
      expectHierarchyInvariants(assign(input), input.length);
    });
  });

  describe("計算量", () => {
    const CHAIN_LENGTH = 10_000;

    it("10,000段の鎖でも例外を出さず、levelsの操作は行数の10倍以内", () => {
      const input = spacesOnly(
        Array.from({ length: CHAIN_LENGTH }, (_, index) => index * 2),
      );
      const result = assign(input);

      expect(result.depths[CHAIN_LENGTH - 1]).toBe(CHAIN_LENGTH - 1);
      expect(result.adjustedLineNumbers).toEqual([]);
      expect(result.levelOperationCount).toBeLessThanOrEqual(10 * CHAIN_LENGTH);
    });

    it("末尾の参照・取り除く・積む・親の参照をそれぞれ数える", () => {
      // 1行目: 積む(1)。2行目: 末尾の参照(1)・積む(1)・親の参照(1)。
      // 3行目: 取り除く前の参照(1)・取り除く(1)・末尾の参照(1)。深さ0なので親の参照なし
      expect(
        assignOutlineDepths(spacesOnly([0, 2, 0]), 2).levelOperationCount,
      ).toBe(7);
    });

    it("10,000件の兄弟でlevelsの操作は行数の10倍以内", () => {
      const input = spacesOnly(Array.from({ length: CHAIN_LENGTH }, () => 0));
      const result = assign(input);

      expect(result.depths.every((depth) => depth === 0)).toBe(true);
      expect(result.levelOperationCount).toBeLessThanOrEqual(10 * CHAIN_LENGTH);
    });

    it("深い鎖の後に一気に0へ戻っても、levelsの操作は行数の10倍以内", () => {
      const half = CHAIN_LENGTH / 2;
      const input = spacesOnly(
        Array.from({ length: CHAIN_LENGTH }, (_, index) =>
          index < half ? index * 2 : 0,
        ),
      );
      const result = assign(input);

      expect(result.depths[half - 1]).toBe(half - 1);
      expect(result.depths[half]).toBe(0);
      expect(result.depths[CHAIN_LENGTH - 1]).toBe(0);
      expect(result.levelOperationCount).toBeLessThanOrEqual(10 * CHAIN_LENGTH);
    });
  });
});
