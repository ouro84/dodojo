import Link from "next/link";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const composants: Components = {
  h2: ({ children }) => (
    <h2 className="mt-6 mb-2 font-display text-sm uppercase tracking-wide text-gold">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-4 mb-1 font-display text-xs uppercase tracking-wide text-ink">{children}</h3>
  ),
  p: ({ children }) => <p className="my-2 text-sm text-muted">{children}</p>,
  ul: ({ children }) => <ul className="my-2 ml-4 list-disc space-y-1 text-sm text-muted">{children}</ul>,
  ol: ({ children }) => (
    <ol className="my-2 ml-4 list-decimal space-y-1 text-sm text-muted">{children}</ol>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-3 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted [&>p]:my-0">
      {children}
    </blockquote>
  ),
  a: ({ href, children }) => {
    const cible = href ?? "#";
    const classe = "text-gold underline underline-offset-4 hover:text-ink";
    return cible.startsWith("/") ? (
      <Link href={cible} className={classe}>
        {children}
      </Link>
    ) : (
      <a href={cible} className={classe} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  },
  code: ({ children }) => (
    <code className="rounded bg-surface px-1 py-0.5 font-mono text-xs text-ink">{children}</code>
  ),
  pre: ({ children }) => (
    <pre className="my-3 overflow-x-auto rounded-lg bg-stage p-3 text-xs text-ink">{children}</pre>
  ),
  hr: () => <hr className="my-4 border-border" />,
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-border bg-surface px-2 py-1 text-left font-semibold text-ink">
      {children}
    </th>
  ),
  td: ({ children }) => <td className="border border-border px-2 py-1 text-muted">{children}</td>,
  img: ({ src, alt }) =>
    typeof src === "string" ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={alt ?? ""} className="my-3 rounded-lg" />
    ) : null,
};

export default function ArticleMarkdown({ contenu }: { contenu: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={composants}>
      {contenu}
    </ReactMarkdown>
  );
}
