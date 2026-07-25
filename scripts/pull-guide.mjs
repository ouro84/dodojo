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
const ORDRE_SECTIONS = ["Démarrage", "Combat", "Journée", "Progression", "Réglages", "Intégrations"];

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
