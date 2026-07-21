// Sync Notion → content/guide.json. Hors build prod. Usage: npm run sync:guide
// Requiert NOTION_TOKEN + NOTION_GUIDE_PAGE_ID. Sans eux : message clair, pas d'écrasement.
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "content", "guide.json");

const token = process.env.NOTION_TOKEN;
const pageId = process.env.NOTION_GUIDE_PAGE_ID;
if (!token || !pageId) {
  console.error("NOTION_TOKEN / NOTION_GUIDE_PAGE_ID manquants — sync ignorée, guide.json conservé.");
  process.exit(0);
}

// A2 : import tolérant — un clone sans devDeps installées ne plante pas.
let Client;
try {
  ({ Client } = await import("@notionhq/client"));
} catch {
  console.error("@notionhq/client absent — lance `npm i -D @notionhq/client` pour activer la sync. guide.json conservé.");
  process.exit(0);
}

const notion = new Client({ auth: token });
const plain = (node) => (node?.rich_text ?? []).map((r) => r.plain_text ?? "").join("").trim();
const slug = (t, i) =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || `section-${i}`;

async function allBlocks(id) {
  const out = [];
  let cursor;
  do {
    const res = await notion.blocks.children.list({ block_id: id, start_cursor: cursor });
    out.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return out;
}

function mapBlocks(blocks) {
  const sections = [];
  let cur = null;
  const ensure = () => {
    if (!cur) {
      cur = { id: slug("", sections.length), title: "", blocks: [] };
      sections.push(cur);
    }
    return cur;
  };
  for (const b of blocks) {
    const t = b.type;
    if (t === "heading_1" || t === "heading_2" || t === "heading_3") {
      const title = plain(b[t]);
      cur = { id: slug(title, sections.length), title, blocks: [] };
      sections.push(cur);
      continue;
    }
    if (t === "paragraph") {
      const text = plain(b.paragraph);
      if (text) ensure().blocks.push({ type: "p", text });
      continue;
    }
    if (t === "bulleted_list_item" || t === "numbered_list_item") {
      const item = plain(b[t]);
      if (!item) continue;
      const s = ensure();
      const last = s.blocks[s.blocks.length - 1];
      if (last?.type === "ul") last.items.push(item);
      else s.blocks.push({ type: "ul", items: [item] });
    }
  }
  return sections;
}

const sections = mapBlocks(await allBlocks(pageId));
const today = new Date().toISOString().slice(0, 10);
await fs.writeFile(OUT, JSON.stringify({ updatedAt: today, sections }, null, 2) + "\n");
console.log(`guide.json écrit : ${sections.length} sections.`);
