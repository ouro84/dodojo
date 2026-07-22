export type GuideBlock =
  | { type: "h"; text: string }
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] };

export interface GuideSection {
  id: string;
  title: string;
  blocks: GuideBlock[];
}

export interface Guide {
  updatedAt: string;
  sections: GuideSection[];
}

export interface NotionBlockLike {
  type: string;
  [key: string]: unknown;
}

function plain(node: unknown): string {
  const rt = (node as { rich_text?: Array<{ plain_text?: string }> })?.rich_text;
  if (!Array.isArray(rt)) return "";
  return rt.map((r) => r.plain_text ?? "").join("").trim();
}

function slug(title: string, i: number): string {
  const base = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || `section-${i}`;
}

// Mappe des blocs Notion (plats) vers des sections internes. Un heading ouvre
// une nouvelle section ; paragraphes/listes se rattachent à la section courante.
// Les puces consécutives sont regroupées dans un seul bloc `ul`. Types non gérés
// et blocs vides ignorés.
export function mapNotionBlocks(blocks: NotionBlockLike[]): GuideSection[] {
  const sections: GuideSection[] = [];
  let current: GuideSection | null = null;

  const ensure = (): GuideSection => {
    if (!current) {
      current = { id: slug("", sections.length), title: "", blocks: [] };
      sections.push(current);
    }
    return current;
  };

  for (const block of blocks) {
    const t = block.type;
    if (t === "heading_1" || t === "heading_2" || t === "heading_3") {
      const title = plain(block[t]);
      current = { id: slug(title, sections.length), title, blocks: [] };
      sections.push(current);
      continue;
    }
    if (t === "paragraph") {
      const text = plain(block.paragraph);
      if (text) ensure().blocks.push({ type: "p", text });
      continue;
    }
    if (t === "bulleted_list_item" || t === "numbered_list_item") {
      const item = plain(block[t]);
      if (!item) continue;
      const sec = ensure();
      const last = sec.blocks[sec.blocks.length - 1];
      if (last && last.type === "ul") last.items.push(item);
      else sec.blocks.push({ type: "ul", items: [item] });
      continue;
    }
    // autres types ignorés
  }
  return sections;
}
