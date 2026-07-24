import type { AggressivityLevel } from "@/types";

const DEFAULT_LEVEL: AggressivityLevel = "direct";

// Le type Profile déclare `aggressivity_level: AggressivityLevel` (non-nullable),
// mais un profil créé avant la migration US-49/US-54 peut avoir NULL en base
// (pas de backfill au moment de la migration) — le type ment sur la forme
// runtime réelle. Point d'entrée UNIQUE pour résoudre une valeur sûre : tout
// lecteur de `profiles.aggressivity_level` doit passer par ici plutôt que
// dupliquer `?? "direct"` (la divergence entre app/qg/page.tsx et
// components/combat/Arena.tsx est exactement ce qui a causé le crash
// pickVariant(pools[undefined]) dans lib/copy/rituals.ts).
export function resolveAggressivityLevel(
  value: AggressivityLevel | null | undefined,
): AggressivityLevel {
  return value ?? DEFAULT_LEVEL;
}
