import type { Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

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
  await page.getByRole("button", { name: "Entrer dans le dojo" }).click();
  await page.waitForURL("/");
}

// US-15 : le "×" ouvre une modale de confirmation (Rage Quit). Le nettoyage e2e
// doit confirmer la modale pour réellement abandonner la tâche.
export async function abandonViaUi(page: Page, title: string): Promise<void> {
  const trigger = page.getByLabel(`Abandonner "${title}"`);
  if (!(await trigger.count())) return;
  await trigger.first().click();
  await page.getByRole("button", { name: "Abandonner", exact: true }).click();
}

// US-18 : remet l'état Échoppe du compte e2e fixe à zéro (compte unique partagé,
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

  const { data: users } = await admin.auth.admin.listUsers();
  const testUser = users?.users.find((u) => u.email === email);
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
      gold_earned: 500,
      closed_manually: true,
    },
    { onConflict: "user_id,day_date" },
  );
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
  const { data } = await admin.auth.admin.listUsers();
  const u = data?.users.find((x) => x.email === email);
  if (u) await admin.auth.admin.deleteUser(u.id);
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
  const { data: users } = await admin.auth.admin.listUsers();
  const uid = users?.users.find((u) => u.email === email)?.id;
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
