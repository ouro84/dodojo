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
  await admin.from("profiles").update({ equipped_hero_id: "fire_knight" }).eq("id", uid);
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
