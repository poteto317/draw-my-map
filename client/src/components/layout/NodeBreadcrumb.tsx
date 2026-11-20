import { useLayoutEffect, useRef } from "react";
import { getNodeDisplayLabel } from "@/domain/nodes/nodeDisplayLabel";
import type { Node } from "@/types/node";

type NodeBreadcrumbProps = {
  breadcrumb: readonly Node[];
  onNavigate: (nodeId: number) => void;
};

const buttonClassName =
  "shrink-0 rounded-md bg-zinc-100 px-3 py-1 text-sm text-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-60 dark:bg-zinc-700 dark:text-zinc-200";

export function NodeBreadcrumb({ breadcrumb, onNavigate }: NodeBreadcrumbProps) {
  const breadcrumbRef = useRef<HTMLElement>(null);
  const currentNodeId = breadcrumb.at(-1)?.id;

  useLayoutEffect(() => {
    const navigation = breadcrumbRef.current;
    if (!navigation || navigation.contains(document.activeElement)) return;
    navigation.scrollLeft = navigation.scrollWidth;
  }, [currentNodeId]);

  if (breadcrumb.length === 0) return null;

  return (
    <nav ref={breadcrumbRef} aria-label="パンくず" className="min-w-0 max-w-full overflow-x-auto">
      <ol className="flex w-max items-center gap-2 px-1 py-1 whitespace-nowrap">
        {breadcrumb.map((node, index) => {
          const label = getNodeDisplayLabel(node.label);
          return (
            <li key={node.id} className="flex items-center gap-2">
              {index > 0 && <span aria-hidden="true">›</span>}
              {node.id === currentNodeId ? (
                <span aria-current="location" className="max-w-48 truncate" title={label}>{label}</span>
              ) : (
                <button
                  type="button"
                  className={`${buttonClassName} max-w-48 truncate`}
                  title={label}
                  onClick={() => onNavigate(node.id)}
                >
                  {label}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
