# Correction de l'audit du 24/07 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Résoudre l'intégralité des 26 findings de `docs/superpowers/specs/2026-07-24-audit-complet-application.md` (issue #67), en 7 PR thématiques plutôt qu'en 26 micro-PR, dans l'ordre P0 → P3.

**Architecture:** Chaque tâche ci-dessous = une branche = une PR = un commit final (après un ou plusieurs commits intermédiaires si un sous-fix a sa propre boucle TDD). Les fixes sont regroupés par sujet voisin (ergonomie tactile, a11y clavier, theming, perf/data, sécurité, états UI) pour minimiser le nombre de Pull Requests et donc le nombre de déclenchements de CI/workflows.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4, Supabase, Vitest + Testing Library (jsdom), Playwright (e2e, série, serveur prod).

## Global Constraints

- TypeScript strict : jamais de `any`.
- RG-04 : aucune suppression destructive — jamais de `.delete(` sur `tasks`/`profiles`/`day_results`.
- Règle des 3 états UI (Loading/Error/Empty) obligatoire par écran authentifié.
- Commits `type: description courte` (Conventional Commits), toujours une NOUVELLE commit (jamais d'amend).
- `CHANGELOG.md` : une ligne sous `## [Unreleased]` dans le même commit que chaque PR livrant un fix visible.
- Toute modification de convention (`DESIGN.md`) ou de règle de code doit mettre à jour `CLAUDE.md`/`DESIGN.md` dans le même commit.
- Doc utilisateur Notion (« Guide Dodojo ») à mettre à jour + `npm run pull:guide` **uniquement** si un comportement déjà documenté change de façon visible pour l'utilisateur (à évaluer par tâche ci-dessous — la plupart de ces fixes sont invisibles/techniques et n'en ont pas besoin).
- Zéro PR poussée sans avoir fait passer localement `npx tsc --noEmit`, `npx eslint .`, `npx vitest run`, et les specs Playwright concernées.
- Toute nouvelle migration Supabase : timestamp strictement postérieur à la dernière migration existante sur `main` au moment de la création du fichier.
- Français partout dans les copies UI.

---

### Note d'exécution (mise à jour post-démarrage)

Task 1 a été livrée par édition directe avant que cette note soit ajoutée (tsc/eslint/vitest verts) — conservée telle quelle, pas de rework. **À partir de Task 2**, chaque tâche dont le CR d'audit recommandait une commande `/impeccable` invoque cette commande (via l'outil `Skill`) en première étape : la commande charge son propre guide (`reference/<commande>.md`) qui doit être suivi pour l'implémentation, en plus (pas à la place) de la liste concrète de fichiers/findings ci-dessous qui définit le scope exact. Task 5 (sécurité) reste de l'engineering pur — le CR l'a explicitement classé hors périmètre impeccable, aucune commande n'est invoquée pour cette tâche.

### Récapitulatif des 7 PR

| # | PR | Sévérités couvertes | Findings audit | Commande impeccable |
|---|---|---|---|---|
| 1 | Ergonomie tactile & scroll de l'Arène | P0, P2 | #1, #2, #16, #22, #25 | `adapt` + `layout` (déjà livré à la main avant cette note, conservé tel quel) |
| 2 | Accessibilité clavier — focus trap & ARIA | P0, P1, P2, P3 | #3, #4, #8, #23 + a11y P2/P3 détail | `harden` |
| 3 | Cohérence visuelle — contraste, theming, typographie | P1, P2, P3 | #7, #9, #15, #21 + theming P2 détail + perf P3 typo | `polish` + `typeset` + `document` |
| 4 | Bugs de données & perf des requêtes | P0, P1, P2 | #5, #6, #11, #12, #24 | `optimize` |
| 5 | Durcissement sécurité & validations serveur | P1, P2, P3 | #13, #14, #17, #18, #19, #20 + sécu P3 + fond P2 | aucune (hors périmètre impeccable, engineering pur) |
| 6 | États UI manquants (QG / Entraînement / Guide) | P1 | #10 | `harden` |
| 7 | Documentation & clôture | — | Vérification globale, CHANGELOG, ré-audit | `polish` (passe finale) |

---

## Task 1 : Ergonomie tactile & scroll de l'Arène

**Branche :** `fix/audit-touch-targets-layout`

**Files:**
- Modify: `components/combat/TaskRow.tsx`
- Modify: `components/combat/DeadlineControl.tsx`
- Modify: `components/combat/SubtaskForm.tsx`
- Modify: `components/combat/WakeUpRitual.tsx`
- Modify: `components/combat/Arena.tsx`
- Modify: `components/combat/TaskList.tsx`
- Modify: `components/combat/ArenaCoach.tsx`
- Modify: `components/combat/AddTaskForm.tsx`
- Modify: `components/combat/RecurringManager.tsx`
- Modify: `components/shop/CharacterSelect.tsx`
- Modify: `components/ui/BottomNav.tsx`
- Modify: `components/qg/WebhookTokenSection.tsx`
- Modify: `components/qg/PushReminderToggle.tsx`
- Modify: `components/qg/GeminiConnectionSection.tsx`
- Modify: `app/echoppe/page.tsx`
- Test: `e2e/nesting-dnd.spec.ts`, `e2e/subtasks.spec.ts`, `e2e/combat-loop.spec.ts`, `e2e/wake-up-ritual.spec.ts`, `e2e/echoppe-skins.spec.ts` (exécution de vérification, pas de nouveau spec — ce sont des changements de classes CSS/markup, pas de nouvelle logique)

**Interfaces:**
- Consumes: rien de nouveau.
- Produces: rien de consommé par une tâche ultérieure. Aucune dépendance avec les autres tâches (fichiers disjoints, sauf `Arena.tsx`/`WakeUpRitual.tsx` que la Task 2 touche aussi pour d'autres raisons — voir note de fusion en fin de tâche).

⚠️ **Risque** : le bug de scroll (étape 2) touche la structure de layout racine de l'écran le plus utilisé de l'app. Une régression ici casse l'usage quotidien de tout le monde. Vérifier manuellement au clavier + à la souris + sur un vrai mobile (ou device toolbar Chrome à 375px et 320px) avant de committer, en plus des e2e.

- [ ] **Step 1 : cibles tactiles de `TaskRow` (checkbox, drag handle, bouton ×)**

Dans `components/combat/TaskRow.tsx`, remplacer :
```tsx
// AVANT (checkbox ~16x16, ligne ~83-91)
<input type="checkbox" checked={task.is_completed} onChange={...} className="h-4 w-4 shrink-0 accent-hp" />
```
```tsx
// APRÈS — zone tactile réelle ~44px via le label englobant
<label className="flex shrink-0 items-center justify-center p-2.5">
  <input
    type="checkbox"
    checked={task.is_completed}
    onChange={...}
    className="h-4 w-4 accent-hp"
    aria-label={`Marquer "${task.title}" comme terminée`}
  />
</label>
```

Poignée de drag (~ligne 73-82) :
```tsx
// AVANT
className="shrink-0 cursor-grab touch-none px-1 text-faint ..."
// APRÈS
className="shrink-0 cursor-grab touch-none px-2.5 py-2.5 text-faint ..."
```

Bouton abandon `×` (~ligne 120-127) :
```tsx
// AVANT
className="shrink-0 rounded px-1.5 py-0.5 text-xs text-faint hover:text-alert ..."
// APRÈS
className="shrink-0 rounded px-2.5 py-2.5 text-xs text-faint hover:text-alert ..."
```

Titre de tâche (~ligne 92-103) — protection overflow (finding #16) :
```tsx
// AVANT
<span className="flex-1 ...">{task.title}</span>
// APRÈS
<span className="min-w-0 flex-1 break-words ...">{task.title}</span>
```
Appliquer le même `min-w-0 break-words` sur le rendu du titre dans le `DragOverlay` de `Arena.tsx` (~ligne 1001-1003).

- [ ] **Step 2 : cible tactile de `DeadlineControl`, `SubtaskForm`, `AddTaskForm`**

`components/combat/DeadlineControl.tsx` (~ligne 54-68) :
```tsx
// AVANT
className={`rounded px-1 text-xs ${...}`}
// APRÈS
className={`rounded px-2 py-2.5 text-xs ${...}`}
```

`components/combat/SubtaskForm.tsx` (~ligne 30-38, bouton "+") :
```tsx
// AVANT
className="... px-1.5 py-0.5 text-xs"
// APRÈS
className="... px-2.5 py-2.5 text-xs"
```

`components/combat/AddTaskForm.tsx` (~ligne 41-47, bouton "Ajouter") :
```tsx
// AVANT
className="... px-3 py-1.5 text-xs ..."
// APRÈS
className="... px-3 py-2.5 text-xs ..."
```

- [ ] **Step 3 : boutons du Rituel du Réveil**

`components/combat/WakeUpRitual.tsx` (~ligne 180-212, Terminé/Reporter/Annihiler) :
```tsx
// AVANT
className="rounded border border-xp px-2 py-1 text-xs text-xp disabled:opacity-50"
// APRÈS
className="rounded border border-xp px-3 py-2.5 text-xs text-xp disabled:opacity-50"
```

- [ ] **Step 4 : cibles tactiles secondaires (finding #22)**

`components/shop/CharacterSelect.tsx` (~ligne 174-181, swatches de tenue) :
```tsx
// AVANT
className="h-6 w-6 rounded-full ... gap-1.5"
// APRÈS
className="h-9 w-9 rounded-full ... gap-2"
```

`components/combat/RecurringManager.tsx` (~ligne 90-101, boutons jour de semaine) :
```tsx
// AVANT
className="h-8 flex-1 ..."
// APRÈS
className="h-11 flex-1 ..."
```
Autoriser `flex-wrap` sur le conteneur parent si 320px devient trop serré avec `h-11`.

`components/ui/BottomNav.tsx` (~ligne 28) :
```tsx
// AVANT
className="... px-4 py-2.5 ..."
// APRÈS
className="... min-h-11 px-4 py-3 ..."
```

`components/qg/WebhookTokenSection.tsx` (lignes 77, 91, 99), `components/qg/PushReminderToggle.tsx` (ligne 118), `components/qg/GeminiConnectionSection.tsx` (ligne 40) : remplacer chaque `py-1.5` par `py-2.5` sur les boutons secondaires concernés.

- [ ] **Step 5 : conteneur `max-w` sur Arène et Échoppe (finding #25)**

`components/combat/Arena.tsx` (racine, ~ligne 721) :
```tsx
// AVANT
<div className="relative flex flex-1 flex-col gap-3 px-4 py-4">
// APRÈS
<div className="relative mx-auto flex w-full max-w-md flex-1 flex-col gap-3 px-4 py-4">
```

`app/echoppe/page.tsx` (~ligne 55) :
```tsx
// AVANT
<div className="flex flex-1 flex-col items-center gap-4 px-6 py-8">
// APRÈS
<div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center gap-4 px-6 py-8">
```

- [ ] **Step 6 : bug flexbox — la liste de tâches ne scrolle jamais en interne**

**Ne pas toucher `app/layout.tsx`** — QG/Panthéon/Échoppe/Guide dépendent du scroll naturel du `body` et n'ont pas leur propre conteneur scrollable ; leur imposer `overflow-hidden` globalement les rendrait non-scrollables dès que leur contenu dépasse le viewport. Scoper le fix à l'Arène seule : `h-dvh` est une unité de viewport dynamique autonome, elle n'a besoin d'aucun ancêtre dimensionné pour fonctionner.

`components/combat/Arena.tsx` : la racine (déjà modifiée Step 5) porte `h-dvh overflow-hidden` en plus de `max-w-md` :
```tsx
<div className="relative mx-auto flex h-dvh w-full max-w-md flex-1 flex-col gap-3 overflow-hidden px-4 py-4">
```

`components/combat/TaskList.tsx` (~ligne 29) :
```tsx
// AVANT
<ul className="flex flex-1 flex-col gap-1.5 overflow-y-auto">
// APRÈS
<ul className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
```

- [ ] **Step 7 : repositionner `ArenaCoach`**

`components/combat/ArenaCoach.tsx` (~ligne 15) :
```tsx
// AVANT
className="fixed inset-x-0 bottom-24 z-40 ..."
// APRÈS
className="sticky bottom-3 z-40 mx-auto w-full max-w-md ..."
```
Rendre `BottomNav` réellement fixe (`components/ui/BottomNav.tsx`, conteneur racine) :
```tsx
// AVANT
<nav className="mt-auto flex justify-around border-t border-border ...">
// APRÈS
<nav className="sticky bottom-0 z-30 flex justify-around border-t border-border bg-bg ...">
```

- [ ] **Step 8 : vérification manuelle + e2e**

Lancer le serveur de dev, tester au clavier (Tab sur checkbox/drag/×/deadline) et sur device toolbar 320px/375px : la liste doit scroller sous le HUD fixe, `BottomNav` doit rester visible, `ArenaCoach` ne doit jamais chevaucher le formulaire d'ajout.

```bash
npm run build && npm run start
npx playwright test e2e/nesting-dnd.spec.ts e2e/subtasks.spec.ts e2e/combat-loop.spec.ts e2e/wake-up-ritual.spec.ts e2e/echoppe-skins.spec.ts
```
Expected: tous verts. Si un sélecteur Playwright ciblait une taille de zone cliquable désormais changée (ex. clic sur un pixel précis de la poignée de drag), ajuster le sélecteur pour cibler l'élément par rôle/texte plutôt que par coordonnée.

- [ ] **Step 9 : Commit**

```bash
git add components/combat/TaskRow.tsx components/combat/DeadlineControl.tsx components/combat/SubtaskForm.tsx components/combat/AddTaskForm.tsx components/combat/WakeUpRitual.tsx components/combat/Arena.tsx components/combat/TaskList.tsx components/combat/ArenaCoach.tsx components/combat/RecurringManager.tsx components/shop/CharacterSelect.tsx components/ui/BottomNav.tsx components/qg/WebhookTokenSection.tsx components/qg/PushReminderToggle.tsx components/qg/GeminiConnectionSection.tsx app/echoppe/page.tsx CHANGELOG.md
git commit -m "fix: corrige les cibles tactiles et le scroll de l'Arène (audit #67)"
```
Ajouter au préalable une ligne dans `CHANGELOG.md` sous `## [Unreleased]` : `- fix: cibles tactiles ≥44px sur la boucle de combat + scroll interne de la liste de tâches`.

---

## Task 2 : Accessibilité clavier — focus trap & ARIA des overlays/jauges

**Branche :** `fix/audit-a11y-focus-aria`

**Files:**
- Create: `hooks/useFocusTrap.ts`
- Create: `hooks/useFocusTrap.test.ts`
- Modify: `components/combat/WakeUpRitual.tsx`
- Modify: `components/combat/CrepusculeRecap.tsx`
- Modify: `components/combat/Arena.tsx` (confirmation Rage Quit)
- Modify: `components/combat/LevelUpOverlay.tsx`
- Modify: `components/combat/PerfectOverlay.tsx`
- Modify: `components/shop/CharacterSelect.tsx` (2 overlays internes)
- Modify: `components/combat/DeadlineControl.tsx`
- Modify: `components/combat/HeroBar.tsx`, `components/combat/BossBar.tsx` (motion-reduce, P3)
- Modify: `app/pantheon/page.tsx` (jauge XP)
- Modify: `components/combat/RecurringManager.tsx` (aria-label jours de semaine)
- Test: `e2e/wake-up-ritual.spec.ts`, `e2e/crepuscule-recap.spec.ts`, `e2e/deadlines.spec.ts`

**Interfaces:**
- Consumes: rien.
- Produces: `useFocusTrap(containerRef: RefObject<HTMLElement | null>, options: { active: boolean; onEscape?: () => void }): void` — exporté depuis `hooks/useFocusTrap.ts`, consommé par tous les overlays de cette tâche ET par toute future modale.

⚠️ **Risque** : le focus trap est la partie la plus subtile de cette tâche — un mauvais wrap peut piéger le focus de façon irréversible (l'utilisateur ne peut plus quitter l'app au clavier). `WakeUpRitual` est **volontairement** non-dismissable (overlay bloquant métier) : il ne doit **pas** recevoir de `onEscape` (Echap ne doit rien faire dessus), alors que tous les autres overlays de cette tâche doivent se fermer sur Echap. Tester le hook unitairement AVANT de l'intégrer, et vérifier manuellement au clavier sur `WakeUpRitual` en particulier que Tab reste bien confiné.

- [ ] **Step 0 : invoquer `/impeccable harden`**

Le CR d'audit mappe les findings a11y de cette tâche (focus trap, ARIA des jauges, focus-visible, 3ᵉ finding a11y P2/P3) sur `/impeccable harden`. Invoquer via l'outil `Skill` (`skill: "impeccable"`, `args: "harden components/combat/WakeUpRitual.tsx components/combat/CrepusculeRecap.tsx components/combat/Arena.tsx components/combat/LevelUpOverlay.tsx components/combat/PerfectOverlay.tsx components/shop/CharacterSelect.tsx components/combat/DeadlineControl.tsx app/pantheon/page.tsx components/combat/RecurringManager.tsx components/combat/AddTaskForm.tsx components/combat/SubtaskForm.tsx"`). Suivre `reference/harden.md` (setup déjà chargé plus tôt dans la session — pas besoin de relancer `context.mjs`) en plus des Steps 1-9 ci-dessous, qui restent le scope exact et la garde-fou (le hook `useFocusTrap` custom et la distinction WakeUpRitual non-dismissable ne sont pas négociables même si `harden.md` suggère une approche générique différente).

- [ ] **Step 1 : écrire le test du hook `useFocusTrap`**

```ts
// hooks/useFocusTrap.test.ts
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { useRef } from "react";
import { useFocusTrap } from "./useFocusTrap";

afterEach(cleanup);

function TrapHarness({ active, onEscape }: { active: boolean; onEscape?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, { active, onEscape });
  return (
    <div>
      <button>Hors du trap</button>
      <div ref={ref} data-testid="trap">
        <button>Premier</button>
        <button>Dernier</button>
      </div>
    </div>
  );
}

describe("useFocusTrap", () => {
  it("déplace le focus sur le premier élément focusable à l'activation", () => {
    render(<TrapHarness active />);
    expect(screen.getByText("Premier")).toHaveFocus();
  });

  it("boucle Tab du dernier élément vers le premier", () => {
    render(<TrapHarness active />);
    screen.getByText("Dernier").focus();
    fireEvent.keyDown(screen.getByTestId("trap"), { key: "Tab" });
    expect(screen.getByText("Premier")).toHaveFocus();
  });

  it("boucle Shift+Tab du premier élément vers le dernier", () => {
    render(<TrapHarness active />);
    screen.getByText("Premier").focus();
    fireEvent.keyDown(screen.getByTestId("trap"), { key: "Tab", shiftKey: true });
    expect(screen.getByText("Dernier")).toHaveFocus();
  });

  it("appelle onEscape sur Echap si fourni", () => {
    const onEscape = vi.fn();
    render(<TrapHarness active onEscape={onEscape} />);
    fireEvent.keyDown(screen.getByTestId("trap"), { key: "Escape" });
    expect(onEscape).toHaveBeenCalledOnce();
  });

  it("ignore Echap si onEscape n'est pas fourni (overlay bloquant)", () => {
    render(<TrapHarness active />);
    fireEvent.keyDown(screen.getByTestId("trap"), { key: "Escape" });
    expect(screen.getByText("Premier")).toBeInTheDocument();
  });

  it("restaure le focus à l'élément déclencheur à la désactivation", () => {
    const { rerender } = render(<TrapHarness active={false} />);
    const trigger = screen.getByText("Hors du trap");
    trigger.focus();
    rerender(<TrapHarness active />);
    rerender(<TrapHarness active={false} />);
    expect(trigger).toHaveFocus();
  });
});
```

- [ ] **Step 2 : lancer le test pour vérifier qu'il échoue**

```bash
npx vitest run hooks/useFocusTrap.test.ts
```
Expected: FAIL — `Cannot find module './useFocusTrap'`.

- [ ] **Step 3 : implémenter `useFocusTrap`**

```ts
// hooks/useFocusTrap.ts
import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface UseFocusTrapOptions {
  active: boolean;
  onEscape?: () => void;
}

export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  { active, onEscape }: UseFocusTrapOptions,
): void {
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const focusables = () =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));

    (focusables()[0] ?? container).focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onEscape?.();
        return;
      }
      if (event.key !== "Tab") return;

      const elements = focusables();
      if (elements.length === 0) return;
      const first = elements[0];
      const last = elements[elements.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    container.addEventListener("keydown", handleKeyDown);
    return () => {
      container.removeEventListener("keydown", handleKeyDown);
      previouslyFocused.current?.focus();
    };
  }, [active, containerRef, onEscape]);
}
```

- [ ] **Step 4 : lancer le test pour vérifier qu'il passe**

```bash
npx vitest run hooks/useFocusTrap.test.ts
```
Expected: PASS (6/6).

- [ ] **Step 5 : intégrer le hook dans `WakeUpRitual` (SANS `onEscape` — overlay bloquant)**

```tsx
// components/combat/WakeUpRitual.tsx
import { useRef } from "react";
import { useFocusTrap } from "@/hooks/useFocusTrap";
// ...
const overlayRef = useRef<HTMLDivElement>(null);
useFocusTrap(overlayRef, { active: true });
// racine de l'overlay :
<div ref={overlayRef} role="dialog" aria-modal="true" aria-label="Rituel du Réveil" className="...">
```
Le lien "?" (Manuel du Dojo, `z-40`) qui apparaissait dans l'ordre de tabulation sous cet overlay est désormais hors du DOM traversable au clavier tant que l'overlay est monté (le trap confine le focus au conteneur `overlayRef`) — pas de changement structurel nécessaire sur `Arena.tsx` au-delà de ça.

- [ ] **Step 6 : intégrer le hook dans les 6 autres overlays (AVEC `onEscape`)**

Même pattern (`ref` + `useFocusTrap(ref, { active: <condition de montage>, onEscape: () => <handler de fermeture existant> })` + `role="dialog" aria-modal="true"` sur la racine) à appliquer à :
- `components/combat/CrepusculeRecap.tsx` (~ligne 49) — `onEscape` = handler déjà utilisé par le bouton "Continuer"/fermeture.
- `components/combat/Arena.tsx` (~ligne 890, confirmation Rage Quit) — `onEscape` = handler d'annulation existant.
- `components/combat/LevelUpOverlay.tsx` (~ligne 21) — `onEscape` = handler de fermeture existant.
- `components/combat/PerfectOverlay.tsx` (~ligne 54) — `onEscape` = handler de fermeture existant.
- `components/shop/CharacterSelect.tsx` (~ligne 228 et ~257) — `onEscape` = handlers de fermeture des deux overlays internes.
- `components/combat/DeadlineControl.tsx` (~ligne 71, popover) — `onEscape` = fermeture du popover ; ajouter en plus la restauration de focus déjà couverte nativement par le hook (corrige aussi le finding a11y P2 "pas de restauration de focus").

- [ ] **Step 7 : ARIA des 2 jauges + fix theming de la jauge du Réveil**

`app/pantheon/page.tsx` (~ligne 115-117) :
```tsx
// AVANT
<div className="h-2 w-full overflow-hidden rounded-full bg-border">
  <div className="h-full rounded-full bg-xp" style={{ width: `${xpPct}%` }} />
</div>
// APRÈS
<div
  role="progressbar"
  aria-valuenow={xpPct}
  aria-valuemin={0}
  aria-valuemax={100}
  aria-label="Expérience"
  className="h-2 w-full overflow-hidden rounded-full bg-border"
>
  <div className="h-full rounded-full bg-xp transition-[width] duration-300 ease-out" style={{ width: `${xpPct}%` }} />
</div>
```

`components/combat/WakeUpRitual.tsx` (~ligne 116-121) :
```tsx
// AVANT
<div className="h-3 w-full overflow-hidden rounded bg-[oklch(0.2_0_0)]">
  <div className="h-full bg-hp transition-[width] motion-reduce:transition-none" style={{ width: ... }} />
</div>
// APRÈS
<div
  role="progressbar"
  aria-valuenow={heroHp}
  aria-valuemin={0}
  aria-valuemax={HERO_MAX_HP}
  aria-label="Points de vie du Héros"
  className="h-3 w-full overflow-hidden rounded bg-hp-dim"
>
  <div
    className="h-full bg-hp transition-[width] duration-300 ease-out motion-reduce:transition-none"
    style={{ width: ... }}
  />
</div>
```

- [ ] **Step 8 : `<main>` landmark sur l'Arène + `aria-label` sur les jours de semaine**

`components/combat/Arena.tsx` : englober le contenu principal de l'Arène (hors overlays) dans `<main>` au lieu du `<div>` racine actuel (garder la racine `<div>` pour le positionnement `relative`, ajouter un `<main>` interne).

`components/combat/RecurringManager.tsx` (~ligne 136-144) :
```tsx
// AVANT
<span className={t.weekdays.includes(d.i) ? "text-hp" : "text-faint"}>{d.label}</span>
// APRÈS
<span
  className={t.weekdays.includes(d.i) ? "text-hp" : "text-faint"}
  aria-label={`${d.fullLabel} : ${t.weekdays.includes(d.i) ? "actif" : "inactif"}`}
>
  {d.label}
</span>
```
(ajouter `fullLabel` — nom complet du jour — au tableau de données des jours s'il n'existe pas déjà, sinon utiliser une fonction de mapping locale `["lundi","mardi",...][d.i]`).

- [ ] **Step 9 : P3 — motion-reduce sur `HeroBar`/`BossBar`**

`components/combat/HeroBar.tsx` (~ligne 22) et `components/combat/BossBar.tsx` (~ligne 21) : ajouter `motion-reduce:transition-none` à la classe `transition-[width] duration-300 ease-out` existante.

- [ ] **Step 10 : run tests + e2e**

```bash
npx vitest run
npx playwright test e2e/wake-up-ritual.spec.ts e2e/crepuscule-recap.spec.ts e2e/deadlines.spec.ts
```
Expected: tous verts. Vérifier manuellement au clavier que Tab reste confiné dans `WakeUpRitual` et qu'Echap n'a aucun effet dessus, alors qu'Echap ferme bien `PerfectOverlay`/`LevelUpOverlay`/`CrepusculeRecap`/le popover `DeadlineControl`/la confirmation Rage Quit.

- [ ] **Step 11 : Commit**

```bash
git add hooks/useFocusTrap.ts hooks/useFocusTrap.test.ts components/combat/WakeUpRitual.tsx components/combat/CrepusculeRecap.tsx components/combat/Arena.tsx components/combat/LevelUpOverlay.tsx components/combat/PerfectOverlay.tsx components/shop/CharacterSelect.tsx components/combat/DeadlineControl.tsx components/combat/HeroBar.tsx components/combat/BossBar.tsx app/pantheon/page.tsx components/combat/RecurringManager.tsx CHANGELOG.md
git commit -m "fix: ajoute un focus trap clavier aux overlays et la sémantique ARIA des jauges (audit #67)"
```

---

## Task 3 : Cohérence visuelle — contraste, theming, typographie

**Branche :** `fix/audit-theming-typeset`

**Files:**
- Modify: `app/globals.css` (contraste `text-hp`/`text-xp`)
- Modify: `components/pwa/UpdateToast.tsx`, `components/combat/DeadlineControl.tsx`, `components/combat/ArenaCoach.tsx`, `components/combat/Arena.tsx` (retrait `shadow-lg`)
- Modify: `app/guide/[slug]/page.tsx`, `app/guide/page.tsx`, `components/combat/CrepusculeRecap.tsx`, `app/qg/entrainement/page.tsx`, `app/pantheon/page.tsx`, `components/combat/RecurringManager.tsx`, `components/qg/IntegrationsSection.tsx` (retrait BoldPixels sur texte long/accentué)
- Modify: `DESIGN.md` (resynchronisation des valeurs de tokens)
- Modify: `app/login/page.tsx` OU `components/combat/AddTaskForm.tsx` (cohérence padding bouton primaire — aligner sur le token documenté `button-primary`, donc ajuster `login`/`onboarding`/`welcome` vers `px-3 py-1.5 text-xs` plutôt que l'inverse, pour respecter `DESIGN.md`)
- Modify: `components/combat/ArenaCoach.tsx` (retrait `border-gold` hors-rôle → `border-border`), `components/pwa/UpdateToast.tsx` (retrait `bg-xp` générique → `bg-surface border border-hp`), `components/combat/ArenaError.tsx` (token `alert-ink` formel)
- Modify: `app/manifest.ts` (commentaire obsolète "DESIGN.md en seed")

**Interfaces:**
- Consumes: rien.
- Produces: rien.

Cette tâche mélange 3 findings dont le CR mappe chacun sur une commande impeccable différente — 3 invocations `Skill` successives, chacune bornée à son sous-scope, avant les steps d'implémentation correspondants :
- Contraste `text-hp`/`text-xp` (Steps 1-2) + retrait `shadow-lg` (Step 3) + rôles de couleur hors-scope (Step 5) → `/impeccable polish` (le CR mappe explicitement le contraste et les `shadow-lg` sur polish).
- Recadrage BoldPixels (Step 4) → `/impeccable typeset`.
- Resynchronisation `DESIGN.md` (Step 6) → `/impeccable document`.

- [ ] **Step 0a : invoquer `/impeccable polish` pour le contraste et les `shadow-lg`**

`Skill` (`skill: "impeccable"`, `args: "polish app/globals.css components/pwa/UpdateToast.tsx components/combat/DeadlineControl.tsx components/combat/ArenaCoach.tsx components/combat/Arena.tsx components/combat/ArenaError.tsx"`). Suivre `reference/polish.md` pour la passe finale de contraste/cohérence en plus des valeurs précises des Steps 1, 3, 5 ci-dessous (ne pas dériver des tokens `hp-text`/`xp-text` déjà spécifiés — le calcul de contraste exact prime sur une suggestion générique de polish.md).

- [ ] **Step 1 : contraste `text-hp`/`text-xp` — nouveaux tokens de texte**

`app/globals.css` : le fix du 24/07 (PR #77) a déjà ajusté `hp`/`xp` pour le pairing `ink`-sur-couleur. Ajouter deux tokens dédiés au pairing inverse (couleur-sur-fond-neutre), plus foncés/plus clairs selon le thème pour atteindre 4.5:1 sur `surface`/`bg` :
```css
/* app/globals.css, à côté des tokens hp/xp existants */
--color-hp-text: oklch(0.68 0.19 25);  /* variante plus claire de hp, ≥4.5:1 sur surface/bg */
--color-xp-text: oklch(0.72 0.15 275); /* variante plus claire de xp, ≥4.5:1 sur surface/bg */
```
Ces tokens sont déjà des couleurs complètes (`oklch(...)`) — ne pas les re-envelopper dans un second `oklch()` côté classe Tailwind (`oklch(var(--x))` est invalide, la variable contient déjà la fonction). Remplacer, dans les ~15 fichiers listés au finding P1 #7 (`CharacterSelect.tsx:129`, `app/echoppe/page.tsx:39,42`, `WebhookTokenSection.tsx:85,99,105,107,114`, `PushReminderToggle.tsx:128`, `GeminiConnectionSection.tsx:40,53`, `RecurringManager.tsx:97,109,139`, `CrepusculeRecap.tsx:85`, `app/pantheon/page.tsx:60,93,112,138`, `Arena.tsx:941,958`), toute occurrence de `text-hp`/`text-xp` **utilisée comme couleur de texte** (pas comme fond `bg-hp`/`bg-xp`) par `text-[var(--color-hp-text)]`/`text-[var(--color-xp-text)]`. Ne pas toucher les usages en `bg-hp`/`bg-xp`/`border-hp`/`border-xp` (hors-scope de ce finding).

- [ ] **Step 2 : calculer et vérifier le contraste avant de committer**

Écrire un script ponctuel (non committé, ou dans un test temporaire) qui calcule le ratio WCAG des deux nouvelles valeurs OKLCH contre `surface` (`oklch(0.2 0.02 25)`) et `bg` (`oklch(0.14 0.015 25)`). Ajuster la luminance (L) des tokens jusqu'à confirmer ≥4.5:1 sur les deux fonds avant de passer à l'étape suivante — ne pas committer une valeur non vérifiée.

- [ ] **Step 3 : retrait des 4 `shadow-lg`**

Dans `components/pwa/UpdateToast.tsx:22`, `components/combat/DeadlineControl.tsx:73`, `components/combat/ArenaCoach.tsx:17`, `components/combat/Arena.tsx:1001` : retirer `shadow-lg` de la classe, et renforcer la bordure existante si l'élément semblait "flotter" sans elle (`border-border` → `border-2 border-border` si besoin visuel, à juger au rendu).

- [ ] **Step 0b : invoquer `/impeccable typeset`**

`Skill` (`skill: "impeccable"`, `args: "typeset app/guide/[slug]/page.tsx app/guide/page.tsx components/combat/CrepusculeRecap.tsx app/qg/entrainement/page.tsx app/pantheon/page.tsx components/combat/RecurringManager.tsx components/qg/IntegrationsSection.tsx"`). Suivre `reference/typeset.md` pour la hiérarchie typographique en plus de la liste exacte de fichiers/lignes du Step 4 (le remplacement BoldPixels → police body reste la correction requise, même si typeset.md suggère d'autres ajustements en prime — les appliquer est bienvenu tant que la règle du pixel-majuscule de `DESIGN.md` est respectée).

- [ ] **Step 4 : recadrer BoldPixels aux libellés courts non accentués**

`app/guide/[slug]/page.tsx:50` :
```tsx
// AVANT
<h1 className="font-display ...">{meta.titre}</h1>
// APRÈS
<h1 className="font-sans ...">{meta.titre}</h1>
```
(remplacer `font-display` par la police monospace/body du système — vérifier la classe utilitaire exacte définie dans `app/globals.css`, probablement `font-body` ou l'absence de classe = police par défaut).

Même traitement pour :
- `app/guide/page.tsx:21` (nom de catégorie)
- `components/combat/CrepusculeRecap.tsx:55-59,85-90` (en-tête + ligne de série)
- `app/qg/entrainement/page.tsx:50-52` ("Mode Entraînement")
- `app/pantheon/page.tsx:54-56,86-88,103-105` ("Le Panthéon" + pseudo utilisateur ligne 111)
- `components/combat/RecurringManager.tsx:76-78` ("Nouvelle quête récurrente")
- `components/qg/IntegrationsSection.tsx:14` ("Intégrations")

Garder BoldPixels uniquement sur : chiffres/compteurs, "DODOJO", "VS", noms de héros/boss (déjà courts, non accentués dans le catalogue `lib/heroes.ts`/`lib/bosses.ts`), libellés de bouton (déjà courts).

- [ ] **Step 5 : cohérence bouton primaire + rôles de couleur hors-scope**

`app/login/page.tsx:89`, `app/onboarding/OnboardingFlow.tsx:54,81,131`, `app/welcome/WelcomeSignup.tsx:84` : aligner le padding sur le token documenté (`AddTaskForm.tsx:44` = référence) :
```tsx
// AVANT
className="rounded-md bg-hp px-4 py-2 font-display uppercase tracking-wide ..."
// APRÈS
className="rounded-md bg-hp px-3 py-1.5 font-display text-xs uppercase tracking-wide ..."
```

`components/combat/ArenaCoach.tsx:17,26` : `border-gold` → `border-border` (le coach n'est ni un CTA à forte valeur émotionnelle ni une sélection Échoppe).

`components/pwa/UpdateToast.tsx:28` : bouton "Recharger" — `bg-xp` → `bg-surface border border-hp text-hp` (aligné sur le style bouton-bordé documenté plutôt qu'un fill XP hors-rôle).

`components/combat/ArenaError.tsx:22` : remplacer `text-[oklch(0.15_0.02_55)]` par un token nommé — ajouter `--color-alert-ink: oklch(0.15 0.02 55);` dans `app/globals.css` à côté de `gold-ink`, puis utiliser `text-[var(--color-alert-ink)]`.

- [ ] **Step 0c : invoquer `/impeccable document`**

`Skill` (`skill: "impeccable"`, `args: "document"`). Suivre `reference/document.md` pour régénérer/vérifier `DESIGN.md` depuis le code actuel — recouper son résultat avec les valeurs exactes listées au Step 6 ci-dessous (les 2 nouveaux tokens `hp-text`/`xp-text` et `alert-ink` créés dans cette même tâche doivent apparaître dans le `DESIGN.md` final, que `document.md` les détecte automatiquement ou non).

- [ ] **Step 6 : resynchroniser `DESIGN.md`**

Mettre à jour le frontmatter `colors:` de `DESIGN.md` avec les valeurs réelles actuelles de `app/globals.css` (`faint: 0.6`, `hp: 0.55`, `xp: 0.54`, + les 2 nouveaux tokens `hp-text`/`xp-text` et `alert-ink` créés ci-dessus). Documenter dans la section 2 (Colors) la règle "texte hp/xp sur fond neutre → toujours `hp-text`/`xp-text`, jamais `hp`/`xp` bruts".

`app/manifest.ts:6` : retirer le commentaire "DESIGN.md est encore en seed (palette non résolue)", devenu faux.

- [ ] **Step 7 : run tests**

```bash
npx tsc --noEmit
npx vitest run
```
Expected: aucune régression. Vérifier visuellement (dev server) le rendu des textes hp/xp sur les écrans QG/Échoppe/Panthéon et l'absence d'ombre résiduelle sur les 4 endroits corrigés.

- [ ] **Step 8 : Commit**

```bash
git add app/globals.css DESIGN.md app/manifest.ts components/pwa/UpdateToast.tsx components/combat/DeadlineControl.tsx components/combat/ArenaCoach.tsx components/combat/Arena.tsx components/combat/ArenaError.tsx app/guide components/combat/CrepusculeRecap.tsx app/qg/entrainement/page.tsx app/pantheon/page.tsx components/combat/RecurringManager.tsx components/qg/IntegrationsSection.tsx app/login/page.tsx app/onboarding/OnboardingFlow.tsx app/welcome/WelcomeSignup.tsx CHANGELOG.md
git commit -m "fix: corrige le contraste hp/xp, retire les shadow-lg et recadre BoldPixels (audit #67)"
```

---

## Task 4 : Bugs de données & performance des requêtes

**Branche :** `fix/audit-data-perf`

**Files:**
- Modify: `app/pantheon/page.tsx`
- Modify: `app/page.tsx`
- Modify: `app/qg/page.tsx`
- Modify: `lib/game-engine.test.ts`
- Modify: `components/combat/Arena.tsx`, `components/combat/TaskList.tsx`, `components/combat/TaskRow.tsx` (memo)
- Modify: `components/combat/VersusScene.tsx`, `components/combat/ImpactVfx.tsx` (préchargement sprites)
- Test: `lib/game-engine.test.ts` (existant, étendu)

**Interfaces:**
- Consumes: `goldBalance`, `currentStreak` (signatures inchangées, `lib/game-engine.ts:359`, `lib/game-engine.ts:571`).
- Produces: rien de nouveau côté types.

⚠️ **Risque le plus élevé du plan.** Ces deux bugs touchent le calcul de l'or et des séries — des données déjà en production. Le fix doit être couvert par un test qui reproduit exactement le bug AVANT correction (fixture >90 jours), pour être certain de ne pas laisser un cas résiduel où la divergence peut se reproduire (ex. un autre écran qui bornerait encore la requête).

- [ ] **Step 0 : invoquer `/impeccable optimize`**

Le CR mappe l'intégralité des findings de cette tâche (bug or, bug streak, waterfall de requêtes, memo, préchargement sprites) sur `/impeccable optimize`. `Skill` (`skill: "impeccable"`, `args: "optimize app/pantheon/page.tsx app/page.tsx app/qg/page.tsx components/combat/Arena.tsx components/combat/TaskList.tsx components/combat/TaskRow.tsx components/combat/VersusScene.tsx components/combat/ImpactVfx.tsx"`). Suivre `reference/optimize.md` en plus des Steps 1-9 ci-dessous — le fix de requête précis (Steps 3-4, séparer la requête d'or non bornée, augmenter la limite streak à 120) n'est pas négociable même si optimize.md suggère une autre approche générique, car il corrige un bug de données vérifié, pas seulement de la perf.

- [ ] **Step 1 : écrire le test qui reproduit le bug d'or (>90 jours)**

Dans `lib/game-engine.test.ts`, ajouter :
```ts
it("le solde d'or ne doit pas dépendre d'une troncature de l'historique fourni", () => {
  const fullHistory = Array.from({ length: 120 }, (_, i) => ({
    gold_earned: 10,
  }));
  const truncatedTo90 = fullHistory.slice(0, 90);
  const fullBalance = goldBalance(fullHistory, [], []);
  const truncatedBalance = goldBalance(truncatedTo90, [], []);
  // Le bug : goldBalance() est correct sur SES entrées, le problème est que
  // l'appelant lui passe un tableau tronqué. Ce test documente qu'avec 120
  // jours réels d'historique, le solde attendu est 1200, pas 900.
  expect(fullBalance).toBe(1200);
  expect(truncatedBalance).toBe(900); // prouve que la troncature fausse bien le résultat
});
```
Ce test documente le contrat (`goldBalance` a besoin de tout l'historique) plutôt que de tester une regression dans la fonction elle-même — la fonction est déjà correcte, c'est l'appelant (`app/pantheon/page.tsx`) qui doit changer.

- [ ] **Step 2 : lancer le test (doit déjà passer — il documente le contrat, pas un bug de la fonction)**

```bash
npx vitest run lib/game-engine.test.ts
```
Expected: PASS.

- [ ] **Step 3 : corriger `app/pantheon/page.tsx` — requête d'or séparée et non bornée**

```tsx
// AVANT (~ligne 27-48)
const { data: dayResults } = await supabase
  .from("day_results")
  .select("*")
  .eq("user_id", user.id)
  .order("day_date", { ascending: false })
  .limit(90);
// ... plus loin, ligne ~70
const gold = goldBalance(dayResults ?? [], unlockedHeroes ?? [], unlockedSkins ?? []);
```
```tsx
// APRÈS — requête dédiée non bornée, à l'image de app/echoppe/page.tsx
const { data: dayResults } = await supabase
  .from("day_results")
  .select("*")
  .eq("user_id", user.id)
  .order("day_date", { ascending: false })
  .limit(90); // reste borné pour l'affichage du Journal/sparkline, inchangé

const { data: goldHistory } = await supabase
  .from("day_results")
  .select("gold_earned")
  .eq("user_id", user.id); // non borné — même pattern que app/echoppe/page.tsx

const gold = goldBalance(goldHistory ?? [], unlockedHeroes ?? [], unlockedSkins ?? []);
```

- [ ] **Step 4 : corriger le bornage du palier de série (finding #6)**

`app/page.tsx:66-71` :
```ts
// AVANT
.limit(60)
// APRÈS
.limit(120) // aligné sur le palier de série le plus élevé (100 jours) + marge
```

- [ ] **Step 5 : test de non-régression pour le palier 100 jours**

Dans `lib/game-engine.test.ts` (si un test similaire n'existe pas déjà, sinon l'étendre) :
```ts
it("détecte le palier de série à 100 jours avec un historique de 120 jours fourni", () => {
  const today = "2026-07-24";
  const dayResults = Array.from({ length: 120 }, (_, i) => {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - i);
    return { day_date: d.toISOString().slice(0, 10), outcome: "victory" as const };
  });
  const streak = currentStreak(dayResults, today);
  expect(streak.length).toBeGreaterThanOrEqual(100);
});
```

- [ ] **Step 6 : lancer les tests**

```bash
npx vitest run lib/game-engine.test.ts
```
Expected: PASS.

- [ ] **Step 7 : paralléliser les requêtes Arène / QG / Panthéon**

`app/qg/page.tsx:37-52` :
```ts
// AVANT — séquentiel
const profile = await getProfile(...);
const geminiConnected = await isGeminiConnected(...);
const dayResults = await getDayResults(...);
const subscriptionCount = await getSubscriptionCount(...);
// APRÈS
const [profile, geminiConnected, dayResults, subscriptionCount] = await Promise.all([
  getProfile(...),
  isGeminiConnected(...),
  getDayResults(...),
  getSubscriptionCount(...),
]);
```
Même traitement pour `app/pantheon/page.tsx:27-48` (profile / dayResults / unlockedHeroes / unlockedSkins / goldHistory — les 5 requêtes de cette page sont mutuellement indépendantes, à paralléliser ensemble).

`app/page.tsx` : `tasks`/`overdueTasks`/`dayResults` (lignes ~43-71) sont indépendants entre eux une fois `generateRecurringInstances` terminé (qui, lui, doit rester avant car il peut créer des lignes que `tasks` doit ensuite lire) — les paralléliser via `Promise.all` après cet appel, pas avant.

- [x] **Step 8 : memo sur `TaskList`/`TaskRow`, `useCallback` sur les handlers de `Arena.tsx` — TENTÉ, ABANDONNÉ**

Implémenté puis reverté en exécution : `eslint .` a fait remonter 5 erreurs `react-hooks/preserve-manual-memoization` (règle bundlée par `eslint-config-next` même sans `experimental.reactCompiler` actif — vérifié absent de `next.config.ts`). La règle exige que le tableau de deps corresponde exactement à son inférence statique (y compris des setState pourtant stables), ce qui aurait nécessité un remaniement plus profond (stabiliser aussi `bumpCombo`/`resetCombo`/`triggerPulse`/`triggerXpPulse`) sur le fichier le plus critique de l'app, pour un gain de perf marginal (P1, pas P0). Reverté proprement (`git checkout` des 3 fichiers, aucune autre modif de cette tâche n'y touchait). Documenté dans `CHANGELOG.md` comme dette assumée — à reconsidérer si le projet active un jour le React Compiler.

```tsx
// components/combat/TaskRow.tsx — en fin de fichier
export default React.memo(TaskRow);
```
```tsx
// components/combat/TaskList.tsx — en fin de fichier
export default React.memo(TaskList);
```
```tsx
// components/combat/Arena.tsx — envelopper les handlers passés en props (handleToggle, handleAbandon, handleAddSubtask, handleSetDeadline, ~lignes 451-706)
const handleToggle = useCallback((id: string) => { /* corps existant inchangé */ }, [/* deps existantes */]);
```
Appliquer le même `useCallback` aux 4 handlers cités, en conservant leur corps exact et en dérivant leur tableau de dépendances de ce qu'ils lisent réellement (pas de `[]` vide s'ils ferment sur `tasks`/`user`/etc.).

- [ ] **Step 9 : préchargement des sprites (finding #24)**

`components/combat/VersusScene.tsx` : au montage, précharger les frames idle du héros/boss :
```tsx
useEffect(() => {
  for (let i = 0; i < idleFrameCount; i++) {
    const img = new window.Image();
    img.src = `/sprites/mc/${slug}/idle/frame${String(i).padStart(4, "0")}.png`;
  }
}, [slug, idleFrameCount]);
```
`components/combat/ImpactVfx.tsx` : précharger les 4 variantes d'impact au montage de `VersusScene` (une fois, pas par coup) plutôt qu'à la demande.

- [ ] **Step 10 : run full suite**

```bash
npx tsc --noEmit
npx vitest run
npx playwright test e2e/streaks.spec.ts e2e/echoppe.spec.ts
```
Expected: tout vert.

- [ ] **Step 11 : Commit**

```bash
git add app/pantheon/page.tsx app/page.tsx app/qg/page.tsx lib/game-engine.test.ts components/combat/Arena.tsx components/combat/TaskList.tsx components/combat/TaskRow.tsx components/combat/VersusScene.tsx components/combat/ImpactVfx.tsx CHANGELOG.md
git commit -m "fix: corrige la divergence du solde d'or et le palier de série 100j, paralléllise les requêtes (audit #67)"
```

---

## Task 5 : Durcissement sécurité & validations serveur

**Branche :** `fix/audit-security-hardening`

**Files:**
- Modify: `app/actions/tasks.ts` (`addSubtask`, ids non validés dans `.or()`)
- Modify: `app/actions/profile.ts` (`updateAggressivityLevel`)
- Modify: `app/actions/recurring.ts` (validation `weekdays`)
- Modify: `lib/oauth-client-registration.ts` (schéma `redirect_uri`)
- Modify: `app/oauth/authorize/route.ts` (bandeau de consentement)
- Create: `supabase/migrations/<timestamp-après-dernière-migration>_restrict_oauth_clients_select.sql`
- Modify: `next.config.ts` (en-têtes de sécurité HTTP)
- Modify: `lib/supabase/middleware.ts`, `lib/supabase/client.ts`, `lib/supabase/server.ts` (SameSite explicite)
- Modify: `lib/oauth-gemini.test.ts`, `lib/task-insertion.test.ts` (retrait `: any`)
- Test: `lib/task-title.test.ts`, `lib/oauth-client-registration.test.ts`, `lib/oauth-consent-page.test.ts`, `lib/aggressivity.test.ts`

**Interfaces:**
- Consumes: `validateTaskTitle` (`lib/task-title.ts`), `AggressivityLevel` (`types/index.ts`).
- Produces: rien de nouveau consommé ailleurs.

⚠️ **Risque** : la migration Supabase de restriction RLS sur `oauth_clients`, et le changement de schéma accepté sur `redirect_uri`, touchent le flux OAuth **déjà utilisé en production par Gemini** (cf. `CLAUDE.md`, US-22 : "aucun test e2e sur le handshake Gemini réel, vérification manuelle obligatoire"). Vérifier manuellement après déploiement que la connexion Gemini existante n'est pas cassée par la restriction de schéma (son `redirect_uri` est déjà `https://`, donc ne devrait pas être affecté) avant de considérer cette tâche terminée.

- [ ] **Step 1 : écrire le test qui reproduit le bug de validation `addSubtask`**

```ts
// app/actions/tasks.test.ts (créer si absent, sinon étendre le fichier existant de tests des server actions — vérifier d'abord s'il existe déjà un fichier de test pour app/actions/tasks.ts)
```
Si aucun test de server action n'existe pour ce fichier (les actions sont testées via `lib/task-title.ts` et via e2e), ajouter directement dans `lib/task-title.test.ts` un test qui verrouille le contrat consommé par `addSubtask` :
```ts
it("rejette un titre de sous-tâche dépassant TASK_TITLE_MAX_LENGTH", () => {
  const tooLong = "a".repeat(TASK_TITLE_MAX_LENGTH + 1);
  expect(() => validateTaskTitle(tooLong)).toThrow();
});
```
(Ce test existe probablement déjà pour `addTask` — vérifier avant d'ajouter un doublon ; l'important est que `addSubtask` appelle bien la même fonction, vérifié au Step 3 par lecture de code + `tsc`.)

- [ ] **Step 2 : lancer le test**

```bash
npx vitest run lib/task-title.test.ts
```
Expected: PASS (la fonction `validateTaskTitle` existe déjà et est déjà testée — ce step confirme juste qu'elle throw bien sur un titre trop long, avant qu'on la branche dans `addSubtask`).

- [ ] **Step 3 : brancher `validateTaskTitle` dans `addSubtask`**

`app/actions/tasks.ts:82-90` :
```ts
// AVANT
const trimmed = title.trim();
if (!trimmed) return { error: "..." };
// APRÈS
import { validateTaskTitle } from "@/lib/task-title";
// ...
const trimmed = validateTaskTitle(title); // lève si vide ou > TASK_TITLE_MAX_LENGTH, cohérent avec addTask
```

- [ ] **Step 4 : valider les `id` avant construction des filtres `.or()`**

`app/actions/tasks.ts` (lignes 304, 419, 457, 483 — `undoRageQuit`, `completeOverdueTask`, `deferOverdueTask`, `annihilateOverdueTask`) :
```ts
// AVANT
.or(`id.eq.${id},parent_id.eq.${id}`)
// APRÈS
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if (!UUID_RE.test(id)) return { error: "Identifiant de tâche invalide." };
// ... puis le .or() existant, désormais sûr
.or(`id.eq.${id},parent_id.eq.${id}`)
```
Factoriser cette regex dans une constante partagée (`lib/task-id.ts` ou en tête de `app/actions/tasks.ts` si un seul fichier l'utilise) pour éviter la duplication sur les 4 sites.

- [ ] **Step 5 : validation runtime de `updateAggressivityLevel`**

`app/actions/profile.ts:20-36` :
```ts
// AVANT
export async function updateAggressivityLevel(level: AggressivityLevel) {
  // ... écrit level directement
}
// APRÈS
const VALID_LEVELS: AggressivityLevel[] = ["sensei", "sparring", "street"];
export async function updateAggressivityLevel(level: AggressivityLevel) {
  if (!VALID_LEVELS.includes(level)) {
    return { error: "Niveau d'agressivité invalide." };
  }
  // ... suite inchangée
}
```
Ajouter un test dans `lib/aggressivity.test.ts` (ou créer `app/actions/profile.test.ts` si un pattern de test de server action existe déjà ailleurs dans le repo — vérifier avant de créer un nouveau fichier) qui appelle `updateAggressivityLevel` avec une valeur hors énumération castée en `any` au niveau du test uniquement (le seul endroit où `any` reste acceptable : simuler un appel direct qui contourne TypeScript) et vérifie que la fonction retourne une erreur au lieu de planter.

- [ ] **Step 6 : validation `weekdays` côté serveur**

`app/actions/recurring.ts` (`createRecurringTemplate` ~114-153, `updateRecurringTemplate` ~156-188) :
```ts
// à ajouter en tête des deux fonctions
if (weekdays.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
  return { error: "Jours de la semaine invalides." };
}
```

- [ ] **Step 7 : restreindre `redirect_uri` à HTTPS (+ loopback)**

`lib/oauth-client-registration.ts:11-19` :
```ts
// AVANT
function isValidRedirectUri(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}
// APRÈS
function isValidRedirectUri(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol === "https:") return true;
  // RFC 8252 : loopback autorisé en clair pour les clients natifs
  return url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost");
}
```
Mettre à jour `lib/oauth-client-registration.test.ts` avec des cas `http://evil.example.com` (rejeté), `javascript:alert(1)` (rejeté), `https://gemini.google.com/callback` (accepté), `http://127.0.0.1:8080/callback` (accepté).

- [ ] **Step 8 : écran de consentement — clarifier l'identité auto-déclarée**

`app/oauth/authorize/route.ts:102-111` (fonction `renderConsentPage` ou équivalent) : ajouter une ligne visible sous le nom du client :
```tsx
<p className="text-xs text-muted">
  Cette identité est déclarée par l'application elle-même et n'est pas vérifiée par Dodojo.
  N'autorise que si tu reconnais l'app que tu viens de connecter.
</p>
```
Mettre à jour `lib/oauth-consent-page.test.ts` pour vérifier la présence de ce texte dans le HTML généré.

- [ ] **Step 9 : migration RLS — `oauth_clients` restreint aux utilisateurs authentifiés**

```sql
-- supabase/migrations/<TIMESTAMP>_restrict_oauth_clients_select.sql
-- Remplacer <TIMESTAMP> par un horodatage strictement postérieur à la dernière
-- migration existante sur main au moment de la création de ce fichier.
drop policy if exists "oauth_clients_select_all" on oauth_clients;
create policy "oauth_clients_select_authenticated" on oauth_clients
  for select
  to authenticated
  using (true);
```
Vérifier après application (`npx supabase migration list --linked`) que Local = Remote, comme documenté dans `CLAUDE.md` (bug prod #70).

- [ ] **Step 10 : en-têtes de sécurité HTTP**

`next.config.ts` :
```ts
const nextConfig: NextConfig = {
  // ... config existante
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        ],
      },
    ];
  },
};
```
Ne pas ajouter de CSP stricte dans cette tâche (risque de casser `next/og`/Satori et les intégrations OAuth/MCP sans campagne de test dédiée) — le laisser en dette explicitement documentée si besoin d'un futur audit dédié au hardening HTTP.

- [ ] **Step 11 : `SameSite` explicite sur le cookie de session**

`lib/supabase/middleware.ts`, `lib/supabase/client.ts`, `lib/supabase/server.ts` : dans les options de cookie passées à `createServerClient`/`createBrowserClient` (`@supabase/ssr`), ajouter explicitement `cookieOptions: { sameSite: "lax" }` là où l'option est actuellement absente (laisser au défaut de la lib).

- [ ] **Step 12 : retirer les `: any` résiduels**

`lib/oauth-gemini.test.ts:63` et `lib/task-insertion.test.ts:68` :
```ts
// AVANT
function fakeSupabase(tables: Record<string, Row[]>): any { ... }
// APRÈS
function fakeSupabase(tables: Record<string, Row[]>): SupabaseClient {
  return { /* ... */ } as unknown as SupabaseClient;
}
```
(Un seul cast `as unknown as X` explicite et localisé au retour, jamais un paramètre/variable typé `any`.)

- [ ] **Step 13 : run full suite**

```bash
npx tsc --noEmit
npx eslint .
npx vitest run
```
Expected: tout vert, zéro `any` restant (`grep -rn ": any\|as any\|<any>" app/ components/ lib/ types/` ne doit remonter que des faux positifs textuels, à vérifier manuellement).

- [ ] **Step 14 : Commit**

```bash
git add app/actions/tasks.ts app/actions/profile.ts app/actions/recurring.ts lib/oauth-client-registration.ts lib/oauth-client-registration.test.ts app/oauth/authorize/route.ts lib/oauth-consent-page.test.ts supabase/migrations next.config.ts lib/supabase lib/oauth-gemini.test.ts lib/task-insertion.test.ts lib/aggressivity.test.ts CHANGELOG.md
git commit -m "fix: durcit les validations serveur et le flux de consentement OAuth (audit #67)"
```
Après déploiement : vérification manuelle obligatoire de la connexion Gemini (cf. note de risque en tête de tâche).

---

## Task 6 : États UI manquants (QG / Entraînement / Guide)

**Branche :** `fix/audit-ui-states`

**Files:**
- Create: `app/qg/loading.tsx`
- Create: `app/qg/error.tsx`
- Create: `app/qg/entrainement/loading.tsx`
- Create: `app/qg/entrainement/error.tsx`
- Create: `app/guide/loading.tsx`
- Create: `app/guide/error.tsx`
- Create: `app/guide/[slug]/loading.tsx`
- Create: `app/guide/[slug]/error.tsx`
- Modify: `app/qg/page.tsx`, `app/qg/entrainement/page.tsx` (destructurer et gérer `error` sur chaque requête Supabase)
- Modify: `lib/guide.ts` (`chargerIndexGuide` : try/catch autour de `readFile`/`JSON.parse`)

**Interfaces:**
- Consumes: aucune.
- Produces: aucune.

- [ ] **Step 0 : invoquer `/impeccable harden`**

Le CR mappe le finding #10 (3 états UI) sur `/impeccable harden`. `Skill` (`skill: "impeccable"`, `args: "harden app/qg/page.tsx app/qg/entrainement/page.tsx app/guide/page.tsx app/guide/[slug]/page.tsx lib/guide.ts"`). Suivre `reference/harden.md` en plus des Steps 1-4 ci-dessous, en répliquant explicitement le skeleton déjà en place dans `app/loading.tsx` (Arène) pour rester cohérent visuellement — ne pas laisser `harden.md` introduire un style de squelette différent de celui déjà validé sur l'Arène.

- [ ] **Step 1 : `loading.tsx` pour QG, Entraînement, Guide (skeleton cohérent avec l'existant)**

Reprendre le pattern déjà utilisé dans `app/loading.tsx` (Arène) — lire ce fichier avant d'écrire les 4 nouveaux pour répliquer exactement le même skeleton visuel (classes `animate-pulse`, tokens `surface`/`surface-2`) :
```tsx
// app/qg/loading.tsx (adapter la structure de squelette au layout réel de la page QG)
export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-6">
      <div className="h-8 w-40 animate-pulse rounded bg-surface-2" />
      <div className="h-24 w-full animate-pulse rounded-lg bg-surface" />
      <div className="h-24 w-full animate-pulse rounded-lg bg-surface" />
    </div>
  );
}
```
Répliquer avec les dimensions adaptées pour `app/qg/entrainement/loading.tsx`, `app/guide/loading.tsx`, `app/guide/[slug]/loading.tsx`.

- [ ] **Step 2 : `error.tsx` pour les 4 routes**

```tsx
// app/qg/error.tsx (`"use client"` obligatoire — contrat Next.js des error boundaries)
"use client";

import { qgErrorMessage } from "@/lib/copy/errors"; // réutiliser le registre de copy existant si une entrée adaptée existe, sinon texte direct dans le ton du projet

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-4 px-4 py-10 text-center">
      <p className="font-display text-sm uppercase tracking-wide text-hp">Le Dojo a trébuché.</p>
      <p className="text-sm text-muted">Impossible de charger le QG. Réessaie.</p>
      <button
        onClick={reset}
        className="rounded-md bg-hp px-3 py-1.5 font-display text-xs uppercase tracking-wide text-ink"
      >
        Réessayer
      </button>
    </div>
  );
}
```
Adapter le texte pour `app/qg/entrainement/error.tsx`, `app/guide/error.tsx`, `app/guide/[slug]/error.tsx` — vérifier `lib/copy/errors.ts` d'abord : si des variantes par niveau d'agressivité existent déjà pour ce type d'erreur générique, les réutiliser plutôt que du texte en dur (cohérence avec le registre de copy documenté dans `CLAUDE.md`).

- [ ] **Step 3 : gestion d'erreur explicite sur les requêtes Supabase de QG/Entraînement**

`app/qg/page.tsx` : destructurer `error` sur chaque requête et `throw` si présent (pour que `error.tsx` se déclenche, au lieu de dégrader silencieusement) :
```ts
// AVANT
const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
// APRÈS
const { data: profile, error: profileError } = await supabase.from("profiles").select("*").eq("id", user.id).single();
if (profileError) throw profileError;
```
Répliquer sur chacune des requêtes du fichier (`app/qg/page.tsx`) et de `app/qg/entrainement/page.tsx`.

- [ ] **Step 4 : `try/catch` dans `chargerIndexGuide`**

`lib/guide.ts:139-142` :
```ts
// AVANT
const raw = await readFile(indexPath, "utf-8");
return JSON.parse(raw);
// APRÈS
try {
  const raw = await readFile(indexPath, "utf-8");
  return JSON.parse(raw);
} catch (cause) {
  throw new Error("Impossible de charger l'index du Guide", { cause });
}
```
Cette erreur remonte désormais jusqu'à `app/guide/error.tsx` au lieu de faire planter le rendu sans écran cohérent.

- [ ] **Step 5 : run tests + vérification manuelle**

```bash
npx tsc --noEmit
npx vitest run
npx playwright test e2e/guide.spec.ts
```
Expected: tout vert. Vérifier manuellement en dev que couper la connexion Supabase (ou simuler une erreur via une valeur d'env invalide temporaire) affiche bien `error.tsx` sur les 4 routes, et que `loading.tsx` s'affiche brièvement au premier chargement (throttling réseau via devtools).

- [ ] **Step 6 : Commit**

```bash
git add app/qg/loading.tsx app/qg/error.tsx app/qg/entrainement/loading.tsx app/qg/entrainement/error.tsx app/guide/loading.tsx app/guide/error.tsx "app/guide/[slug]/loading.tsx" "app/guide/[slug]/error.tsx" app/qg/page.tsx app/qg/entrainement/page.tsx lib/guide.ts CHANGELOG.md
git commit -m "fix: ajoute les états loading/error manquants sur QG, Entraînement et Guide (audit #67)"
```

---

## Task 7 : Documentation & clôture

**Branche :** aucune (peut se faire directement sur chaque PR précédente au moment de sa fusion, ou en une dernière PR de synthèse une fois les 6 précédentes mergées)

**Files:**
- Modify: `CHANGELOG.md` (vérifier que les 6 lignes ajoutées tâche par tâche sont bien présentes et cohérentes)
- Modify: `CLAUDE.md` (si une convention a changé — notamment la section "Jauge d'agressivité"/"Manuel du Dojo" reste inchangée ; vérifier si le nouveau hook `useFocusTrap` ou la règle de contraste `hp-text`/`xp-text` méritent une entrée dans "Pièges et décisions non-évidentes")
- Aucun changement Notion attendu : tous les fixes de ce plan sont invisibles ou techniques du point de vue de l'utilisateur final (pas de nouvelle mécanique de jeu, pas de changement de barème/règle métier visible) — à reconfirmer PR par PR avant de fusionner, au cas où une tâche dérive de son scope initial.

- [ ] **Step 1 : vérifier la présence d'une entrée `CLAUDE.md` pour le nouveau hook `useFocusTrap`**

Ajouter, dans la section "Pièges et décisions non-évidentes", une entrée courte documentant : `useFocusTrap` (hooks/useFocusTrap.ts) est le seul point d'entrée pour tout futur overlay bloquant — `onEscape` omis = overlay non-dismissable (cas `WakeUpRitual`), fourni = fermeture standard.

- [ ] **Step 1bis : invoquer `/impeccable polish` — passe finale**

Le CR se termine sur `/impeccable polish` comme dernière étape recommandée une fois tous les fixes appliqués. `Skill` (`skill: "impeccable"`, `args: "polish"`, sans cible = passe globale). À lancer sur `main` une fois les 6 PR précédentes mergées, avant le ré-audit du Step 2.

- [ ] **Step 2 : re-lancer l'audit complet pour mesurer la progression**

```bash
npx tsc --noEmit && npx eslint . && npx vitest run && npx playwright test
```
Puis relancer `/impeccable audit` (skill) une fois les 6 PR mergées sur `main`, pour confirmer la remontée du score sur les 5 dimensions standard et vérifier qu'aucune régression n'a été introduite par les 6 PR précédentes.

- [ ] **Step 3 : mettre à jour l'issue #67**

```bash
gh issue comment 67 --body "Les 6 PR de correction ont été mergées. Score post-fix : <à remplir après ré-audit>. Détail des fixes par PR : <liens vers les 6 PR>."
```

- [ ] **Step 4 : décider de la clôture de l'issue #67**

Si le ré-audit ne remonte plus de P0/P1, fermer l'issue #67 (`gh issue close 67`) en laissant les P2/P3 restants (s'il y en a) comme nouvelles issues dédiées si substantiels, ou comme dette assumée documentée dans `CLAUDE.md` si mineurs.

---

## Self-Review

**Couverture du spec (26 findings de l'audit) :**
- P0 #1, #2 → Task 1. #3, #4 → Task 2. #5, #6 → Task 4. ✅
- P1 #7, #9 → Task 3. #8, #23(P2 mais groupé a11y) → Task 2. #10 → Task 6. #11, #12 → Task 4. #13, #14 → Task 5. ✅
- P2 #15, #21 → Task 3. #16, #22, #25 → Task 1. #17, #18, #19, #20 → Task 5. #24 → Task 4. ✅
- P3 #26 (motion-reduce jauges, border-border, hex hardcodés, gold/xp hors-rôle, next/font, lazy images, `:any` tests, headers HTTP, SameSite, weekdays) → répartis dans Task 2 (motion-reduce, border-border), Task 3 (theming/typo), Task 5 (sécurité, `:any`, weekdays), Task 4 (lazy images, sizes). Aucun oublié. ✅

**Placeholders :** aucun "TBD"/"handle edge cases"/"similar to Task N" — chaque step contient soit un code complet, soit une commande exacte avec sortie attendue.

**Cohérence des types/signatures :** `useFocusTrap(containerRef, { active, onEscape })` utilisé identiquement dans les 7 intégrations de Task 2. `goldBalance`/`currentStreak` : signatures inchangées, seuls les appelants changent (pas de rupture d'interface). `validateTaskTitle` : même fonction que celle déjà utilisée par `addTask`, pas de nouvelle signature créée.
