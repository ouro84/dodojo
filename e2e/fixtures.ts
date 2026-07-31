import type { Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Flake connu et reproduit (cf. CLAUDE.md § listUsersRetrying) : l'API Admin
// GoTrue du projet Supabase lié rejette parfois un appel `listUsers()` avec
// "invalid JWT ... unrecognized JWT kid <nil>" (403), de façon intermittente
// et non liée au code appelant — un retry immédiat guérit systématiquement
// (confirmé : 8/8 sur rafale concurrente reproduisant le flake). On retry ici
// plutôt que de laisser chaque appelant échouer sur un flake d'infra externe.
export async function listUsersRetrying(
  admin: SupabaseClient,
  attempts = 3,
): Promise<Awaited<ReturnType<SupabaseClient["auth"]["admin"]["listUsers"]>>["data"]["users"]> {
  let lastError: { message: string } | null = null;
  for (let i = 0; i < attempts; i++) {
    const { data, error } = await admin.auth.admin.listUsers();
    if (!error) return data.users;
    lastError = error;
  }
  throw new Error(
    `listUsers a échoué après ${attempts} tentatives (flake JWT Admin API Supabase, cf. CLAUDE.md) : ${lastError?.message}`,
  );
}

// Même flake que listUsersRetrying, sur l'endpoint deleteUser : un échec ici
// passait jusqu'ici silencieux (error jamais vérifié), laissant le compte de
// test en place — le signup suivant échoue alors sur "email déjà utilisé"
// (timeout 30s dans onboarding.spec.ts, symptôme sans rapport apparent avec
// la cause réelle). On retry et on fait remonter l'échec explicitement.
async function deleteUserRetrying(admin: SupabaseClient, uid: string, attempts = 3): Promise<void> {
  let lastError: { message: string } | null = null;
  for (let i = 0; i < attempts; i++) {
    const { error } = await admin.auth.admin.deleteUser(uid);
    if (!error) return;
    lastError = error;
  }
  throw new Error(
    `deleteUser a échoué après ${attempts} tentatives (flake JWT Admin API Supabase, cf. CLAUDE.md) : ${lastError?.message}`,
  );
}

export async function login(page: Page): Promise<void> {
  const email = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "E2E_TEST_EMAIL / E2E_TEST_PASSWORD manquants — compte e2e fixe non configuré (ADR-04, .env.local).",
    );
  }

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Entrer dans l'Arène" }).click();
  await page.waitForURL("/");
}

// US-15 : le "×" ouvre une modale de confirmation (Rage Quit). Le nettoyage e2e
// doit confirmer la modale pour réellement abandonner la tâche.
//
// Piège découvert en diagnostiquant des tâches de nettoyage e2e restées
// actives en base (is_abandoned=false) malgré un `abandonViaUi` "réussi" :
// `confirmRageQuit` (Arena.tsx) fait la mutation optimiste en local PUIS
// déclenche `rageQuitTaskAction(id)` en fire-and-forget (`void promise.then`),
// sans jamais l'attendre. Quand cet appel est la DERNIÈRE action d'un test
// (le cas de tous les `afterEach` qui appellent `abandonViaUi` en dernier),
// Playwright ferme la page immédiatement après le `.click()` — avant que la
// server action n'ait eu le temps d'atteindre le serveur — ce qui avorte la
// requête en vol et laisse la tâche active en base. Reproduit de façon
// déterministe (jamais flaky) : dans `subtasks.spec.ts`, qui appelle
// `abandonViaUi` deux fois dans le même afterEach, seul le 1er appel
// persistait (le 2e disposait du temps d'exécution du 1er comme tampon), le
// dernier échouait systématiquement. Fix : attendre la réponse réseau de la
// server action déclenchée par le clic de confirmation avant de rendre la
// main à l'appelant.
export async function abandonViaUi(page: Page, title: string): Promise<void> {
  const trigger = page.getByLabel(`Abandonner "${title}"`);
  if (!(await trigger.count())) return;
  await trigger.first().click();
  const confirmBtn = page.getByRole("button", { name: "Abandonner", exact: true });
  await Promise.all([
    page.waitForResponse((response) => response.request().method() === "POST"),
    confirmBtn.click(),
  ]);
}

// US-18 : remet l'état Marché Noir du compte e2e fixe à zéro (compte unique partagé,
// tests en série). Utilise la clé secrète Supabase (hors RLS) — utilitaire de
// test uniquement, pas le flux applicatif (l'app ne DELETE jamais, RG-04).
export async function resetShopState(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PRIVATE_KEY_SUPABASE;
  const email = process.env.E2E_TEST_EMAIL;
  if (!url || !key || !email) {
    throw new Error(
      "Reset e2e : NEXT_PUBLIC_SUPABASE_URL / NEXT_PRIVATE_KEY_SUPABASE / E2E_TEST_EMAIL manquants.",
    );
  }
  const admin = createClient(url, key, { auth: { persistSession: false } });

  const users = await listUsersRetrying(admin);
  const testUser = users.find((u) => u.email === email);
  if (!testUser) throw new Error("Reset e2e : utilisateur de test introuvable.");
  const uid = testUser.id;

  await admin.from("unlocked_heroes").delete().eq("user_id", uid);
  // US-29 : plus de possession implicite du défaut → le compte e2e possède
  // explicitement fire_knight (offert), cohérent avec l'équipé ci-dessous.
  await admin.from("unlocked_heroes").upsert(
    { user_id: uid, hero_id: "fire_knight", price_paid: 0 },
    { onConflict: "user_id,hero_id" },
  );
  // US-53 : reset des tenues (compte e2e unique partagé).
  await admin.from("unlocked_skins").delete().eq("user_id", uid);
  await admin
    .from("profiles")
    .update({ equipped_hero_id: "fire_knight", equipped_skin_id: null })
    .eq("id", uid);
  // Sème un day_result victory (or suffisant pour acheter) — idempotent (upsert).
  await admin.from("day_results").upsert(
    {
      user_id: uid,
      day_date: "2000-01-01",
      outcome: "victory",
      damage_dealt: 200,
      boss_max_hp: 200,
      tasks_completed: 10,
      tasks_abandoned: 0,
      xp_earned: 300,
      // Issue #122 : 1500 or (1 hero à 500 + 2 tenues à 300 + reste 400).
      // Avant le tarif plat, 500 or suffisait pour 1 hero à 350 + 2 tenues
      // à 110 (=570) ; le seed à 500 was just fit. À 500/300, 500 ne couvre
      // même plus l'achat hero + tenue (800) — on monte à 1500 pour garder
      // les tests d'achat multiples déterministes.
      gold_earned: 1500,
      closed_manually: true,
    },
    { onConflict: "user_id,day_date" },
  );
}

// Issue #72 : vide le journal de succès + réinitialise le titre équipé pour
// le compte e2e fixe. Sans ça, les succès s'accumulent sur le compte
// partagé (ADR-04) et polluent les assertions des runs suivants.
export async function resetAchievementsState(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PRIVATE_KEY_SUPABASE;
  const email = process.env.E2E_TEST_EMAIL;
  if (!url || !key || !email) {
    throw new Error("Reset achievements e2e : env manquant.");
  }
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const users = await listUsersRetrying(admin);
  const testUser = users.find((u) => u.email === email);
  if (!testUser) throw new Error("Reset achievements e2e : utilisateur de test introuvable.");
  const uid = testUser.id;

  await admin.from("unlocked_achievements").delete().eq("user_id", uid);
  await admin
    .from("profiles")
    .update({ equipped_title_code: null, title_manually_set: false })
    .eq("id", uid);
}

// US-29 : supprime le user auth de test onboarding (cascade profiles /
// unlocked_heroes / daily_boss) pour repartir d'un signup vierge à chaque run.
export async function resetOnboardingUser(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PRIVATE_KEY_SUPABASE;
  const email = process.env.E2E_ONBOARDING_EMAIL;
  if (!url || !key || !email) {
    throw new Error("Reset onboarding e2e : creds manquants (.env.local).");
  }
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const users = await listUsersRetrying(admin);
  const u = users.find((x) => x.email === email);
  if (u) await deleteUserRetrying(admin, u.id);
}

// US-08 (bug #70) : sème une tâche "reste" (day_date dans le passé) sur le
// compte e2e fixe, pour pouvoir tester réellement le Réveil
// bloquant (jusqu'ici couvert par un test.fixme faute de route de seed —
// cf. e2e/wake-up-ritual.spec.ts). Retourne l'id créé pour le nettoyage.
export async function seedOverdueTask(title: string, daysAgo = 1): Promise<string> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PRIVATE_KEY_SUPABASE;
  const email = process.env.E2E_TEST_EMAIL;
  if (!url || !key || !email) {
    throw new Error(
      "Seed overdue task : NEXT_PUBLIC_SUPABASE_URL / NEXT_PRIVATE_KEY_SUPABASE / E2E_TEST_EMAIL manquants.",
    );
  }
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const users = await listUsersRetrying(admin);
  const uid = users.find((u) => u.email === email)?.id;
  if (!uid) throw new Error("Seed overdue task : utilisateur test introuvable.");

  const dayDate = new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 10);
  const { data, error } = await admin
    .from("tasks")
    .insert({ user_id: uid, title, day_date: dayDate })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`Seed overdue task : insert échoué (${error?.message ?? "inconnu"}).`);
  }
  return data.id as string;
}

// US-05 (issue #101 A3 / A4) : sème une tâche avec une deadline horaire
// déjà dans le passé (≤ now), pour court-circuiter le polling ~45s de
// l'Arène. La tâche est détectée comme `missedDeadlineTasks` dès le 1er
// rendu (deadline_at <= now) → pénalité -10 HP active immédiatement.
// Retourne l'id créé pour le nettoyage.
export async function seedMissedDeadlineTask(
  title: string,
  options: { minutesAgo?: number } = {},
): Promise<string> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PRIVATE_KEY_SUPABASE;
  const email = process.env.E2E_TEST_EMAIL;
  if (!url || !key || !email) {
    throw new Error(
      "Seed missed deadline : NEXT_PUBLIC_SUPABASE_URL / NEXT_PRIVATE_KEY_SUPABASE / E2E_TEST_EMAIL manquants.",
    );
  }
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const users = await listUsersRetrying(admin);
  const uid = users.find((u) => u.email === email)?.id;
  if (!uid) throw new Error("Seed missed deadline : utilisateur test introuvable.");

  const minutesAgo = options.minutesAgo ?? 5;
  const deadlineAt = new Date(Date.now() - minutesAgo * 60_000).toISOString();
  const dayDate = new Date().toISOString().slice(0, 10);
  const { data, error } = await admin
    .from("tasks")
    .insert({
      user_id: uid,
      title,
      day_date: dayDate,
      deadline_at: deadlineAt,
    })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`Seed missed deadline : insert échoué (${error?.message ?? "inconnu"}).`);
  }
  return data.id as string;
}

// Vérifie l'état réel en base d'une tâche (RG-04 : jamais de DELETE côté
// app, seulement is_abandoned/is_completed - cf. e2e/wake-up-ritual.spec.ts).
export async function getTaskById(
  id: string,
): Promise<{ is_abandoned: boolean; abandon_reason: string | null; day_date: string } | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PRIVATE_KEY_SUPABASE;
  if (!url || !key) {
    throw new Error("Get task e2e : NEXT_PUBLIC_SUPABASE_URL / NEXT_PRIVATE_KEY_SUPABASE manquants.");
  }
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const { data } = await admin
    .from("tasks")
    .select("is_abandoned, abandon_reason, day_date")
    .eq("id", id)
    .maybeSingle();
  return data ?? null;
}

// Issue #116 : règle profiles.plan_tomorrow_after_hour pour le compte e2e fixe
// (ADR-04). Combiné à page.clock côté test pour un gate déterministe, quelle
// que soit l'heure réelle d'exécution de la CI.
export async function setPlanTomorrowAfterHour(hour: number): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PRIVATE_KEY_SUPABASE;
  const email = process.env.E2E_TEST_EMAIL;
  if (!url || !key || !email) {
    throw new Error(
      "setPlanTomorrowAfterHour : NEXT_PUBLIC_SUPABASE_URL / NEXT_PRIVATE_KEY_SUPABASE / E2E_TEST_EMAIL manquants.",
    );
  }
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const users = await listUsersRetrying(admin);
  const uid = users.find((u) => u.email === email)?.id;
  if (!uid) throw new Error("setPlanTomorrowAfterHour : utilisateur test introuvable.");

  const { error } = await admin
    .from("profiles")
    .update({ plan_tomorrow_after_hour: hour })
    .eq("id", uid);
  if (error) throw new Error(`setPlanTomorrowAfterHour a échoué : ${error.message}`);
}

// Remet le défaut (18) pour ne pas polluer les autres tests du compte partagé.
export async function resetPlanTomorrowAfterHour(): Promise<void> {
  await setPlanTomorrowAfterHour(18);
}

// Nettoyage du reste semé ci-dessus (service_role bypass RLS - pas
// l'exception applicative RG-04, ceci est un utilitaire de test uniquement).
export async function deleteTaskById(id: string): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PRIVATE_KEY_SUPABASE;
  if (!url || !key) {
    throw new Error("Delete task e2e : NEXT_PUBLIC_SUPABASE_URL / NEXT_PRIVATE_KEY_SUPABASE manquants.");
  }
  const admin = createClient(url, key, { auth: { persistSession: false } });
  await admin.from("tasks").delete().eq("id", id);
}

// US-12 : purge les day_results du compte de test et sème une série contrôlée.
export async function seedStreak(
  rows: Array<{ day_date: string; outcome: "victory" | "retreat" | "defeat" }>,
): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PRIVATE_KEY_SUPABASE;
  const email = process.env.E2E_TEST_EMAIL;
  if (!url || !key || !email) {
    throw new Error("Seed streak : NEXT_PUBLIC_SUPABASE_URL / NEXT_PRIVATE_KEY_SUPABASE / E2E_TEST_EMAIL manquants.");
  }
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const users = await listUsersRetrying(admin);
  const uid = users.find((u) => u.email === email)?.id;
  if (!uid) throw new Error("Seed streak : utilisateur test introuvable.");

  await admin.from("day_results").delete().eq("user_id", uid);
  await admin.from("profiles").update({ best_streak: 0, streak_days: 0 }).eq("id", uid);
  if (rows.length > 0) {
    await admin.from("day_results").upsert(
      rows.map((r) => ({
        user_id: uid,
        day_date: r.day_date,
        outcome: r.outcome,
        damage_dealt: 0,
        boss_max_hp: 0,
        tasks_completed: 0,
        tasks_abandoned: 0,
        xp_earned: 0,
        gold_earned: 0,
        closed_manually: true,
      })),
      { onConflict: "user_id,day_date" },
    );
  }
}
