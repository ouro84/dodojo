import { createClient } from "@supabase/supabase-js";
import { listUsersRetrying, purgeE2eAccountState, requireE2eAdminEnv } from "./fixtures";

// Purge l'état de combat du compte e2e fixe AVANT toute la suite. Les nettoyages
// par test (afterEach) ne suffisent pas : dès qu'un overlay bloquant apparaît
// (Réveil sur des restes, bascule de jour…), ils échouent et les
// tâches s'accumulent, faisant boule de neige sur les runs suivants. Ce reset
// global casse le cycle en repartant d'une Arène vide. Tourne dans le process
// Playwright (mêmes droits admin que les autres fixtures : seedStreak, etc.).
//
// Échoue bruyamment si les credentials admin manquent, plutôt que de retourner
// silencieusement : un run sans purge donne l'illusion d'un compte propre alors
// qu'il accumule tâches/routines/succès/achats d'un run à l'autre.
export default async function globalSetup() {
  const { url, key, email } = requireE2eAdminEnv();
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const users = await listUsersRetrying(admin);
  const uid = users.find((u) => u.email === email)?.id;
  if (!uid) {
    throw new Error(`global-setup e2e : utilisateur de test introuvable pour ${email}.`);
  }
  await purgeE2eAccountState(admin, uid);
}
