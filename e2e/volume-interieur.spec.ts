import { test, expect } from "@playwright/test";
import { login } from "./fixtures";

// Bug #70 (prod) : la migration `add_profile_aggressivity_level` n'était pas
// appliquée en production → toute écriture de `profiles.aggressivity_level`
// (onboarding et Vestiaire) échouait. Ce test couvre le chemin Vestiaire (mise
// à jour du Volume Intérieur à tout moment, US-54) pour empêcher une
// régression silencieuse de ce type.
test("Volume Intérieur : changer le ton depuis Le Vestiaire persiste sans erreur (US-54)", async ({ page }) => {
  await login(page);
  await page.goto("/vestiaire");

  // Scope volontaire à la section "Volume Intérieur" : `page.getByRole("alert")`
  // seul matche aussi l'annonceur de route interne de Next.js (role="alert"
  // caché, présent sur toute page après navigation) — faux positif sans
  // rapport avec `AggressivityLevelSection`.
  const volumeSection = page.locator("section", { hasText: "Volume Intérieur" });
  const brutOption = volumeSection.getByRole("button", { name: /Brut/ });
  const directOption = volumeSection.getByRole("button", { name: /Direct/ });

  await brutOption.click();
  await expect(brutOption).toHaveAttribute("aria-pressed", "true");
  await expect(volumeSection.getByRole("alert")).toHaveCount(0);

  await page.reload();
  const volumeSectionAfterReload = page.locator("section", { hasText: "Volume Intérieur" });
  await expect(
    volumeSectionAfterReload.getByRole("button", { name: /Brut/ }),
  ).toHaveAttribute("aria-pressed", "true");

  // Remet le défaut ("direct", cf. profiles.aggressivity_level) pour ne pas
  // polluer les autres tests du compte e2e fixe partagé (ADR-04).
  await volumeSectionAfterReload.getByRole("button", { name: /Direct/ }).click();
  await expect(volumeSectionAfterReload.getByRole("alert")).toHaveCount(0);
});
