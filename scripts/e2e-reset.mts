// Reset manuel de tous les comptes e2e configurés (ADR-04), hors suite
// Playwright — utile en debug local sans relancer tous les specs. Réutilise
// EXACTEMENT la même fonction de purge que `e2e/global-setup.ts`
// (`purgeE2eAccountState`, `e2e/fixtures.ts`), pour ne jamais laisser les deux
// mécanismes diverger silencieusement sur les tables couvertes — cette
// divergence entre resets ciblés (resetShopState, resetAchievementsState…) et
// purge globale est justement ce qui a laissé le compte partagé accumuler de
// l'état avant la refonte de ce script.
//
// Usage : npm run e2e:reset
import { createClient } from "@supabase/supabase-js";
import {
  configuredE2eWorkerSuffixes,
  listUsersRetrying,
  purgeE2eAccountState,
  requireE2eAdminEnv,
} from "../e2e/fixtures.ts";

try {
  process.loadEnvFile(".env.local");
} catch {
  // Pas de .env.local : les variables doivent déjà être dans l'environnement.
}

for (const suffix of configuredE2eWorkerSuffixes()) {
  const { url, key, email } = requireE2eAdminEnv(suffix);
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const users = await listUsersRetrying(admin);
  const uid = users.find((u) => u.email === email)?.id;
  if (!uid) {
    throw new Error(`e2e:reset : utilisateur de test introuvable pour ${email}.`);
  }
  await purgeE2eAccountState(admin, uid);
  console.log(`Compte e2e (${email}) purgé.`);
}
