import type { Metadata } from "next";
import BackLink from "@/components/ui/BackLink";

export const metadata: Metadata = { title: "Conditions Générales d'Utilisation — Dodojo" };

// Issue #134. CGU courtes, pas de CGV (aucun paiement réel dans l'app à ce
// jour) — à ajouter si une monétisation réelle est introduite plus tard.
export default function CguPage() {
  return (
    <main className="screen-main gap-4 px-4 py-8">
      <BackLink href="/informations-legales" label="Retour aux informations légales" />
      <h1 className="text-center font-display text-lg uppercase tracking-wide text-ink">
        Conditions Générales d&apos;Utilisation
      </h1>

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-sm uppercase tracking-wide text-muted">Objet</h2>
        <p className="text-sm text-ink">
          Ces conditions régissent l&apos;utilisation de Dodojo, une application personnelle de
          productivité gratuite.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-sm uppercase tracking-wide text-muted">Or virtuel</h2>
        <p className="text-sm text-ink">
          L&apos;or gagné en jouant n&apos;a aucune valeur réelle. Il ne peut être ni remboursé,
          ni converti en argent réel, ni transféré à un autre compte.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-sm uppercase tracking-wide text-muted">
          Usage du compte
        </h2>
        <p className="text-sm text-ink">
          Ton compte est personnel. Ne le partage pas, ne le revends pas.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-sm uppercase tracking-wide text-muted">
          Responsabilité
        </h2>
        <p className="text-sm text-ink">
          Dodojo est un projet personnel, fourni tel quel. Sa disponibilité continue
          n&apos;est pas garantie.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-sm uppercase tracking-wide text-muted">
          Droit applicable
        </h2>
        <p className="text-sm text-ink">Droit français.</p>
      </section>
    </main>
  );
}
