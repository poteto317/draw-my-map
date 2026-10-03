// すでにイラストがあるノードでは、生成の操作は「再生成」（結果は、プレビューを確認してから置き換える）
export function getIllustrationActionLabel(hasIllustration: boolean): string {
  return hasIllustration ? "イラストを再生成" : "イラストを生成";
}
