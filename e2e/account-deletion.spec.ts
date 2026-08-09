import { test, expect } from "@playwright/test";

// Issue #154. Compte JETABLE créé à la volée pour ce test — jamais un des
// comptes fixes partagés (E2E_TEST_EMAIL*/E2E_ONBOARDING_EMAIL, cf. ADR-04) :
// la suppression réelle de ces comptes casserait toute la suite. Le test
// crée son propre compte via signup réel (/welcome), comme onboarding.spec.ts.
test("suppression de compte : signup, suppression en self-service, login suivant refusé", async ({
  page,
}) => {
  const email = `e2e-delete-${Date.now()}@example.com`;
  const password = "MotDePasseTest123!";

  await page.goto("/welcome");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: /Entrer dans l'Arène/ }).click();

  await page.waitForURL("/onboarding");
  await page.getByLabel(/pseudo/i).fill("Compte Jetable");
  await page.getByRole("button", { name: /Continuer/ }).click();

  await page.getByRole("button", { name: "Prêtresse de l'Eau" }).click();
  await page.getByRole("button", { name: /Continuer/ }).click();

  await page.getByRole("button", { name: "Direct" }).click();
  await page.getByRole("button", { name: /Entrer dans l'Arène/ }).click();

  await page.waitForURL("/");

  await page.goto("/vestiaire/profil");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Supprimer mon compte" }).click();

  const modal = page.getByRole("alertdialog");
  await expect(modal).toBeVisible();
  await modal.getByLabel("Mot de passe actuel").fill(password);
  await modal.getByLabel(/Tape SUPPRIMER/).fill("SUPPRIMER");
  await modal.getByRole("button", { name: "Supprimer définitivement" }).click();

  await page.waitForURL("/welcome");

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: /Entrer dans l'Arène/ }).click();

  await expect(page.getByText("Identifiants refusés. Vérifie ton email et ton mot de passe.")).toBeVisible();
});
