import type { AggressivityLevel } from "../../types";
import { pickVariant, randomSeed } from "./variant";

// Issue #116 : ligne de La Voix affichée une seule fois par déblocage
// journalier de la section "Demain" (heure seuil franchie) — seed figé côté
// Arena.tsx à la transition (même patron que PerfectOverlay/emptyState).
export function planningUnlockedLine(
  level: AggressivityLevel,
  seed: number = randomSeed(),
): string {
  const pools: Record<AggressivityLevel, string[]> = {
    doux: [
      "La nuit approche. Si tu veux, prépare doucement demain.",
      "Le jour se referme bientôt. Demain peut déjà t'attendre, sans pression.",
      "Un peu de calme avant la nuit : et si demain se préparait maintenant ?",
      "Rien ne t'oblige, mais demain peut déjà prendre forme ici.",
      "Le soir s'installe. Demain a le temps d'être pensé, doucement.",
    ],
    direct: [
      "La journée touche à sa fin. Prépare demain pendant que c'est frais.",
      "Il se fait tard — pose déjà ce que demain devra affronter.",
      "Fin de journée : le moment de planifier la suite.",
      "Demain n'attend pas. Pose tes prochaines cibles ici.",
      "La section Demain est ouverte. Prépare le prochain combat.",
    ],
    brut: [
      "La journée crève, merde. Prépare demain avant de t'effondrer.",
      "Bouge-toi, il est tard : balance déjà ce qui attend demain.",
      "Demain va te tomber dessus. Prépare le terrain, maintenant.",
      "T'as fini de glander aujourd'hui ? Pose demain, tout de suite.",
      "La nuit approche, connard — demain se prépare pas tout seul.",
    ],
  };
  return pickVariant(pools[level], seed);
}
