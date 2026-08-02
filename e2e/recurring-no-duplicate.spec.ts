import { expect, test, type Page } from "@playwright/test";
import { login } from "./fixtures";

// Crée une routine qui matche tous les jours de la semaine (matche donc
// forcément aujourd'hui). L'input de titre n'a ni label ni aria-label, on
// cible via son placeholder (cf. components/combat/RecurringManager.tsx).
async function createRoutine(page: Page, title: string): Promise<void> {
  await page.goto("/vestiaire/entrainement");
  await page.getByPlaceholder("Ex. 30 min de sport").fill(title);
  for (const day of ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]) {
    const box = page.getByRole("button", { name: day });
    if ((await box.getAttribute("aria-pressed")) !== "true") await box.click();
  }
  await page.getByRole("button", { name: /Créer la routine/ }).click();
  await expect(page.getByText(title)).toBeVisible();
}

test.describe("Routines sans doublon (issue #156)", () => {
  let routineTitle: string | undefined;

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test.afterEach(async ({ page }) => {
    if (routineTitle) {
      await page.goto("/vestiaire/entrainement");
      const row = page.getByRole("listitem").filter({ hasText: routineTitle });
      await row.getByRole("button", { name: /Désactiver/ }).click();
    }
    routineTitle = undefined;
  });

  test("deux chargements concurrents de l'Arène ne créent qu'une instance", async ({
    page,
    context,
  }) => {
    routineTitle = `E2E routine ${Date.now()}`;
    await createRoutine(page, routineTitle);

    // Deux onglets chargent / en même temps : c'est la course reproduite par
    // le prefetch RSC de BottomNav en usage réel.
    const second = await context.newPage();
    await Promise.all([page.goto("/"), second.goto("/")]);
    await second.close();

    await page.reload();
    await expect(page.getByText(routineTitle, { exact: false })).toHaveCount(1);
  });

  test("Reporter un reste de routine au Réveil ne crée pas de doublon", async ({ page }) => {
    routineTitle = `E2E routine reveil ${Date.now()}`;
    await createRoutine(page, routineTitle);

    // L'instance du jour vient d'être générée : on la déplace sur hier pour
    // fabriquer un reste, via l'API admin (impossible depuis l'UI).
    const { seedOverdueRecurringInstance } = await import("./fixtures");
    await seedOverdueRecurringInstance(routineTitle);

    await page.goto("/");
    const ritual = page.getByRole("alertdialog", { name: "Le Réveil" });
    await expect(ritual).toBeVisible();
    await ritual.getByRole("button", { name: /Reporter/ }).first().click();
    await expect(ritual).toBeHidden({ timeout: 10_000 });

    // Sans rechargement : couvre à la fois D1 et la propagation createdTasks.
    await expect(page.getByText(routineTitle, { exact: false })).toHaveCount(1);
  });
});
