import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { currentStreak, dayKey } from "@/lib/game-engine";
import { getHero, DEFAULT_HERO_ID } from "@/lib/heroes";
import StreakBadge from "@/components/combat/StreakBadge";
import HeroIdle from "@/components/combat/HeroIdle";
import InstallCta from "@/components/pwa/InstallCta";
import BottomNav from "@/components/ui/BottomNav";
import RecurringIcon from "@/components/ui/RecurringIcon";
import GameIcon, { type GameIconName } from "@/components/ui/GameIcon";

export const metadata: Metadata = { title: "Le Vestiaire — Dodojo" };

// Issue #187 : la pile de 7 boutons identiques devient une carte de nœuds —
// le chemin en pointillés est purement décoratif (vocabulaire "carte de
// niveaux" d'arcade), jamais une mécanique de progression : tous les nœuds
// restent cliquables direct, aucun verrou. Positions en % sur une base
// viewBox 300×460 (cf. maquette de shape) ; la taille "major" code
// l'importance réelle (Marché Noir / Tableau de Chasse), pas un ordre.
interface MapNode {
  href: string;
  icon: GameIconName | "recurring";
  label: string;
  left: number;
  top: number;
  major?: boolean;
}

const NODES: MapNode[] = [
  { href: "/vestiaire/profil", icon: "profil", label: "Profil", left: 30, top: 78 },
  {
    href: "/tableau-de-chasse",
    icon: "trophy",
    label: "Tableau de Chasse",
    left: 70,
    top: 63,
    major: true,
  },
  { href: "/vestiaire/entrainement", icon: "recurring", label: "Mes Routines", left: 30, top: 48 },
  {
    href: "/marche-noir",
    icon: "marche",
    label: "Le Marché Noir",
    left: 70,
    top: 33,
    major: true,
  },
  { href: "/vestiaire/artisans", icon: "artisans", label: "Les Artisans", left: 30, top: 18 },
  { href: "/guide", icon: "guide", label: "Le Guide", left: 50, top: 6 },
];

const PATH_POINTS = [
  [50, 93],
  [30, 78],
  [70, 63],
  [30, 48],
  [70, 33],
  [30, 18],
  [50, 6],
]
  .map(([x, y]) => `${x},${y}`)
  .join(" ");

export default async function QgPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile, error: profileError }, { data: dayResults, error: dayError }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("best_streak, timezone, equipped_hero_id, equipped_skin_id")
        .eq("id", user.id)
        .maybeSingle(),
      supabase.from("day_results").select("day_date, outcome").eq("user_id", user.id),
    ]);

  if (profileError || dayError) {
    throw profileError ?? dayError;
  }

  const today = dayKey(new Date(), profile?.timezone ?? "UTC");
  const streak = currentStreak(dayResults ?? [], today);
  const hero = getHero(profile?.equipped_hero_id ?? DEFAULT_HERO_ID) ?? getHero(DEFAULT_HERO_ID)!;

  return (
    <main className="screen-main h-dvh gap-3 overflow-hidden px-4 py-4">
      {/* Issue #189 : lg:justify-center comble le vide sous le contenu sur grand
          viewport (contenu naturellement plus court que h-dvh) sans risquer le
          piège classique de justify-content:center + overflow (contenu qui
          déborderait vers le haut serait tronqué au scroll) — restreint à
          lg: où le contenu ne déborde jamais en pratique. */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto py-2 lg:justify-center">
        <h1 className="text-center font-display text-lg uppercase tracking-wide text-ink">
          Le Vestiaire
        </h1>
        <InstallCta />

        <div className="relative mx-auto mb-10 h-[26rem] w-full max-w-xs">
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
            className="absolute inset-0 h-full w-full"
          >
            <polyline
              points={PATH_POINTS}
              fill="none"
              stroke="var(--color-border)"
              strokeWidth="0.6"
              strokeDasharray="0.5 2"
              strokeLinecap="round"
            />
          </svg>

          {/* Nœud "ici" : le héros équipé tient lieu de point de départ du chemin. */}
          <div
            className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
            style={{ left: "50%", top: "93%" }}
          >
            <HeroIdle hero={hero} skinId={profile?.equipped_skin_id ?? null} baseHeight={56} />
            <StreakBadge state={streak} />
            <p className="text-center text-[10px] text-faint">
              Record : {profile?.best_streak ?? 0} jours
            </p>
          </div>

          {NODES.map((node) => (
            <Link
              key={node.href}
              href={node.href}
              className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 rounded-md p-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-xp"
              style={{ left: `${node.left}%`, top: `${node.top}%` }}
            >
              <span
                className={`flex items-center justify-center rounded-full border bg-surface-2 ${
                  node.major ? "h-14 w-14 border-gold" : "h-11 w-11 border-border"
                }`}
              >
                {node.icon === "recurring" ? (
                  <RecurringIcon className={node.major ? "h-6 w-6 text-ink" : "h-5 w-5 text-ink"} />
                ) : (
                  <GameIcon name={node.icon} className={node.major ? "h-8 w-8" : "h-6 w-6"} />
                )}
              </span>
              <span className="max-w-[6rem] text-center text-micro uppercase tracking-wide text-muted">
                {node.label}
              </span>
            </Link>
          ))}
        </div>

        <Link
          href="/informations-legales"
          className="flex items-center justify-center gap-1.5 text-xs text-faint hover:text-ink"
        >
          <GameIcon name="legal" className="h-3.5 w-3.5" /> Informations légales
        </Link>
      </div>

      <BottomNav active="vestiaire" />
    </main>
  );
}
