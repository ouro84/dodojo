import { notFound } from "next/navigation";
import ArticleMarkdown from "@/components/guide/ArticleMarkdown";
import { chargerCorpsArticle, chargerIndexGuide } from "@/lib/guide";
import BackLink from "@/components/ui/BackLink";
import BottomNav from "@/components/ui/BottomNav";

export async function generateStaticParams() {
  const articles = await chargerIndexGuide();
  return articles.map((article) => ({ slug: article.slug }));
}

// Set fermé de slugs résolu au build (pas de dépendance Notion au runtime,
// cf. CLAUDE.md). Un slug hors de generateStaticParams doit 404 au niveau
// routage (vrai statut HTTP 404), pas être rendu à la demande — avec
// dynamicParams par défaut (true), Next traite l'appel notFound() dans un
// slug non listé comme un fallback statique caché en 200 (header
// x-nextjs-prerender: 1), ce qui casse toute vérification de statut HTTP.
export const dynamicParams = false;

async function trouverMeta(slug: string) {
  const articles = await chargerIndexGuide();
  return articles.find((article) => article.slug === slug) ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const meta = await trouverMeta(slug);
  if (!meta) return { title: "Le Guide" };
  return { title: `${meta.titre} — Le Guide` };
}

export default async function GuideArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [meta, contenu] = await Promise.all([trouverMeta(slug), chargerCorpsArticle(slug)]);
  if (!meta || contenu === null) notFound();

  return (
    <main className="screen-main gap-4 px-4 py-6">
      <BackLink href="/guide" label="Tout le Guide" />
      <header className="flex flex-col gap-1">
        <p className="text-xs uppercase tracking-wide text-gold">{meta.section}</p>
        <h1 className="font-hud text-lg font-semibold uppercase tracking-wide text-ink">{meta.titre}</h1>
      </header>
      <article>
        <ArticleMarkdown contenu={contenu} />
      </article>
      <BottomNav active="qg" />
    </main>
  );
}
