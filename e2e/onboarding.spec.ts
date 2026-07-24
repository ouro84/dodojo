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
  await page.getByRole("button", { name: /Entrer dans l'Arène/ }).click();

  await page.waitForURL("/onboarding");
  await page.getByLabel(/pseudo/i).fill("Ryu Test");
  await page.getByRole("button", { name: /Continuer/ }).click();

  // Choix d'un avatar puis validation.
  await page.getByRole("button", { name: "Prêtresse de l'Eau" }).click();
  await page.getByRole("button", { name: /Continuer/ }).click();

  // Bug #70 (prod) : cette étape "Volume Intérieur" écrit `profiles.aggressivity_level`
  // à la création du profil — la migration manquante en prod faisait échouer
  // TOUT l'insert (message "Dodojo n'a pas pu enregistrer ton nom"), pas
  // seulement le réglage. Ce test doit donc réellement traverser l'étape
  // (elle ne l'était pas avant, laissant ce chemin non couvert).
  await page.getByRole("button", { name: "Brut" }).click();
  await page.getByRole("button", { name: /Entrer dans l'Arène/ }).click();

  await page.waitForURL("/");

  // Coach étape "add" : la suggestion crée la 1re tâche.
  await page.getByRole("button", { name: /Prendre en main Dodojo/ }).click();
  await expect(page.getByText(/vient de grandir/)).toBeVisible();

  // Coach étape "strike" : cocher la tâche termine le tuto.
  await page.getByLabel(/Marquer "Prendre en main Dodojo" comme accomplie/).check();
  await expect(page.getByText(/vient de grandir/)).toBeHidden();
});
