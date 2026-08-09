import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

type Row = Record<string, unknown>;

let currentUser: { id: string } | null = { id: "u1" };
let tables: Record<string, Row[]> = {};
let deleteUserCalls: string[] = [];
let deleteUserErrorCount = 0;

function tableStub(name: string) {
  return {
    select: () => ({
      eq: () => Promise.resolve({ data: tables[name] ?? [], error: null }),
    }),
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: currentUser } }),
    },
    from: (name: string) => tableStub(name),
  }),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      admin: {
        deleteUser: async (id: string) => {
          deleteUserCalls.push(id);
          if (deleteUserErrorCount > 0) {
            deleteUserErrorCount -= 1;
            return { error: { message: "bad_jwt" } };
          }
          return { error: null };
        },
      },
    },
  }),
}));

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://fake.supabase.co");
  vi.stubEnv("NEXT_PRIVATE_KEY_SUPABASE", "fake-service-role-key");
  currentUser = { id: "u1" };
  deleteUserCalls = [];
  deleteUserErrorCount = 0;
  tables = {
    profiles: [{ id: "u1", username: "Ryu", webhook_token_hash: "secret-hash" }],
    tasks: [{ id: "t1", title: "Tâche" }],
    day_results: [{ day_date: "2026-08-01" }],
    unlocked_heroes: [{ hero_id: "fire_knight" }],
    unlocked_skins: [{ skin_id: "fire_knight_default" }],
    unlocked_achievements: [{ code: "FIRST_VICTORY" }],
    daily_boss: [{ day_date: "2026-08-01", boss_id: "satyr" }],
    recurring_templates: [{ id: "r1", title: "Routine" }],
    push_subscriptions: [
      { endpoint: "https://push.example/abc", keys: { p256dh: "x", auth: "y" }, created_at: "2026-08-01T00:00:00Z" },
    ],
  };
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("exportUserData", () => {
  test("retourne une erreur si la session est expirée", async () => {
    currentUser = null;
    const { exportUserData } = await import("./account");
    const result = await exportUserData();
    expect(result.error).toMatch(/Session expirée/);
    expect(result.data).toBeNull();
  });

  test("agrège les tables personnelles", async () => {
    const { exportUserData } = await import("./account");
    const result = await exportUserData();
    expect(result.error).toBeNull();
    expect(result.data?.profile.username).toBe("Ryu");
    expect(result.data?.tasks).toEqual([{ id: "t1", title: "Tâche" }]);
    expect(result.data?.dayResults).toEqual([{ day_date: "2026-08-01" }]);
    expect(result.data?.unlockedHeroes).toEqual([{ hero_id: "fire_knight" }]);
    expect(result.data?.recurringTemplates).toEqual([{ id: "r1", title: "Routine" }]);
  });

  test("exclut webhook_token_hash du profil exporté", async () => {
    const { exportUserData } = await import("./account");
    const result = await exportUserData();
    expect(result.data?.profile).not.toHaveProperty("webhook_token_hash");
  });

  test("exclut les clés de chiffrement push, ne garde que endpoint/created_at", async () => {
    const { exportUserData } = await import("./account");
    const result = await exportUserData();
    expect(result.data?.pushSubscriptions).toEqual([
      { endpoint: "https://push.example/abc", created_at: "2026-08-01T00:00:00Z" },
    ]);
  });
});

describe("deleteAccount", () => {
  test("rejette un texte de confirmation invalide sans appeler l'API admin", async () => {
    const { deleteAccount } = await import("./account");
    const result = await deleteAccount("supprimer");
    expect(result.error).toMatch(/SUPPRIMER/);
    expect(deleteUserCalls.length).toBe(0);
  });

  test("rejette si la session est expirée", async () => {
    currentUser = null;
    const { deleteAccount } = await import("./account");
    const result = await deleteAccount("SUPPRIMER");
    expect(result.error).toMatch(/Session expirée/);
    expect(deleteUserCalls.length).toBe(0);
  });

  test("appelle admin.deleteUser avec l'id de l'utilisateur de session sur confirmation valide", async () => {
    const { deleteAccount } = await import("./account");
    const result = await deleteAccount("SUPPRIMER");
    expect(result.error).toBeNull();
    expect(deleteUserCalls).toEqual(["u1"]);
  });

  test("retry une fois sur le flake JWT Admin connu, puis réussit", async () => {
    deleteUserErrorCount = 1;
    const { deleteAccount } = await import("./account");
    const result = await deleteAccount("SUPPRIMER");
    expect(result.error).toBeNull();
    expect(deleteUserCalls.length).toBe(2);
  });

  test("retourne une erreur générique si toutes les tentatives échouent", async () => {
    deleteUserErrorCount = 5;
    const { deleteAccount } = await import("./account");
    const result = await deleteAccount("SUPPRIMER");
    expect(result.error).toMatch(/Réessaie/);
    expect(deleteUserCalls.length).toBe(3);
  });
});
