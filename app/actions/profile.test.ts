import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

type UpdatePatch = Record<string, unknown>;

let updateCalls: UpdatePatch[] = [];
let shouldError = false;
let currentUser: { id: string } | null = { id: "u1" };

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: currentUser } }),
    },
    from: () => ({
      update: (patch: UpdatePatch) => {
        updateCalls.push(patch);
        return {
          eq: () => Promise.resolve({ error: shouldError ? new Error("boom") : null }),
        };
      },
    }),
  }),
}));

beforeEach(() => {
  updateCalls = [];
  shouldError = false;
  currentUser = { id: "u1" };
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("updateUsername", () => {
  test("rejette un pseudo vide sans appeler Supabase", async () => {
    const { updateUsername } = await import("./profile");
    const result = await updateUsername("   ");
    expect(result.error).toMatch(/pseudo/i);
    expect(updateCalls.length).toBe(0);
  });

  test("rejette un pseudo de plus de 24 caractères", async () => {
    const { updateUsername } = await import("./profile");
    const result = await updateUsername("a".repeat(25));
    expect(result.error).toBeTruthy();
    expect(updateCalls.length).toBe(0);
  });

  test("enregistre un pseudo valide, trim appliqué", async () => {
    const { updateUsername } = await import("./profile");
    const result = await updateUsername("  Ryu  ");
    expect(result.error).toBeNull();
    expect(updateCalls).toEqual([{ username: "Ryu" }]);
  });

  test("retourne une erreur générique si Supabase échoue", async () => {
    shouldError = true;
    const { updateUsername } = await import("./profile");
    const result = await updateUsername("Ryu");
    expect(result.error).toMatch(/Réessaie/);
  });

  test("retourne une erreur si la session est expirée", async () => {
    currentUser = null;
    const { updateUsername } = await import("./profile");
    const result = await updateUsername("Ryu");
    expect(result.error).toMatch(/Session expirée/);
    expect(updateCalls.length).toBe(0);
  });
});

describe("updateTimezone", () => {
  test("rejette un fuseau horaire inconnu", async () => {
    const { updateTimezone } = await import("./profile");
    const result = await updateTimezone("Mars/Olympus_Mons");
    expect(result.error).toMatch(/invalide/i);
    expect(updateCalls.length).toBe(0);
  });

  test("enregistre un fuseau IANA valide", async () => {
    const { updateTimezone } = await import("./profile");
    const result = await updateTimezone("Europe/Paris");
    expect(result.error).toBeNull();
    expect(updateCalls).toEqual([{ timezone: "Europe/Paris" }]);
  });

  test("retourne une erreur générique si Supabase échoue", async () => {
    shouldError = true;
    const { updateTimezone } = await import("./profile");
    const result = await updateTimezone("Europe/Paris");
    expect(result.error).toMatch(/Réessaie/);
  });
});

describe("updateReminderOffsetDefault", () => {
  test("rejette une valeur hors 0-240", async () => {
    const { updateReminderOffsetDefault } = await import("./profile");
    const result = await updateReminderOffsetDefault(300);
    expect(result.error).toMatch(/invalide/i);
    expect(updateCalls.length).toBe(0);
  });

  test("enregistre une valeur valide", async () => {
    const { updateReminderOffsetDefault } = await import("./profile");
    const result = await updateReminderOffsetDefault(60);
    expect(result.error).toBeNull();
    expect(updateCalls).toEqual([{ reminder_offset_minutes: 60 }]);
  });
});
