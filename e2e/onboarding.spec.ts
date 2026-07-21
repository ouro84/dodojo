import { test, expect } from "@playwright/test";
import { resetOnboardingUser } from "./fixtures";

test.beforeAll(async () => {
  await resetOnboardingUser();
});

// US-29 : tunnel complet signup → pseudo → avatar → coach 1er combat.
// Compte dédié (recréé à chaque run). Ne touche pas au compte e2e fixe.
test("Onboarding complet (US-29)", async ({ page }) => {
  const email = process.env.E2E_ONBOARDING_EMAIL!;
  const password = process.env.E2E_ONBOARDING_PASSWORD!;

  await page.goto("/welcome");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: /Rejoindre le dojo/ }).click();

  await page.waitForURL("/onboarding");
  await page.getByLabel(/pseudo/i).fill("Ryu Test");
  await page.getByRole("button", { name: /Continuer/ }).click();

  // Choix d'un avatar puis validation.
  await page.getByRole("button", { name: "Prêtresse de l'Eau" }).click();
  await page.getByRole("button", { name: /Entrer dans l'Arène/ }).click();

  await page.waitForURL("/");

  // Coach étape "add" : la suggestion crée la 1re tâche.
  await page.getByRole("button", { name: /Prendre en main Dodojo/ }).click();
  await expect(page.getByText(/Coche-la pour frapper/)).toBeVisible();

  // Coach étape "strike" : cocher la tâche termine le tuto.
  await page.getByLabel(/Marquer "Prendre en main Dodojo" comme accomplie/).check();
  await expect(page.getByText(/Coche-la pour frapper/)).toBeHidden();
});
