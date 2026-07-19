# Arène Versus (Street Fighter) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Arène screen on branch `feat/arena-street-fighter-challenger` as a versus-style layout (Hero vs Boss, two HP bars, both sprites animated idle, face to face).

**Architecture:** New pure function `calculateHeroHp` in `lib/game-engine.ts` computes a hero HP gauge from overdue tasks (procrastination penalty). Two new presentational components (`HeroBar`, mirroring `BossBar`; `IdleSprite`, a generic looping-frame sprite) plus a new `VersusScene` that replaces `CombatScene`. `app/page.tsx` gains one extra read-only Supabase query for overdue tasks. `Arena.tsx` is updated to render the new versus layout; existing task list, VFX, and victory overlay logic are untouched.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Tailwind CSS v4, Vitest, Supabase (`@supabase/ssr`), `sharp` (already in `node_modules`) for one-off sprite cropping.

## Global Constraints

- TypeScript strict, no `any` (CLAUDE.md règle de code #1).
- Game calculations live in `lib/game-engine.ts`, pure and unit-testable (CLAUDE.md règle #2).
- RG-04: never destructively delete task rows — not touched by this plan, but any query added must respect it (read-only `select`, no `delete`).
- Commits: Conventional Commits, `type: description courte` (CLAUDE.md).
- All UI copy/user-facing text in French.
- No component test framework exists in this repo (Vitest only covers `lib/**/*.test.ts`) — components are verified via `tsc --noEmit`, `eslint`, and a manual dev-server visual check, matching the existing pattern for `BossBar.tsx`/`CombatScene.tsx`.

---

### Task 1: `calculateHeroHp` in the game engine

**Files:**
- Modify: `lib/game-engine.ts`
- Modify: `lib/game-engine.test.ts`

**Interfaces:**
- Produces: `export const HERO_MAX_HP = 100`, `export const HERO_DAMAGE_PER_OVERDUE_TASK = 20`, `export type OverdueTask = Pick<Task, "is_abandoned" | "is_completed">`, `export function calculateHeroHp(overdueTasks: OverdueTask[]): number`.

- [ ] **Step 1: Write the failing tests**

Append to `lib/game-engine.test.ts` (after the existing `describe("calculateBossCurrentHp (RG-02)"...)` block):

```ts
import { calculateHeroHp } from "./game-engine";

describe("calculateHeroHp (pénalité procrastination)", () => {
  test("100 HP quand aucune tâche n'est en retard", () => {
    expect(calculateHeroHp([])).toBe(100);
  });

  test("retire 20 HP par tâche en retard non résolue", () => {
    const tasks = [
      makeTask({ id: "1" }),
      makeTask({ id: "2" }),
    ];
    expect(calculateHeroHp(tasks)).toBe(60);
  });

  test("ignore les tâches en retard déjà complétées ou abandonnées", () => {
    const tasks = [
      makeTask({ id: "1", is_completed: true }),
      makeTask({ id: "2", is_abandoned: true }),
      makeTask({ id: "3" }),
    ];
    expect(calculateHeroHp(tasks)).toBe(80);
  });

  test("plafonne à 0, jamais négatif", () => {
    const tasks = Array.from({ length: 10 }, (_, i) => makeTask({ id: `t${i}` }));
    expect(calculateHeroHp(tasks)).toBe(0);
  });
});
```

Add the `calculateHeroHp` import to the existing top-of-file import from `./game-engine` instead of a second import line — i.e. edit the existing import statement:

```ts
import {
  calculateBossCurrentHp,
  calculateBossMaxHp,
  calculateHeroHp,
  taskHpValue,
} from "./game-engine";
```

(Remove the separate `import { calculateHeroHp } from "./game-engine";` line shown above — it was only there to make the diff obvious; the real edit merges it into the existing import.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/game-engine.test.ts`
Expected: FAIL — `calculateHeroHp is not exported` / `is not a function`.

- [ ] **Step 3: Implement `calculateHeroHp`**

Append to `lib/game-engine.ts`:

```ts
export const HERO_MAX_HP = 100;
export const HERO_DAMAGE_PER_OVERDUE_TASK = 20;

export type OverdueTask = Pick<Task, "is_abandoned" | "is_completed">;

export function calculateHeroHp(overdueTasks: OverdueTask[]): number {
  const unresolvedCount = overdueTasks.filter(
    (task) => !task.is_abandoned && !task.is_completed,
  ).length;

  return Math.max(0, HERO_MAX_HP - unresolvedCount * HERO_DAMAGE_PER_OVERDUE_TASK);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/game-engine.test.ts`
Expected: PASS, all tests including the 4 new ones.

- [ ] **Step 5: Commit**

```bash
git add lib/game-engine.ts lib/game-engine.test.ts
git commit -m "feat: add calculateHeroHp for procrastination penalty gauge"
```

---

### Task 2: Prepare idle sprite frames (Fire Knight + Frost Guardian)

**Files:**
- Create (script, temporary — delete after use): `prepare-versus-sprites.mjs` (repo root)
- Create: `public/sprites/mc/fire-knight/idle/frame0000.png` … `frame0007.png` (8 files)
- Create: `public/sprites/bosses/frost-guardian/idle/frame0000.png` … `frame0005.png` (6 files)
- Delete: `public/sprites/bosses/frost-guardian/idle-1-trimmed.png` (superseded by the `idle/` sequence, unused once Task 5 removes `CombatScene.tsx`)

**Interfaces:**
- Produces: two frame sequences on disk, `frame0000.png`-style zero-padded names (4 digits), matching the naming convention already used in `public/vfx/impact/*/frame0000.png`. Frame counts: Fire Knight = 8, Frost Guardian = 6.

- [ ] **Step 1: Write the crop script**

Create `prepare-versus-sprites.mjs` at the repo root:

```js
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";

async function cropAnimationConsistently(framePaths, outDir, outPrefix) {
  await mkdir(outDir, { recursive: true });

  const trims = [];
  for (const framePath of framePaths) {
    const { info } = await sharp(framePath)
      .trim()
      .toBuffer({ resolveWithObject: true });
    trims.push({
      left: -(info.trimOffsetLeft ?? 0),
      top: -(info.trimOffsetTop ?? 0),
      width: info.width,
      height: info.height,
    });
  }

  const left = Math.min(...trims.map((t) => t.left));
  const top = Math.min(...trims.map((t) => t.top));
  const right = Math.max(...trims.map((t) => t.left + t.width));
  const bottom = Math.max(...trims.map((t) => t.top + t.height));
  const width = right - left;
  const height = bottom - top;

  for (let i = 0; i < framePaths.length; i += 1) {
    const outPath = path.join(outDir, `${outPrefix}${String(i).padStart(4, "0")}.png`);
    await sharp(framePaths[i]).extract({ left, top, width, height }).toFile(outPath);
  }

  console.log(`${outDir}: cropped to ${width}x${height} at (${left},${top})`);
}

const fireKnightDir =
  "assets/MC/Elementals_fire_knight_FREE_v1.1/Elementals_fire_knight_FREE_v1.1/png/fire_knight/01_idle";
const fireKnightFrames = Array.from({ length: 8 }, (_, i) =>
  path.join(fireKnightDir, `idle_${i + 1}.png`),
);
await cropAnimationConsistently(
  fireKnightFrames,
  "public/sprites/mc/fire-knight/idle",
  "frame",
);

const frostGuardianDir =
  "assets/Boss/Frost_Guardian_FREE_v1.0/Frost_Guardian_FREE_v1.0/PNG files/idle";
const frostGuardianFrames = Array.from({ length: 6 }, (_, i) =>
  path.join(frostGuardianDir, `idle_${i + 1}.png`),
);
await cropAnimationConsistently(
  frostGuardianFrames,
  "public/sprites/bosses/frost-guardian/idle",
  "frame",
);
```

This has already been validated in a scratch run against the real asset files: Fire Knight crops to **58×44** at offset (101,83); Frost Guardian crops to **81×91** at offset (55,19). Both are consistent across every frame of their respective animation (no jitter).

- [ ] **Step 2: Run the script**

Run: `node prepare-versus-sprites.mjs`
Expected output:
```
public/sprites/mc/fire-knight/idle: cropped to 58x44 at (101,83)
public/sprites/bosses/frost-guardian/idle: cropped to 81x91 at (55,19)
```

- [ ] **Step 3: Verify file counts and remove the old single-frame boss asset**

Run: `ls public/sprites/mc/fire-knight/idle | wc -l` → expect `8`
Run: `ls public/sprites/bosses/frost-guardian/idle | wc -l` → expect `6`
Run: `rm public/sprites/bosses/frost-guardian/idle-1-trimmed.png prepare-versus-sprites.mjs`

- [ ] **Step 4: Commit**

```bash
git add public/sprites/mc/fire-knight/idle public/sprites/bosses/frost-guardian/idle
git add -u public/sprites/bosses/frost-guardian/idle-1-trimmed.png
git commit -m "feat: add cropped idle sprite sequences for hero and boss versus scene"
```

---

### Task 3: `IdleSprite` component (shared looping-frame sprite)

**Files:**
- Create: `components/combat/IdleSprite.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks (standalone, but frame paths must match Task 2's output — `/sprites/mc/fire-knight/idle/frame` and `/sprites/bosses/frost-guardian/idle/frame`, both zero-padded 4-digit `.png`).
- Produces: `export default function IdleSprite({ framePrefix, frameCount, alt, className }: IdleSpriteProps): JSX.Element`, where `IdleSpriteProps = { framePrefix: string; frameCount: number; alt: string; className?: string }`.

- [ ] **Step 1: Write the component**

Create `components/combat/IdleSprite.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";

interface IdleSpriteProps {
  framePrefix: string;
  frameCount: number;
  alt: string;
  className?: string;
}

const FRAME_MS = 120;

export default function IdleSprite({
  framePrefix,
  frameCount,
  alt,
  className,
}: IdleSpriteProps) {
  const [reducedMotion] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (reducedMotion) return;

    const timer = setTimeout(() => {
      setFrame((current) => (current + 1) % frameCount);
    }, FRAME_MS);

    return () => clearTimeout(timer);
  }, [frame, frameCount, reducedMotion]);

  const paddedFrame = String(frame).padStart(4, "0");

  return (
    // eslint-disable-next-line @next/next/no-img-element -- flipbook rapide, next/image inutile ici
    <img
      src={`${framePrefix}${paddedFrame}.png`}
      alt={alt}
      className={className}
    />
  );
}
```

- [ ] **Step 2: Verify types and lint**

Run: `npx tsc --noEmit`
Expected: no errors.
Run: `npx eslint components/combat/IdleSprite.tsx`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/combat/IdleSprite.tsx
git commit -m "feat: add IdleSprite looping-frame animation component"
```

---

### Task 4: `HeroBar` component (mirrors `BossBar`)

**Files:**
- Create: `components/combat/HeroBar.tsx`

**Interfaces:**
- Produces: `export default function HeroBar({ heroName, currentHp, maxHp }: HeroBarProps): JSX.Element`, where `HeroBarProps = { heroName: string; currentHp: number; maxHp: number }`.

- [ ] **Step 1: Write the component**

Create `components/combat/HeroBar.tsx`:

```tsx
interface HeroBarProps {
  heroName: string;
  currentHp: number;
  maxHp: number;
}

export default function HeroBar({ heroName, currentHp, maxHp }: HeroBarProps) {
  const pct = maxHp > 0 ? Math.max(0, Math.min(100, (currentHp / maxHp) * 100)) : 0;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between font-display text-sm uppercase tracking-wide text-ink">
        <span className="font-hud text-xs tabular-nums text-muted">
          {currentHp}/{maxHp} HP
        </span>
        <span>{heroName}</span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={currentHp}
        aria-valuemin={0}
        aria-valuemax={maxHp}
        aria-label={`Vie du héros : ${currentHp} sur ${maxHp}`}
        className="h-3.5 overflow-hidden rounded-sm bg-hp-dim"
      >
        <div
          className="ml-auto h-full bg-hp transition-[width] duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify types and lint**

Run: `npx tsc --noEmit`
Expected: no errors.
Run: `npx eslint components/combat/HeroBar.tsx`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/combat/HeroBar.tsx
git commit -m "feat: add HeroBar component mirroring BossBar"
```

---

### Task 5: `VersusScene` component (replaces `CombatScene`)

**Files:**
- Create: `components/combat/VersusScene.tsx`
- Delete: `components/combat/CombatScene.tsx`

**Interfaces:**
- Consumes: `IdleSprite` from Task 3 (`framePrefix`, `frameCount`, `alt`, `className` props).
- Produces: `export default function VersusScene({ dimmed }: VersusSceneProps): JSX.Element`, where `VersusSceneProps = { dimmed?: boolean }` (same prop shape as the old `CombatScene`, so `Arena.tsx` swaps the import with no other change needed).

- [ ] **Step 1: Write the component**

Create `components/combat/VersusScene.tsx`:

```tsx
import Image from "next/image";
import IdleSprite from "./IdleSprite";

interface VersusSceneProps {
  dimmed?: boolean;
}

// Décor : assets/Backgrounds/free-steampunk-cityscape-pixel-backgrounds (CraftPix, cf. ASSETS.md)
// Héros : assets/MC/Elementals_fire_knight_FREE_v1.1 (licence non documentée localement, cf. ASSETS.md)
// Boss : assets/Boss/Frost_Guardian_FREE_v1.0 (licence non documentée localement, cf. ASSETS.md)
export default function VersusScene({ dimmed = false }: VersusSceneProps) {
  return (
    <div
      className="relative h-40 w-full overflow-hidden rounded-lg border border-border"
      style={dimmed ? { filter: "saturate(0.5) brightness(0.7)" } : undefined}
    >
      <Image
        src="/backgrounds/steampunk-cityscape-1.png"
        alt=""
        fill
        sizes="336px"
        priority
        className="object-cover [image-rendering:pixelated]"
      />
      <IdleSprite
        framePrefix="/sprites/mc/fire-knight/idle/frame"
        frameCount={8}
        alt="Ton héros : le Chevalier de Feu"
        className="absolute bottom-2 left-4 h-28 w-auto [image-rendering:pixelated] drop-shadow-[0_4px_8px_rgba(0,0,0,0.6)]"
      />
      <IdleSprite
        framePrefix="/sprites/bosses/frost-guardian/idle/frame"
        frameCount={6}
        alt="Le Boss du jour : le Gardien de Glace"
        className="absolute bottom-2 right-4 h-28 w-auto [image-rendering:pixelated] drop-shadow-[0_4px_8px_rgba(0,0,0,0.6)]"
      />
    </div>
  );
}
```

- [ ] **Step 2: Delete the old scene**

Run: `rm components/combat/CombatScene.tsx`

- [ ] **Step 3: Verify types and lint**

Run: `npx tsc --noEmit`
Expected: errors referencing `CombatScene` in `Arena.tsx` — expected at this point, resolved in Task 7. Confirm the only errors are about the now-missing `CombatScene` import/usage in `Arena.tsx`, nothing else.

- [ ] **Step 4: Commit**

```bash
git add -A components/combat/VersusScene.tsx components/combat/CombatScene.tsx
git commit -m "feat: add VersusScene (hero + boss face to face), remove CombatScene"
```

---

### Task 6: `app/page.tsx` — fetch overdue tasks

**Files:**
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `OverdueTask` shape from Task 1 (structurally — the raw Supabase `Task[]` rows satisfy it).
- Produces: `Arena` now receives an additional `overdueTasks: Task[]` prop (wired up fully in Task 7).

- [ ] **Step 1: Add the overdue tasks query**

Edit `app/page.tsx` — replace the block from the existing tasks query to the return statement:

```tsx
  const { data: tasks, error: tasksError } = await supabase
    .from("tasks")
    .select("*")
    .eq("user_id", user.id)
    .eq("day_date", todayIso())
    .order("position", { ascending: true });

  if (tasksError) {
    return <ArenaError />;
  }

  const { data: overdueTasks, error: overdueError } = await supabase
    .from("tasks")
    .select("*")
    .eq("user_id", user.id)
    .lt("day_date", todayIso())
    .eq("is_completed", false)
    .eq("is_abandoned", false);

  if (overdueError) {
    return <ArenaError />;
  }

  return (
    <Arena
      profile={profile}
      initialTasks={tasks ?? []}
      overdueTasks={overdueTasks ?? []}
    />
  );
```

- [ ] **Step 2: Verify types**

Run: `npx tsc --noEmit`
Expected: error — `Arena` doesn't yet accept an `overdueTasks` prop. Expected at this point, resolved in Task 7.

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "feat: fetch overdue tasks for hero HP penalty"
```

---

### Task 7: `Arena.tsx` — versus layout wiring

**Files:**
- Modify: `components/combat/Arena.tsx`

**Interfaces:**
- Consumes: `calculateHeroHp`, `HERO_MAX_HP`, `OverdueTask` from `lib/game-engine.ts` (Task 1); `HeroBar` from Task 4; `VersusScene` from Task 5; `overdueTasks` prop from Task 6.
- Produces: `Arena` now requires `overdueTasks: Task[]` in `ArenaProps` — the last integration point, no further tasks depend on this.

- [ ] **Step 1: Update imports and props**

In `components/combat/Arena.tsx`, replace:

```tsx
import { calculateBossCurrentHp, calculateBossMaxHp } from "@/lib/game-engine";
```

with:

```tsx
import {
  calculateBossCurrentHp,
  calculateBossMaxHp,
  calculateHeroHp,
  HERO_MAX_HP,
} from "@/lib/game-engine";
```

Replace:

```tsx
import CombatScene from "./CombatScene";
```

with:

```tsx
import VersusScene from "./VersusScene";
import HeroBar from "./HeroBar";
```

Replace:

```tsx
const BOSS_NAME = "Le Gardien de Glace";
```

with:

```tsx
const BOSS_NAME = "Le Gardien de Glace";
const HERO_NAME = "Le Chevalier de Feu";
```

Replace:

```tsx
interface ArenaProps {
  profile: Profile;
  initialTasks: Task[];
}
```

with:

```tsx
interface ArenaProps {
  profile: Profile;
  initialTasks: Task[];
  overdueTasks: Task[];
}
```

Replace:

```tsx
export default function Arena({ profile, initialTasks }: ArenaProps) {
```

with:

```tsx
export default function Arena({ profile, initialTasks, overdueTasks }: ArenaProps) {
```

- [ ] **Step 2: Compute hero HP**

Replace:

```tsx
  const maxHp = calculateBossMaxHp(tasks);
  const currentHp = calculateBossCurrentHp(tasks);
```

with:

```tsx
  const maxHp = calculateBossMaxHp(tasks);
  const currentHp = calculateBossCurrentHp(tasks);
  const heroHp = calculateHeroHp(overdueTasks);
```

- [ ] **Step 3: Replace the versus header + scene render**

Replace:

```tsx
        <BossBar bossName={BOSS_NAME} currentHp={currentHp} maxHp={maxHp} />
        <div className="relative">
          <CombatScene dimmed={isEmpty} />
```

with:

```tsx
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <HeroBar heroName={HERO_NAME} currentHp={heroHp} maxHp={HERO_MAX_HP} />
          </div>
          <span className="font-display text-xs text-alert">VS</span>
          <div className="flex-1">
            <BossBar bossName={BOSS_NAME} currentHp={currentHp} maxHp={maxHp} />
          </div>
        </div>
        <div className="relative">
          <VersusScene dimmed={isEmpty} />
```

- [ ] **Step 4: Verify types and lint**

Run: `npx tsc --noEmit`
Expected: no errors.
Run: `npx eslint components/combat/Arena.tsx app/page.tsx`
Expected: no errors.

- [ ] **Step 5: Run the full unit test suite**

Run: `npx vitest run`
Expected: PASS, all tests (including the 4 new `calculateHeroHp` tests from Task 1).

- [ ] **Step 6: Commit**

```bash
git add components/combat/Arena.tsx
git commit -m "feat: wire versus layout (HeroBar + VersusScene) into Arena"
```

---

### Task 8: `app/loading.tsx` — skeleton for the versus layout

**Files:**
- Modify: `app/loading.tsx`

**Interfaces:**
- Consumes: none (pure presentational skeleton, mirrors Task 7's Arena layout shape).

- [ ] **Step 1: Update the skeleton to show two HP bars**

Replace:

```tsx
      <div className="flex items-center justify-between">
        <span className="skeleton h-4 w-32" />
        <span className="skeleton h-4 w-16" />
      </div>
      <span className="skeleton h-3.5 w-full" />
      <span className="skeleton h-40 w-full rounded-lg" />
```

with:

```tsx
      <div className="flex items-center gap-2">
        <div className="flex flex-1 flex-col gap-1">
          <span className="skeleton h-4 w-full" />
          <span className="skeleton h-3.5 w-full" />
        </div>
        <span className="skeleton h-3 w-6" />
        <div className="flex flex-1 flex-col gap-1">
          <span className="skeleton h-4 w-full" />
          <span className="skeleton h-3.5 w-full" />
        </div>
      </div>
      <span className="skeleton h-40 w-full rounded-lg" />
```

- [ ] **Step 2: Verify types and lint**

Run: `npx tsc --noEmit`
Expected: no errors.
Run: `npx eslint app/loading.tsx`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/loading.tsx
git commit -m "feat: update loading skeleton for versus layout"
```

---

### Task 9: Full verification pass (visual check + sprite facing)

**Files:**
- Modify (only if the visual check finds a facing issue): `components/combat/VersusScene.tsx`

**Interfaces:**
- Consumes: nothing new — this is a verification-only task, following the project's `verify` skill convention (drive the real screen, don't just trust `tsc`/`eslint`).

- [ ] **Step 1: Run the full check suite**

Run: `npx tsc --noEmit && npx eslint . && npx vitest run`
Expected: all three pass with no errors/failures.

- [ ] **Step 2: Start the dev server and visually check the Arène screen**

Run: `npm run dev` (background)
Open the app in a browser, log in, and view the Arène screen.

Check:
- Both HeroBar and BossBar render side by side with "VS" between them, hero bar fills from the right, boss bar fills from the left, both at full width when no tasks are overdue/completed.
- Both sprites idle-loop smoothly (no flicker/jitter — confirms Task 2's consistent crop worked).
- Hero (Fire Knight) and Boss (Frost Guardian) face each other. **If either sprite visually faces away from the other**, add `-scale-x-100` to that sprite's `className` in `components/combat/VersusScene.tsx` and re-check.
- Completing a task still damages the Boss (existing VFX/floating text/flash) — hero bar does not react to task completion (by design, per spec).

- [ ] **Step 3: Fix facing if needed, then commit**

Only if Step 2 required a flip:

```bash
git add components/combat/VersusScene.tsx
git commit -m "fix: flip sprite to face opponent in versus scene"
```

If no fix was needed, skip this commit — Task 9 is verification-only.

---

## Self-Review Notes

- **Spec coverage:** Sprites (Fire Knight/Frost Guardian, animated idle) → Tasks 2/3/5. Hero HP mechanic → Task 1/6/7. HeroBar/VersusScene/Arena rewrite → Tasks 4/5/7. Loading skeleton parity (CLAUDE.md 3-states rule) → Task 8. Hors-scope items (Rituel du Réveil, hero hit animation) intentionally have no task — confirmed absent.
- **Type consistency:** `OverdueTask` (Task 1) matches the `Task` fields used in Task 6's query and Task 7's `overdueTasks` prop. `IdleSprite`'s `framePrefix`/`frameCount` props (Task 3) match the exact paths and counts produced by Task 2's script.
- **No placeholders:** every step has literal code/commands; the crop script was validated against the real asset files before being written into this plan (see Task 2 output dimensions).
