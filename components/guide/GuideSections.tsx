import type { GuideSection } from "@/lib/guide";

export default function GuideSections({ sections }: { sections: GuideSection[] }) {
  return (
    <div className="flex flex-col gap-6">
      {sections.map((s) => (
        <section key={s.id} id={s.id} className="flex scroll-mt-4 flex-col gap-2">
          {s.title && (
            <h2 className="font-display text-sm uppercase tracking-wide text-gold">
              {s.title}
            </h2>
          )}
          {s.blocks.map((b, i) => {
            if (b.type === "p")
              return (
                <p key={i} className="text-sm text-muted">
                  {b.text}
                </p>
              );
            if (b.type === "h")
              return (
                <h3 key={i} className="font-display text-xs uppercase tracking-wide text-ink">
                  {b.text}
                </h3>
              );
            return (
              <ul key={i} className="ml-4 flex list-disc flex-col gap-1 text-sm text-muted">
                {b.items.map((it, j) => (
                  <li key={j}>{it}</li>
                ))}
              </ul>
            );
          })}
        </section>
      ))}
    </div>
  );
}
