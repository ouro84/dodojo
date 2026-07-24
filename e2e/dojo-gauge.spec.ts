import { test, expect } from "@playwright/test";
import { login } from "./fixtures";

// Bug #70 (prod) : la migration `add_profile_aggressivity_level` n'était pas
// appliquée en production → toute écriture de `profiles.aggressivity_level`
// (onboarding et QG) échouait avec "Le dojo n'a pas pu enregistrer...".
// Ce test couvre le chemin QG (mise à jour de la Dojo Gauge à tout moment,
// US-54) pour empêcher une régression silencieuse de ce type.
test("Dojo Gauge : changer le ton depuis le QG persiste sans erreur (US-54)", async ({ page }) => {
  await login(page);
  await page.goto("/qg");

  // Scope volontaire à la section "Dojo Gauge" : `page.getByRole("alert")`
  // seul matche aussi l'annonceur de route interne de Next.js (role="alert"
  // caché, présent sur toute page après navigation) — faux positif sans
  // rapport avec `AggressivityLevelSection`.
  const dojoGaugeSection = page.locator("section", { hasText: "Dojo Gauge" });
  const streetOption = dojoGaugeSection.getByRole("button", { name: /Street/ });
  const sparringOption = dojoGaugeSection.getByRole("button", { name: /Sparring/ });

  await streetOption.click();
  await expect(streetOption).toHaveAttribute("aria-pressed", "true");
  await expect(dojoGaugeSection.getByRole("alert")).toHaveCount(0);

  await page.reload();
  const dojoGaugeSectionAfterReload = page.locator("section", { hasText: "Dojo Gauge" });
  await expect(
    dojoGaugeSectionAfterReload.getByRole("button", { name: /Street/ }),
  ).toHaveAttribute("aria-pressed", "true");

  // Remet le défaut ("sparring", cf. profiles.aggressivity_level) pour ne pas
  // polluer les autres tests du compte e2e fixe partagé (ADR-04).
  await dojoGaugeSectionAfterReload.getByRole("button", { name: /Sparring/ }).click();
  await expect(dojoGaugeSectionAfterReload.getByRole("alert")).toHaveCount(0);
});
