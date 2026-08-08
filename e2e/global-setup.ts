import { createClient } from "@supabase/supabase-js";
import { configuredE2eWorkerSuffixes, listUsersRetrying, purgeE2eAccountState, requireE2eAdminEnv } from "./fixtures";

// Purge l'état de combat de TOUS les comptes e2e configurés AVANT toute la
// suite (un compte par worker en CI, un seul en local — cf.
// `configuredE2eWorkerSuffixes`). Les nettoyages par test (afterEach) ne
// suffisent pas : dès qu'un overlay bloquant apparaît (Réveil sur des restes,
// bascule de jour…), ils échouent et les tâches s'accumulent, faisant boule
// de neige sur les runs suivants. Ce reset global casse le cycle en repartant
// d'une Arène vide. Tourne UNE FOIS dans le process principal Playwright,
// avant que les workers n'existent (`TEST_PARALLEL_INDEX` n'est pas défini
// ici) — d'où la boucle explicite plutôt qu'une résolution "worker courant".
//
// Échoue bruyamment si les credentials admin manquent, plutôt que de retourner
// silencieusement : un run sans purge donne l'illusion d'un compte propre alors
// qu'il accumule tâches/routines/succès/achats d'un run à l'autre.
export default async function globalSetup() {
  for (const suffix of configuredE2eWorkerSuffixes()) {
    const { url, key, email } = requireE2eAdminEnv(suffix);
    const admin = createClient(url, key, { auth: { persistSession: false } });
    const users = await listUsersRetrying(admin);
    const uid = users.find((u) => u.email === email)?.id;
    if (!uid) {
      throw new Error(`global-setup e2e : utilisateur de test introuvable pour ${email}.`);
    }
    await purgeE2eAccountState(admin, uid);
  }
}
