# Issue #147 — Demain : bandeau + bottom sheet — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sortir la section "Demain" du flux figé de l'Arène (`main` en `h-dvh overflow-hidden`) pour arrêter de compresser la liste de tâches du jour, en la remplaçant par un bandeau compact + une bottom sheet plein écran ouverte à la demande.

**Architecture:** Deux nouveaux composants (`TomorrowBanner`, `TomorrowSheet`) ; `TomorrowSheet` enveloppe `TomorrowSection` **sans modifier sa logique interne**. `Arena.tsx` remplace son rendu inline de `TomorrowSection` par `TomorrowBanner` (toujours visible si débloqué, hauteur constante) + `TomorrowSheet` (montée conditionnellement via un state `tomorrowSheetOpen`).

**Tech Stack:** Next.js 16 App Router, React (client components), Tailwind CSS v4, Vitest + Testing Library (jsdom), Playwright (e2e).

## Global Constraints

- Aucune modification de la logique métier US-116 (`lib/game-engine.ts`, `app/actions/tasks.ts`) — chrome UI uniquement.
- `TomorrowBanner` reste en copy neutre (pas de texte "voix" levelé) — seul le contenu de `TomorrowSection`/`planningUnlockedLine` reste dans le scope Volume Intérieur (convention CLAUDE.md).
- Tout overlay bloquant/dismissable passe par `useFocusTrap` (`hooks/useFocusTrap.ts`) — patron unique déjà établi dans ce repo.
- TypeScript strict, jamais de `any`.
- Aucune nouvelle dépendance npm.
- Gating horaire (`planningUnlocked` / `profiles.plan_tomorrow_after_hour`) strictement inchangé.

---

### Task 1: `TomorrowBanner`

**Files:**
- Create: `components/combat/TomorrowBanner.tsx`
- Test: `components/combat/TomorrowBanner.test.tsx`

**Interfaces:**
- Produces: `export default function TomorrowBanner({ count, onOpen }: { count: number; onOpen: () => void })` — bouton pleine largeur, texte `"Demain — rien de prévu"` (count === 0) ou `"Demain · N tâche(s)"` (count ≥ 1, singulier à 1). Appelle `onOpen()` au clic. Accessible name = texte visible (pas d'`aria-label` séparé, cf. WCAG 2.5.3 Label in Name) — permet aux tests de matcher via `getByRole("button", { name: /^Demain/ })` peu importe le compteur.

- [ ] **Step 1: Write the failing test**

```tsx
// components/combat/TomorrowBanner.test.tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import TomorrowBanner from "./TomorrowBanner";

afterEach(cleanup);

describe("TomorrowBanner", () => {
  it("affiche 'rien de prévu' quand count vaut 0", () => {
    render(<TomorrowBanner count={0} onOpen={vi.fn()} />);
    expect(screen.getByText("Demain — rien de prévu")).toBeInTheDocument();
  });

  it("affiche le singulier pour 1 tâche", () => {
    render(<TomorrowBanner count={1} onOpen={vi.fn()} />);
    expect(screen.getByText("Demain · 1 tâche")).toBeInTheDocument();
  });

  it("affiche le pluriel pour plusieurs tâches", () => {
    render(<TomorrowBanner count={3} onOpen={vi.fn()} />);
    expect(screen.getByText("Demain · 3 tâches")).toBeInTheDocument();
  });

  it("appelle onOpen au clic", () => {
    const onOpen = vi.fn();
    render(<TomorrowBanner count={2} onOpen={onOpen} />);
    screen.getByRole("button", { name: /^Demain/ }).click();
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/combat/TomorrowBanner.test.tsx`
Expected: FAIL — `Cannot find module './TomorrowBanner'`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// components/combat/TomorrowBanner.tsx
"use client";

interface TomorrowBannerProps {
  count: number;
  onOpen: () => void;
}

// Issue #147 : remplace le rendu inline de TomorrowSection dans l'Arène.
// Hauteur constante (une ligne) — ne recompresse jamais TaskList, contrairement
// à l'ancien rendu inline (cf. spec).
export default function TomorrowBanner({ count, onOpen }: TomorrowBannerProps) {
  const label =
    count === 0
      ? "Demain — rien de prévu"
      : `Demain · ${count} tâche${count > 1 ? "s" : ""}`;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center justify-between gap-2 rounded-md border border-border bg-surface/50 px-3 py-2 text-xs text-muted"
    >
      <span>{label}</span>
      <span aria-hidden="true">→</span>
    </button>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/combat/TomorrowBanner.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add components/combat/TomorrowBanner.tsx components/combat/TomorrowBanner.test.tsx
git commit -m "feat(arene): ajoute le bandeau compact TomorrowBanner (issue #147)"
```

---

### Task 2: Animation de la sheet (`globals.css`)

**Files:**
- Modify: `app/globals.css:355-368` (juste après `.achievement-toast`, avant le bloc `@media (prefers-reduced-motion: reduce)` qui commence ligne 369) et le bloc `@media (prefers-reduced-motion: reduce)` lui-même (lignes 369-≈410).

**Interfaces:**
- Produces: classe CSS `.tomorrow-sheet` (animation d'entrée `tomorrow-sheet-in`, désactivée sous `prefers-reduced-motion: reduce`) — consommée par `TomorrowSheet` (Task 3).

- [ ] **Step 1: Ajouter le keyframe et la classe**

Insérer juste après le bloc `.achievement-toast { animation: achievement-pop 0.25s ease-out; }` (ligne 366-367 actuelles) et avant `@media (prefers-reduced-motion: reduce) {` :

```css
@keyframes tomorrow-sheet-in {
  from {
    transform: translateY(16px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}
.tomorrow-sheet {
  animation: tomorrow-sheet-in 0.2s ease-out;
}
```

- [ ] **Step 2: Désactiver sous reduced-motion**

Dans le bloc `@media (prefers-reduced-motion: reduce) { ... }` existant, ajouter une entrée au même patron que les autres (ex. `.achievement-toast { animation: none; }`) :

```css
  .tomorrow-sheet {
    animation: none;
  }
```

- [ ] **Step 3: Vérifier visuellement (pas de test automatisé pour du CSS pur)**

Run: `npm run dev`, ouvrir `http://localhost:3000` dans un navigateur, exécuter dans la console `document.body.classList` — pas de vérification automatisée possible ici ; la vérification visuelle réelle se fera Task 4 Step 5 une fois `TomorrowSheet` montée dans l'Arène.

- [ ] **Step 4: Commit**

```bash
git add app/globals.css
git commit -m "feat(css): anime l'entrée de la sheet Demain, respecte prefers-reduced-motion (issue #147)"
```

---

### Task 3: `TomorrowSheet`

**Files:**
- Modify: `components/combat/TomorrowSection.tsx:10-23` (exporter l'interface de props existante)
- Create: `components/combat/TomorrowSheet.tsx`
- Test: `components/combat/TomorrowSheet.test.tsx`

**Interfaces:**
- Consumes: `TomorrowSection` (défaut, export existant) ; `useFocusTrap(containerRef, { active, onEscape })` de `hooks/useFocusTrap.ts` (déjà utilisé partout dans le repo, signature inchangée).
- Produces: `export interface TomorrowSectionProps { ... }` (nouvel export nommé depuis `TomorrowSection.tsx`, mêmes 12 champs qu'aujourd'hui) ; `export default function TomorrowSheet(props: TomorrowSectionProps & { onClose: () => void })` — consommé par `Arena.tsx` (Task 4).

- [ ] **Step 1: Exporter l'interface de props de TomorrowSection**

Dans `components/combat/TomorrowSection.tsx`, remplacer :

```tsx
interface TomorrowSectionProps {
```

par :

```tsx
export interface TomorrowSectionProps {
```

(Aucun autre changement dans ce fichier — le composant garde exactement le même comportement.)

- [ ] **Step 2: Write the failing test**

```tsx
// components/combat/TomorrowSheet.test.tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import TomorrowSheet from "./TomorrowSheet";

afterEach(cleanup);

const baseProps = {
  tasks: [],
  timezone: "Europe/Paris",
  aggressivityLevel: "direct" as const,
  voiceSeed: 1,
  onAdd: vi.fn(),
  onAddSubtask: vi.fn(),
  onSetDeadline: vi.fn(),
  onAnnihilate: vi.fn(),
  onBringToToday: vi.fn(),
  addingSubtaskParentId: null,
  isAdding: false,
  pendingMutationIds: new Set<string>(),
};

describe("TomorrowSheet", () => {
  it("affiche le contenu de TomorrowSection (empty state)", () => {
    render(<TomorrowSheet {...baseProps} onClose={vi.fn()} />);
    expect(screen.getByText("Rien de prévu encore pour demain.")).toBeInTheDocument();
  });

  it("appelle onClose au clic sur le bouton Fermer", () => {
    const onClose = vi.fn();
    render(<TomorrowSheet {...baseProps} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Fermer" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("appelle onClose sur Echap", () => {
    const onClose = vi.fn();
    render(<TomorrowSheet {...baseProps} onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run components/combat/TomorrowSheet.test.tsx`
Expected: FAIL — `Cannot find module './TomorrowSheet'`.

- [ ] **Step 4: Write minimal implementation**

```tsx
// components/combat/TomorrowSheet.tsx
"use client";

import { useRef } from "react";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import TomorrowSection, { type TomorrowSectionProps } from "./TomorrowSection";

interface TomorrowSheetProps extends TomorrowSectionProps {
  onClose: () => void;
}

// Issue #147 : sheet plein écran ouverte depuis TomorrowBanner. Reprend
// TomorrowSection sans modification interne — seul le chrome (header, focus
// trap, fixed inset-0) est nouveau. Dismissable (onEscape fourni), contrairement
// à WakeUpRitual qui est volontairement bloquant.
export default function TomorrowSheet({ onClose, ...sectionProps }: TomorrowSheetProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  useFocusTrap(overlayRef, { active: true, onEscape: onClose });

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label="Demain"
      className="tomorrow-sheet fixed inset-0 z-50 flex flex-col gap-3 overflow-y-auto bg-[oklch(0.08_0_0_/_92%)] px-4 py-4"
    >
      <div className="flex items-center justify-between">
        <p className="font-display text-sm uppercase tracking-wide text-ink">Demain</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="text-lg text-muted hover:text-ink"
        >
          ×
        </button>
      </div>
      <TomorrowSection {...sectionProps} />
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run components/combat/TomorrowSheet.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: aucune erreur (vérifie que l'export nommé `TomorrowSectionProps` est correctement consommé).

- [ ] **Step 7: Commit**

```bash
git add components/combat/TomorrowSection.tsx components/combat/TomorrowSheet.tsx components/combat/TomorrowSheet.test.tsx
git commit -m "feat(arene): ajoute TomorrowSheet, wrapper plein écran de TomorrowSection (issue #147)"
```

---

### Task 4: Câblage dans `Arena.tsx`

**Files:**
- Modify: `components/combat/Arena.tsx:110` (import), `:182` (ref → state), `:1145-1150` (fonction scroll → open), `:1600`, `:1726` (deux `onPlanTomorrow`), `:1917-1934` (rendu inline → banner + sheet)

**Interfaces:**
- Consumes: `TomorrowBanner` (Task 1), `TomorrowSheet` (Task 3).
- Produces: aucune nouvelle interface exportée — comportement observable seulement (couvert par e2e, Task 5).

- [ ] **Step 1: Remplacer l'import**

Dans `components/combat/Arena.tsx:110`, remplacer :

```tsx
import TomorrowSection from "./TomorrowSection";
```

par :

```tsx
import TomorrowBanner from "./TomorrowBanner";
import TomorrowSheet from "./TomorrowSheet";
```

- [ ] **Step 2: Remplacer le ref par un state**

Ligne 182, remplacer :

```tsx
  const tomorrowSectionRef = useRef<HTMLDivElement>(null);
```

par :

```tsx
  const [tomorrowSheetOpen, setTomorrowSheetOpen] = useState(false);
```

- [ ] **Step 3: Remplacer la fonction de scroll par une fonction d'ouverture**

Lignes 1145-1150, remplacer :

```tsx
  function scrollToTomorrowSection() {
    tomorrowSectionRef.current?.scrollIntoView({
      behavior: reducedMotion ? "auto" : "smooth",
      block: "start",
    });
  }
```

par :

```tsx
  function openTomorrowSheet() {
    setTomorrowSheetOpen(true);
  }
```

- [ ] **Step 4: Rebrancher les deux CTA "Planifier demain"**

Ligne 1600 (prop `onPlanTomorrow` de `CrepusculeRecap`) et ligne 1726 (prop `onPlanTomorrow` de `PerfectOverlay`) : les deux lignes sont actuellement identiques —

```tsx
          onPlanTomorrow={planningUnlocked ? scrollToTomorrowSection : undefined}
```

Remplacer **les deux occurrences** (une dans le bloc `<CrepusculeRecap ...>`, une dans le bloc `<PerfectOverlay ...>`) par :

```tsx
          onPlanTomorrow={planningUnlocked ? openTomorrowSheet : undefined}
```

- [ ] **Step 5: Remplacer le rendu inline par le banner + la sheet**

Lignes 1917-1934, remplacer :

```tsx
      {planningUnlocked && (
        <div ref={tomorrowSectionRef}>
          <TomorrowSection
            tasks={activeTomorrowTasks}
            timezone={profile.timezone}
            aggressivityLevel={level}
            voiceSeed={planningVoiceSeed}
            onAdd={handleAddTomorrow}
            onAddSubtask={handleAddTomorrowSubtask}
            onSetDeadline={handleSetTomorrowDeadline}
            onAnnihilate={handleAnnihilateTomorrow}
            onBringToToday={handleBringToToday}
            addingSubtaskParentId={addingTomorrowSubtaskParentId}
            isAdding={isAddingTomorrow}
            pendingMutationIds={pendingMutationIds}
          />
        </div>
      )}
```

par :

```tsx
      {planningUnlocked && (
        <TomorrowBanner count={activeTomorrowTasks.length} onOpen={openTomorrowSheet} />
      )}

      {tomorrowSheetOpen && (
        <TomorrowSheet
          tasks={activeTomorrowTasks}
          timezone={profile.timezone}
          aggressivityLevel={level}
          voiceSeed={planningVoiceSeed}
          onAdd={handleAddTomorrow}
          onAddSubtask={handleAddTomorrowSubtask}
          onSetDeadline={handleSetTomorrowDeadline}
          onAnnihilate={handleAnnihilateTomorrow}
          onBringToToday={handleBringToToday}
          addingSubtaskParentId={addingTomorrowSubtaskParentId}
          isAdding={isAddingTomorrow}
          pendingMutationIds={pendingMutationIds}
          onClose={() => setTomorrowSheetOpen(false)}
        />
      )}
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: aucune erreur. Si `reducedMotion` ou un autre identifiant devient "declared but never used" à cause de la suppression de `scrollToTomorrowSection`, vérifier ligne par ligne — `reducedMotion` est utilisé ailleurs dans `Arena.tsx` (passé à `VersusScene`), donc ne doit **pas** être supprimé ; seul le retrait de `tomorrowSectionRef`/`scrollToTomorrowSection` est attendu.

- [ ] **Step 7: Vérification manuelle (dev server)**

Run: `npm run dev`, se connecter avec le compte e2e (`E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD` dans `.env.local`), régler l'heure de déblocage sur `/vestiaire` à une valeur déjà passée (ou attendre l'heure réelle), recharger `/`. Vérifier :
- Le bandeau "Demain — rien de prévu" (ou "Demain · N tâche(s)") apparaît juste au-dessus du `BottomNav`, sur une seule ligne.
- La liste des tâches du jour occupe tout l'espace disponible sous `VersusScene` (plus de compression même avec plusieurs tâches).
- Taper le bandeau ouvre la sheet plein écran ; `×` et Echap la ferment.
- Depuis un K.O. (`PerfectOverlay`), "Planifier demain" ouvre directement la sheet.

- [ ] **Step 8: Commit**

```bash
git add components/combat/Arena.tsx
git commit -m "feat(arene): remplace le rendu inline de Demain par TomorrowBanner + TomorrowSheet (issue #147)"
```

---

### Task 5: Mise à jour de l'e2e `planifier-demain.spec.ts`

**Files:**
- Modify: `e2e/planifier-demain.spec.ts` (fichier entier, 3 tests)

**Interfaces:**
- Consumes: `login`, `setPlanTomorrowAfterHour`, `resetPlanTomorrowAfterHour`, `listUsersRetrying` de `e2e/fixtures.ts` (signatures inchangées) ; `deadlineIso` de `lib/game-engine.ts` (inchangé).

- [ ] **Step 1: Remplacer le contenu du fichier**

Remplacer tout le contenu de `e2e/planifier-demain.spec.ts` par :

```ts
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

test.describe("Planifier demain (issue #116 / #147)", () => {
  test.afterEach(async () => {
    await resetPlanTomorrowAfterHour();
  });

  test("bandeau Demain masqué avant l'heure seuil, ouvre la sheet une fois débloqué", async ({ page }) => {
    await setPlanTomorrowAfterHour(21); // seuil au-delà de l'heure fixée (20h) : masqué
    const fixedTime = await fixedTimeAt20hLocal();
    await page.clock.install({ time: new Date(fixedTime) });

    await login(page);
    await expect(page.getByRole("button", { name: /^Demain/ })).toHaveCount(0);

    await setPlanTomorrowAfterHour(18); // seuil avant l'heure fixée (20h) : visible
    await page.reload();
    const banner = page.getByRole("button", { name: /^Demain/ });
    await expect(banner).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Demain" })).toHaveCount(0);

    await banner.click();
    await expect(page.getByRole("dialog", { name: "Demain" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Demain" })).toBeVisible();
  });

  test("créer une tâche dans la sheet Demain, puis la ramener à aujourd'hui", async ({ page }) => {
    await setPlanTomorrowAfterHour(18);
    const fixedTime = await fixedTimeAt20hLocal();
    await page.clock.install({ time: new Date(fixedTime) });
    await login(page);

    const title = `E2E demain ${Date.now()}`;
    await page.getByRole("button", { name: /^Demain/ }).click();
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

    // Ferme la sheet avant le nettoyage (la tâche ramenée est désormais dans
    // la liste du jour, derrière la sheet encore ouverte).
    await page.getByRole("button", { name: "Fermer" }).click();

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
    // bandeau Demain visible.
    await page.getByLabel("Ajouter une tâche").fill(title);
    await page.getByRole("button", { name: "Ajouter" }).click();
    const row = page.locator("li", { hasText: title });
    await expect(row).toBeVisible();

    await row.getByLabel(`Reporter "${title}" à demain`).click();
    // Toast d'annulation (~5s, indépendant du bandeau/sheet — cf. reportUndo
    // dans Arena.tsx) : confirme le report avant d'ouvrir la sheet.
    await expect(page.getByText(`« ${title} » repoussée à demain.`)).toBeVisible();

    await page.getByRole("button", { name: /^Demain/ }).click();
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

    await page.getByRole("button", { name: "Fermer" }).click();

    // Nettoyage.
    await page.locator("li", { hasText: title }).getByLabel(`Abandonner "${title}"`).click();
    await page.getByRole("button", { name: "Abandonner", exact: true }).click();
  });
});
```

- [ ] **Step 2: Lancer la suite e2e ciblée**

Run: `npm run build && npx playwright test e2e/planifier-demain.spec.ts --project=chromium` (adapter le nom de projet si différent dans `playwright.config.ts` — build requis, cf. `playwright.config.ts` qui démarre un serveur **prod**, pas `next dev`).
Expected: 3 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add e2e/planifier-demain.spec.ts
git commit -m "test(e2e): adapte planifier-demain.spec.ts au bandeau + sheet (issue #147)"
```

---

### Task 6: Documentation (Guide + CHANGELOG) et vérification finale

**Files:**
- Modify: `content/guide/planifier-demain.md`
- Modify: `CHANGELOG.md` (section `## [Unreleased]` → `### Produit`)

**Interfaces:** aucune (contenu texte uniquement).

- [ ] **Step 1: Mettre à jour l'article du Guide**

Convention CLAUDE.md : éditer la page Notion "Guide Dodojo" (slug `planifier-demain` **inchangé**) puis `npm run pull:guide` si `NOTION_TOKEN` est configuré ; sinon éditer directement le fichier. Remplacer le premier paragraphe de `content/guide/planifier-demain.md` :

```md
En fin de journée, une section "Demain" apparaît sous ton combat du jour. Tu peux y ajouter directement des tâches pour demain, ou reporter une tâche du jour vers demain d'un clic — sans jamais perdre de HP, ni pour toi, ni pour le Boss du jour.
```

par :

```md
En fin de journée, un bandeau "Demain" apparaît en bas de l'Arène. Tape dessus pour ouvrir ton planning du lendemain en plein écran : tu peux y ajouter directement des tâches pour demain, ou reporter une tâche du jour vers demain d'un clic — sans jamais perdre de HP, ni pour toi, ni pour le Boss du jour.
```

Le reste du fichier (sections "À partir de quand ?" et "Ce que ça change") reste inchangé — aucun des comportements qu'il décrit n'a changé, seul le chrome d'accès change.

- [ ] **Step 2: Ajouter l'entrée CHANGELOG**

Dans `CHANGELOG.md`, sous `## [Unreleased]` → `### Produit`, ajouter en tête de liste (juste après la ligne `## [Unreleased]` / `### Produit`) :

```md
- Issue #147 : la section "Demain" de l'Arène devient un bandeau compact + une sheet plein écran ouverte à la demande (au lieu d'un bloc toujours affiché sous le combat) — corrige un bug de layout où la liste de tâches du jour se retrouvait compressée à quelques lignes dès que "Demain" prenait de la place, l'Arène étant en hauteur figée (`h-dvh overflow-hidden`) sans scroll de page.
```

- [ ] **Step 3: Vérification finale complète**

Run: `npx tsc --noEmit`
Expected: 0 erreur.

Run: `npx vitest run`
Expected: tous les tests passent (y compris les nouveaux `TomorrowBanner.test.tsx`/`TomorrowSheet.test.tsx`).

Run: `npm run build && npx playwright test`
Expected: build réussi, suite e2e complète PASS (pas seulement `planifier-demain.spec.ts` — vérifie l'absence de régression sur les specs qui montent l'Arène, ex. `nesting-dnd.spec.ts`, `rafale-optimistic.spec.ts`).

- [ ] **Step 4: Commit**

```bash
git add content/guide/planifier-demain.md CHANGELOG.md
git commit -m "docs: met à jour le Guide et le CHANGELOG pour le bandeau Demain (issue #147)"
```
