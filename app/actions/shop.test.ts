import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HEROES } from "@/lib/heroes";
import { SKINS } from "@/lib/hero-skins";

type Row = Record<string, unknown>;

let currentUser: { id: string } | null = { id: "u1" };
let tables: Record<string, Row[]> = {};
let inserted: Record<string, Row[]> = {};
let updated: Row[] = [];
let newAchievements: string[] = [];

function tableStub(name: string) {
  const result = { data: tables[name] ?? [], error: null };
  return {
    select: () => ({
      eq: () => Promise.resolve(result),
    }),
    insert: (row: Row) => {
      inserted[name] = [...(inserted[name] ?? []), row];
      return Promise.resolve({ error: null });
    },
    update: (patch: Row) => ({
      eq: () => {
        updated.push({ table: name, ...patch });
        return Promise.resolve({ error: null });
      },
    }),
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: currentUser } }) },
    from: (name: string) => tableStub(name),
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

vi.mock("@/app/actions/achievements", () => ({
  assembleAchievementContext: async () => ({}),
  applyNewAchievements: async () => newAchievements,
}));

const { purchaseHero, purchaseSkin } = await import("@/app/actions/shop");

beforeEach(() => {
  currentUser = { id: "u1" };
  inserted = {};
  updated = [];
  newAchievements = [];
  tables = {
    // 5000 or gagné, rien de dépensé : de quoi acheter n'importe quoi.
    day_results: [{ gold_earned: 5000 }],
    unlocked_heroes: [],
    unlocked_skins: [],
  };
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("purchaseHero", () => {
  // Bug rapporté : le starter d'onboarding n'étant plus offert d'office
  // (US-29), fire_knight peut ne pas être possédé — il doit être achetable
  // comme n'importe quel autre héros du catalogue.
  it.each(HEROES.map((h) => h.id))("achète %s quand il n'est pas possédé", async (heroId) => {
    const res = await purchaseHero(heroId);

    expect(res.error).toBeNull();
    expect(inserted.unlocked_heroes).toEqual([
      { user_id: "u1", hero_id: heroId, price_paid: 500 },
    ]);
  });

  it("reste idempotent si le héros est déjà possédé", async () => {
    tables.unlocked_heroes = [{ hero_id: "fire_knight", price_paid: 0 }];

    const res = await purchaseHero("fire_knight");

    expect(res.error).toBeNull();
    expect(inserted.unlocked_heroes).toBeUndefined();
  });

  it("refuse l'achat si le solde est insuffisant", async () => {
    tables.day_results = [{ gold_earned: 100 }];

    const res = await purchaseHero("fire_knight");

    expect(res.error).toMatch(/Pas assez d'or/);
    expect(inserted.unlocked_heroes).toBeUndefined();
  });
});

describe("purchaseSkin", () => {
  const alternatives = SKINS.filter((s) => !s.isDefault);

  it.each(alternatives.map((s) => [s.heroId, s.id] as const))(
    "achète la tenue %s / %s quand le héros est possédé",
    async (heroId, skinId) => {
      tables.unlocked_heroes = [{ hero_id: heroId, price_paid: 500 }];

      const res = await purchaseSkin(heroId, skinId);

      expect(res.error).toBeNull();
      expect(inserted.unlocked_skins).toEqual([
        { user_id: "u1", hero_id: heroId, skin_id: skinId, price_paid: 300 },
      ]);
    },
  );

  // Issue #199 : purchaseSkin n'était pas un checkpoint de succès. Sans ce
  // retour, Fashion Week & co ne se débloqueraient qu'au prochain chargement
  // de l'Arène, sans jamais afficher leur toast.
  it("remonte les succès débloqués par l'achat", async () => {
    tables.unlocked_heroes = [{ hero_id: "fire_knight", price_paid: 500 }];
    newAchievements = ["FIRST_SKIN"];

    const res = await purchaseSkin("fire_knight", "fire_knight_shadow_purple");

    expect(res.newAchievements).toEqual(["FIRST_SKIN"]);
  });

  it("no-op sur la tenue par défaut (gratuite, jamais de ligne en base)", async () => {
    tables.unlocked_heroes = [{ hero_id: "fire_knight", price_paid: 500 }];

    const res = await purchaseSkin("fire_knight", "fire_knight_default");

    expect(res.error).toBeNull();
    expect(inserted.unlocked_skins).toBeUndefined();
  });

  it("refuse une tenue dont le héros n'est pas possédé", async () => {
    const res = await purchaseSkin("fire_knight", "fire_knight_shadow_purple");

    expect(res.error).toMatch(/Débloque ce combattant/);
    expect(inserted.unlocked_skins).toBeUndefined();
  });
});
