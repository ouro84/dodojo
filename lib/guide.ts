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
