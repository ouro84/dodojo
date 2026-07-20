import type { Page } from "@playwright/test";

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
