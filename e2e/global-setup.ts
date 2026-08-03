import { createClient } from "@supabase/supabase-js";
import { listUsersRetrying } from "./fixtures";

// Purge l'état de combat du compte e2e fixe AVANT toute la suite. Les nettoyages
// par test (afterEach) ne suffisent pas : dès qu'un overlay bloquant apparaît
// (Réveil sur des restes, bascule de jour…), ils échouent et les
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
  // Réveil parasite.
  await admin.from("tasks").delete().eq("user_id", uid);
  // Purge des routines de test. Sans ça la suite ne repart PAS d'une Arène vide
  // malgré la ligne ci-dessus : `recurring-no-duplicate.spec.ts` crée 2
  // templates par run et n'en nettoie aucun, or `generateRecurringInstances`
  // tourne à chaque chargement de `/` — chaque run régénère donc une instance
  // par template accumulé. Constaté sur le compte fixe le 2026-08-03 : 26
  // templates dont 20 actifs, remontant au 2026-08-02, soit 400 HP de Boss
  // avant qu'un seul test n'ajoute quoi que ce soit (mesuré 480-520 HP en CI).
  // C'est ce qui avait fait sauter la borne de boucle de
  // `ko-overlay-viewport.spec.ts`, et ça rongeait progressivement les marges de
  // timeout (`closeDay` recalcule sur toutes les tâches du jour).
  //
  // DELETE dur assumé, comme pour `tasks` juste au-dessus : compte de test
  // dédié, client service-role, nettoyage de fixture — pas un chemin produit,
  // donc hors du périmètre de RG-04.
  await admin.from("recurring_templates").delete().eq("user_id", uid);
  // Le cache de saut de la génération (issue #156) doit repartir à zéro, sinon
  // une valeur laissée à "aujourd'hui" par un run précédent ferait sauter la
  // génération pour les specs qui l'attendent.
  await admin.from("profiles").update({ last_recurring_gen_day: null }).eq("id", uid);
  // Repart aussi d'un boss du jour non figé (le roster se re-tirera).
  await admin.from("daily_boss").delete().eq("user_id", uid);
}
