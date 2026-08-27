import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { login, requireE2eAdminEnv, resolveE2eUserId } from "./fixtures";

// Remplace `e2e/task-reorder-race.spec.ts` (issue #144), qui couvrait déjà ces
// deux symptômes — « cocher deux tâches rapprochées » et « ajouter alors qu'une
// racine est cochée » — mais **sans latence simulée** : il enchaînait deux clics
// à moins de 200 ms et attendait `networkidle` avant de recharger. C'est
// précisément pourquoi il n'a jamais attrapé la course, alors qu'elle était
// présente : la fenêtre de course est la latence réseau, pas l'intervalle entre
// les deux clics. Ne pas réintroduire un second fichier sur ce sujet.
//
// Issue #195 : l'ordre était calculé au clic depuis un snapshot du state, puis
// envoyé à `reorderSiblings` APRÈS l'aller-retour de la mutation. Toute
// mutation concurrente pendant la fenêtre réseau périmait ce payload — cocher
// deux tâches d'affilée et le plan de la première, appliqué en dernier,
// remettait la seconde en TÊTE de liste.
//
// Les assertions portent sur l'ordre RÉELLEMENT AFFICHÉ (ordre du DOM), pas sur
// la colonne `position` : depuis le correctif l'ordre est dérivé du contenu
// (`compareForDisplay`, complétées en bas) et plus jamais écrit en base, donc
// `position` ne porte plus l'invariant — l'utilisateur, lui, ne voit que le DOM.
//
// La latence simulée est indispensable : la fenêtre de course EST la latence
// réseau. Sans elle ces tests passeraient même avec le bug — c'est exactement
// pourquoi il n'avait pas de scénario de repro en local.
const ACTION_LATENCY_MS = 1500;

const RUN = Date.now().toString().slice(-6);
const TITLES = [`ORD-A-${RUN}`, `ORD-B-${RUN}`, `ORD-C-${RUN}`, `ORD-D-${RUN}`];

interface DisplayedRow {
  title: string;
  done: boolean;
}

// Mémoïsé : `resolveE2eUserId` fait un appel Admin GoTrue (listUsers), et ces
// helpers sont appelés en boucle par les attentes de persistance — sans cache,
// le polling coûte plus cher que ce qu'il attend et épuise le timeout du test.
let adminCache: { db: SupabaseClient; uid: string; day: string } | null = null;

async function admin(): Promise<{ db: SupabaseClient; uid: string; day: string }> {
  if (adminCache) return adminCache;
  const { url, key, email } = requireE2eAdminEnv();
  const db = createClient(url, key, { auth: { persistSession: false } });
  const uid = await resolveE2eUserId(db, email);
  const { data: profile } = await db.from("profiles").select("timezone").eq("id", uid).single();
  const timezone = (profile?.timezone as string) ?? "UTC";
  // Même jour local que `dayKey` côté app : formatage direct via Intl, sans
  // arithmétique d'offset (cf. CLAUDE.md § Décalage horaire).
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
  adminCache = { db, uid, day };
  return adminCache;
}

// Sème en base plutôt que par le formulaire : l'objet du test est l'ordre après
// mutation, et le compte e2e est partagé (ADR-04) — les tâches accumulées d'un
// run précédent fausseraient la lecture de l'ordre.
async function seedTodayRoots(titles: string[]): Promise<void> {
  const { db, uid, day } = await admin();
  await db.from("tasks").delete().eq("user_id", uid).eq("day_date", day);
  await db
    .from("tasks")
    .insert(titles.map((title, position) => ({ user_id: uid, title, day_date: day, position })));
}

async function displayedRows(page: Page): Promise<DisplayedRow[]> {
  const rows = page.locator('li[id^="task-"]');
  const count = await rows.count();
  const displayed: DisplayedRow[] = [];
  for (let index = 0; index < count; index += 1) {
    const row = rows.nth(index);
    displayed.push({
      title: (await row.textContent())?.trim() ?? "",
      done: await row.getByRole("checkbox").isChecked(),
    });
  }
  return displayed;
}

function summary(rows: DisplayedRow[]): string {
  return rows.map((row) => `${row.done ? "✓" : "·"}${row.title.slice(0, 9)}`).join(" ");
}

// Invariant produit : aucune tâche cochée ne doit précéder une tâche active.
function expectCompletedLast(rows: DisplayedRow[]): void {
  const firstDone = rows.findIndex((row) => row.done);
  if (firstDone === -1) return;
  const lastActive = rows.map((row) => row.done).lastIndexOf(false);
  expect(lastActive, `une complétée précède une active : ${summary(rows)}`).toBeLessThan(firstDone);
}

async function persistedRows(): Promise<Array<{ title: string; done: boolean }>> {
  const { db, uid, day } = await admin();
  const { data } = await db
    .from("tasks")
    .select("title, is_completed")
    .eq("user_id", uid)
    .eq("day_date", day)
    .eq("is_abandoned", false);
  return (data ?? []).map((row) => ({
    title: row.title as string,
    done: row.is_completed as boolean,
  }));
}

// Attend que la BASE reflète la mutation, avant tout `reload()`. `networkidle`
// ne suffit pas : sous latence simulée, il peut se résoudre entre le retour du
// premier POST et l'émission du second (Playwright attend d'abord que la ligne
// visée soit stable, or la liste se réordonne au premier clic), et le reload
// annule alors la requête en vol — on testerait l'annulation, pas la
// persistance. Vérifié en instrumentant : sans reload, les deux complétions
// arrivent bien en base.
async function waitForPersisted(
  check: (rows: Array<{ title: string; done: boolean }>) => void,
): Promise<void> {
  await expect(async () => check(await persistedRows())).toPass({ timeout: 20_000 });
}

async function slowDownServerActions(page: Page): Promise<void> {
  await page.route(
    (url) => url.pathname === "/",
    async (route) => {
      if (route.request().method() === "POST") {
        await new Promise((resolve) => setTimeout(resolve, ACTION_LATENCY_MS));
      }
      await route.continue();
    },
  );
}

test.describe("Ordre de la liste du jour (issue #195)", () => {
  test("deux cases cochées coup sur coup : les deux finissent en bas, même après rechargement", async ({
    page,
  }) => {
    await seedTodayRoots(TITLES);
    await login(page);
    await page.goto("/");
    await expect(page.getByText(TITLES[3])).toBeVisible();

    await slowDownServerActions(page);

    // `pendingMutationIds` (Fix #95) ne verrouille que la tâche en vol : cocher
    // une AUTRE tâche pendant l'aller-retour est permis, et c'est ce geste qui
    // renvoyait la seconde complétée en tête de liste.
    await page.getByRole("checkbox", { name: new RegExp(TITLES[0]) }).check();
    await page.getByRole("checkbox", { name: new RegExp(TITLES[1]) }).check();

    await expect(async () => {
      const rows = await displayedRows(page);
      expect(rows.filter((row) => row.done)).toHaveLength(2);
    }).toPass({ timeout: 15_000 });
    expectCompletedLast(await displayedRows(page));

    // Le rechargement est la vraie preuve : c'est au fetch suivant que l'ordre
    // persisté reprenait le dessus sur l'affichage optimiste.
    await waitForPersisted((rows) => {
      expect(rows.filter((row) => row.done)).toHaveLength(2);
    });
    await page.reload();
    await expect(page.getByText(TITLES[3])).toBeVisible();
    const afterReload = await displayedRows(page);
    expect(afterReload.filter((row) => row.done)).toHaveLength(2);
    expectCompletedLast(afterReload);
  });

  test("une tâche ajoutée s'affiche au-dessus des complétées", async ({ page }) => {
    await seedTodayRoots(TITLES.slice(0, 3));
    await login(page);
    await page.goto("/");
    await page.getByRole("checkbox", { name: new RegExp(TITLES[0]) }).check();
    await expect(async () => {
      expect((await displayedRows(page)).filter((row) => row.done)).toHaveLength(1);
    }).toPass({ timeout: 15_000 });

    await slowDownServerActions(page);

    const added = `ORD-NEW-${RUN}`;
    const input = page.getByLabel("Ajouter une tâche", { exact: true });
    await input.fill(added);
    await input.press("Enter");
    await expect(page.getByText(added)).toBeVisible();

    await waitForPersisted((rows) => {
      expect(rows.map((row) => row.title)).toContain(added);
    });
    await page.reload();
    await expect(page.getByText(added)).toBeVisible();
    const rows = await displayedRows(page);
    expectCompletedLast(rows);
    expect(
      rows.findIndex((row) => row.title.includes(added)),
      `la nouvelle tâche doit précéder les complétées : ${summary(rows)}`,
    ).toBeLessThan(rows.findIndex((row) => row.done));
  });

  // La soumission implicite d'un formulaire clique son bouton par défaut ; un
  // bouton `disabled` l'annule purement et simplement. Le champ restait donc
  // muet quand on enchaînait une saisie pendant un ajout en vol — sans le
  // moindre retour, alors que le texte tapé était toujours là.
  test("Entrée enchaînée pendant un ajout en vol : aucune tâche perdue", async ({ page }) => {
    await seedTodayRoots([TITLES[0]]);
    await login(page);
    await page.goto("/");
    await expect(page.getByText(TITLES[0])).toBeVisible();

    await slowDownServerActions(page);

    const first = `ORD-FAST1-${RUN}`;
    const second = `ORD-FAST2-${RUN}`;
    const input = page.getByLabel("Ajouter une tâche", { exact: true });
    await input.fill(first);
    await input.press("Enter");
    await input.fill(second);
    await input.press("Enter");

    // Rechargement : prouve que les deux tâches ont bien atteint la base, et
    // pas seulement le state optimiste.
    await expect(page.getByText(second)).toBeVisible();
    await waitForPersisted((rows) => {
      const titles = rows.map((row) => row.title);
      expect(titles).toContain(first);
      expect(titles).toContain(second);
    });
    await page.reload();
    await expect(page.getByText(first)).toBeVisible();
    await expect(page.getByText(second)).toBeVisible();
    expectCompletedLast(await displayedRows(page));
  });
});
