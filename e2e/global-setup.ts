import { createClient } from "@supabase/supabase-js";
import { listUsersRetrying } from "./fixtures";

// Purge l'état de combat du compte e2e fixe AVANT toute la suite. Les nettoyages
// par test (afterEach) ne suffisent pas : dès qu'un overlay bloquant apparaît
// (Rituel du Réveil sur des restes, bascule de jour…), ils échouent et les
// tâches s'accumulent, faisant boule de neige sur les runs suivants. Ce reset
// global casse le cycle en repartant d'une Arène vide. Tourne dans le process
// Playwright (mêmes droits admin que les autres fixtures : seedStreak, etc.).
export default async function globalSetup() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PRIVATE_KEY_SUPABASE;
  const email = process.env.E2E_TEST_EMAIL;
  if (!url || !key || !email) {
    // CI/local sans creds admin : on laisse la suite gérer (elle échouera clairement).
    return;
  }
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const users = await listUsersRetrying(admin);
  const uid = users.find((u) => u.email === email)?.id;
  if (!uid) return;
  // Purge des tâches du compte fixe (données de test pures) → Arène vide, pas de
  // Rituel du Réveil parasite.
  await admin.from("tasks").delete().eq("user_id", uid);
  // Repart aussi d'un boss du jour non figé (le roster se re-tirera).
  await admin.from("daily_boss").delete().eq("user_id", uid);
}
