import Link from "next/link";
import { chargerIndexGuide, grouperParSection } from "@/lib/guide";
import BackLink from "@/components/ui/BackLink";
import BottomNav from "@/components/ui/BottomNav";

export const metadata = { title: "Le Guide" };

export default async function GuidePage() {
  const articles = await chargerIndexGuide();
  const sections = grouperParSection(articles);

  return (
    <main className="screen-main h-dvh gap-3 overflow-hidden px-4 py-4">
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto py-2">
        <BackLink href="/vestiaire" label="Retour au Vestiaire" />
        <h1 className="text-center font-display text-lg uppercase tracking-wide text-ink">
          Le Guide
        </h1>
        {sections.length === 0 ? (
          <p className="text-center text-sm text-muted">Guide en préparation.</p>
        ) : (
          sections.map(({ section, articles: articlesSection }) => (
            <section key={section} className="flex flex-col gap-2">
              <h2 className="font-hud text-xs font-semibold uppercase tracking-wide text-gold">
                {section}
              </h2>
              <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border">
                {articlesSection.map((article) => (
                  <li key={article.slug}>
                    <Link
                      href={`/guide/${article.slug}`}
                      className="block bg-surface px-3 py-2 transition-colors hover:bg-surface-2"
                    >
                      <span className="block text-sm text-ink">{article.titre}</span>
                      {article.resume && (
                        <span className="block text-xs text-muted">{article.resume}</span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
      <BottomNav active="vestiaire" />
    </main>
  );
}
