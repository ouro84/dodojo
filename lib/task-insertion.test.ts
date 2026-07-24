import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { insertTaskForUser, type InsertTaskOutcome } from "./task-insertion";

type Row = Record<string, unknown>;

// Fake Supabase minimal : couvre les deux chaînes utilisées par
// insertTaskForUser — select().eq().eq() (awaited directement, tableau) et
// insert().select().single() (une ligne).
class FakeQueryBuilder implements PromiseLike<{ data: Row[]; error: null }> {
  private filters: Array<(row: Row) => boolean> = [];
  private mode: "select" | "insert" = "select";
  private insertedRow: Row | null = null;

  constructor(private readonly rows: Row[]) {}

  select(): this {
    return this;
  }

  insert(row: Row): this {
    this.mode = "insert";
    this.insertedRow = {
      id: `task-${this.rows.length + 1}`,
      parent_id: null,
      is_abandoned: false,
      is_completed: false,
      ...row,
    };
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  private matched(): Row[] {
    return this.rows.filter((row) => this.filters.every((f) => f(row)));
  }

  async single(): Promise<{ data: Row | null; error: null }> {
    if (this.mode === "insert" && this.insertedRow) {
      this.rows.push(this.insertedRow);
      return { data: this.insertedRow, error: null };
    }
    return { data: this.matched()[0] ?? null, error: null };
  }

  then<TResult1 = { data: Row[]; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: Row[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    const data = this.matched();
    return Promise.resolve({ data, error: null as null }).then(onfulfilled ?? undefined) as PromiseLike<
      TResult1 | TResult2
    >;
  }
}

class FakeSupabaseClient {
  constructor(private readonly tables: Record<string, Row[]>) {}
  from(table: string): FakeQueryBuilder {
    if (!this.tables[table]) this.tables[table] = [];
    return new FakeQueryBuilder(this.tables[table]);
  }
}

// Audit #67, PR5 : cast unique et localisé au retour (pas de paramètre/
// variable typé `any`) — la règle projet "Interdiction d'utiliser `any`"
// ne prévoit pas d'exception test.
function fakeSupabase(tables: Record<string, Row[]>): SupabaseClient {
  return new FakeSupabaseClient(tables) as unknown as SupabaseClient;
}

const NOW = "2026-07-22T12:00:00.000Z"; // midi UTC : même jour calendaire à Paris (UTC+2) et en UTC

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("insertTaskForUser (US-03/US-22 — extraction réutilisable hors session cookie)", () => {
  test("première tâche du jour : position 0, day_date en fuseau local, Boss à 20 HP", async () => {
    const tables: Record<string, Row[]> = { tasks: [] };

    const outcome: InsertTaskOutcome = await insertTaskForUser(fakeSupabase(tables), {
      userId: "u1",
      title: "Rappeler le client",
      timezone: "Europe/Paris",
    });

    expect(outcome.dayDate).toBe("2026-07-22");
    expect(tables.tasks).toHaveLength(1);
    expect(tables.tasks[0]).toMatchObject({
      user_id: "u1",
      title: "Rappeler le client",
      day_date: "2026-07-22",
      position: 0,
    });
    expect(outcome.bossMaxHp).toBe(20);
    expect(outcome.bossCurrentHp).toBe(20);
  });

  test("second tâche du même jour : position suit la fratrie existante, HP cumulés", async () => {
    const tables: Record<string, Row[]> = {
      tasks: [
        {
          id: "existing",
          user_id: "u1",
          parent_id: null,
          day_date: "2026-07-22",
          position: 0,
          is_abandoned: false,
          is_completed: true,
        },
      ],
    };

    const outcome = await insertTaskForUser(fakeSupabase(tables), {
      userId: "u1",
      title: "Deuxième monstre",
      timezone: "UTC",
    });

    expect(tables.tasks).toHaveLength(2);
    expect(tables.tasks[1]).toMatchObject({ position: 1 });
    // 1 tâche déjà complétée (20 HP infligés) + 1 nouvelle tâche (20 HP) = 40 max, 20 restant.
    expect(outcome.bossMaxHp).toBe(40);
    expect(outcome.bossCurrentHp).toBe(20);
  });

  test("une tâche abandonnée du jour ne compte ni dans le max ni dans les dégâts", async () => {
    const tables: Record<string, Row[]> = {
      tasks: [
        {
          id: "abandoned",
          user_id: "u1",
          parent_id: null,
          day_date: "2026-07-22",
          position: 0,
          is_abandoned: true,
          is_completed: false,
        },
      ],
    };

    const outcome = await insertTaskForUser(fakeSupabase(tables), {
      userId: "u1",
      title: "Nouvelle tâche",
      timezone: "UTC",
    });

    expect(outcome.bossMaxHp).toBe(20);
    expect(outcome.bossCurrentHp).toBe(20);
  });
});
