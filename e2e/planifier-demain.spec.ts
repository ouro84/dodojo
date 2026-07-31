import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { deadlineIso } from "../lib/game-engine";
import {
  login,
  setPlanTomorrowAfterHour,
  resetPlanTomorrowAfterHour,
  listUsersRetrying,
} from "./fixtures";

// Issue #116 : lit le fuseau du compte e2e fixe pour calculer un instant
// déterministe correspondant à 20h00 locale, quel que soit le fuseau réel du
// compte de test (évite de le supposer en dur).
async function fixedTimeAt20hLocal(): Promise<string> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PRIVATE_KEY_SUPABASE!;
  const email = process.env.E2E_TEST_EMAIL!;
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const users = await listUsersRetrying(admin);
  const uid = users.find((u) => u.email === email)?.id;
  const { data: profile } = await admin
    .from("profiles")
    .select("timezone")
    .eq("id", uid!)
    .maybeSingle();
  const timezone = profile?.timezone ?? "UTC";
  const today = new Date().toISOString().slice(0, 10);
  return deadlineIso(today, "20:00", timezone);
}

test.describe("Planifier demain (issue #116)", () => {
  test.afterEach(async () => {
    await resetPlanTomorrowAfterHour();
  });

  test("section Demain masquée avant l'heure seuil, visible après", async ({ page }) => {
    await setPlanTomorrowAfterHour(21); // seuil au-delà de l'heure fixée (20h) : masquée
    const fixedTime = await fixedTimeAt20hLocal();
    await page.clock.install({ time: new Date(fixedTime) });

    await login(page);
    await expect(page.getByRole("region", { name: "Demain" })).toHaveCount(0);

    await setPlanTomorrowAfterHour(18); // seuil avant l'heure fixée (20h) : visible
    await page.reload();
    await expect(page.getByRole("region", { name: "Demain" })).toBeVisible();
  });

  test("créer une tâche dans la section Demain, puis la ramener à aujourd'hui", async ({ page }) => {
    await setPlanTomorrowAfterHour(18);
    const fixedTime = await fixedTimeAt20hLocal();
    await page.clock.install({ time: new Date(fixedTime) });
    await login(page);

    const title = `E2E demain ${Date.now()}`;
    const demainSection = page.getByRole("region", { name: "Demain" });
    await expect(demainSection).toBeVisible();

    // Libellé/texte de bouton distincts du formulaire du jour (AddTaskForm
    // Step 0) — aucune ambiguïté même si les deux formulaires sont montés
    // simultanément (régression réelle constatée puis corrigée : "Ajouter"
    // matchait les deux boutons avant l'introduction de submitLabel).
    await demainSection.getByLabel("Prévoir une tâche pour demain").fill(title);
    await demainSection.getByRole("button", { name: "Planifier" }).click();
    await expect(demainSection.getByText(title)).toBeVisible();

    // La tâche de demain ne doit jamais apparaître ailleurs que dans "Demain"
    // (le compte e2e partagé peut avoir une liste du jour vide au moment du
    // run — on vérifie l'unicité globale plutôt qu'une liste "du jour"
    // supposée, fragile si elle n'est pas rendue quand elle est vide).
    await expect(page.locator("li", { hasText: title })).toHaveCount(1);

    await demainSection.getByRole("button", { name: `Ramener "${title}" à aujourd'hui` }).click();
    await expect(demainSection.getByText(title)).toHaveCount(0);
    await expect(page.locator("li", { hasText: title })).toHaveCount(1);

    // Nettoyage : abandon direct de la tâche ramenée aujourd'hui.
    await page.locator("li", { hasText: title }).getByLabel(`Abandonner "${title}"`).click();
    await page.getByRole("button", { name: "Abandonner", exact: true }).click();
  });

  test("reporter une tâche du jour vers demain, puis annuler via le toast", async ({ page }) => {
    await setPlanTomorrowAfterHour(18);
    const fixedTime = await fixedTimeAt20hLocal();
    await page.clock.install({ time: new Date(fixedTime) });
    await login(page);

    const title = `E2E report ${Date.now()}`;
    // "Ajouter une tâche"/"Ajouter" restent uniques au formulaire du jour
    // (le formulaire "Demain" utilise désormais "Prévoir une tâche pour
    // demain"/"Planifier", cf. AddTaskForm Step 0) — aucune ambiguïté même
    // section Demain visible.
    await page.getByLabel("Ajouter une tâche").fill(title);
    await page.getByRole("button", { name: "Ajouter" }).click();
    const row = page.locator("li", { hasText: title });
    await expect(row).toBeVisible();

    await row.getByLabel(`Reporter "${title}" à demain`).click();
    const demainSection = page.getByRole("region", { name: "Demain" });
    await expect(demainSection.getByText(title)).toBeVisible();
    // `row` se re-résout dynamiquement (pas une référence figée à l'élément
    // d'origine) — après le déplacement il matcherait la nouvelle ligne dans
    // "Demain". On vérifie plutôt l'unicité globale : une seule occurrence,
    // désormais dans "Demain".
    await expect(page.locator("li", { hasText: title })).toHaveCount(1);

    await page.getByRole("button", { name: "Annuler" }).click();
    await expect(demainSection.getByText(title)).toHaveCount(0);
    await expect(page.locator("li", { hasText: title })).toHaveCount(1);

    // Nettoyage.
    await page.locator("li", { hasText: title }).getByLabel(`Abandonner "${title}"`).click();
    await page.getByRole("button", { name: "Abandonner", exact: true }).click();
  });
});
