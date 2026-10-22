import type { OutlinePreviewNode } from "@/domain/outline/outlinePreview";

type OutlinePreviewTreeProps = {
  roots: readonly OutlinePreviewNode[];
};

// 読むだけの木なので role="tree" を使わず、入れ子の <ul> で階層を伝える。
// ラベルは buildOutlinePreview が表示用に短くした値をそのまま出す。
// 長いラベルで属性が巨大にならないよう、全文を title に入れない。
function OutlinePreviewList({
  nodes,
  nested,
}: {
  nodes: readonly OutlinePreviewNode[];
  nested: boolean;
}) {
  return (
    <ul className={nested ? "pl-4" : undefined}>
      {nodes.map((node) => (
        <li key={node.key} className="whitespace-nowrap">
          {node.label}
          {node.children.length > 0 && (
            <OutlinePreviewList nodes={node.children} nested />
          )}
        </li>
      ))}
    </ul>
  );
}

export function OutlinePreviewTree({ roots }: OutlinePreviewTreeProps) {
  return <OutlinePreviewList nodes={roots} nested={false} />;
}
