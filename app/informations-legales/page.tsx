import Link from "next/link";
import type { Metadata } from "next";
import BackLink from "@/components/ui/BackLink";

export const metadata: Metadata = { title: "Informations légales — Dodojo" };

const PAGES: Array<{ href: string; label: string }> = [
  { href: "/mentions-legales", label: "Mentions légales" },
  { href: "/confidentialite", label: "Politique de confidentialité" },
  { href: "/cgu", label: "Conditions Générales d'Utilisation" },
];

// Issue #134. Sommaire statique, public (cf. isPublicRoute) — pas de
// BottomNav : ce hub doit rester lisible par un visiteur non authentifié
// (lien depuis /welcome), pour qui les onglets Arène/Marché Noir n'ont pas
// de sens avant inscription.
export default function InformationsLegalesPage() {
  return (
    <main className="screen-main gap-4 px-4 py-8">
      <BackLink href="/vestiaire" label="Retour au Vestiaire" />
      <h1 className="text-center font-display text-lg uppercase tracking-wide text-ink">
        Informations légales
      </h1>
      <nav aria-label="Pages légales" className="flex flex-col gap-2">
        {PAGES.map((page) => (
          <Link
            key={page.href}
            href={page.href}
            className="flex items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 py-3 text-sm text-ink hover:border-ink"
          >
            {page.label}
            <span aria-hidden="true" className="text-faint">
              ›
            </span>
          </Link>
        ))}
      </nav>
    </main>
  );
}
