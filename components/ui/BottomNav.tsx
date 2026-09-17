import Link from "next/link";

type NavKey = "arene" | "vestiaire" | "marche-noir";

interface BottomNavProps {
  active: NavKey;
}

const ITEMS: Array<{ key: NavKey; label: string; href: string }> = [
  { key: "arene", label: "Arène", href: "/" },
  { key: "vestiaire", label: "Vestiaire", href: "/vestiaire" },
  { key: "marche-noir", label: "Marché Noir", href: "/marche-noir" },
];

export default function BottomNav({ active }: BottomNavProps) {
  return (
    <nav
      aria-label="Navigation principale"
      className="sticky bottom-0 z-30 mt-auto flex justify-around border-t border-border bg-bg pt-2.5 lg:fixed lg:inset-y-0 lg:left-0 lg:mt-0 lg:w-20 lg:flex-col lg:items-center lg:justify-start lg:gap-1 lg:border-t-0 lg:border-r lg:pt-6"
    >
      {ITEMS.map((item) => {
        const isActive = item.key === active;
        return (
          <Link
            key={item.key}
            href={item.href}
            // Issue #211 bis : "/" (l'Arène) porte des effets de bord au
            // rendu (resolveDailyBoss, generateRecurringInstances) — un
            // prefetch en arrière-plan de ce lien (viewport, sur toutes les
            // pages où BottomNav est monté) est suspecté de déclencher une
            // exécution supplémentaire, non liée au clic réel de
            // l'utilisateur (même famille que le prefetch-exécute-le-composant-
            // serveur déjà diagnostiqué issue #156). Désactivé en filet
            // défensif : aucune page listée ici n'a besoin d'être préchargée
            // (rendu dynamique de toute façon, pas de cache statique perdu).
            prefetch={false}
            aria-current={isActive ? "page" : undefined}
            className={`flex min-h-11 flex-col items-center justify-center gap-1 px-4 py-2.5 text-micro uppercase tracking-wide transition-colors lg:w-full lg:px-1 lg:py-3 lg:text-center lg:leading-snug ${
              isActive ? "font-semibold text-ink" : "text-faint hover:text-ink focus-visible:text-ink"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                isActive ? "bg-hp" : "bg-faint"
              }`}
            />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
