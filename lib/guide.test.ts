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
