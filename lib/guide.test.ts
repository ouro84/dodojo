import { describe, expect, test } from "vitest";
import { mapNotionBlocks, type NotionBlockLike } from "./guide";

function rich(text: string) {
  return [{ plain_text: text }];
}

describe("mapNotionBlocks (US-28)", () => {
  test("heading_2 ouvre une section ; paragraphes et listes s'y rattachent", () => {
    const blocks: NotionBlockLike[] = [
      { type: "heading_2", heading_2: { rich_text: rich("Le barème") } },
      { type: "paragraph", paragraph: { rich_text: rich("Chaque tâche vaut 20 HP.") } },
      { type: "bulleted_list_item", bulleted_list_item: { rich_text: rich("Tâche : 20 HP") } },
      { type: "bulleted_list_item", bulleted_list_item: { rich_text: rich("Sous-tâche : 10 HP") } },
    ];
    const sections = mapNotionBlocks(blocks);
    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe("Le barème");
    expect(sections[0].blocks).toEqual([
      { type: "p", text: "Chaque tâche vaut 20 HP." },
      { type: "ul", items: ["Tâche : 20 HP", "Sous-tâche : 10 HP"] },
    ]);
  });

  test("contenu avant tout heading → section d'intro sans titre", () => {
    const sections = mapNotionBlocks([
      { type: "paragraph", paragraph: { rich_text: rich("Bienvenue.") } },
    ]);
    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe("");
    expect(sections[0].blocks[0]).toEqual({ type: "p", text: "Bienvenue." });
  });

  test("types non gérés ignorés ; blocs vides ignorés", () => {
    const sections = mapNotionBlocks([
      { type: "heading_2", heading_2: { rich_text: rich("S") } },
      { type: "image", image: {} },
      { type: "paragraph", paragraph: { rich_text: rich("") } },
    ]);
    expect(sections[0].blocks).toEqual([]);
  });

  test("page vide → aucune section", () => {
    expect(mapNotionBlocks([])).toEqual([]);
  });
});
