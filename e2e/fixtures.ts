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

// Isolation multi-comptes (PR2) : `fullyParallel`/`workers:4` en CI (ADR-04
// complété) exigent un compte Supabase par worker, sinon les workers se
// marchent dessus sur le même état (exactement le bug qui avait fait
// abandonner `fullyParallel` la première fois — cf. CLAUDE.md § playwright.config).
// Playwright expose `TEST_PARALLEL_INDEX` (0-based, stable par slot de worker
// concurrent) dans chaque process worker — absent seulement dans le process
// `globalSetup` (qui tourne une fois, avant que les workers n'existent).
// Convention de nommage : worker 0 → `E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD`
// (compte historique, inchangé pour la compat locale à 1 worker) ; workers
// 1/2/3 → `E2E_TEST_EMAIL_2/3/4` (suffixe humain, pas l'index brut).
function currentWorkerSuffix(): string {
  const idx = Number(process.env.TEST_PARALLEL_INDEX ?? "0");
  return idx > 0 ? `_${idx + 1}` : "";
}

export function e2eEnvNamesForSuffix(suffix: string): { emailVar: string; passwordVar: string } {
  return { emailVar: `E2E_TEST_EMAIL${suffix}`, passwordVar: `E2E_TEST_PASSWORD${suffix}` };
}

// Liste les comptes e2e réellement configurés dans l'environnement courant :
// toujours le compte 0 (obligatoire), plus tout compte 2/3/4 dont l'email est
// présent. Permet à `global-setup.ts`/`e2e:reset` de purger les 4 comptes en
// CI mais un seul en local (dev sans les 3 comptes worker supplémentaires).
export function configuredE2eWorkerSuffixes(): string[] {
  const suffixes = [""];
  for (let i = 2; i <= 4; i++) {
    if (process.env[`E2E_TEST_EMAIL_${i}`]) suffixes.push(`_${i}`);
  }
  return suffixes;
}

// Env admin requis par tout appel service-role (global-setup, reset manuel,
// tous les helpers de fixture ci-dessous). Échoue bruyamment plutôt que de
// laisser un appelant retomber silencieusement sur un compte non purgé —
// symétrique à la logique de `login()` juste en dessous. `suffix` par défaut
// résout le compte du worker COURANT (usage normal, appelé depuis un test) ;
// `global-setup.ts`/`e2e:reset` passent un suffixe explicite pour boucler sur
// tous les comptes configurés depuis le process principal (pas de worker actif).
export function requireE2eAdminEnv(
  suffix: string = currentWorkerSuffix(),
): { url: string; key: string; email: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PRIVATE_KEY_SUPABASE;
  const { emailVar } = e2eEnvNamesForSuffix(suffix);
  const email = process.env[emailVar];
  if (!url || !key || !email) {
    throw new Error(
      `Reset e2e : NEXT_PUBLIC_SUPABASE_URL / NEXT_PRIVATE_KEY_SUPABASE / ${emailVar} manquants (ADR-04, .env.local).`,
    );
  }
  return { url, key, email };
}

export async function resolveE2eUserId(admin: SupabaseClient, email: string): Promise<string> {
  const users = await listUsersRetrying(admin);
  const uid = users.find((u) => u.email === email)?.id;
  if (!uid) throw new Error(`Reset e2e : utilisateur de test introuvable pour ${email}.`);
  return uid;
}

// Résout admin+uid pour le compte du worker COURANT — factorise le
// boilerplate (url/key/email → client → uid) répété par tous les helpers de
// fixture ci-dessous. Chacun résolvait sa propre variante avant cette
// factorisation ; en plus de la duplication, ça aurait multiplié par 12 les
// endroits à mettre à jour pour l'isolation multi-comptes (PR2).
async function getE2eAdmin(): Promise<{ admin: SupabaseClient; uid: string }> {
  const { url, key, email } = requireE2eAdminEnv();
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const uid = await resolveE2eUserId(admin, email);
  return { admin, uid };
}

// Purge complète de l'état de combat + boutique + succès d'UN compte e2e
// (identifié par `uid`). Partagée entre `global-setup.ts` (avant toute la
// suite, boucle sur tous les comptes configurés) et `npm run e2e:reset`
// (reset manuel hors suite, même boucle) — avant cette factorisation, seul
// `tasks` + `recurring_templates` + `daily_boss` étaient purgés
// automatiquement ; `day_results`/`unlocked_achievements`/`unlocked_skins`/
// `unlocked_heroes` n'étaient nettoyés que par les resets ciblés de tests
// spécifiques (`resetShopState`, `resetAchievementsState`), donc jamais si le
// run précédent s'est arrêté avant d'atteindre ces tests — source résiduelle
// d'accumulation sur le(s) compte(s) partagé(s) (ADR-04).
//
// `unlocked_heroes` ne peut PAS être vidé sans reseed : la quasi-totalité des
// specs de combat ne passent jamais par `resetShopState` et supposent
// `fire_knight` déjà possédé + équipé (offert à l'onboarding, US-29) — un
// DELETE nu y laisserait `profiles.equipped_hero_id` pointer vers un héros non
// possédé. `unlocked_skins`/`unlocked_achievements`/`day_results` n'ont pas
// cette contrainte (skin par défaut implicite dès le héros possédé, succès et
// titre purement additifs).
export async function purgeE2eAccountState(admin: SupabaseClient, uid: string): Promise<void> {
  await admin.from("tasks").delete().eq("user_id", uid);
  await admin.from("recurring_templates").delete().eq("user_id", uid);
  await admin.from("profiles").update({ last_recurring_gen_day: null }).eq("id", uid);
  await admin.from("daily_boss").delete().eq("user_id", uid);
  await admin.from("day_results").delete().eq("user_id", uid);
  await admin.from("unlocked_achievements").delete().eq("user_id", uid);
  await admin.from("unlocked_skins").delete().eq("user_id", uid);
  await admin.from("unlocked_heroes").delete().eq("user_id", uid);
  await admin.from("unlocked_heroes").upsert(
    { user_id: uid, hero_id: "fire_knight", price_paid: 0 },
    { onConflict: "user_id,hero_id" },
  );
  await admin
    .from("profiles")
    .update({
      equipped_hero_id: "fire_knight",
      equipped_skin_id: null,
      equipped_title_code: null,
      title_manually_set: false,
    })
    .eq("id", uid);
}

export async function login(page: Page): Promise<void> {
  const { emailVar, passwordVar } = e2eEnvNamesForSuffix(currentWorkerSuffix());
  const email = process.env[emailVar];
  const password = process.env[passwordVar];

  if (!email || !password) {
    throw new Error(
      `${emailVar} / ${passwordVar} manquants — compte e2e worker non configuré (ADR-04, .env.local).`,
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
// Issue #156 : l'overlay K.O./Perfect est un modal plein écran depuis que
// PerfectOverlay est passé en `fixed inset-0` (Task 3) — n'importe quel test
// qui termine assez de tâches pour vider le Boss (compte e2e propre, donc un
// boss parfois réduit à une poignée de HP) peut le faire apparaître en cours
// de route et bloquer tout clic ultérieur derrière lui. Avant ce fix, l'overlay
// ne bloquait pas les clics et ce cas passait inaperçu. Exporté (pas seulement
// utilisé par `abandonViaUi`) car plusieurs specs déclenchent un K.O. par
// inadvertance en cochant toutes leurs tâches (compte propre + petit nombre de
// tâches = boss facilement vidé), pas seulement au moment du nettoyage.
export async function dismissKoOverlayIfPresent(page: Page): Promise<void> {
  const koOverlay = page.getByRole("alertdialog", { name: /Boss vaincu/ });
  if (await koOverlay.isVisible().catch(() => false)) {
    await koOverlay.getByRole("button", { name: /Continuer le combat/ }).click();
    return;
  }
  // Piège trouvé en reproduisant en direct (pas seulement supposé) : l'overlay
  // peut apparaître jusqu'à ~2.4s APRÈS le coup fatal qui l'a déclenché
  // (DEATH_DURATION_MS + KO_FADE_MS + KO_OVERLAY_EXTRA_DELAY_MS,
  // lib/combat-animation.ts) — un simple `isVisible()` immédiat le rate si le
  // K.O. vient tout juste de se produire, et l'overlay finit par apparaître
  // PENDANT le clic suivant (repro : task-reorder-race.spec.ts, toggle-cascade
  // .spec.ts — le cochage qui vide le Boss est la toute dernière action avant
  // l'abandon). On n'attend cette apparition différée QUE si le Boss est
  // effectivement à 0 HP maintenant (sinon aucun K.O. n'est en cours).
  const bossBar = page.getByRole("progressbar", { name: /Vie du Boss/ });
  const currentHp = await bossBar.getAttribute("aria-valuenow").catch(() => null);
  if (currentHp !== "0") return;
  try {
    await koOverlay.waitFor({ state: "visible", timeout: 2600 });
  } catch {
    return; // jamais apparu (renaissance entre-temps, ou pas de K.O. réel) : rien à fermer.
  }
  await koOverlay.getByRole("button", { name: /Continuer le combat/ }).click();
}

export async function abandonViaUi(page: Page, title: string): Promise<void> {
  await dismissKoOverlayIfPresent(page);

  const trigger = page.getByLabel(`Abandonner "${title}"`);
  if (!(await trigger.count())) return;
  await trigger.first().click();
  const confirmBtn = page.getByRole("button", { name: "Abandonner", exact: true });
  await Promise.all([
    page.waitForResponse((response) => response.request().method() === "POST"),
    confirmBtn.click(),
  ]);
}

// US-18 : remet l'état Marché Noir du compte e2e du worker courant à zéro.
// Utilise la clé secrète Supabase (hors RLS) — utilitaire de test uniquement,
// pas le flux applicatif (l'app ne DELETE jamais, RG-04).
export async function resetShopState(): Promise<void> {
  const { admin, uid } = await getE2eAdmin();

  await admin.from("unlocked_heroes").delete().eq("user_id", uid);
  // US-29 : plus de possession implicite du défaut → le compte e2e possède
  // explicitement fire_knight (offert), cohérent avec l'équipé ci-dessous.
  await admin.from("unlocked_heroes").upsert(
    { user_id: uid, hero_id: "fire_knight", price_paid: 0 },
    { onConflict: "user_id,hero_id" },
  );
  // US-53 : reset des tenues.
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
// le compte e2e du worker courant. Sans ça, les succès s'accumulent sur le
// compte partagé (ADR-04) et polluent les assertions des runs suivants.
export async function resetAchievementsState(): Promise<void> {
  const { admin, uid } = await getE2eAdmin();
  await admin.from("unlocked_achievements").delete().eq("user_id", uid);
  await admin
    .from("profiles")
    .update({ equipped_title_code: null, title_manually_set: false })
    .eq("id", uid);
}

// Issue #142 : remet level=1 et best_streak=0 sur le profil pour rendre les
// KPI de rareté déterministes. Sans ça, les paliers LEVEL_10/LEVEL_20 (bronze)
// se débloquent sur le level résiduel du compte partagé et faussent les
// compteurs attendus. Complémentaire à resetAchievementsState (qui ne touche
// qu'unlocked_achievements + equipped_title_code).
export async function resetProfileForKpi(): Promise<void> {
  const { admin, uid } = await getE2eAdmin();
  const { error } = await admin
    .from("profiles")
    .update({ level: 1, best_streak: 0, streak_days: 0 })
    .eq("id", uid);
  if (error) throw new Error(`resetProfileForKpi a échoué : ${error.message}`);
}

// US-29 : supprime le user auth de test onboarding (cascade profiles /
// unlocked_heroes / daily_boss) pour repartir d'un signup vierge à chaque run.
// Compte dédié unique (pas de variante par worker : un seul fichier de spec
// l'utilise, `onboarding.spec.ts`, donc jamais de contention inter-worker).
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
// compte e2e du worker courant, pour pouvoir tester réellement le Réveil
// bloquant (jusqu'ici couvert par un test.fixme faute de route de seed —
// cf. e2e/wake-up-ritual.spec.ts). Retourne l'id créé pour le nettoyage.
export async function seedOverdueTask(title: string, daysAgo = 1): Promise<string> {
  const { admin, uid } = await getE2eAdmin();

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

// Issue #156 : transforme l'instance du jour d'une routine en reste de la
// veille, pour reproduire le chemin de duplication P2 (Réveil + Reporter).
export async function seedOverdueRecurringInstance(title: string): Promise<void> {
  const { admin, uid } = await getE2eAdmin();

  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const { error } = await admin
    .from("tasks")
    .update({ day_date: yesterday })
    .eq("user_id", uid)
    .eq("title", title)
    .not("recurring_template_id", "is", null);
  if (error) {
    throw new Error(`Seed overdue recurring : update échoué (${error.message}).`);
  }
}

// Issue #156 (P1) : `createRecurringTemplate` génère l'instance du jour dans
// la foulée (effet immédiat) — il n'y a donc plus de fenêtre de course à
// tester une fois la routine créée. Ce fixture rouvre artificiellement cette
// fenêtre : déplace l'instance déjà générée sur demain (retour à "rien pour
// aujourd'hui") et efface le cache de saut (`last_recurring_gen_day`).
//
// Piège découvert en écrivant ce fixture : `generateRecurringInstances`
// considère un template "déjà généré" dès qu'une ligne existe pour
// `day_date = today`, SANS filtrer `is_abandoned` — annihiler la ligne (au
// lieu de la déplacer) ne rouvre donc pas la fenêtre, elle continue de
// bloquer la génération via `existingIds` malgré son statut abandonné.
// Déplacer vers demain sort la ligne des deux exclusions (`existingToday` ne
// regarde que `today`, `overdueTemplateIds` que `< today`) sans dépendre de
// ce détail — et sans réintroduire le chemin P2 (demain n'est pas un reste).
export async function reopenRecurringGenerationWindow(title: string): Promise<void> {
  const { admin, uid } = await getE2eAdmin();

  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const { error: taskError } = await admin
    .from("tasks")
    .update({ day_date: tomorrow })
    .eq("user_id", uid)
    .eq("title", title)
    .eq("is_abandoned", false)
    .not("recurring_template_id", "is", null);
  if (taskError) {
    throw new Error(`Reopen recurring window : déplacement échoué (${taskError.message}).`);
  }

  const { error: profileError } = await admin
    .from("profiles")
    .update({ last_recurring_gen_day: null })
    .eq("id", uid);
  if (profileError) {
    throw new Error(`Reopen recurring window : reset cache échoué (${profileError.message}).`);
  }
}

// Issue #156 (P1) : compte les instances ACTIVES (non abandonnées) d'une
// routine sur le jour local courant du compte e2e du worker courant —
// invariant direct du test de concurrence (doit toujours valoir 1, jamais 2).
export async function countActiveRecurringToday(title: string): Promise<number> {
  const { admin, uid } = await getE2eAdmin();

  // Compte du jour de l'app : dayKey résout au calendrier local du profil, ici
  // "UTC" pour le compte e2e fixe (vérifié) — le découpage UTC naïf de
  // toISOString() coïncide donc exactement avec `today` côté serveur.
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await admin
    .from("tasks")
    .select("id")
    .eq("user_id", uid)
    .eq("title", title)
    .eq("day_date", today)
    .eq("is_abandoned", false)
    .not("recurring_template_id", "is", null);
  if (error) {
    throw new Error(`Count active recurring : requête échouée (${error.message}).`);
  }
  return data?.length ?? 0;
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
  const { admin, uid } = await getE2eAdmin();

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
// Opère sur un id de tâche déjà résolu par l'appelant : pas de notion de
// compte/worker ici.
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

// Issue #116 : règle profiles.plan_tomorrow_after_hour pour le compte e2e du
// worker courant (ADR-04). Combiné à page.clock côté test pour un gate
// déterministe, quelle que soit l'heure réelle d'exécution de la CI.
export async function setPlanTomorrowAfterHour(hour: number): Promise<void> {
  const { admin, uid } = await getE2eAdmin();
  const { error } = await admin
    .from("profiles")
    .update({ plan_tomorrow_after_hour: hour })
    .eq("id", uid);
  if (error) throw new Error(`setPlanTomorrowAfterHour a échoué : ${error.message}`);
}

// Remet le défaut (18) pour ne pas polluer les autres tests du compte.
export async function resetPlanTomorrowAfterHour(): Promise<void> {
  await setPlanTomorrowAfterHour(18);
}

// Nettoyage du reste semé ci-dessus (service_role bypass RLS - pas
// l'exception applicative RG-04, ceci est un utilitaire de test uniquement).
// Opère sur un id de tâche déjà résolu par l'appelant : pas de notion de
// compte/worker ici.
export async function deleteTaskById(id: string): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PRIVATE_KEY_SUPABASE;
  if (!url || !key) {
    throw new Error("Delete task e2e : NEXT_PUBLIC_SUPABASE_URL / NEXT_PRIVATE_KEY_SUPABASE manquants.");
  }
  const admin = createClient(url, key, { auth: { persistSession: false } });
  await admin.from("tasks").delete().eq("id", id);
}

// US-12 : purge les day_results du compte e2e du worker courant et sème une
// série contrôlée. Issue #160 (bug #2) : simule un jour gagné (tâche
// complétée) mais jamais clôturé manuellement — pour reproduire le trou
// permanent qui consommait un joker à tort sur un compte sans aucun retard
// (Le Réveil, seul déclencheur historique de backfillMissedDays, ne se monte
// jamais dans ce cas).
export async function seedWonPastDayWithoutResult(daysAgo: number): Promise<string> {
  const { admin, uid } = await getE2eAdmin();

  const dayDate = new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 10);
  await admin.from("day_results").delete().eq("user_id", uid).eq("day_date", dayDate);
  const { data, error } = await admin
    .from("tasks")
    .insert({ user_id: uid, title: `E2E won day ${dayDate}`, day_date: dayDate, is_completed: true })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`Seed won past day : insert échoué (${error?.message ?? "inconnu"}).`);
  }
  return dayDate;
}

// Issue #160 (bug #2) : lit l'outcome day_results pour une date donnée (ou
// null si la ligne n'existe pas encore — le "trou" que ce bug produisait).
export async function getDayResultOutcome(dayDate: string): Promise<string | null> {
  const { admin, uid } = await getE2eAdmin();
  const { data } = await admin
    .from("day_results")
    .select("outcome")
    .eq("user_id", uid)
    .eq("day_date", dayDate)
    .maybeSingle();
  return (data?.outcome as string | undefined) ?? null;
}

export async function seedStreak(
  rows: Array<{ day_date: string; outcome: "victory" | "retreat" | "defeat" }>,
): Promise<void> {
  const { admin, uid } = await getE2eAdmin();

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
