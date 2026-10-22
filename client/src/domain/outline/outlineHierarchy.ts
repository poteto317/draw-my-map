// 取り込む行のインデントから、標準の1段の幅 W と、各行の深さ・親を決める。

// 取り込む行だけ（空行と記号だけの行を除く）を入力の順に並べたもの。
export type OutlineIndentedLine = {
  lineNumber: number; // 分割の結果の行番号（1 始まり）
  tabs: number; // 行頭のタブの数 T
  spaces: number; // 行頭の空白の幅 S
};

export type OutlineDepthAssignment = {
  depths: number[]; // lines と同じ長さ
  parentIndexes: (number | null)[]; // lines の添字。深さ0は null
  adjustedLineNumbers: number[]; // 補正の警告の対象の行番号（全件、入力の順）
  levelOperationCount: number; // levels の操作の回数。計算量のテスト用
};

// 深さ d の段。不変条件: 段 d の values はすべて、段 d + 1 の min より小さい。
type OutlineLevel = {
  values: Set<number>; // その段に揃えたインデント値の集合
  min: number;
  max: number;
  lastV: number; // その段に最後に置いた行のインデント値
  lastIndex: number; // その段に最後に置いた項目の添字
};

// 隣り合う2行の S の正の増分のうち、最も多く現れた値（同数なら先に現れた値）。
// 増分が無ければ 1。Map は挿入順に並ぶので、数えた後の走査で先に現れた値が残る。
export function determineOutlineUnitWidth(
  lines: readonly OutlineIndentedLine[],
): number {
  const counts = new Map<number, number>();
  for (let index = 1; index < lines.length; index += 1) {
    const increase = lines[index].spaces - lines[index - 1].spaces;
    if (increase > 0) counts.set(increase, (counts.get(increase) ?? 0) + 1);
  }

  let unitWidth = 1;
  let bestCount = 0;
  for (const [increase, count] of counts) {
    if (count > bestCount) {
      unitWidth = increase;
      bestCount = count;
    }
  }
  return unitWidth;
}

function createLevel(value: number, index: number): OutlineLevel {
  return {
    values: new Set([value]),
    min: value,
    max: value,
    lastV: value,
    lastIndex: index,
  };
}

// 設計書の「階層の補正」の手順。levels の末尾から段を取り除き、取り除いた段は戻さない。
// values への追加は1行につき最大1回なので、全体で行数に比例する。再帰は使わない。
export function assignOutlineDepths(
  lines: readonly OutlineIndentedLine[],
  unitWidth: number,
): OutlineDepthAssignment {
  const depths: number[] = [];
  const parentIndexes: (number | null)[] = [];
  const adjustedLineNumbers: number[] = [];
  const levels: OutlineLevel[] = [];
  let levelOperationCount = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const value = line.tabs * unitWidth + line.spaces;

    // 最初の行は深さ0。インデントされていても警告しない。
    if (index === 0) {
      levels.push(createLevel(value, index));
      levelOperationCount += 1;
      depths.push(0);
      parentIndexes.push(null);
      continue;
    }

    // v より深い段（min が v より大きい段）を末尾から取り除く。深さ0の段は残す。
    let popped = false;
    while (levels.length >= 2) {
      levelOperationCount += 1;
      if (levels[levels.length - 1].min <= value) break;
      levels.pop();
      levelOperationCount += 1;
      popped = true;
    }

    const top = levels[levels.length - 1];
    const topDepth = levels.length - 1;
    levelOperationCount += 1;

    let depth: number;
    if (top.values.has(value)) {
      // 一致: 同じ段の兄弟。
      depth = topDepth;
      top.lastV = value;
      top.lastIndex = index;
    } else if (!popped && value > top.max) {
      // 深い: どれだけ深くても1段だけ深くする。W と違う量だけ深いときに警告する。
      depth = topDepth + 1;
      if (value - top.lastV !== unitWidth)
        adjustedLineNumbers.push(line.lineNumber);
      levels.push(createLevel(value, index));
      levelOperationCount += 1;
    } else {
      // 揃える: 段の間・最初の段より浅い・同じ段の値の間。後続の同じ値の行が一致になるよう values に加える。
      depth = topDepth;
      top.values.add(value);
      levelOperationCount += 1;
      if (value < top.min) top.min = value;
      if (value > top.max) top.max = value;
      top.lastV = value;
      top.lastIndex = index;
      adjustedLineNumbers.push(line.lineNumber);
    }

    depths.push(depth);
    if (depth === 0) {
      parentIndexes.push(null);
    } else {
      parentIndexes.push(levels[depth - 1].lastIndex);
      levelOperationCount += 1;
    }
  }

  return { depths, parentIndexes, adjustedLineNumbers, levelOperationCount };
}
