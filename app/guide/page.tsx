import Link from "next/link";
import { chargerIndexGuide, grouperParSection } from "@/lib/guide";

export const metadata = { title: "Manuel du Dojo" };

export default async function GuidePage() {
  const articles = await chargerIndexGuide();
  const sections = grouperParSection(articles);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-6">
      <h1 className="text-center font-display text-lg uppercase tracking-wide text-ink">
        Manuel du Dojo
      </h1>
      {sections.length === 0 ? (
        <p className="text-center text-sm text-muted">Manuel en préparation.</p>
      ) : (
        sections.map(({ section, articles: articlesSection }) => (
          <section key={section} className="flex flex-col gap-2">
            <h2 className="font-display text-xs uppercase tracking-wide text-gold">{section}</h2>
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
      <Link href="/qg" className="self-center text-xs text-muted underline underline-offset-4">
        Retour au QG
      </Link>
    </main>
  );
}
