import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

type Row = Record<string, unknown>;

let selectCallCount = 0;
const seededWinner: Row = { boss_id: "boss-winner", background_id: "bg-winner" };

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    from: (table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: { timezone: "UTC" } }) }),
          }),
        };
      }
      // table === "daily_boss" : un seul builder partagé, chaînable dans
      // n'importe quel ordre (eq/lt/order renvoient le même objet). Seul
      // maybeSingle() incrémente le compteur : 1er appel = "déjà tiré
      // aujourd'hui ?" (rien), 2e appel = relecture après upsert (le
      // "gagnant" simulé de la course).
      const builder: Row = {};
      builder.eq = () => builder;
      builder.lt = () => builder;
      builder.order = () => builder;
      builder.limit = async () => ({ data: [] });
      builder.then = (resolve: (v: unknown) => void) => resolve({ data: [] });
      builder.maybeSingle = async () => {
        selectCallCount += 1;
        return { data: selectCallCount === 1 ? null : seededWinner };
      };
      return {
        select: () => builder,
        // insert() présent pour que le code PRE-fix (qui appelle .insert(),
        // pas .upsert()) s'exécute sans planter sur "insert is not a
        // function" — sans lui, le test rouge échouerait sur une erreur non
        // liée plutôt que sur l'assertion réellement visée.
        insert: async () => ({ error: null }),
        upsert: async () => ({ error: null }),
      };
    },
  }),
}));

vi.mock("@/lib/bosses", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/bosses")>();
  return {
    ...actual,
    pickDailyBoss: () => actual.getBoss("frost-guardian")!,
    pickBackgroundId: () => "bg-local",
  };
});

vi.mock("@/lib/domain/achievements", () => ({
  assembleAchievementContext: async () => ({}),
  applyNewAchievements: async () => [],
}));

beforeEach(() => {
  selectCallCount = 0;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("resolveDailyBoss — course à l'écriture (issue #160 bug #1)", () => {
  test("renvoie toujours la ligne persistée, jamais le pick local en cas de course perdue", async () => {
    const { resolveDailyBoss } = await import("./boss");
    const result = await resolveDailyBoss();
    // pickDailyBoss (mocké) renvoie "frost-guardian" pour CET appel, mais la
    // relecture après upsert renvoie "boss-winner" (simulant un appel
    // concurrent qui a gagné la course pendant que celui-ci tournait). La
    // fonction doit faire confiance à la relecture, jamais à son pick local.
    expect(result.bossId).toBe("boss-winner");
    expect(result.backgroundId).toBe("bg-winner");
  });
});
