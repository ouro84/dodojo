# Refonte Manuel du Dojo — articles Notion multi-pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer le Manuel du Dojo mono-bloc (`content/guide.json`, une page Notion, sync manuelle) par une doc multi-articles (base Notion « Guide Dodojo », 19 articles déjà migrés et publiés) avec sync automatique au build, rendue en sommaire par catégorie + pages d'article individuelles.

**Architecture:** `scripts/pull-guide.mjs` interroge l'API REST Notion en `fetch` brut (aucun SDK), filtre `Statut = Publié`, convertit chaque page en Markdown, écrit `content/guide/<slug>.md` + `content/guide/index.json` (committés). `app/guide/page.tsx` (sommaire) et `app/guide/[slug]/page.tsx` (article, SSG) lisent ce contenu via `lib/guide.ts`. Rendu Markdown via `react-markdown` + `remark-gfm` dans `components/guide/ArticleMarkdown.tsx`.

**Tech Stack:** Next.js 16 App Router (Server Components), TypeScript strict, Vitest, Playwright, `react-markdown` + `remark-gfm` (nouvelles deps), Notion REST API v1 (`2022-06-28`).

## Global Constraints

- TypeScript strict, jamais de `any` (règle projet n°1).
- Vitest ne découvre que `lib/**/*.test.ts`, `components/**/*.test.tsx`, `app/**/*.test.ts` (`vitest.config.ts:12`) — un test dans `scripts/` ne tourne jamais.
- Aucun alias `@/` dans les scripts `.mjs` (pas de résolution TS) — imports relatifs uniquement si jamais un script importe un autre fichier local.
- Aucune dépendance SDK Notion (`@notionhq/client` à retirer) : tout passe par `fetch` natif vers l'API REST Notion.
- Conventional Commits : `type: description courte` (`feat:`, `fix:`, `chore:`, `docs:`).
- `CHANGELOG.md` (sous `[Unreleased]`) et `CLAUDE.md` (piège documenté) mis à jour dans la **même PR** que l'implémentation, jamais après coup.
- E2E Playwright tourne en série sur build prod (`playwright.config.ts`) — jamais de `test.only`/`fullyParallel`.
- Notion (déjà fait, ne pas refaire) : base « Guide Dodojo » créée, database ID `577dc545-1f8a-4c42-9821-d16e3568a6ec`, 19 articles migrés et `Statut = Publié`. `NOTION_TOKEN` déjà dans `.env.local`.

---

## Task 1: `lib/guide.ts` — conversion Markdown pure + helpers d'accès au contenu

**Files:**
- Modify: `lib/guide.ts` (réécriture complète)
- Modify: `lib/guide.test.ts` (réécriture complète)

**Interfaces:**
- Produces: `richTextToMarkdown(richText?: NotionRichTextLike[]): string`, `notionBlocksToMarkdown(blocks: NotionBlockLike[], depth?: number): string`, `ORDRE_SECTIONS: readonly string[]`, `interface ArticleGuide { titre: string; slug: string; section: string; ordre: number; resume: string; motsCles: string[]; majLe: string }`, `chargerIndexGuide(): Promise<ArticleGuide[]>`, `chargerCorpsArticle(slug: string): Promise<string | null>`, `grouperParSection(articles: ArticleGuide[]): { section: string; articles: ArticleGuide[] }[]`.
- Consumes: rien (première tâche du plan).

- [ ] **Step 1: Écrire les tests (échouent, `lib/guide.ts` n'a pas encore les nouvelles fonctions)**

Remplace tout le contenu de `lib/guide.test.ts` par :

```ts
import { describe, expect, test } from "vitest";
import {
  richTextToMarkdown,
  notionBlocksToMarkdown,
  grouperParSection,
  type NotionBlockLike,
  type ArticleGuide,
} from "./guide";

function rich(text: string, annotations: Record<string, boolean> = {}) {
  return [{ plain_text: text, annotations }];
}

describe("richTextToMarkdown", () => {
  test("applique gras, italique, code, lien", () => {
    expect(richTextToMarkdown(rich("gras", { bold: true }))).toBe("**gras**");
    expect(richTextToMarkdown(rich("italique", { italic: true }))).toBe("_italique_");
    expect(richTextToMarkdown(rich("code", { code: true }))).toBe("`code`");
    expect(richTextToMarkdown([{ plain_text: "lien", href: "https://x.test" }])).toBe(
      "[lien](https://x.test)",
    );
  });

  test("tableau vide renvoie une chaîne vide", () => {
    expect(richTextToMarkdown()).toBe("");
    expect(richTextToMarkdown([])).toBe("");
  });
});

describe("notionBlocksToMarkdown", () => {
  test("heading_2 puis paragraphe", () => {
    const blocks: NotionBlockLike[] = [
      { type: "heading_2", heading_2: { rich_text: rich("Titre") } },
      { type: "paragraph", paragraph: { rich_text: rich("Un texte.") } },
    ];
    expect(notionBlocksToMarkdown(blocks)).toBe("## Titre\n\nUn texte.");
  });

  test("liste à puces avec enfants imbriqués (children pré-résolus)", () => {
    const blocks: NotionBlockLike[] = [
      {
        type: "bulleted_list_item",
        bulleted_list_item: { rich_text: rich("Parent") },
        children: [
          { type: "bulleted_list_item", bulleted_list_item: { rich_text: rich("Enfant") } },
        ],
      },
    ];
    expect(notionBlocksToMarkdown(blocks)).toBe("- Parent\n\n  - Enfant");
  });

  test("quote et callout deviennent des blockquotes", () => {
    const blocks: NotionBlockLike[] = [
      { type: "quote", quote: { rich_text: rich("Une citation") } },
      {
        type: "callout",
        callout: { rich_text: rich("Attention"), icon: { emoji: "💡" } },
      },
    ];
    expect(notionBlocksToMarkdown(blocks)).toBe("> Une citation\n\n> 💡 Attention");
  });

  test("code, divider, image (localPath pré-résolu)", () => {
    const blocks: NotionBlockLike[] = [
      { type: "code", code: { rich_text: [{ plain_text: "const x = 1;" }], language: "ts" } },
      { type: "divider" },
      { type: "image", image: { caption: rich("Alt"), localPath: "/guide/slug/img-1.png" } },
    ];
    expect(notionBlocksToMarkdown(blocks)).toBe(
      "```ts\nconst x = 1;\n```\n\n---\n\n![Alt](/guide/slug/img-1.png)",
    );
  });

  test("table (rows pré-résolues comme children)", () => {
    const blocks: NotionBlockLike[] = [
      {
        type: "table",
        table: {},
        children: [
          { type: "table_row", table_row: { cells: [rich("A"), rich("B")] } },
          { type: "table_row", table_row: { cells: [rich("1"), rich("2")] } },
        ],
      },
    ];
    expect(notionBlocksToMarkdown(blocks)).toBe("| A | B |\n| --- | --- |\n| 1 | 2 |");
  });

  test("type non géré ignoré silencieusement", () => {
    const blocks: NotionBlockLike[] = [{ type: "unsupported_type" }];
    expect(notionBlocksToMarkdown(blocks)).toBe("");
  });

  test("liste de blocs vide → chaîne vide", () => {
    expect(notionBlocksToMarkdown([])).toBe("");
  });
});

describe("grouperParSection", () => {
  const articles: ArticleGuide[] = [
    { titre: "B", slug: "b", section: "Combat", ordre: 20, resume: "", motsCles: [], majLe: "" },
    { titre: "A", slug: "a", section: "Combat", ordre: 10, resume: "", motsCles: [], majLe: "" },
    { titre: "Z", slug: "z", section: "Démarrage", ordre: 10, resume: "", motsCles: [], majLe: "" },
  ];

  test("groupe par section canonique, trie par ordre, filtre les sections vides", () => {
    const groupes = grouperParSection(articles);
    expect(groupes.map((g) => g.section)).toEqual(["Démarrage", "Combat"]);
    expect(groupes[1].articles.map((a) => a.slug)).toEqual(["a", "b"]);
  });

  test("aucun article → aucun groupe", () => {
    expect(grouperParSection([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Lancer les tests, vérifier qu'ils échouent**

Run: `npm test -- lib/guide.test.ts`
Expected: FAIL — `richTextToMarkdown`/`notionBlocksToMarkdown`/`grouperParSection` n'existent pas encore (ou signatures obsolètes de l'ancien `mapNotionBlocks`).

- [ ] **Step 3: Réécrire `lib/guide.ts`**

Remplace tout le contenu de `lib/guide.ts` par :

```ts
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export interface NotionRichTextLike {
  plain_text: string;
  annotations?: {
    bold?: boolean;
    italic?: boolean;
    strikethrough?: boolean;
    code?: boolean;
  };
  href?: string | null;
}

export interface NotionBlockLike {
  type: string;
  has_children?: boolean;
  children?: NotionBlockLike[];
  [key: string]: unknown;
}

export interface ArticleGuide {
  titre: string;
  slug: string;
  section: string;
  ordre: number;
  resume: string;
  motsCles: string[];
  majLe: string;
}

// Ordre canonique des catégories (figé ici, pas dans Notion). MIROIR de
// ORDRE_SECTIONS dans scripts/pull-guide.mjs → faire évoluer les deux ensemble.
export const ORDRE_SECTIONS = [
  "Démarrage",
  "Combat",
  "Rituels",
  "Progression",
  "Réglages",
  "Intégrations",
] as const;

export function richTextToMarkdown(richText: NotionRichTextLike[] = []): string {
  return richText
    .map((t) => {
      let s = t.plain_text;
      const a = t.annotations ?? {};
      if (a.code) s = `\`${s}\``;
      if (a.bold) s = `**${s}**`;
      if (a.italic) s = `_${s}_`;
      if (a.strikethrough) s = `~~${s}~~`;
      if (t.href) s = `[${s}](${t.href})`;
      return s;
    })
    .join("");
}

const indent = (line: string, depth: number) => "  ".repeat(depth) + line;

type RichTextHolder = { rich_text?: NotionRichTextLike[] };

// Convertit un arbre de blocs Notion DÉJÀ RÉSOLU (children et image.localPath
// pré-attachés par l'appelant, cf. scripts/pull-guide.mjs) en Markdown.
// Fonction PURE : aucun appel réseau ici — la résolution (fetch des blocs
// enfants, téléchargement des images) est faite en amont par le script.
export function notionBlocksToMarkdown(blocks: NotionBlockLike[], depth = 0): string {
  const morceaux: string[] = [];
  for (const bloc of blocks) {
    const enfants = bloc.children ?? [];
    switch (bloc.type) {
      case "heading_2":
        morceaux.push(`## ${richTextToMarkdown((bloc.heading_2 as RichTextHolder)?.rich_text)}`);
        break;
      case "heading_3":
        morceaux.push(`### ${richTextToMarkdown((bloc.heading_3 as RichTextHolder)?.rich_text)}`);
        break;
      case "paragraph": {
        const texte = richTextToMarkdown((bloc.paragraph as RichTextHolder)?.rich_text);
        if (texte) morceaux.push(texte);
        break;
      }
      case "bulleted_list_item": {
        const texte = richTextToMarkdown((bloc.bulleted_list_item as RichTextHolder)?.rich_text);
        morceaux.push(indent(`- ${texte}`, depth));
        if (enfants.length) morceaux.push(notionBlocksToMarkdown(enfants, depth + 1));
        break;
      }
      case "numbered_list_item": {
        const texte = richTextToMarkdown((bloc.numbered_list_item as RichTextHolder)?.rich_text);
        morceaux.push(indent(`1. ${texte}`, depth));
        if (enfants.length) morceaux.push(notionBlocksToMarkdown(enfants, depth + 1));
        break;
      }
      case "quote":
        morceaux.push(`> ${richTextToMarkdown((bloc.quote as RichTextHolder)?.rich_text)}`);
        break;
      case "callout": {
        const callout = bloc.callout as RichTextHolder & { icon?: { emoji?: string } };
        const emoji = callout.icon?.emoji ? `${callout.icon.emoji} ` : "";
        morceaux.push(`> ${emoji}${richTextToMarkdown(callout.rich_text)}`);
        break;
      }
      case "code": {
        const code = bloc.code as { rich_text?: NotionRichTextLike[]; language?: string };
        const texte = (code.rich_text ?? []).map((r) => r.plain_text).join("");
        morceaux.push(`\`\`\`${code.language ?? ""}\n${texte}\n\`\`\``);
        break;
      }
      case "divider":
        morceaux.push("---");
        break;
      case "image": {
        const image = bloc.image as { caption?: NotionRichTextLike[]; localPath?: string };
        morceaux.push(`![${richTextToMarkdown(image.caption)}](${image.localPath ?? ""})`);
        break;
      }
      case "table": {
        if (enfants.length === 0) break;
        const cellules = (row: NotionBlockLike) =>
          ((row.table_row as { cells?: NotionRichTextLike[][] })?.cells ?? []).map((c) =>
            richTextToMarkdown(c).replace(/\|/g, "\\|"),
          );
        const [entete, ...corps] = enfants.map(cellules);
        const lignes = [`| ${entete.join(" | ")} |`, `| ${entete.map(() => "---").join(" | ")} |`];
        for (const row of corps) lignes.push(`| ${row.join(" | ")} |`);
        morceaux.push(lignes.join("\n"));
        break;
      }
      default:
        break; // type non géré : ignoré silencieusement.
    }
  }
  return morceaux.join("\n\n");
}

const RACINE = join(process.cwd(), "content", "guide");

/** Sommaire : tous les articles publiés, déjà triés par le script de pull. */
export async function chargerIndexGuide(): Promise<ArticleGuide[]> {
  const brut = await readFile(join(RACINE, "index.json"), "utf8");
  return JSON.parse(brut) as ArticleGuide[];
}

/** Corps Markdown d'un article, ou `null` si le slug n'existe pas. */
export async function chargerCorpsArticle(slug: string): Promise<string | null> {
  try {
    return await readFile(join(RACINE, `${slug}.md`), "utf8");
  } catch {
    return null;
  }
}

/** Regroupe les articles par catégorie, dans l'ordre canonique. */
export function grouperParSection(
  articles: ArticleGuide[],
): { section: string; articles: ArticleGuide[] }[] {
  return ORDRE_SECTIONS.map((section) => ({
    section,
    articles: articles.filter((a) => a.section === section).sort((a, b) => a.ordre - b.ordre),
  })).filter((groupe) => groupe.articles.length > 0);
}
```

- [ ] **Step 4: Lancer les tests, vérifier qu'ils passent**

Run: `npm test -- lib/guide.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/guide.ts lib/guide.test.ts
git commit -m "feat: réécrit lib/guide.ts pour le modèle multi-articles Notion"
```

---

## Task 2: `scripts/pull-guide.mjs` — pull Notion → Markdown committé

**Files:**
- Create: `scripts/pull-guide.mjs`
- Delete: `scripts/sync-guide.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: rien de `lib/guide.ts` (duplication volontaire, cf. Global Constraints — un script `.mjs` ne peut pas importer un fichier `.ts` sans étape de build, précédent déjà établi par l'ancien `scripts/sync-guide.mjs` qui dupliquait `lib/guide.ts`).
- Produces: `content/guide/<slug>.md`, `content/guide/index.json` (consommés par `lib/guide.ts` dans les tâches suivantes), `public/guide/<slug>/img-N.<ext>` (si des images apparaissent un jour dans Notion — aucune dans le contenu actuel).

- [ ] **Step 1: Créer `scripts/pull-guide.mjs`**

```js
// Pull de la doc utilisateur depuis Notion (issue #68).
//
// Tire les articles au statut « Publié » de la base Notion « Guide Dodojo »,
// les convertit en Markdown et écrit le contenu COMMITTÉ au repo :
//   - content/guide/<slug>.md   (corps de l'article, Markdown pur)
//   - content/guide/index.json  (sommaire : métadonnées de chaque article)
//   - public/guide/<slug>/*     (images rapatriées — les URLs Notion expirent)
//
// La route /guide de l'app lit ces fichiers au build (SSG). Notion reste la
// SOURCE DE VÉRITÉ ; ce script est le seul pont. Aucune dépendance SDK Notion :
// tout passe par fetch() brut vers l'API REST (modèle webapp-repas, issue #97).
//
// DEUX usages :
//   - `npm run pull:guide`               : pull manuel (échoue si token/erreur).
//   - `npm run pull:guide -- --prebuild`  (hook `prebuild`) : mode TOLÉRANT —
//     pas de token OU erreur réseau ⇒ contenu committé conservé, sortie en succès.
//
// Token : NOTION_TOKEN (env, ou .env.local chargé ci-dessous). Intégration
// interne partagée sur la base « Guide Dodojo » (workspace Arnaud Solente).

import { mkdir, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MODE_PREBUILD = process.argv.includes("--prebuild");

function chargerEnvLocal() {
  if (process.env.NOTION_TOKEN) return;
  try {
    const contenu = readFileSync(join(process.cwd(), ".env.local"), "utf8");
    for (const ligne of contenu.split(/\r?\n/)) {
      const m = ligne.match(/^\s*NOTION_TOKEN\s*=\s*(.+?)\s*$/);
      if (m) {
        process.env.NOTION_TOKEN = m[1].replace(/^["']|["']$/g, "");
        break;
      }
    }
  } catch {
    // Pas de .env.local : normal en CI/Vercel, ignoré.
  }
}
chargerEnvLocal();

const TOKEN = process.env.NOTION_TOKEN;
// Base « Guide Dodojo » (override possible via env si la base est recréée).
const DATABASE_ID = process.env.NOTION_DATABASE_ID ?? "577dc545-1f8a-4c42-9821-d16e3568a6ec";
const NOTION_VERSION = "2022-06-28";
const API = "https://api.notion.com/v1";

// Ordre canonique des catégories (figé ici, pas dans Notion). MIROIR de
// ORDRE_SECTIONS dans lib/guide.ts → faire évoluer les deux ensemble.
const ORDRE_SECTIONS = ["Démarrage", "Combat", "Rituels", "Progression", "Réglages", "Intégrations"];

const RACINE_CONTENU = join(process.cwd(), "content", "guide");
const RACINE_IMAGES = join(process.cwd(), "public", "guide");

async function notion(chemin, options = {}) {
  const res = await fetch(`${API}${chemin}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`API Notion ${res.status} sur ${chemin} : ${await res.text()}`);
  }
  return res.json();
}

async function listerArticlesPublies() {
  const pages = [];
  let cursor;
  do {
    const data = await notion(`/databases/${DATABASE_ID}/query`, {
      method: "POST",
      body: JSON.stringify({
        filter: { property: "Statut", select: { equals: "Publié" } },
        page_size: 100,
        ...(cursor ? { start_cursor: cursor } : {}),
      }),
    });
    pages.push(...data.results);
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return pages;
}

async function listerBlocs(blocId) {
  const blocs = [];
  let cursor;
  do {
    const params = new URLSearchParams({ page_size: "100" });
    if (cursor) params.set("start_cursor", cursor);
    const data = await notion(`/blocks/${blocId}/children?${params}`);
    blocs.push(...data.results);
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return blocs;
}

const texteBrut = (richText = []) => richText.map((t) => t.plain_text).join("");

function lireProprietes(page) {
  const p = page.properties;
  return {
    titre: texteBrut(p["Titre"]?.title),
    slug: texteBrut(p["Slug"]?.rich_text).trim(),
    section: p["Section"]?.select?.name ?? "",
    ordre: p["Ordre"]?.number ?? 0,
    resume: texteBrut(p["Résumé"]?.rich_text),
    motsCles: (p["Mots-clés"]?.multi_select ?? []).map((m) => m.name),
    majLe: page.last_edited_time,
  };
}

function richTextVersMd(richText = []) {
  return richText
    .map((t) => {
      let s = t.plain_text;
      const a = t.annotations ?? {};
      if (a.code) s = `\`${s}\``;
      if (a.bold) s = `**${s}**`;
      if (a.italic) s = `_${s}_`;
      if (a.strikethrough) s = `~~${s}~~`;
      if (t.href) s = `[${s}](${t.href})`;
      return s;
    })
    .join("");
}

const indenter = (ligne, profondeur) => "  ".repeat(profondeur) + ligne;

// Convertit des blocs Notion en Markdown. `ctx` = { slug, compteurImage, images } :
// les images NE SONT PAS écrites ici mais collectées dans ctx.images (écriture
// différée après fetch complet, pour ne jamais laisser de contenu partiel sur erreur).
async function blocsVersMd(blocs, ctx, profondeur = 0) {
  const morceaux = [];
  for (const bloc of blocs) {
    const enfants = bloc.has_children && bloc.type !== "table" ? await listerBlocs(bloc.id) : [];
    switch (bloc.type) {
      case "heading_2":
        morceaux.push(`## ${richTextVersMd(bloc.heading_2.rich_text)}`);
        break;
      case "heading_3":
        morceaux.push(`### ${richTextVersMd(bloc.heading_3.rich_text)}`);
        break;
      case "paragraph":
        morceaux.push(richTextVersMd(bloc.paragraph.rich_text));
        break;
      case "bulleted_list_item":
        morceaux.push(indenter(`- ${richTextVersMd(bloc.bulleted_list_item.rich_text)}`, profondeur));
        if (enfants.length) morceaux.push(await blocsVersMd(enfants, ctx, profondeur + 1));
        break;
      case "numbered_list_item":
        morceaux.push(indenter(`1. ${richTextVersMd(bloc.numbered_list_item.rich_text)}`, profondeur));
        if (enfants.length) morceaux.push(await blocsVersMd(enfants, ctx, profondeur + 1));
        break;
      case "quote":
        morceaux.push(`> ${richTextVersMd(bloc.quote.rich_text)}`);
        break;
      case "callout": {
        const emoji = bloc.callout.icon?.emoji ? `${bloc.callout.icon.emoji} ` : "";
        morceaux.push(`> ${emoji}${richTextVersMd(bloc.callout.rich_text)}`);
        break;
      }
      case "toggle": {
        const corps = enfants.length ? await blocsVersMd(enfants, ctx) : "";
        morceaux.push(`**${richTextVersMd(bloc.toggle.rich_text)}**\n\n${corps}`);
        break;
      }
      case "code":
        morceaux.push(`\`\`\`${bloc.code.language ?? ""}\n${texteBrut(bloc.code.rich_text)}\n\`\`\``);
        break;
      case "divider":
        morceaux.push("---");
        break;
      case "image": {
        const url = bloc.image.type === "external" ? bloc.image.external.url : bloc.image.file.url;
        const alt = texteBrut(bloc.image.caption);
        const chemin = await collecterImage(url, ctx);
        morceaux.push(`![${alt}](${chemin})`);
        break;
      }
      case "table":
        morceaux.push(await tableVersMd(bloc));
        break;
      default:
        console.warn(`  ⚠ bloc « ${bloc.type} » ignoré (non supporté)`);
    }
  }
  return morceaux.join("\n\n");
}

async function tableVersMd(bloc) {
  const lignes = await listerBlocs(bloc.id);
  if (lignes.length === 0) return "";
  const cellules = (row) => row.table_row.cells.map((c) => richTextVersMd(c).replace(/\|/g, "\\|"));
  const [entete, ...corps] = lignes.map(cellules);
  const md = [`| ${entete.join(" | ")} |`, `| ${entete.map(() => "---").join(" | ")} |`];
  for (const row of corps) md.push(`| ${row.join(" | ")} |`);
  return md.join("\n");
}

// Télécharge l'image EN MÉMOIRE et la collecte (écriture différée). Renvoie
// le chemin public final qui sera servi par Next.
async function collecterImage(url, ctx) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Image inaccessible (${res.status}) : ${url}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const ext = extensionImage(url, res.headers.get("content-type"));
  ctx.compteurImage += 1;
  const nomFichier = `img-${ctx.compteurImage}.${ext}`;
  ctx.images.push({ slug: ctx.slug, nomFichier, buffer });
  return `/guide/${ctx.slug}/${nomFichier}`;
}

function extensionImage(url, contentType) {
  const m = url.split("?")[0].match(/\.(png|jpe?g|gif|webp|svg)$/i);
  if (m) return m[1].toLowerCase().replace("jpeg", "jpg");
  if (contentType?.includes("png")) return "png";
  if (contentType?.includes("webp")) return "webp";
  if (contentType?.includes("svg")) return "svg";
  return "jpg";
}

// Fetch COMPLET en mémoire, PUIS écriture. Sur erreur avant l'écriture, le
// contenu committé reste intact (important pour le mode --prebuild tolérant).
async function pull() {
  console.log("Lecture de la base Notion « Guide Dodojo »…");
  const pages = await listerArticlesPublies();
  console.log(`${pages.length} article(s) au statut « Publié ».`);

  const articles = [];
  const images = [];
  const slugsVus = new Set();

  for (const page of pages) {
    const meta = lireProprietes(page);
    if (!meta.slug) throw new Error(`Article « ${meta.titre} » sans slug.`);
    if (slugsVus.has(meta.slug)) throw new Error(`Slug dupliqué : « ${meta.slug} ».`);
    if (!ORDRE_SECTIONS.includes(meta.section)) {
      throw new Error(`Section inconnue « ${meta.section} » (article ${meta.slug}).`);
    }
    slugsVus.add(meta.slug);

    console.log(`  • ${meta.section} / ${meta.titre} (${meta.slug})`);
    const blocs = await listerBlocs(page.id);
    const ctx = { slug: meta.slug, compteurImage: 0, images };
    const markdown = await blocsVersMd(blocs, ctx);
    articles.push({ meta, markdown });
  }

  articles.sort((a, b) => {
    const ds = ORDRE_SECTIONS.indexOf(a.meta.section) - ORDRE_SECTIONS.indexOf(b.meta.section);
    return ds !== 0 ? ds : a.meta.ordre - b.meta.ordre;
  });

  // — À partir d'ici seulement, on touche au système de fichiers —
  await rm(RACINE_CONTENU, { recursive: true, force: true });
  await rm(RACINE_IMAGES, { recursive: true, force: true });
  await mkdir(RACINE_CONTENU, { recursive: true });

  for (const { meta, markdown } of articles) {
    await writeFile(join(RACINE_CONTENU, `${meta.slug}.md`), `${markdown}\n`, "utf8");
  }
  for (const { slug, nomFichier, buffer } of images) {
    const dossier = join(RACINE_IMAGES, slug);
    await mkdir(dossier, { recursive: true });
    await writeFile(join(dossier, nomFichier), buffer);
  }
  await writeFile(
    join(RACINE_CONTENU, "index.json"),
    `${JSON.stringify(articles.map((a) => a.meta), null, 2)}\n`,
    "utf8",
  );
  console.log(`\n✓ ${articles.length} article(s) écrit(s) dans content/guide/.`);
}

async function principal() {
  if (!TOKEN) {
    const msg =
      "NOTION_TOKEN absent. Crée une intégration Notion et partage la base « Guide Dodojo » " +
      "avec elle, puis renseigne NOTION_TOKEN.";
    if (MODE_PREBUILD) {
      console.log(`[prebuild] ${msg}\n[prebuild] Pull ignoré — contenu committé de content/guide conservé.`);
      return;
    }
    console.error(`Erreur : ${msg}`);
    process.exit(1);
  }

  try {
    await pull();
  } catch (e) {
    if (MODE_PREBUILD) {
      console.warn(`[prebuild] Pull échoué (${e.message}). Contenu committé conservé.`);
      return;
    }
    throw e;
  }
}

principal().catch((e) => {
  console.error(`\n✗ Échec du pull : ${e.message}`);
  process.exit(1);
});
```

- [ ] **Step 2: Supprimer l'ancien script**

```bash
git rm scripts/sync-guide.mjs
```

- [ ] **Step 3: Mettre à jour `package.json`**

Dans la section `"scripts"`, remplace la ligne `"sync:guide": "node scripts/sync-guide.mjs",` par :

```json
    "prebuild": "node scripts/pull-guide.mjs --prebuild",
    "pull:guide": "node scripts/pull-guide.mjs",
```

Dans `"dependencies"`, ajoute (ordre alphabétique avec le reste de la liste) :

```json
    "react-markdown": "^10.1.0",
    "remark-gfm": "^4.0.1",
```

Dans `"devDependencies"`, supprime la ligne `"@notionhq/client": "^5.23.2",`.

- [ ] **Step 4: Installer les nouvelles dépendances, désinstaller l'ancienne**

Run: `npm install react-markdown@^10.1.0 remark-gfm@^4.0.1 && npm uninstall @notionhq/client`
Expected: `package-lock.json` mis à jour, aucune erreur de résolution.

- [ ] **Step 5: Vérifier le mode tolérant sans token**

Run: `NOTION_TOKEN= node scripts/pull-guide.mjs --prebuild` (PowerShell : `$env:NOTION_TOKEN=""; node scripts/pull-guide.mjs --prebuild`)
Expected: le script log `[prebuild] NOTION_TOKEN absent...` et sort avec le code 0 (`echo $?` / `$LASTEXITCODE` → `0`), **sans** toucher à `content/guide.json` existant.

- [ ] **Step 6: Commit**

```bash
git add scripts/pull-guide.mjs package.json package-lock.json
git commit -m "feat: script pull-guide.mjs (fetch brut Notion, sync prebuild tolérante)"
```

---

## Task 3: Pull réel — générer le contenu committé depuis la base Notion

**Files:**
- Create: `content/guide/*.md` (19 fichiers), `content/guide/index.json`
- Delete: `content/guide.json`

**Interfaces:**
- Consumes: `scripts/pull-guide.mjs` (Task 2), `NOTION_TOKEN` déjà présent dans `.env.local`.
- Produces: le contenu réel lu par `lib/guide.ts` dans les tâches suivantes.

- [ ] **Step 1: Lancer le pull manuel**

Run: `npm run pull:guide`
Expected: `19 article(s) au statut « Publié ».` puis `✓ 19 article(s) écrit(s) dans content/guide/.`. Si le réseau est bloqué dans l'environnement d'exécution (sandbox sans accès internet), relancer avec les permissions réseau explicitement autorisées avant de considérer cette étape en échec — ne pas passer à la suite sans ce contenu réel.

- [ ] **Step 2: Vérifier le contenu généré**

Run: `ls content/guide` (ou `Get-ChildItem content/guide` en PowerShell)
Expected: 19 fichiers `.md` (un par slug listé dans le spec §3) + `index.json`.

Ouvrir `content/guide/index.json` et vérifier : 19 entrées, `Statut` n'apparaît pas (propriété non exportée dans `meta`), chaque entrée a `titre`/`slug`/`section`/`ordre`/`resume`/`motsCles`/`majLe` renseignés, aucune `section` hors de `["Démarrage","Combat","Rituels","Progression","Réglages","Intégrations"]`.

- [ ] **Step 3: Supprimer l'ancien contenu**

```bash
git rm content/guide.json
```

- [ ] **Step 4: Commit**

```bash
git add content/guide
git commit -m "content: seed initial des 19 articles du Manuel du Dojo (pull Notion)"
```

---

## Task 4: `components/guide/ArticleMarkdown.tsx` — rendu Markdown stylé

**Files:**
- Create: `components/guide/ArticleMarkdown.tsx`
- Create: `components/guide/ArticleMarkdown.test.tsx`
- Delete: `components/guide/GuideSections.tsx` (plus référencé après Task 5)

**Interfaces:**
- Consumes: `react-markdown`, `remark-gfm` (Task 2).
- Produces: `ArticleMarkdown({ contenu: string }): JSX.Element` (export par défaut), consommé par `app/guide/[slug]/page.tsx` (Task 6).

- [ ] **Step 1: Écrire le test (échoue, le composant n'existe pas)**

Crée `components/guide/ArticleMarkdown.test.tsx` :

```tsx
// @vitest-environment jsdom
import { describe, expect, test, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import ArticleMarkdown from "./ArticleMarkdown";

afterEach(cleanup);

describe("ArticleMarkdown", () => {
  test("rend un heading, un paragraphe et une liste", () => {
    render(<ArticleMarkdown contenu={"## Titre\n\nUn paragraphe.\n\n- Un\n- Deux"} />);
    expect(screen.getByRole("heading", { name: "Titre", level: 2 })).toBeInTheDocument();
    expect(screen.getByText("Un paragraphe.")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  test("lien interne utilise next/link, sans target=_blank", () => {
    render(<ArticleMarkdown contenu={"[Retour](/guide)"} />);
    const lien = screen.getByRole("link", { name: "Retour" });
    expect(lien).toHaveAttribute("href", "/guide");
    expect(lien).not.toHaveAttribute("target");
  });

  test("lien externe ouvre dans un nouvel onglet", () => {
    render(<ArticleMarkdown contenu={"[Externe](https://example.com)"} />);
    expect(screen.getByRole("link", { name: "Externe" })).toHaveAttribute("target", "_blank");
  });
});
```

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

Run: `npm test -- components/guide/ArticleMarkdown.test.tsx`
Expected: FAIL — module `./ArticleMarkdown` introuvable.

- [ ] **Step 3: Créer `components/guide/ArticleMarkdown.tsx`**

```tsx
import Link from "next/link";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const composants: Components = {
  h2: ({ children }) => (
    <h2 className="mt-6 mb-2 font-display text-sm uppercase tracking-wide text-gold">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-4 mb-1 font-display text-xs uppercase tracking-wide text-ink">{children}</h3>
  ),
  p: ({ children }) => <p className="my-2 text-sm text-muted">{children}</p>,
  ul: ({ children }) => <ul className="my-2 ml-4 list-disc space-y-1 text-sm text-muted">{children}</ul>,
  ol: ({ children }) => (
    <ol className="my-2 ml-4 list-decimal space-y-1 text-sm text-muted">{children}</ol>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-3 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted [&>p]:my-0">
      {children}
    </blockquote>
  ),
  a: ({ href, children }) => {
    const cible = href ?? "#";
    const classe = "text-gold underline underline-offset-4 hover:text-ink";
    return cible.startsWith("/") ? (
      <Link href={cible} className={classe}>
        {children}
      </Link>
    ) : (
      <a href={cible} className={classe} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  },
  code: ({ children }) => (
    <code className="rounded bg-surface px-1 py-0.5 font-mono text-xs text-ink">{children}</code>
  ),
  pre: ({ children }) => (
    <pre className="my-3 overflow-x-auto rounded-lg bg-stage p-3 text-xs text-ink">{children}</pre>
  ),
  hr: () => <hr className="my-4 border-border" />,
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-border bg-surface px-2 py-1 text-left font-semibold text-ink">
      {children}
    </th>
  ),
  td: ({ children }) => <td className="border border-border px-2 py-1 text-muted">{children}</td>,
  img: ({ src, alt }) =>
    typeof src === "string" ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={alt ?? ""} className="my-3 rounded-lg" />
    ) : null,
};

export default function ArticleMarkdown({ contenu }: { contenu: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={composants}>
      {contenu}
    </ReactMarkdown>
  );
}
```

- [ ] **Step 4: Lancer le test, vérifier qu'il passe**

Run: `npm test -- components/guide/ArticleMarkdown.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Supprimer l'ancien composant de rendu**

```bash
git rm components/guide/GuideSections.tsx
```

(Aucune référence ne casse : `app/guide/page.tsx` est réécrit dans la Task 5, avant tout re-build.)

- [ ] **Step 6: Commit**

```bash
git add components/guide/ArticleMarkdown.tsx components/guide/ArticleMarkdown.test.tsx
git commit -m "feat: composant ArticleMarkdown (react-markdown stylé), retire GuideSections"
```

---

## Task 5: `app/guide/page.tsx` — sommaire par catégorie

**Files:**
- Modify: `app/guide/page.tsx` (réécriture complète)

**Interfaces:**
- Consumes: `chargerIndexGuide`, `grouperParSection` (Task 1, `lib/guide.ts`).
- Produces: route `/guide` (sommaire), consommée par les liens du QG/Arène (Task 7) et par `app/guide/[slug]/page.tsx` (lien retour, Task 6).

- [ ] **Step 1: Réécrire `app/guide/page.tsx`**

```tsx
import Link from "next/link";
import { chargerIndexGuide, grouperParSection } from "@/lib/guide";

export const metadata = { title: "Manuel du Dojo" };

export default async function GuidePage() {
  const articles = await chargerIndexGuide();
  const sections = grouperParSection(articles);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-6">
      <h1 className="text-center font-display text-lg uppercase tracking-wide text-ink">
        Manuel du Dojo
      </h1>
      {sections.length === 0 ? (
        <p className="text-center text-sm text-muted">Manuel en préparation.</p>
      ) : (
        sections.map(({ section, articles: articlesSection }) => (
          <section key={section} className="flex flex-col gap-2">
            <h2 className="font-display text-xs uppercase tracking-wide text-gold">{section}</h2>
            <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border">
              {articlesSection.map((article) => (
                <li key={article.slug}>
                  <Link
                    href={`/guide/${article.slug}`}
                    className="block bg-surface px-3 py-2 transition-colors hover:bg-surface-2"
                  >
                    <span className="block text-sm text-ink">{article.titre}</span>
                    {article.resume && (
                      <span className="block text-xs text-muted">{article.resume}</span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
      <Link href="/qg" className="self-center text-xs text-muted underline underline-offset-4">
        Retour au QG
      </Link>
    </main>
  );
}
```

- [ ] **Step 2: Vérifier manuellement en dev**

Run: `npm run dev`, ouvrir `http://localhost:3000/guide` connecté (l'auth reste requise — cf. spec D7)
Expected: sommaire affiché avec 6 catégories (Démarrage/Combat/Rituels/Progression/Réglages/Intégrations), chaque article cliquable (mène sur une 404 pour l'instant, `/guide/[slug]` n'existe pas encore — normal, Task 6 le crée).

- [ ] **Step 3: Commit**

```bash
git add app/guide/page.tsx
git commit -m "feat: sommaire du Manuel du Dojo groupé par catégorie"
```

---

## Task 6: `app/guide/[slug]/page.tsx` — page d'article (SSG)

**Files:**
- Create: `app/guide/[slug]/page.tsx`

**Interfaces:**
- Consumes: `chargerIndexGuide`, `chargerCorpsArticle` (Task 1), `ArticleMarkdown` (Task 4, export par défaut).
- Produces: route `/guide/[slug]`, consommée par `StreakBadge`/`app/qg/page.tsx` (Task 7).

- [ ] **Step 1: Créer `app/guide/[slug]/page.tsx`**

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import ArticleMarkdown from "@/components/guide/ArticleMarkdown";
import { chargerCorpsArticle, chargerIndexGuide } from "@/lib/guide";

export async function generateStaticParams() {
  const articles = await chargerIndexGuide();
  return articles.map((article) => ({ slug: article.slug }));
}

async function trouverMeta(slug: string) {
  const articles = await chargerIndexGuide();
  return articles.find((article) => article.slug === slug) ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const meta = await trouverMeta(slug);
  if (!meta) return { title: "Manuel du Dojo" };
  return { title: `${meta.titre} — Manuel du Dojo` };
}

export default async function GuideArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [meta, contenu] = await Promise.all([trouverMeta(slug), chargerCorpsArticle(slug)]);
  if (!meta || contenu === null) notFound();

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 py-6">
      <Link href="/guide" className="text-xs text-muted underline underline-offset-4">
        ← Tout le Manuel
      </Link>
      <header className="flex flex-col gap-1">
        <p className="text-xs uppercase tracking-wide text-gold">{meta.section}</p>
        <h1 className="font-display text-lg uppercase tracking-wide text-ink">{meta.titre}</h1>
      </header>
      <article>
        <ArticleMarkdown contenu={contenu} />
      </article>
      <Link href="/qg" className="self-center text-xs text-muted underline underline-offset-4">
        Retour au QG
      </Link>
    </main>
  );
}
```

- [ ] **Step 2: Vérifier manuellement en dev**

Run: `npm run dev` (si pas déjà lancé), ouvrir `http://localhost:3000/guide/hp`
Expected: article « Le barème de combat » rendu (titre, catégorie « Combat », paragraphe + liste à puces). Ouvrir `http://localhost:3000/guide/slug-inexistant` → page 404 Next.

- [ ] **Step 3: Build pour valider le SSG**

Run: `npm run build`
Expected: build réussi, log Next listant 19 pages statiques sous `/guide/[slug]` (une par slug de `content/guide/index.json`).

- [ ] **Step 4: Commit**

```bash
git add app/guide/[slug]/page.tsx
git commit -m "feat: page d'article du Manuel du Dojo (SSG par slug)"
```

---

## Task 7: Mettre à jour les deep-links (StreakBadge, QG)

**Files:**
- Modify: `components/combat/StreakBadge.tsx`
- Modify: `app/qg/page.tsx`

**Interfaces:**
- Consumes: routes `/guide/streak` et `/guide/or` (Task 6).
- Produces: rien de nouveau — mise à jour de liens existants.

- [ ] **Step 1: Mettre à jour `components/combat/StreakBadge.tsx`**

Remplace :

```tsx
// US-12 : compteur de série + alerte « en danger » (jokers de la semaine épuisés).
// US-28 (A1) : le badge renvoie à la section Séries du Manuel.
export default function StreakBadge({ state }: { state: StreakState }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <Link
        href="/guide#streak"
```

par :

```tsx
// US-12 : compteur de série + alerte « en danger » (jokers de la semaine épuisés).
// Renvoie vers l'article « Séries & jokers » du Manuel du Dojo (issue #68).
export default function StreakBadge({ state }: { state: StreakState }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <Link
        href="/guide/streak"
```

- [ ] **Step 2: Mettre à jour `app/qg/page.tsx`**

Remplace :

```tsx
      <Link href="/guide#or" className="text-xs text-faint underline underline-offset-4">
```

par :

```tsx
      <Link href="/guide/or" className="text-xs text-faint underline underline-offset-4">
```

- [ ] **Step 3: Vérifier manuellement**

Run: `npm run dev`, se connecter, ouvrir `/qg` → cliquer « Comment gagner de l'or ? » → doit atterrir sur `/guide/or` avec l'article « Or & Échoppe » affiché. Ouvrir le badge série (🔥) → doit atterrir sur `/guide/streak`.

- [ ] **Step 4: Commit**

```bash
git add components/combat/StreakBadge.tsx app/qg/page.tsx
git commit -m "fix: deep-links StreakBadge/QG vers les nouvelles pages d'article"
```

---

## Task 8: `e2e/guide.spec.ts` — tests Playwright mis à jour

**Files:**
- Modify: `e2e/guide.spec.ts` (réécriture complète)

**Interfaces:**
- Consumes: `login` depuis `./fixtures` (helper e2e existant).
- Produces: rien de nouveau — couverture e2e du parcours doc.

- [ ] **Step 1: Réécrire `e2e/guide.spec.ts`**

```ts
import { test, expect } from "@playwright/test";
import { login } from "./fixtures";

test.describe("Manuel du Dojo (issue #68)", () => {
  test("sommaire par catégorie, accessible depuis le QG", async ({ page }) => {
    await login(page);
    await page.goto("/qg");
    await page.getByRole("link", { name: /Manuel du Dojo/ }).click();
    await page.waitForURL("/guide");
    await expect(page.getByRole("heading", { name: "Manuel du Dojo" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Combat" })).toBeVisible();
  });

  test("navigation vers un article et retour au sommaire", async ({ page }) => {
    await login(page);
    await page.goto("/guide");
    await page.getByRole("link", { name: "Le barème de combat" }).click();
    await page.waitForURL("/guide/hp");
    await expect(page.getByRole("heading", { name: "Le barème de combat" })).toBeVisible();
    await page.getByRole("link", { name: /Tout le Manuel/ }).click();
    await page.waitForURL("/guide");
  });

  test("slug inconnu renvoie une 404", async ({ page }) => {
    await login(page);
    const response = await page.goto("/guide/slug-inexistant");
    expect(response?.status()).toBe(404);
  });
});
```

- [ ] **Step 2: Lancer la suite e2e complète (série, build prod)**

Run: `npm run e2e`
Expected: PASS pour les 3 tests de `guide.spec.ts`, et aucune régression sur le reste de la suite.

- [ ] **Step 3: Commit**

```bash
git add e2e/guide.spec.ts
git commit -m "test: e2e Manuel du Dojo mis à jour pour le sommaire multi-articles"
```

---

## Task 9: Documentation (CHANGELOG, CLAUDE.md, .env.example, issue #68)

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `CLAUDE.md`
- Modify: `.env.example`

**Interfaces:**
- Consumes: rien (tâche de documentation pure).
- Produces: rien — clôture la PR côté conventions projet (règle de mise à jour de `CLAUDE.md` + `CHANGELOG.md`).

- [ ] **Step 1: Mettre à jour `CHANGELOG.md`**

Sous `## [Unreleased]` → `### Produit`, juste après la ligne `### Produit`, ajoute :

```markdown
- Issue #68 : Manuel du Dojo refondu en articles multi-pages (sommaire par catégorie + page par article), source Notion restructurée en base (19 articles publiés) avec sync automatique au build (`prebuild`), remplace l'ancien mono-bloc `content/guide.json`.
```

- [ ] **Step 2: Mettre à jour `CLAUDE.md`**

Remplace le paragraphe (section « Pièges et décisions non-évidentes ») commençant par `**Manuel du Dojo — statique, sync Notion au build (US-28)**` :

```markdown
**Manuel du Dojo — statique, sync Notion au build (US-28)** — Le guide est **100% statique** : `content/guide.json` (committé) rendu par `app/guide/page.tsx`. **Jamais** de Notion au runtime — `@notionhq/client` est une **devDependency** importée dynamiquement uniquement dans `scripts/sync-guide.mjs` (`npm run sync:guide`, requiert `NOTION_TOKEN` + `NOTION_GUIDE_PAGE_ID`, sinon no-op sans écraser). Le mapper Notion→schéma est pur et testé (`lib/guide.ts`, `mapNotionBlocks`). Les `section.id` servent d'ancres de deep-link (`/guide#streak`, `/guide#or`) — garder ces ids stables si on réécrit le contenu. Accès : QG + « ? » dans l'Arène.
```

par :

```markdown
**Manuel du Dojo — articles Notion multi-pages, sync auto au build (issue #68)** — Le guide est **statique** : `content/guide/<slug>.md` + `content/guide/index.json` (committés) rendus par `app/guide/page.tsx` (sommaire par catégorie) et `app/guide/[slug]/page.tsx` (article, SSG via `generateStaticParams`). Source de vérité = base Notion **« Guide Dodojo »** (pas une simple page), filtrée sur `Statut = Publié`. **Aucune dépendance SDK Notion** — `scripts/pull-guide.mjs` interroge l'API REST Notion en `fetch` brut (`NOTION_TOKEN` seul requis ; `NOTION_DATABASE_ID` a un défaut hardcodé dans le script, override optionnel). Sync **automatique** via le hook `prebuild` de `package.json`, **tolérant** : token absent ou panne réseau ⇒ contenu committé conservé, le build ne casse jamais (`npm run pull:guide` pour un pull manuel strict). Rendu Markdown via `react-markdown` + `remark-gfm` (`components/guide/ArticleMarkdown.tsx`), pas de `rehype-raw` (le script ne produit que du Markdown pur). Slugs = anciens `section.id` conservés pour la continuité des deep-links : `StreakBadge` → `/guide/streak`, lien Échoppe (QG) → `/guide/or`. Accès : QG + « ? » dans l'Arène (inchangé, pointe vers `/guide`).
```

- [ ] **Step 3: Mettre à jour `.env.example`**

Remplace :

```
# Guide utilisateur (US-28) — sync Notion → build (hors runtime, jamais requis en prod)
NOTION_TOKEN=
NOTION_GUIDE_PAGE_ID=
```

par :

```
# Guide utilisateur (issue #68) — sync Notion → build, base "Guide Dodojo".
# NOTION_DATABASE_ID a un défaut hardcodé dans scripts/pull-guide.mjs, override optionnel ici.
NOTION_TOKEN=
```

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md CLAUDE.md .env.example
git commit -m "docs: CHANGELOG + CLAUDE.md + .env.example pour le Manuel du Dojo multi-articles"
```

- [ ] **Step 5: Commenter l'issue GitHub #68**

Run:
```bash
gh issue comment 68 --body "Refonte livrée : Manuel du Dojo articulé autour d'articles Notion (base « Guide Dodojo », 19 articles publiés), sommaire par catégorie + page par article, sync automatique au build. La réorganisation du QG lui-même reste hors scope de ce travail — à ouvrir en issue séparée."
```

Expected: commentaire visible sur https://github.com/ouro84/dodojo/issues/68 (ajuster `ouro84/dodojo` si le remote diffère).

---

## Vérification finale (toutes tâches terminées)

1. `npm test` → tous les tests Vitest passent (y compris `lib/guide.test.ts`, `components/guide/ArticleMarkdown.test.tsx`).
2. `npm run lint` → propre.
3. `npm run build` → réussit, `prebuild` tolérant si `NOTION_TOKEN` absent de l'environnement de build.
4. `npm run e2e` → suite complète verte, y compris `guide.spec.ts`.
5. `grep -r "@notionhq/client" --include="*.ts" --include="*.tsx" --include="*.mjs" .` → aucun résultat.
6. `grep -rn "/guide#" app components` → aucun résultat (plus aucune ancre intra-page).
7. Vérification manuelle : `/guide` affiche 6 catégories et 19 articles ; un article ouvre bien son contenu ; un slug inconnu 404 ; QG → « Comment gagner de l'or ? » → `/guide/or` ; StreakBadge → `/guide/streak`.
