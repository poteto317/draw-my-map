"use client";

import { createContext, useContext, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { normalizeNodeNote } from "@/domain/nodes/nodeNote";
import {
  formatNoteMarkdownImageLabel,
  toSafeNoteMarkdownImageHref,
  toSafeNoteMarkdownLinkHref,
} from "@/domain/nodes/nodeNoteMarkdownUrl";

type NodeNoteMarkdownProps = {
  markdown: string;
};

const REMARK_PLUGINS = [remarkGfm];

// 既定の urlTransform は危険スキームを空文字 "" に変えて <a href=""> を残すため、
// 恒等関数で元の文字列を渡し、components.a / components.img で検証して <span> へ落とす（L-018・L-032）
const identityUrlTransform = (url: string): string => url;

// [![alt](img)](link) のように <a> の内側に画像があるとき、<a> の中に <a> を入れ子にしないための文脈（L-835）
const InsideMarkdownLinkContext = createContext(false);

const LINK_CLASS_NAME =
  "break-all text-blue-600 underline hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300";

function MarkdownLink({ href, children }: { href?: string; children?: ReactNode }) {
  const safeHref = typeof href === "string" ? toSafeNoteMarkdownLinkHref(href) : null;
  if (safeHref === null) {
    return <span>{children}</span>;
  }
  return (
    <InsideMarkdownLinkContext.Provider value={true}>
      <a
        href={safeHref}
        target="_blank"
        rel="noopener noreferrer"
        className={LINK_CLASS_NAME}
      >
        {children}
      </a>
    </InsideMarkdownLinkContext.Provider>
  );
}

function MarkdownImage({ src, alt }: { src?: string | Blob; alt?: string }) {
  const isInsideLink = useContext(InsideMarkdownLinkContext);
  const label = formatNoteMarkdownImageLabel(alt);
  if (isInsideLink) {
    return <span>{label}</span>;
  }
  const safeHref = typeof src === "string" ? toSafeNoteMarkdownImageHref(src) : null;
  if (safeHref === null) {
    return <span className="text-zinc-600 dark:text-zinc-400">{label}</span>;
  }
  return (
    <a
      href={safeHref}
      target="_blank"
      rel="noopener noreferrer"
      className={LINK_CLASS_NAME}
    >
      {label}
    </a>
  );
}

const MARKDOWN_COMPONENTS: Components = {
  a: ({ href, children }) => <MarkdownLink href={href}>{children}</MarkdownLink>,
  img: ({ src, alt }) => <MarkdownImage src={src} alt={alt} />,
  input: ({ type, checked }) => {
    if (type !== "checkbox") return null;
    return (
      <input
        type="checkbox"
        checked={Boolean(checked)}
        disabled
        readOnly
        tabIndex={-1}
        className="mr-1.5 align-middle"
      />
    );
  },
  h1: ({ children }) => (
    <h1 className="text-base font-bold text-zinc-900 dark:text-zinc-50">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-50">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{children}</h4>
  ),
  h5: ({ children }) => (
    <h5 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{children}</h5>
  ),
  h6: ({ children }) => (
    <h6 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{children}</h6>
  ),
  p: ({ children }) => (
    <p className="leading-relaxed whitespace-pre-wrap break-words">{children}</p>
  ),
  ul: ({ children }) => <ul className="list-disc space-y-1 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal space-y-1 pl-5">{children}</ol>,
  li: ({ children }) => <li className="break-words">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-zinc-300 pl-3 text-zinc-600 dark:border-zinc-600 dark:text-zinc-300">
      {children}
    </blockquote>
  ),
  pre: ({ children }) => (
    <pre className="whitespace-pre-wrap break-words rounded-md bg-zinc-100 p-2 font-mono text-xs text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">
      {children}
    </pre>
  ),
  code: ({ children }) => (
    <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-xs text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">
      {children}
    </code>
  ),
  table: ({ children }) => (
    <table className="w-full table-fixed border-collapse text-xs">{children}</table>
  ),
  th: ({ children }) => (
    <th className="border border-zinc-300 bg-zinc-100 px-2 py-1 text-left font-semibold break-words dark:border-zinc-600 dark:bg-zinc-900">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-zinc-300 px-2 py-1 break-words dark:border-zinc-600">
      {children}
    </td>
  ),
  hr: () => <hr className="border-zinc-200 dark:border-zinc-700" />,
  del: ({ children }) => (
    <del className="text-zinc-500 line-through dark:text-zinc-400">{children}</del>
  ),
};

export function NodeNoteMarkdown({ markdown }: NodeNoteMarkdownProps) {
  const normalized = normalizeNodeNote(markdown);
  if (normalized === undefined) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">メモはありません</p>;
  }
  return (
    <div className="flex flex-col gap-2 break-words text-sm text-zinc-800 dark:text-zinc-100">
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        urlTransform={identityUrlTransform}
        components={MARKDOWN_COMPONENTS}
      >
        {normalized}
      </ReactMarkdown>
    </div>
  );
}
