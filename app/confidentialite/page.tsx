import type { Metadata } from "next";
import BackLink from "@/components/ui/BackLink";

export const metadata: Metadata = { title: "Politique de confidentialité — Dodojo" };

// Issue #134. Tension documentée avec RG-04 (CLAUDE.md) : le droit à
// l'effacement RGPD est un droit sur les données PERSONNELLES, distinct de
// l'historique de jeu que RG-04 protège — traité manuellement par email pour
// l'instant (dette assumée MVP), jamais un flow en self-service.
export default function ConfidentialitePage() {
  return (
    <main className="screen-main gap-4 px-4 py-8">
      <BackLink href="/informations-legales" label="Retour aux informations légales" />
      <h1 className="text-center font-display text-lg uppercase tracking-wide text-ink">
        Politique de confidentialité
      </h1>

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-sm uppercase tracking-wide text-muted">
          Données collectées
        </h2>
        <p className="text-sm text-ink">
          Email, pseudo, fuseau horaire, niveau d&apos;agressivité de La Voix, historique de
          tâches et de combats, souscription aux notifications push (si activée), jeton de
          webhook (si généré). Si tu connectes Gemini à Dodojo : les informations techniques de
          cette connexion (client OAuth, jetons d&apos;accès).
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-sm uppercase tracking-wide text-muted">
          Pourquoi ces données
        </h2>
        <p className="text-sm text-ink">
          Uniquement pour fournir le service que tu utilises : faire fonctionner ton compte, ton
          combat quotidien et tes réglages. Aucune finalité publicitaire, aucune revente à des
          tiers.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-sm uppercase tracking-wide text-muted">
          Qui héberge/traite ces données
        </h2>
        <ul className="list-disc pl-5 text-sm text-ink">
          <li>Supabase (base de données et authentification, hébergé dans l&apos;Union Européenne)</li>
          <li>Vercel (hébergement de l&apos;application)</li>
          <li>Inngest (envoi programmé des rappels de notification)</li>
          <li>
            Le service de notification de ton navigateur (Google, Mozilla ou Apple selon le
            navigateur utilisé) si tu actives les notifications push — il ne reçoit que
            l&apos;URL technique de ta souscription, jamais le contenu de tes tâches.
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-sm uppercase tracking-wide text-muted">
          Durée de conservation
        </h2>
        <p className="text-sm text-ink">
          Tant que ton compte existe. Voir la section « Tes droits » ci-dessous pour en demander
          la suppression.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-sm uppercase tracking-wide text-muted">Cookies</h2>
        <p className="text-sm text-ink">
          Dodojo pose un seul cookie : celui de ta session de connexion (Supabase), strictement
          nécessaire au fonctionnement du service. Aucun cookie publicitaire, aucun cookie de
          suivi tiers — aucun bandeau de consentement n&apos;est donc nécessaire aujourd&apos;hui.
          Ce point sera revu si un outil de mesure d&apos;audience est ajouté un jour.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-sm uppercase tracking-wide text-muted">Tes droits</h2>
        <p className="text-sm text-ink">
          Tu peux demander l&apos;accès, la rectification ou la suppression de tes données
          personnelles à tout moment. Écris à{" "}
          <a
            href="mailto:arnaud.solente+dodojo@gmail.com"
            className="underline underline-offset-4"
          >
            arnaud.solente+dodojo@gmail.com
          </a>{" "}
          — ta demande sera traitée manuellement, sous 30 jours.
        </p>
      </section>
    </main>
  );
}
