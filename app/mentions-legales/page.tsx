import type { Metadata } from "next";
import BackLink from "@/components/ui/BackLink";

export const metadata: Metadata = { title: "Mentions légales — Dodojo" };

// Issue #134. Page 100% statique, publique (cf. isPublicRoute) — lisible
// avant inscription. Éditeur particulier non-déclaré : identité réduite au
// minimum LCEN (art. 6-III), adresse complète communicable aux autorités
// compétentes via l'hébergeur, jamais publiée ici.
export default function MentionsLegalesPage() {
  return (
    <main className="screen-main gap-4 px-4 py-8">
      <BackLink href="/informations-legales" label="Retour aux informations légales" />
      <h1 className="text-center font-display text-lg uppercase tracking-wide text-ink">
        Mentions légales
      </h1>

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-sm uppercase tracking-wide text-muted">Édition</h2>
        <p className="text-sm text-ink">
          Dodojo est édité par un particulier, à titre non professionnel.
        </p>
        <p className="text-sm text-ink">
          Contact :{" "}
          <a
            href="mailto:arnaud.solente+dodojo@gmail.com"
            className="underline underline-offset-4"
          >
            arnaud.solente+dodojo@gmail.com
          </a>
        </p>
        <p className="text-xs text-muted">
          Conformément à l&apos;article 6-III de la loi n° 2004-575 du 21 juin 2004 pour la
          confiance dans l&apos;économie numérique, l&apos;éditeur, personne physique agissant à
          titre non professionnel, a communiqué son identité complète à l&apos;hébergeur
          ci-dessous. Cette identité est tenue à la disposition des autorités judiciaires qui en
          feraient la demande, sans être publiée sur ce site.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-sm uppercase tracking-wide text-muted">Hébergement</h2>
        <p className="text-sm text-ink">
          Vercel Inc.
          <br />
          440 N Barranca Avenue #4133
          <br />
          Covina, CA 91723
          <br />
          États-Unis
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-sm uppercase tracking-wide text-muted">
          Base de données et authentification
        </h2>
        <p className="text-sm text-ink">Supabase, hébergé dans l&apos;Union Européenne.</p>
      </section>
    </main>
  );
}
